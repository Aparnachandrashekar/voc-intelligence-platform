export const INGESTION_PIPELINES = ["huggingface", "live_scrape"] as const;
export type IngestionPipeline = (typeof INGESTION_PIPELINES)[number];

export const FEEDBACK_SOURCES = [
  "app_store",
  "play_store",
  "quora",
  "twitter",
  "forum",
  "huggingface",
] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const LIVE_SCRAPE_SOURCES = [
  "app_store",
  "play_store",
  "quora",
  "twitter",
  "forum",
] as const;
export type LiveScrapeSource = (typeof LIVE_SCRAPE_SOURCES)[number];

export interface FeedbackItem {
  id: string;
  ingestion_pipeline: IngestionPipeline;
  source: FeedbackSource;
  source_id: string;
  source_url: string | null;
  product_name: string;
  content: string;
  rating: number | null;
  author: string | null;
  created_at: Date | null;
  ingested_at: Date;
  fetched_at: Date | null;
  metadata: Record<string, unknown>;
}

export interface InsertFeedbackItemInput {
  ingestion_pipeline: IngestionPipeline;
  source: FeedbackSource;
  source_id: string;
  source_url?: string | null;
  product_name?: string;
  content: string;
  rating?: number | null;
  author?: string | null;
  created_at?: Date | null;
  fetched_at?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface RetrievedFeedbackItem extends FeedbackItem {
  similarity_score?: number;
}
