// `static_import` and `huggingface` are legacy — kept for existing DB rows only.
// New ingestion uses `live_scrape` (App Store + Play Store).
export const INGESTION_PIPELINES = [
  "static_import",
  "live_scrape",
  "huggingface",
] as const;
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

// Legacy — Kaggle static import removed; type kept for old rows.
export const STATIC_IMPORT_SOURCES = ["app_store", "play_store"] as const;
export type StaticImportSource = (typeof STATIC_IMPORT_SOURCES)[number];

export interface FeedbackItem {
  id: string;
  ingestion_pipeline: IngestionPipeline;
  source: FeedbackSource;
  source_id: string;
  source_url: string | null;
  product_name: string;
  title: string | null;
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
  title?: string | null;
  content: string;
  rating?: number | null;
  author?: string | null;
  created_at?: Date | null;
  fetched_at?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface RetrievedFeedbackItem extends FeedbackItem {
  similarity_score?: number;
  keyword_score?: number;
  hybrid_score?: number;
}
