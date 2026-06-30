/**
 * Question → corpus aggregation buckets (Part A).
 * Counts run over the full enriched dataset — not retrieved samples.
 */

import { detectRagTopics, RAG_TOPIC_MAP } from "@/lib/rag-topics";

export interface BucketMatch {
  /** Any of these stored theme tags on enrichment_results.themes */
  themesAny?: string[];
  /** Postgres ~* pattern on feedback_items.content */
  contentPattern?: string;
}

export interface AnswerBucketDef {
  id: string;
  label: string;
  match: BucketMatch;
  /** When set, only negative + mixed sentiment rows count. */
  frustrationOnly?: boolean;
}

/** Sub-buckets for recommendation / discovery frustration questions. */
export const RECOMMENDATION_FRUSTRATION_BUCKETS: AnswerBucketDef[] = [
  {
    id: "repetitive_playback",
    label: "Repetitive playback & shuffle",
    frustrationOnly: true,
    match: {
      themesAny: ["playback", "recommendations"],
      contentPattern:
        "(same song|same music|same track|repeat|repetitive|over and over|again and again|plays the same|hear the same|shuffle.*same|not random|narrow rotation)",
    },
  },
  {
    id: "recommendation_quality",
    label: "Recommendation quality & algorithm trust",
    frustrationOnly: true,
    match: {
      themesAny: ["recommendations"],
      contentPattern:
        "(algorithm|recommend|suggest|personaliz|daily mix|discover weekly|for you|made for you|radio|autoplay)",
    },
  },
  {
    id: "weak_discovery",
    label: "Discovery not surfacing new music",
    frustrationOnly: true,
    match: {
      themesAny: ["discovery"],
      contentPattern:
        "(discover|find new|new music|explore|hidden gem|narrow|stale|no variety|same artist|can't find)",
    },
  },
  {
    id: "shuffle_controls",
    label: "Shuffle & playback control",
    frustrationOnly: true,
    match: {
      themesAny: ["playback"],
      contentPattern: "(shuffle|smart shuffle|autoplay|skip|queue|random play|forced shuffle)",
    },
  },
  {
    id: "playlist_mismatch",
    label: "Playlist & mood mismatch",
    frustrationOnly: true,
    match: {
      themesAny: ["discovery", "recommendations", "playback"],
      contentPattern:
        "(wrong song|wrong music|doesn't fit|does not fit|interrupt|mood|vibe|off playlist|changes my playlist)",
    },
  },
];

function topicToBucket(topicKey: string): AnswerBucketDef | null {
  const config = RAG_TOPIC_MAP[topicKey];
  if (!config) return null;
  const match: BucketMatch = {};
  if (config.theme) match.themesAny = [config.theme];
  if (config.contentPattern) match.contentPattern = config.contentPattern;
  if (!match.themesAny && !match.contentPattern) return null;
  return {
    id: topicKey,
    label: config.label,
    match,
  };
}

export function isRecommendationFrustrationQuestion(question: string): boolean {
  const q = question.toLowerCase();
  const rec =
    /\b(recommendation|recommend|recommendations|algorithm|discover|personaliz|for you|daily mix)\b/.test(
      q
    );
  const frustration =
    /\b(frustrat|frustration|complaint|complain|problem|issue|pain|common|hate|worst|why|disappoint|weak|bad)\b/.test(
      q
    ) || /\bmost common\b/.test(q);
  return rec && frustration;
}

/** Resolve which corpus buckets to aggregate for a user question. */
export function resolveAnswerBuckets(question: string): AnswerBucketDef[] {
  if (isRecommendationFrustrationQuestion(question)) {
    return RECOMMENDATION_FRUSTRATION_BUCKETS;
  }

  const topics = detectRagTopics(question);
  if (topics.length > 0) {
    const buckets = topics
      .map(topicToBucket)
      .filter((b): b is AnswerBucketDef => b !== null);
    if (buckets.length > 0) return buckets;
  }

  return DEFAULT_OVERVIEW_BUCKETS;
}

/** Broad theme buckets when the question does not map to a specific topic. */
export const DEFAULT_OVERVIEW_BUCKETS: AnswerBucketDef[] = [
  {
    id: "discovery",
    label: "Music discovery",
    match: { themesAny: ["discovery"] },
  },
  {
    id: "recommendations",
    label: "Recommendations & algorithm",
    match: { themesAny: ["recommendations"] },
  },
  {
    id: "playback",
    label: "Playback & shuffle",
    match: { themesAny: ["playback"] },
  },
  {
    id: "pricing",
    label: "Pricing & premium",
    match: { themesAny: ["pricing"] },
  },
  {
    id: "performance",
    label: "Performance & reliability",
    match: { themesAny: ["performance"] },
  },
];
