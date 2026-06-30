import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

/** ts_rank_cd scores are much smaller than cosine similarity (0–1). */
const MIN_KEYWORD_TS_RANK = 0.03;

/** ILIKE fallback assigns a fixed keyword score when FTS is unavailable. */
const MIN_KEYWORD_ILIKE = 0.45;

/**
 * Best score for display / relevance gates (cosine preferred over ts_rank).
 * Never use hybrid RRF scores here — they are rank-fusion weights (~0.01–0.03).
 */
export function bestRetrievalScore(item: RetrievedFeedbackItem): number {
  const sim = item.similarity_score ?? 0;
  const kw = item.keyword_score ?? 0;
  return Math.max(sim, kw);
}

/** Whether a retrieved item counts as qualifying evidence for RAG. */
export function itemQualifiesForEvidence(
  item: RetrievedFeedbackItem,
  minCosine: number
): boolean {
  const sim = item.similarity_score ?? 0;
  if (sim >= minCosine) return true;

  const kw = item.keyword_score ?? 0;
  if (kw >= MIN_KEYWORD_ILIKE) return true;
  if (kw >= MIN_KEYWORD_TS_RANK) return true;

  return false;
}
