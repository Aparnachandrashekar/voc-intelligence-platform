import { getEnv } from "@/lib/env";
import { itemQualifiesForEvidence } from "@/lib/guardrails/retrieval-score";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";
import { sortByRelevanceStable } from "@/lib/retrieval/deterministic-rank";

/**
 * Strict relevance gate — cosine must meet cutoff, or meet floor + strong FTS rank.
 * Does not pad results to a target count.
 */
export function itemMeetsRelevanceCutoff(
  item: RetrievedFeedbackItem,
  minCosine: number
): boolean {
  return itemQualifiesForEvidence(item, minCosine);
}

/**
 * Keep only reviews above the relevance cutoff, sorted deterministically.
 * Returns fewer than `maxResults` when insufficient qualify — never pads.
 */
export function applyRelevanceCutoff(
  items: RetrievedFeedbackItem[],
  maxResults: number,
  minCosine?: number
): RetrievedFeedbackItem[] {
  const cutoff = minCosine ?? getEnv().MIN_RETRIEVAL_SCORE;

  const qualifying = sortByRelevanceStable(
    items.filter((item) => itemMeetsRelevanceCutoff(item, cutoff))
  );

  return qualifying.slice(0, maxResults);
}
