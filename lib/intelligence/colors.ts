/** Pastel palette for charts — readable on dark backgrounds without harsh saturation. */
export const PASTEL_SENTIMENT = {
  positive: "#1ed760",
  negative: "#e8a0a0",
  neutral: "#9ec5e8",
  mixed: "#e8d5a8",
} as const;

export function pastelSentimentColor(sentiment: string): string {
  const key = sentiment.toLowerCase() as keyof typeof PASTEL_SENTIMENT;
  return PASTEL_SENTIMENT[key] ?? PASTEL_SENTIMENT.neutral;
}
