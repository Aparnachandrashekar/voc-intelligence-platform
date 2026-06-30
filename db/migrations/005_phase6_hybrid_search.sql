-- Phase 6: PostgreSQL full-text search for hybrid keyword + vector retrieval
ALTER TABLE feedback_items
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_feedback_items_content_tsv
  ON feedback_items USING GIN (content_tsv);
