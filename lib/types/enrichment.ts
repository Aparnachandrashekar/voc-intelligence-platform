export type Sentiment = "positive" | "negative" | "neutral" | "mixed";

export interface EnrichmentResult {
  id: string;
  feedback_item_id: string;
  sentiment: Sentiment;
  themes: string[];
  pain_points: string[];
  user_goals: string[];
  feature_requests: string[];
  enrichment_status: "completed" | "failed" | "skipped_empty";
  enriched_at: Date;
}

export interface EnrichmentOutput {
  sentiment: Sentiment;
  themes: string[];
  pain_points: string[];
  user_goals: string[];
  feature_requests: string[];
}
