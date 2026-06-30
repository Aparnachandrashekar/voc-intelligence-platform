import { getPool } from "@/lib/db";
import { liveStoreScopeClause } from "@/lib/data-scope";
import { countEmbeddings } from "@/lib/embeddings";

export interface VectorIndexAudit {
  /** All rows in feedback_items. */
  total_reviews_all_sources: number;
  /** Active RAG corpus (live App Store + Play Store). */
  active_corpus_reviews: number;
  active_corpus_enriched: number;
  active_corpus_indexed: number;
  active_corpus_missing_embeddings: number;
  /** All embedding rows (includes historical/non-active sources). */
  total_indexed_vectors: number;
  coverage_pct: number;
}

/** Compare indexed vector count vs review counts for the active RAG corpus. */
export async function auditVectorIndex(): Promise<VectorIndexAudit> {
  const pool = getPool();
  const scope = liveStoreScopeClause("f", 1);

  const [allReviews, active, totalVectors] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM feedback_items`),
    pool.query<{ total: string; enriched: string; indexed: string }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(e.feedback_item_id)::text AS enriched,
         COUNT(emb.feedback_item_id)::text AS indexed
       FROM feedback_items f
       LEFT JOIN enrichment_results e ON e.feedback_item_id = f.id
       LEFT JOIN embeddings emb ON emb.feedback_item_id = f.id
       WHERE ${scope.clause}`,
      scope.params
    ),
    countEmbeddings(),
  ]);

  const activeTotal = parseInt(active.rows[0]?.total ?? "0", 10);
  const activeIndexed = parseInt(active.rows[0]?.indexed ?? "0", 10);

  return {
    total_reviews_all_sources: parseInt(allReviews.rows[0]?.count ?? "0", 10),
    active_corpus_reviews: activeTotal,
    active_corpus_enriched: parseInt(active.rows[0]?.enriched ?? "0", 10),
    active_corpus_indexed: activeIndexed,
    active_corpus_missing_embeddings: Math.max(0, activeTotal - activeIndexed),
    total_indexed_vectors: totalVectors,
    coverage_pct:
      activeTotal > 0
        ? Math.round((activeIndexed / activeTotal) * 1000) / 10
        : 0,
  };
}

export function formatVectorIndexAudit(audit: VectorIndexAudit): string {
  return [
    "=== Vector index audit ===",
    `Active RAG corpus reviews:     ${audit.active_corpus_reviews.toLocaleString()}`,
    `Active corpus enriched:        ${audit.active_corpus_enriched.toLocaleString()}`,
    `Active corpus indexed vectors: ${audit.active_corpus_indexed.toLocaleString()}`,
    `Active corpus missing vectors: ${audit.active_corpus_missing_embeddings.toLocaleString()}`,
    `Coverage (active corpus):      ${audit.coverage_pct}%`,
    "",
    `All sources — total reviews:   ${audit.total_reviews_all_sources.toLocaleString()}`,
    `All sources — indexed vectors: ${audit.total_indexed_vectors.toLocaleString()}`,
  ].join("\n");
}
