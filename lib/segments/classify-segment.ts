/** Mirrors {@link SEGMENT_CASE_SQL} — keep in sync when rules change. */
export interface PersonaSegmentInput {
  content: string;
  sentiment: string;
  themes: string[];
  feature_requests: string[];
  rating: number | null;
}

export const PERSONA_SEGMENT_KEYS = [
  "discovery_seeker",
  "feature_advocate",
  "price_sensitive",
  "technical_issues",
  "happy_promoter",
  "dissatisfied_critic",
  "neutral_observer",
  "podcast_listener",
  "general",
] as const;

export type PersonaSegmentKey = (typeof PERSONA_SEGMENT_KEYS)[number];

export function classifyPersonaSegment(input: PersonaSegmentInput): PersonaSegmentKey {
  const themes = input.themes ?? [];
  const featureRequests = input.feature_requests ?? [];
  const content = input.content ?? "";
  const sentiment = input.sentiment ?? "neutral";
  const rating = input.rating;

  const hasPricingOrAds =
    themes.includes("pricing") ||
    /\bad\b|\bads\b|advert/i.test(content);

  if (hasPricingOrAds && (sentiment === "negative" || sentiment === "mixed")) {
    return "price_sensitive";
  }

  const hasPerformance =
    themes.includes("performance") ||
    /crash|slow|lag|freeze|bug/i.test(content);

  if (
    hasPerformance &&
    (sentiment === "negative" || sentiment === "mixed" || sentiment === "neutral")
  ) {
    return "technical_issues";
  }

  if (featureRequests.length > 0) {
    return "feature_advocate";
  }

  if (themes.includes("discovery") || themes.includes("recommendations")) {
    return "discovery_seeker";
  }

  if (themes.includes("podcasts")) {
    return "podcast_listener";
  }

  if (sentiment === "positive" && (rating === null || rating >= 4)) {
    return "happy_promoter";
  }

  if (sentiment === "negative" && (rating === null || rating <= 2)) {
    return "dissatisfied_critic";
  }

  if (sentiment === "neutral") {
    return "neutral_observer";
  }

  return "general";
}
