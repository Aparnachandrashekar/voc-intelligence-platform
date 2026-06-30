import { getPool } from "@/lib/db";
import {
  embedText,
  fetchEmbeddingVectors,
} from "@/lib/embeddings";
import { buildFilterClause, needsEnrichmentJoin } from "@/lib/reports/filters";
import { buildFtsOrQuery, expandQuery } from "@/lib/query-expansion";
import { getEnv } from "@/lib/env";
import { sortByRelevanceStable } from "@/lib/retrieval/deterministic-rank";
import { maximalMarginalRelevance } from "@/lib/retrieval/mmr";
import {
  buildRetrievalCacheKey,
  getCachedRetrieval,
  setCachedRetrieval,
} from "@/lib/retrieval/query-cache";
import { applyRelevanceCutoff } from "@/lib/retrieval/relevance-filter";
import {
  buildQueryEmbeddingText,
  classifyRetrievalSentimentMode,
  type RetrievalSentimentMode,
} from "@/lib/retrieval/question-intent";
import {
  detectSegmentRetrievalIntent,
  type SegmentRetrievalIntent,
} from "@/lib/retrieval/segment-intent";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";
import type { SearchMode } from "@/lib/types/search";
import type { ReportFilters } from "@/lib/types/reports";

export type { SearchMode };

export interface SearchOptions extends ReportFilters {
  query: string;
  limit?: number;
  minScore?: number;
  mode?: SearchMode;
  /** Feedback item IDs already shown in this browser session — excluded from results. */
  excludeIds?: string[];
}

const RRF_K = 60;
const MMR_LAMBDA = 0.5;
/** Fetch this many candidates before MMR trims to final limit. */
const MMR_CANDIDATE_FACTOR = 4;

const SENTIMENT_POOLS: Record<
  Exclude<RetrievalSentimentMode, "balanced">,
  string[]
> = {
  negative: ["negative"],
  positive: ["positive"],
};

function mapRow(
  row: Record<string, unknown>,
  scores: { similarity?: number; keyword?: number; hybrid?: number }
): RetrievedFeedbackItem {
  const metadata = (row.metadata as Record<string, unknown>) ?? {};
  const personaSegment = row.persona_segment as string | undefined;
  if (personaSegment) {
    metadata.persona_segment = personaSegment;
  }

  return {
    id: row.id as string,
    ingestion_pipeline: row.ingestion_pipeline as RetrievedFeedbackItem["ingestion_pipeline"],
    source: row.source as RetrievedFeedbackItem["source"],
    source_id: row.source_id as string,
    source_url: row.source_url as string | null,
    product_name: row.product_name as string,
    title: (row.title as string | null) ?? null,
    content: row.content as string,
    rating: row.rating as number | null,
    author: row.author as string | null,
    created_at: row.created_at as Date | null,
    ingested_at: row.ingested_at as Date,
    fetched_at: row.fetched_at as Date | null,
    metadata,
    similarity_score: scores.similarity,
    keyword_score: scores.keyword,
    hybrid_score: scores.hybrid,
  };
}

async function hasEmbeddings(): Promise<boolean> {
  const result = await getPool().query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM embeddings LIMIT 1) AS exists`
  );
  return Boolean(result.rows[0]?.exists);
}

async function hasFullTextIndex(): Promise<boolean> {
  const result = await getPool().query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'feedback_items' AND column_name = 'content_tsv'
     ) AS exists`
  );
  return Boolean(result.rows[0]?.exists);
}

function pickSearchFilters(options: SearchOptions): ReportFilters {
  return {
    source: options.source,
    sentiment: options.sentiment,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    segment: options.segment,
    discoveryScope: options.discoveryScope,
  };
}

function joinForFilters(filters: ReportFilters): string {
  return needsEnrichmentJoin(filters)
    ? "INNER JOIN enrichment_results e ON e.feedback_item_id = f.id"
    : "LEFT JOIN enrichment_results e ON e.feedback_item_id = f.id";
}

function appendExcludeClause(
  where: string,
  params: unknown[],
  excludeIds?: string[]
): { where: string; params: unknown[] } {
  if (!excludeIds?.length) return { where, params };
  params.push(excludeIds);
  const clause = `f.id <> ALL($${params.length}::uuid[])`;
  if (where) {
    return { where: `${where} AND ${clause}`, params };
  }
  return { where: `WHERE ${clause}`, params };
}

function appendSentimentPoolClause(
  where: string,
  params: unknown[],
  sentiments: string[]
): { where: string; params: unknown[] } {
  params.push(sentiments);
  const clause = `e.sentiment = ANY($${params.length}::text[])`;
  if (where) {
    return { where: `${where} AND ${clause}`, params };
  }
  return { where: `WHERE ${clause}`, params };
}

function effectiveFetchLimit(limit: number, excludeIds?: string[]): number {
  const excluded = excludeIds?.length ?? 0;
  return Math.min(limit * MMR_CANDIDATE_FACTOR + excluded, 200);
}

function reciprocalRankFusion(
  lists: RetrievedFeedbackItem[][],
  limit: number
): RetrievedFeedbackItem[] {
  const fused = new Map<
    string,
    {
      item: RetrievedFeedbackItem;
      score: number;
      similarity?: number;
      keyword?: number;
    }
  >();

  for (const list of lists) {
    list.forEach((item, index) => {
      const rankScore = 1 / (RRF_K + index + 1);
      const existing = fused.get(item.id);
      if (existing) {
        existing.score += rankScore;
        existing.similarity = Math.max(
          existing.similarity ?? 0,
          item.similarity_score ?? 0
        );
        existing.keyword = Math.max(existing.keyword ?? 0, item.keyword_score ?? 0);
      } else {
        fused.set(item.id, {
          item,
          score: rankScore,
          similarity: item.similarity_score,
          keyword: item.keyword_score,
        });
      }
    });
  }

  return [...fused.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.id.localeCompare(b.item.id);
    })
    .slice(0, limit)
    .map(({ item, score, similarity, keyword }) => ({
      ...item,
      similarity_score: similarity,
      keyword_score: keyword,
      hybrid_score: score,
    }));
}

async function applyMmr(
  queryVector: number[],
  items: RetrievedFeedbackItem[],
  limit: number
): Promise<RetrievedFeedbackItem[]> {
  if (items.length <= limit) return items.slice(0, limit);

  const vectors = await fetchEmbeddingVectors(items.map((i) => i.id));
  const candidates = items
    .map((item) => {
      const vector = vectors.get(item.id);
      if (!vector) return null;
      return {
        id: item.id,
        vector,
        relevance:
          item.similarity_score ??
          item.hybrid_score ??
          item.keyword_score ??
          0,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const selectedIds = maximalMarginalRelevance(
    queryVector,
    candidates,
    limit,
    MMR_LAMBDA
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  return selectedIds
    .map((id) => byId.get(id))
    .filter((i): i is RetrievedFeedbackItem => i !== undefined);
}

async function semanticSearchPool(
  options: SearchOptions,
  queryVector: number[],
  poolSentiments: string[]
): Promise<RetrievedFeedbackItem[]> {
  const limit = options.limit ?? 20;
  const fetchLimit = effectiveFetchLimit(limit, options.excludeIds);
  const minScore = options.minScore;
  const filters = pickSearchFilters(options);
  let { where, params } = buildFilterClause(filters, "f");
  ({ where, params } = appendExcludeClause(where, params, options.excludeIds));
  ({ where, params } = appendSentimentPoolClause(where, params, poolSentiments));

  const vectorParam = `$${params.length + 1}`;
  const limitParam = `$${params.length + 2}`;

  const filterSql = where
    ? `${where} AND emb.embedding IS NOT NULL`
    : "WHERE emb.embedding IS NOT NULL";

  const result = await getPool().query(
    `SELECT f.*, emb.persona_segment,
            1 - (emb.embedding <=> ${vectorParam}::vector) AS similarity_score
     FROM feedback_items f
     INNER JOIN embeddings emb ON emb.feedback_item_id = f.id
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${filterSql}
     ORDER BY emb.embedding <=> ${vectorParam}::vector, f.id ASC
     LIMIT ${limitParam}`,
    [...params, `[${queryVector.join(",")}]`, fetchLimit]
  );

  const items = result.rows.map((row) =>
    mapRow(row, { similarity: parseFloat(String(row.similarity_score ?? 0)) })
  );

  if (minScore !== undefined) {
    return items.filter((i) => (i.similarity_score ?? 0) >= minScore);
  }
  return items;
}

async function fullTextSearchPool(
  options: SearchOptions,
  poolSentiments: string[]
): Promise<RetrievedFeedbackItem[]> {
  const limit = options.limit ?? 20;
  const expansion = expandQuery(options.query);
  const filters = pickSearchFilters(options);
  let { where, params } = buildFilterClause(filters, "f");
  ({ where, params } = appendExcludeClause(where, params, options.excludeIds));
  ({ where, params } = appendSentimentPoolClause(where, params, poolSentiments));
  const join = "INNER JOIN enrichment_results e ON e.feedback_item_id = f.id";
  const queryIdx = params.length + 1;
  const limitIdx = params.length + 2;
  const fetchLimit = effectiveFetchLimit(limit, options.excludeIds);

  const useFts = await hasFullTextIndex();
  const ftsQuery = buildFtsOrQuery(expansion);

  if (useFts) {
    const tsClause = `f.content_tsv @@ websearch_to_tsquery('english', $${queryIdx})`;
    const fullWhere = where ? `${where} AND ${tsClause}` : `WHERE ${tsClause}`;

    const result = await getPool().query(
      `SELECT f.*,
              ts_rank_cd(f.content_tsv, websearch_to_tsquery('english', $${queryIdx})) AS keyword_score
       FROM feedback_items f
       ${join}
       ${fullWhere}
       ORDER BY keyword_score DESC, f.id ASC
       LIMIT $${limitIdx}`,
      [...params, ftsQuery, fetchLimit]
    );

    return result.rows.map((row) =>
      mapRow(row, { keyword: parseFloat(String(row.keyword_score ?? 0)) })
    );
  }

  const textTerms =
    expansion.ftsTerms.length > 0 ? expansion.ftsTerms : [options.query];
  const terms = textTerms.slice(0, 8);
  const ilikeClauses = terms
    .map((_, i) => `f.content ILIKE '%' || $${params.length + 1 + i} || '%'`)
    .join(" OR ");
  const fullWhere = where
    ? `${where} AND (${ilikeClauses})`
    : `WHERE (${ilikeClauses})`;
  const ilikeLimitIdx = params.length + terms.length + 1;

  const result = await getPool().query(
    `SELECT f.* FROM feedback_items f
     ${join}
     ${fullWhere}
     ORDER BY f.id ASC
     LIMIT $${ilikeLimitIdx}`,
    [...params, ...terms, fetchLimit]
  );

  return result.rows.map((row) => mapRow(row, { keyword: 0.5 }));
}

function balancedPoolSentiments(): string[][] {
  return [
    SENTIMENT_POOLS.negative,
    ["neutral", "mixed"],
    SENTIMENT_POOLS.positive,
  ];
}

async function retrieveFromSentimentMode(
  options: SearchOptions,
  mode: RetrievalSentimentMode,
  queryVector: number[]
): Promise<RetrievedFeedbackItem[]> {
  const finalLimit = options.limit ?? 20;
  const candidateLimit = effectiveFetchLimit(finalLimit, options.excludeIds);

  if (mode === "balanced") {
    const pools = balancedPoolSentiments();
    const perPool = Math.ceil(candidateLimit / pools.length);
    const lists = await Promise.all(
      pools.flatMap((sentiments) => [
        semanticSearchPool({ ...options, limit: perPool }, queryVector, sentiments),
        fullTextSearchPool({ ...options, limit: perPool }, sentiments),
      ])
    );
    return reciprocalRankFusion(lists, candidateLimit);
  }

  const sentiments = SENTIMENT_POOLS[mode];
  const [semantic, keyword] = await Promise.all([
    semanticSearchPool({ ...options, limit: candidateLimit }, queryVector, sentiments),
    fullTextSearchPool({ ...options, limit: candidateLimit }, sentiments),
  ]);
  return reciprocalRankFusion([semantic, keyword], candidateLimit);
}

export async function fullTextSearch(
  options: SearchOptions
): Promise<RetrievedFeedbackItem[]> {
  const mode = classifyRetrievalSentimentMode(options.query);
  const sentiments =
    mode === "balanced"
      ? ["negative", "neutral", "mixed", "positive"]
      : mode === "negative"
        ? SENTIMENT_POOLS.negative
        : SENTIMENT_POOLS.positive;
  return fullTextSearchPool(options, sentiments);
}

export async function semanticSearch(
  options: SearchOptions
): Promise<RetrievedFeedbackItem[]> {
  if (!(await hasEmbeddings())) {
    return fullTextSearch(options);
  }

  try {
    const mode = classifyRetrievalSentimentMode(options.query);
    const queryVector = await embedText(
      buildQueryEmbeddingText(options.query, mode)
    );
    const sentiments =
      mode === "balanced"
        ? ["negative", "neutral", "mixed", "positive"]
        : mode === "negative"
          ? SENTIMENT_POOLS.negative
          : SENTIMENT_POOLS.positive;
    return semanticSearchPool(options, queryVector, sentiments);
  } catch {
    return fullTextSearch(options);
  }
}

/**
 * Hybrid retrieval: sentiment-routed pools → RRF fusion → MMR diversification.
 * No theme-boost lane (was causing the same discovery praise reviews every query).
 */
/**
 * Deterministic final ranking — stable relevance order, no MMR jitter.
 * Session follow-ups pass excludeIds and may use MMR on the remaining pool.
 */
async function finalizeRankedResults(
  queryVector: number[],
  candidates: RetrievedFeedbackItem[],
  limit: number,
  excludeIds?: string[]
): Promise<RetrievedFeedbackItem[]> {
  const sorted = sortByRelevanceStable(candidates);

  if (excludeIds?.length) {
    const excluded = new Set(excludeIds);
    const pool = sorted.filter((item) => !excluded.has(item.id));
    const fetchCap = Math.min(pool.length, limit * MMR_CANDIDATE_FACTOR);
    const mmrPool = pool.slice(0, fetchCap);
    if (mmrPool.length <= limit) return mmrPool;
    return applyMmr(queryVector, mmrPool, limit);
  }

  return sorted.slice(0, limit);
}

async function hybridSearchCore(
  options: SearchOptions
): Promise<RetrievedFeedbackItem[]> {
  const finalLimit = options.limit ?? 20;
  const mode = classifyRetrievalSentimentMode(options.query);
  const queryVector = await embedText(
    buildQueryEmbeddingText(options.query, mode)
  );

  const candidates = await retrieveFromSentimentMode(
    options,
    mode,
    queryVector
  );

  return finalizeRankedResults(
    queryVector,
    candidates,
    finalLimit,
    options.excludeIds
  );
}

export async function hybridSearch(
  options: SearchOptions
): Promise<RetrievedFeedbackItem[]> {
  if (!(await hasEmbeddings())) {
    return fullTextSearch(options);
  }

  const segmentIntent = detectSegmentRetrievalIntent(options.query);

  if (segmentIntent.mode === "compare") {
    return hybridSearchSegmentCompare(options, segmentIntent);
  }

  const mergedOptions =
    segmentIntent.mode === "filter"
      ? { ...options, segment: segmentIntent.segment }
      : options;

  return hybridSearchCore(mergedOptions);
}

async function hybridSearchSegmentCompare(
  options: SearchOptions,
  intent: Extract<SegmentRetrievalIntent, { mode: "compare" }>
): Promise<RetrievedFeedbackItem[]> {
  const finalLimit = options.limit ?? 20;
  const perSegment = Math.max(
    6,
    Math.ceil(finalLimit / intent.segments.length)
  );

  const lists = await Promise.all(
    intent.segments.map((segment) =>
      hybridSearchCore({
        ...options,
        segment,
        limit: perSegment,
      })
    )
  );

  return reciprocalRankFusion(lists, finalLimit);
}

/** RAG entry — cached deterministic ranking + strict relevance cutoff. */
export async function retrieveForQuestion(
  options: SearchOptions
): Promise<RetrievedFeedbackItem[]> {
  const env = getEnv();
  const poolLimit = options.limit ?? env.RAG_RETRIEVE_POOL;
  const cacheKey = buildRetrievalCacheKey(options);

  let ranked: RetrievedFeedbackItem[];

  if (!options.excludeIds?.length) {
    const cached = getCachedRetrieval(cacheKey);
    if (cached) {
      ranked = cached;
    } else {
      ranked = applyRelevanceCutoff(
        await hybridSearch({ ...options, excludeIds: undefined, limit: poolLimit }),
        poolLimit
      );
      setCachedRetrieval(cacheKey, ranked);
    }
  } else {
    const cached = getCachedRetrieval(cacheKey);
    const base =
      cached ??
      applyRelevanceCutoff(
        await hybridSearch({ ...options, excludeIds: undefined, limit: poolLimit }),
        poolLimit
      );
    if (!cached) {
      setCachedRetrieval(cacheKey, base);
    }
    const excluded = new Set(options.excludeIds);
    ranked = applyRelevanceCutoff(
      base.filter((item) => !excluded.has(item.id)),
      poolLimit
    );
  }

  return ranked;
}

/** Unified search entry — defaults to hybrid (Phase 6). */
export async function search(
  options: SearchOptions
): Promise<RetrievedFeedbackItem[]> {
  const mode = options.mode ?? "hybrid";
  switch (mode) {
    case "semantic":
      return semanticSearch(options);
    case "keyword":
      return fullTextSearch(options);
    case "hybrid":
      return hybridSearch(options);
  }
}

/** Exposed for retrieval tests — returns sentiment mode + candidate IDs pre-MMR. */
export async function hybridSearchDebug(
  options: SearchOptions
): Promise<{
  sentiment_mode: RetrievalSentimentMode;
  pre_mmr_ids: string[];
  post_mmr_ids: string[];
}> {
  const finalLimit = options.limit ?? 20;
  const mode = classifyRetrievalSentimentMode(options.query);
  const queryVector = await embedText(
    buildQueryEmbeddingText(options.query, mode)
  );
  const candidates = await retrieveFromSentimentMode(
    options,
    mode,
    queryVector
  );
  const postRank = await finalizeRankedResults(
    queryVector,
    candidates,
    finalLimit,
    options.excludeIds
  );
  return {
    sentiment_mode: mode,
    pre_mmr_ids: sortByRelevanceStable(candidates).map((i) => i.id),
    post_mmr_ids: postRank.map((i) => i.id),
  };
}

export {
  classifyRetrievalSentimentMode,
  type RetrievalSentimentMode,
} from "@/lib/retrieval/question-intent";
