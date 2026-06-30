import { bestRetrievalScore } from "@/lib/guardrails/retrieval-score";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

/** Stable sort: relevance desc, then id asc for tie-breaks. */
export function sortByRelevanceStable(
  items: RetrievedFeedbackItem[]
): RetrievedFeedbackItem[] {
  return [...items].sort((a, b) => {
    const scoreDiff = bestRetrievalScore(b) - bestRetrievalScore(a);
    if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;
    return a.id.localeCompare(b.id);
  });
}

export function compareRelevanceStable(
  a: RetrievedFeedbackItem,
  b: RetrievedFeedbackItem
): number {
  const scoreDiff = bestRetrievalScore(b) - bestRetrievalScore(a);
  if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;
  return a.id.localeCompare(b.id);
}
