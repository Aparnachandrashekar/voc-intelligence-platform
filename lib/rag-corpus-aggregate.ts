/**
 * Part A — corpus-wide tag aggregation (SQL counts, no LLM).
 * Part B — illustrative quotes per bucket (SQL fetch, no semantic retrieval).
 */

import { getPool } from "@/lib/db";
import { cleanQuoteForDisplay } from "@/lib/intelligence/quote-display";
import { buildFilterClause } from "@/lib/reports/filters";
import {
  resolveAnswerBuckets,
  type AnswerBucketDef,
} from "@/lib/rag-answer-buckets";
import type { ReportFilters } from "@/lib/types/reports";

export interface CorpusBucketStat {
  id: string;
  label: string;
  count: number;
  pct: number;
  sentiment: string;
}

export interface IllustrativeQuote {
  feedback_item_id: string;
  quote: string;
  source: string;
  theme: string;
  segment?: string;
  date: string;
  sentiment: string;
}

export interface CorpusAnswerContext {
  total_analyzed: number;
  buckets: CorpusBucketStat[];
  quotesByBucket: Record<string, IllustrativeQuote[]>;
}

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

export async function countEnrichedCorpus(
  filters: ReportFilters = {}
): Promise<number> {
  const { where, params } = buildFilterClause(filters, "f");
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}`,
    params
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

function buildBucketWhereClause(
  bucket: AnswerBucketDef,
  filters: ReportFilters
): { clause: string; params: unknown[] } {
  const { where, params } = buildFilterClause(filters, "f");
  const matchParts: string[] = [];
  let idx = params.length + 1;

  if (bucket.match.themesAny?.length) {
    matchParts.push(`e.themes && $${idx}::text[]`);
    params.push(bucket.match.themesAny);
    idx++;
  }
  if (bucket.match.contentPattern) {
    matchParts.push(`f.content ~* $${idx}`);
    params.push(bucket.match.contentPattern);
    idx++;
  }

  if (matchParts.length === 0) {
    matchParts.push("TRUE");
  }

  const parts = [`(${matchParts.join(" OR ")})`];
  if (bucket.frustrationOnly) {
    parts.push(`e.sentiment IN ('negative', 'mixed')`);
  }

  const bucketClause = parts.join(" AND ");
  const fullWhere = where
    ? `${where} AND ${bucketClause}`
    : `WHERE ${bucketClause}`;

  return { clause: fullWhere, params };
}

export async function countBucketMatches(
  bucket: AnswerBucketDef,
  filters: ReportFilters = {}
): Promise<{ count: number; topSentiment: string }> {
  const { clause, params } = buildBucketWhereClause(bucket, filters);

  const countResult = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${clause}`,
    params
  );

  const sentimentResult = await getPool().query<{ sentiment: string; count: string }>(
    `SELECT e.sentiment, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${clause}
     GROUP BY e.sentiment
     ORDER BY count DESC
     LIMIT 1`,
    params
  );

  return {
    count: parseInt(countResult.rows[0]?.count ?? "0", 10),
    topSentiment: sentimentResult.rows[0]?.sentiment ?? "mixed",
  };
}

export async function fetchBucketQuotes(
  bucket: AnswerBucketDef,
  filters: ReportFilters = {},
  limit = 3
): Promise<IllustrativeQuote[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const matchParts: string[] = [];
  let idx = params.length + 1;

  if (bucket.match.themesAny?.length) {
    matchParts.push(`e.themes && $${idx++}::text[]`);
    params.push(bucket.match.themesAny);
  }
  if (bucket.match.contentPattern) {
    matchParts.push(`f.content ~* $${idx++}`);
    params.push(bucket.match.contentPattern);
  }
  if (matchParts.length === 0) return [];

  let bucketClause = `(${matchParts.join(" OR ")})`;
  if (bucket.frustrationOnly) {
    bucketClause += ` AND e.sentiment IN ('negative', 'mixed')`;
  }

  const fullWhere = where
    ? `${where} AND ${bucketClause}`
    : `WHERE ${bucketClause}`;

  const limitIdx = params.length + 1;
  params.push(limit);

  const result = await getPool().query<{
    feedback_item_id: string;
    content: string;
    source: string;
    created_at: Date | null;
    sentiment: string;
    persona_segment: string | null;
  }>(
    `SELECT f.id AS feedback_item_id, f.content, f.source, f.created_at,
            e.sentiment, emb.persona_segment
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     LEFT JOIN embeddings emb ON emb.feedback_item_id = f.id
     ${fullWhere}
     ORDER BY
       CASE e.sentiment WHEN 'negative' THEN 0 WHEN 'mixed' THEN 1 ELSE 2 END,
       length(f.content) DESC,
       f.ingested_at DESC
     LIMIT $${limitIdx}`,
    params
  );

  return result.rows.map((row) => ({
    feedback_item_id: row.feedback_item_id,
    quote: cleanQuoteForDisplay(row.content.slice(0, 320)),
    source: row.source,
    theme: bucket.id,
    segment: row.persona_segment ?? undefined,
    date: row.created_at?.toISOString?.() ?? "",
    sentiment: row.sentiment,
  }));
}

/** Part A + B: full corpus stats and illustrative quotes for a question. */
export async function buildCorpusAnswerContext(
  question: string,
  filters: ReportFilters = {},
  options?: { maxBuckets?: number; quotesPerBucket?: number }
): Promise<CorpusAnswerContext> {
  const maxBuckets = options?.maxBuckets ?? 5;
  const quotesPerBucket = options?.quotesPerBucket ?? 3;

  const total_analyzed = await countEnrichedCorpus(filters);
  const bucketDefs = resolveAnswerBuckets(question);

  const rawStats = await Promise.all(
    bucketDefs.map(async (def) => {
      const { count, topSentiment } = await countBucketMatches(def, filters);
      return {
        id: def.id,
        label: def.label,
        count,
        pct: pct(count, total_analyzed),
        sentiment: topSentiment,
        def,
      };
    })
  );

  const buckets = rawStats
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxBuckets)
    .map(({ def: _def, ...rest }) => rest);

  const topDefs = rawStats
    .sort((a, b) => b.count - a.count)
    .slice(0, maxBuckets)
    .map((b) => b.def);

  const quoteEntries = await Promise.all(
    topDefs.map(async (def) => {
      const quotes = await fetchBucketQuotes(def, filters, quotesPerBucket);
      return [def.id, quotes] as const;
    })
  );

  const quotesByBucket: Record<string, IllustrativeQuote[]> = {};
  for (const [id, quotes] of quoteEntries) {
    if (quotes.length > 0) quotesByBucket[id] = quotes;
  }

  return { total_analyzed, buckets, quotesByBucket };
}

export function formatCorpusStatsBlock(ctx: CorpusAnswerContext): string {
  const lines = [
    `Total analyzed reviews: ${ctx.total_analyzed.toLocaleString()}`,
    ...ctx.buckets.map(
      (b) =>
        `- ${b.label}: ${b.pct}% (${b.count.toLocaleString()} of ${ctx.total_analyzed.toLocaleString()} analyzed reviews)`
    ),
  ];
  return lines.join("\n");
}

export function formatIllustrativeQuotesBlock(ctx: CorpusAnswerContext): string {
  const sections: string[] = [];
  for (const bucket of ctx.buckets) {
    const quotes = ctx.quotesByBucket[bucket.id] ?? [];
    if (quotes.length === 0) continue;
    sections.push(
      `[${bucket.label}]\n${quotes
        .map(
          (q, i) =>
            `${i + 1}. id=${q.feedback_item_id} source=${q.source} sentiment=${q.sentiment}\n"${q.quote}"`
        )
        .join("\n")}`
    );
  }
  return sections.join("\n\n");
}

export function buildCorpusFindings(
  ctx: CorpusAnswerContext
): Array<{
  insight: string;
  quote: string;
  source: string;
  theme: string;
  segment?: string;
  date: string;
  feedback_item_id: string;
}> {
  const findings: Array<{
    insight: string;
    quote: string;
    source: string;
    theme: string;
    segment?: string;
    date: string;
    feedback_item_id: string;
  }> = [];

  for (const bucket of ctx.buckets) {
    const quotes = ctx.quotesByBucket[bucket.id] ?? [];
    for (const q of quotes) {
      findings.push({
        insight: `${bucket.pct}% of analyzed reviews (${bucket.count.toLocaleString()}) mention ${bucket.label.toLowerCase()}.`,
        quote: q.quote,
        source: q.source,
        theme: bucket.label,
        segment: q.segment,
        date: q.date,
        feedback_item_id: q.feedback_item_id,
      });
    }
  }

  return findings;
}

export function buildCorpusDetailedAnalysis(ctx: CorpusAnswerContext): string {
  return ctx.buckets
    .map(
      (b) =>
        `${b.label}: ${b.pct}% (${b.count.toLocaleString()} of ${ctx.total_analyzed.toLocaleString()} analyzed reviews)`
    )
    .join("\n");
}

export function computeSourceAttributionFromQuotes(
  ctx: CorpusAnswerContext
): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();
  for (const quotes of Object.values(ctx.quotesByBucket)) {
    for (const q of quotes) {
      counts.set(q.source, (counts.get(q.source) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));
}

export function corpusBucketsToThemeBreakdown(
  buckets: CorpusBucketStat[]
): Array<{ theme: string; count: number; sentiment: string }> {
  return buckets.map((b) => ({
    theme: b.label,
    count: b.count,
    sentiment: b.sentiment,
  }));
}
