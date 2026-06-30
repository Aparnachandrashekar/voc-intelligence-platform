import { cache } from "react";
import { getPool } from "@/lib/db";
import { liveStoreScopeClause } from "@/lib/data-scope";

export interface ActiveCorpusStats {
  total_reviews: number;
  enriched_count: number;
  indexed_count: number;
}

/** Live App Store + Play Store corpus counts — single source for UI copy. */
export const getActiveCorpusStats = cache(async (): Promise<ActiveCorpusStats> => {
  const scope = liveStoreScopeClause("f", 1);

  const result = await getPool().query<{
    total: string;
    enriched: string;
    indexed: string;
  }>(
    `SELECT COUNT(DISTINCT f.id)::text AS total,
            COUNT(DISTINCT e.feedback_item_id) FILTER (
              WHERE e.enrichment_status = 'completed'
            )::text AS enriched,
            COUNT(DISTINCT emb.feedback_item_id)::text AS indexed
     FROM feedback_items f
     LEFT JOIN enrichment_results e ON e.feedback_item_id = f.id
     LEFT JOIN embeddings emb ON emb.feedback_item_id = f.id
     WHERE ${scope.clause}`,
    scope.params
  );

  const row = result.rows[0];
  return {
    total_reviews: parseInt(row?.total ?? "0", 10),
    enriched_count: parseInt(row?.enriched ?? "0", 10),
    indexed_count: parseInt(row?.indexed ?? "0", 10),
  };
});
