import { getEnv } from "@/lib/env";
import { questionHasKnownTopic } from "@/lib/rag-stats";
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
  return items.map((i) => i.similarity_score ?? 0).filter((s) => s > 0);
}

/** Block answers when retrieval similarity is too weak (likely off-topic). */
export function evaluateRetrievalRelevance(
  items: RetrievedFeedbackItem[],
  question: string
): RetrievalRelevanceResult {
  const env = getEnv();
  const minItems = env.MIN_EVIDENCE_ITEMS;

  const cosines = cosineScores(items);
  const maxCosine = cosines.length > 0 ? Math.max(...cosines) : 0;
  const topCosines = cosines.slice(0, Math.min(3, cosines.length));
  const avgCosine =
    topCosines.length > 0
      ? topCosines.reduce((a, b) => a + b, 0) / topCosines.length
      : 0;

  const hasKeywordHit = items.some((i) => (i.keyword_score ?? 0) >= 0.5);
  const knownTopic = questionHasKnownTopic(question);

  // Keyword / known Spotify topic + enough hits → allow (shuffle, ads, etc.)
  if (items.length >= minItems && (hasKeywordHit || knownTopic)) {
    if (maxCosine >= 0.25 || hasKeywordHit || items.length >= 5) {
      return {
        allowed: true,
        max_similarity: maxCosine || null,
        avg_top_similarity: avgCosine || null,
      };
    }
  }

  const minMax = env.MIN_ANSWER_SIMILARITY ?? 0.3;
  const minAvg = env.MIN_ANSWER_AVG_SIMILARITY ?? 0.27;

  if (cosines.length === 0 && !hasKeywordHit) {
    return {
      allowed: false,
      reason:
        "No sufficiently similar Spotify reviews were found for this question.",
      max_similarity: null,
      avg_top_similarity: null,
    };
  }

  if (maxCosine > 0 && (maxCosine < minMax || avgCosine < minAvg)) {
    return {
      allowed: false,
      reason:
        "Retrieved reviews aren't closely related to this question. Try rephrasing with a Spotify-specific topic (e.g. shuffle, ads, Premium, playlists).",
      max_similarity: maxCosine,
      avg_top_similarity: avgCosine,
    };
  }

  return {
    allowed: true,
    max_similarity: maxCosine || null,
    avg_top_similarity: avgCosine || null,
  };
}
