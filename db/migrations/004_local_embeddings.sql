-- Phase 3: local embeddings (all-MiniLM-L6-v2, 384 dimensions)
-- Groq is not used for embedding; table was empty at migration time.

DROP INDEX IF EXISTS idx_embeddings_vector;

ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(384);
ALTER TABLE embeddings ALTER COLUMN model SET DEFAULT 'Xenova/all-MiniLM-L6-v2';

CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON embeddings USING hnsw (embedding vector_cosine_ops);
