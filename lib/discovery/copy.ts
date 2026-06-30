import type { DiscoverySentimentScore } from "@/lib/types/discovery";

/** One-line narrative for the discovery sentiment headline. */
export function discoverySentimentHeadline(
  sentiment: DiscoverySentimentScore
): string {
  if (sentiment.total_reviews === 0) {
    return "No discovery-tagged reviews in the current corpus.";
  }
  if (sentiment.negative_pct >= sentiment.positive_pct) {
    return `${sentiment.negative_pct}% of discovery-related reviews are negative — users struggle more than they praise recommendation and discovery features.`;
  }
  return `${sentiment.positive_pct}% positive among discovery-related reviews, but ${sentiment.negative_pct}% still negative — mixed signals on whether Spotify helps users find new music.`;
}
