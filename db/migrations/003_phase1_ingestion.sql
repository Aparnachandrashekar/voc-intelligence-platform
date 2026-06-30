-- Phase 1: Kaggle static import pipeline + review title support
-- Adds the `static_import` pipeline (Kaggle dataset bulk load) alongside the
-- existing live_scrape pipeline. `huggingface` is retained only so historical
-- rows remain valid; no new huggingface rows are produced.

ALTER TABLE feedback_items
  DROP CONSTRAINT IF EXISTS feedback_items_ingestion_pipeline_check;
ALTER TABLE feedback_items
  ADD CONSTRAINT feedback_items_ingestion_pipeline_check
  CHECK (ingestion_pipeline IN ('huggingface', 'static_import', 'live_scrape'));

ALTER TABLE ingestion_runs
  DROP CONSTRAINT IF EXISTS ingestion_runs_pipeline_check;
ALTER TABLE ingestion_runs
  ADD CONSTRAINT ingestion_runs_pipeline_check
  CHECK (pipeline IN ('huggingface', 'static_import', 'live_scrape'));

-- App Store / Play Store reviews carry a short title separate from the body.
ALTER TABLE feedback_items ADD COLUMN IF NOT EXISTS title TEXT;
