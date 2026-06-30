import { env as transformersEnv, pipeline } from "@xenova/transformers";
import { getPool } from "@/lib/db";
import { liveStoreScopeClause } from "@/lib/data-scope";
import { getEnv } from "@/lib/env";
import { formatPersona } from "@/lib/intelligence/format";
import {
  classifyPersonaSegment,
  type PersonaSegmentKey,
} from "@/lib/segments/classify-segment";

let extractorPromise: Promise<Awaited<ReturnType<typeof pipeline>>> | null = null;

/** Lazy-load the local embedding model once per process (CLI or Next.js server). */
async function getExtractor() {
  if (!extractorPromise) {
    const modelId = getEnv().LOCAL_EMBEDDING_MODEL;
    transformersEnv.cacheDir = "./.cache/transformers";
    transformersEnv.allowLocalModels = true;
    extractorPromise = pipeline("feature-extraction", modelId);
  }
  return extractorPromise;
}

/** Embed text locally (384-dim for all-MiniLM-L6-v2). No Groq / no network after first model download. */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  // Transformers.js overload types are overly strict in Next build.
  const output = await (
    extractor as (
      text: string,
      opts: { pooling: "mean"; normalize: boolean }
    ) => Promise<{ data: Float32Array }>
  )(text.slice(0, 512), { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return vectors[0];

  const dim = vectors[0].length;
  const sum = new Array<number>(dim).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dim; i++) {
      sum[i] += vector[i] ?? 0;
    }
  }

  const averaged = sum.map((v) => v / vectors.length);
  const magnitude = Math.sqrt(averaged.reduce((acc, v) => acc + v * v, 0));
  if (magnitude === 0) return averaged;
  return averaged.map((v) => v / magnitude);
}

/** Embed the question plus concept variants, then average (wider semantic recall). */
export async function embedExpandedQuery(query: string): Promise<number[]> {
  const { expandQuery } = await import("@/lib/query-expansion");
  const expansion = expandQuery(query);

  const texts = uniqueEmbedTexts([
    expansion.original,
    expansion.conceptPhrase,
    ...expansion.embeddingVariants,
  ]);

  const vectors = await Promise.all(texts.map((text) => embedText(text)));
  return averageVectors(vectors);
}

function uniqueEmbedTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    const key = text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text.trim());
  }
  return out;
}

/** Richer document text — sentiment + full review meaning, not keyword tags alone. */
export function buildFeedbackEmbeddingText(
  content: string,
  enrichment?: {
    sentiment?: string;
    persona_segment?: string;
    themes?: string[];
    pain_points?: string[];
    feature_requests?: string[];
  }
): string {
  const sentiment = enrichment?.sentiment?.trim();
  const parts: string[] = [];

  if (enrichment?.persona_segment) {
    parts.push(
      `User persona: ${formatPersona(enrichment.persona_segment)} (${enrichment.persona_segment}).`
    );
  }

  if (sentiment) {
    const tone =
      sentiment === "negative"
        ? "expresses frustration and problems"
        : sentiment === "positive"
          ? "expresses praise and satisfaction"
          : sentiment === "mixed"
            ? "expresses mixed praise and complaints"
            : "offers neutral factual feedback";
    parts.push(`This is a ${sentiment} Spotify user review that ${tone}.`);
  }

  parts.push(content.trim());

  if (enrichment?.themes?.length) {
    parts.push(`Topics discussed: ${enrichment.themes.join(", ")}.`);
  }
  if (enrichment?.pain_points?.length) {
    const pains = enrichment.pain_points
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p.length < 120)
      .slice(0, 3);
    if (pains.length > 0) {
      parts.push(`User concerns: ${pains.join("; ")}.`);
    }
  }
  if (enrichment?.feature_requests?.length) {
    const requests = enrichment.feature_requests
      .map((r) => r.trim())
      .filter((r) => r.length > 0 && r.length < 120)
      .slice(0, 3);
    if (requests.length > 0) {
      parts.push(`User requests: ${requests.join("; ")}.`);
    }
  }

  return parts.join("\n").slice(0, 512);
}

/** Preload model (call from /api/warm or first query). */
export async function warmEmbeddingModel(): Promise<void> {
  await embedText("warmup");
}

export async function embedFeedbackItem(
  feedbackItemId: string
): Promise<void> {
  const item = await getPool().query<{
    content: string;
    sentiment: string | null;
    themes: string[] | null;
    pain_points: string[] | null;
    feature_requests: string[] | null;
    rating: number | null;
  }>(
    `SELECT f.content, f.rating, e.sentiment, e.themes, e.pain_points, e.feature_requests
     FROM feedback_items f
     LEFT JOIN enrichment_results e ON e.feedback_item_id = f.id
     WHERE f.id = $1`,
    [feedbackItemId]
  );
  if (!item.rows[0]) return;

  const row = item.rows[0];
  const personaSegment: PersonaSegmentKey = row.sentiment
    ? classifyPersonaSegment({
        content: row.content,
        sentiment: row.sentiment,
        themes: row.themes ?? [],
        feature_requests: row.feature_requests ?? [],
        rating: row.rating,
      })
    : "general";

  const embedInput = buildFeedbackEmbeddingText(row.content, {
    sentiment: row.sentiment ?? undefined,
    persona_segment: personaSegment,
    themes: row.themes ?? undefined,
    pain_points: row.pain_points ?? undefined,
    feature_requests: row.feature_requests ?? undefined,
  });
  const vector = await embedText(embedInput);
  const model = getEnv().LOCAL_EMBEDDING_MODEL;

  await getPool().query(
    `INSERT INTO embeddings (feedback_item_id, embedding, model, persona_segment)
     VALUES ($1, $2::vector, $3, $4)
     ON CONFLICT (feedback_item_id) DO UPDATE SET
       embedding = EXCLUDED.embedding,
       model = EXCLUDED.model,
       persona_segment = EXCLUDED.persona_segment,
       created_at = NOW()`,
    [feedbackItemId, `[${vector.join(",")}]`, model, personaSegment]
  );
}

export async function embedBatch(options?: {
  limit?: number;
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<number> {
  const limit = options?.limit ?? 5000;
  const force = options?.force ?? false;

  const rows = force
    ? await getPool().query<{ id: string }>(
        `SELECT f.id FROM feedback_items f
         ORDER BY f.ingested_at ASC
         LIMIT $1`,
        [limit]
      )
    : await getPool().query<{ id: string }>(
        `SELECT f.id FROM feedback_items f
         LEFT JOIN embeddings emb ON emb.feedback_item_id = f.id
         WHERE emb.id IS NULL
         ORDER BY f.ingested_at ASC
         LIMIT $1`,
        [limit]
      );

  let done = 0;
  for (const row of rows.rows) {
    await embedFeedbackItem(row.id);
    done++;
    if (options?.onProgress && done % 100 === 0) {
      options.onProgress(done, rows.rows.length);
    }
  }
  return rows.rows.length;
}

/** Embed the active RAG corpus (live App Store + Play Store reviews). */
export async function embedActiveCorpus(options?: {
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<number> {
  const force = options?.force ?? false;
  const scope = liveStoreScopeClause("f", 1);

  const rows = force
    ? await getPool().query<{ id: string }>(
        `SELECT f.id FROM feedback_items f
         WHERE ${scope.clause}
         ORDER BY f.ingested_at ASC`,
        scope.params
      )
    : await getPool().query<{ id: string }>(
        `SELECT f.id FROM feedback_items f
         LEFT JOIN embeddings emb ON emb.feedback_item_id = f.id
         WHERE ${scope.clause} AND emb.id IS NULL
         ORDER BY f.ingested_at ASC`,
        scope.params
      );

  let done = 0;
  for (const row of rows.rows) {
    await embedFeedbackItem(row.id);
    done++;
    if (options?.onProgress && done % 50 === 0) {
      options.onProgress(done, rows.rows.length);
    }
  }
  return rows.rows.length;
}

export async function countEmbeddings(): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM embeddings`
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

/** Load stored vectors for MMR diversification. */
export async function fetchEmbeddingVectors(
  feedbackItemIds: string[]
): Promise<Map<string, number[]>> {
  if (feedbackItemIds.length === 0) return new Map();

  const result = await getPool().query<{
    feedback_item_id: string;
    embedding: string;
  }>(
    `SELECT feedback_item_id, embedding::text AS embedding
     FROM embeddings
     WHERE feedback_item_id = ANY($1::uuid[])`,
    [feedbackItemIds]
  );

  const map = new Map<string, number[]>();
  for (const row of result.rows) {
    const parsed = JSON.parse(row.embedding) as number[];
    map.set(row.feedback_item_id, parsed);
  }
  return map;
}

/** Embed a retrieval query with optional sentiment intent prefix. */
export async function embedRetrievalQuery(
  question: string,
  intentPrefix?: string
): Promise<number[]> {
  const text = intentPrefix
    ? `${intentPrefix}\n${question.trim()}`
    : question.trim();
  return embedText(text);
}
