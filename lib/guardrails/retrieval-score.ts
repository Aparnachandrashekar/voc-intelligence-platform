import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

/** Minimum cosine signal — keyword-only matches never qualify below this. */
export const MIN_COSINE_FLOOR = 0.28;

/** Strong Postgres ts_rank_cd for keyword-assisted qualification. */
const MIN_KEYWORD_TS_RANK = 0.08;

/**
 * Best score for ranking — prefer cosine; scale keyword ranks into a comparable range.
 * Never use hybrid RRF scores (~0.01–0.03).
 */
export function bestRetrievalScore(item: RetrievedFeedbackItem): number {
  const sim = item.similarity_score ?? 0;
  if (sim > 0) return sim;
  const kw = item.keyword_score ?? 0;
  return kw * 0.5;
}

/** Whether a retrieved item counts as qualifying evidence for RAG. */
export function itemQualifiesForEvidence(
  item: RetrievedFeedbackItem,
  minCosine: number
): boolean {
  const sim = item.similarity_score ?? 0;
  if (sim >= minCosine) return true;

  const kw = item.keyword_score ?? 0;
  if (sim >= MIN_COSINE_FLOOR && kw >= MIN_KEYWORD_TS_RANK) return true;

  return false;
}
