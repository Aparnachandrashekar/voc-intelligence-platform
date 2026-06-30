import { getEnv } from "@/lib/env";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

/** Products/services outside the Spotify review corpus. */
const OFF_SCOPE_ENTITIES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bnetflix\b/i, label: "Netflix" },
  { pattern: /\bhulu\b/i, label: "Hulu" },
  { pattern: /\bdisney\s*\+?\b/i, label: "Disney+" },
  { pattern: /\byoutube\s+music\b/i, label: "YouTube Music" },
  { pattern: /\bapple\s+music\b/i, label: "Apple Music" },
  { pattern: /\bamazon\s+music\b/i, label: "Amazon Music" },
  { pattern: /\bdeezer\b/i, label: "Deezer" },
  { pattern: /\btidal\b/i, label: "Tidal" },
];

export interface ScopeCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Reject questions clearly about non-Spotify products. */
export function evaluateQuestionScope(question: string): ScopeCheckResult {
  const mentionsSpotify = /\bspotify\b/i.test(question);

  for (const { pattern, label } of OFF_SCOPE_ENTITIES) {
    if (pattern.test(question) && !mentionsSpotify) {
      return {
        allowed: false,
        reason: `This dataset contains Spotify app reviews only — not ${label}. Ask about Spotify users, features, or pain points instead.`,
      };
    }
  }

  return { allowed: true };
}

export interface RetrievalRelevanceResult {
  allowed: boolean;
  reason?: string;
  max_similarity: number | null;
  avg_top_similarity: number | null;
}

function cosineScores(items: RetrievedFeedbackItem[]): number[] {
  return items
    .map((i) => i.similarity_score ?? 0)
    .filter((s) => s > 0)
    .sort((a, b) => b - a);
}

/** Block answers when retrieval similarity is too weak (likely off-topic). */
export function evaluateRetrievalRelevance(
  items: RetrievedFeedbackItem[],
  _question: string
): RetrievalRelevanceResult {
  const env = getEnv();
  const minItems = env.MIN_EVIDENCE_ITEMS;
  const minMax = env.MIN_ANSWER_SIMILARITY;
  const minAvg = env.MIN_ANSWER_AVG_SIMILARITY;

  const cosines = cosineScores(items);
  const maxCosine = cosines.length > 0 ? cosines[0] : 0;
  const topCosines = cosines.slice(0, Math.min(3, cosines.length));
  const avgCosine =
    topCosines.length > 0
      ? topCosines.reduce((a, b) => a + b, 0) / topCosines.length
      : 0;

  if (items.length < minItems) {
    return {
      allowed: false,
      reason: "Not enough relevant reviews found for this query.",
      max_similarity: maxCosine || null,
      avg_top_similarity: avgCosine || null,
    };
  }

  if (cosines.length === 0) {
    return {
      allowed: false,
      reason: "Not enough relevant reviews found for this query.",
      max_similarity: null,
      avg_top_similarity: null,
    };
  }

  if (maxCosine < minMax || avgCosine < minAvg) {
    return {
      allowed: false,
      reason: "Not enough relevant reviews found for this query.",
      max_similarity: maxCosine,
      avg_top_similarity: avgCosine,
    };
  }

  return {
    allowed: true,
    max_similarity: maxCosine,
    avg_top_similarity: avgCosine,
  };
}
