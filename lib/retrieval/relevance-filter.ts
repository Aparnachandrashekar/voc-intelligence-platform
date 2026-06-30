import { getEnv } from "@/lib/env";
import { bestRetrievalScore } from "@/lib/guardrails/retrieval-score";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";
import { sortByRelevanceStable } from "@/lib/retrieval/deterministic-rank";

/** Strong FTS rank required when cosine similarity is below the cutoff. */
const MIN_KEYWORD_ONLY_RANK = 0.06;

/**
 * Strict relevance gate — cosine must meet cutoff, or keyword rank must be strong.
 * Does not pad results to a target count.
 */
export function itemMeetsRelevanceCutoff(
  item: RetrievedFeedbackItem,
  minCosine: number
): boolean {
  const sim = item.similarity_score ?? 0;
  if (sim >= minCosine) return true;

  const kw = item.keyword_score ?? 0;
  if (sim < 0.05 && kw >= MIN_KEYWORD_ONLY_RANK) return true;

  return false;
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
