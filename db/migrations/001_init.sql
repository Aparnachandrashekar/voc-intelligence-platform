-- Phase 0: Foundation schema
CREATE EXTENSION IF NOT EXISTS vector;

-- Allowed ingestion pipelines and sources enforced at DB level
CREATE TABLE IF NOT EXISTS feedback_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_pipeline TEXT NOT NULL CHECK (ingestion_pipeline IN ('huggingface', 'live_scrape')),
  source TEXT NOT NULL CHECK (source IN ('app_store', 'play_store', 'quora', 'twitter', 'forum', 'huggingface')),
  source_id TEXT NOT NULL,
  source_url TEXT,
  product_name TEXT NOT NULL DEFAULT 'Unknown',
  content TEXT NOT NULL,
  rating SMALLINT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  author TEXT,
  created_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetched_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT GENERATED ALWAYS AS (md5(content)) STORED,
  CONSTRAINT feedback_items_pipeline_source_source_id_unique
    UNIQUE (ingestion_pipeline, source, source_id),
  CONSTRAINT feedback_items_live_scrape_requires_url
    CHECK (ingestion_pipeline <> 'live_scrape' OR source_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_feedback_items_source ON feedback_items (source);
CREATE INDEX IF NOT EXISTS idx_feedback_items_ingested_at ON feedback_items (ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_items_content_hash ON feedback_items (content_hash);

-- Track ingestion runs (used from Phase 1; created in Phase 0 for webhook logging)
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline TEXT NOT NULL CHECK (pipeline IN ('huggingface', 'live_scrape')),
  source TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  fetched_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Placeholder for Phase 3 embeddings
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_item_id UUID NOT NULL REFERENCES feedback_items (id) ON DELETE CASCADE,
  embedding vector(1536),
  model TEXT NOT NULL DEFAULT 'nomic-embed-text-v1_5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT embeddings_feedback_item_id_unique UNIQUE (feedback_item_id)
);
