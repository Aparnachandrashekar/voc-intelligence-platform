-- Phase 2+: enrichment results
CREATE TABLE IF NOT EXISTS enrichment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_item_id UUID NOT NULL REFERENCES feedback_items (id) ON DELETE CASCADE,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  themes TEXT[] NOT NULL DEFAULT '{}',
  pain_points TEXT[] NOT NULL DEFAULT '{}',
  user_goals TEXT[] NOT NULL DEFAULT '{}',
  feature_requests TEXT[] NOT NULL DEFAULT '{}',
  enrichment_status TEXT NOT NULL DEFAULT 'completed'
    CHECK (enrichment_status IN ('completed', 'failed', 'skipped_empty')),
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enrichment_results_feedback_item_id_unique UNIQUE (feedback_item_id)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_sentiment ON enrichment_results (sentiment);
CREATE INDEX IF NOT EXISTS idx_enrichment_themes ON enrichment_results USING GIN (themes);
CREATE INDEX IF NOT EXISTS idx_enrichment_pain_points ON enrichment_results USING GIN (pain_points);
CREATE INDEX IF NOT EXISTS idx_enrichment_feature_requests ON enrichment_results USING GIN (feature_requests);

-- Phase 4: query session logging
CREATE TABLE IF NOT EXISTS query_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  response JSONB,
  status TEXT NOT NULL CHECK (status IN ('completed', 'insufficient_evidence', 'failed')),
  retrieved_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Groq nomic-embed-text-v1_5 uses 768 dimensions
ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE embeddings ALTER COLUMN model SET DEFAULT 'nomic-embed-text-v1_5';

CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON embeddings USING hnsw (embedding vector_cosine_ops);
