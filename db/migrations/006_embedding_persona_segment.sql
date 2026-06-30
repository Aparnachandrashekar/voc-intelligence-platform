-- Persona segment indexed alongside each embedding for segment-filtered RAG.

ALTER TABLE embeddings
  ADD COLUMN IF NOT EXISTS persona_segment TEXT;

CREATE INDEX IF NOT EXISTS idx_embeddings_persona_segment
  ON embeddings (persona_segment);

-- Backfill from enrichment using the same rules as segment-sql.ts
UPDATE embeddings emb
SET persona_segment = sub.segment
FROM (
  SELECT f.id AS feedback_item_id,
         CASE
           WHEN (
             'pricing' = ANY(e.themes)
             OR f.content ILIKE '% ad %'
             OR f.content ILIKE '% ads %'
             OR f.content ILIKE '%advert%'
           ) AND e.sentiment IN ('negative', 'mixed') THEN 'price_sensitive'
           WHEN (
             'performance' = ANY(e.themes)
             OR f.content ~* 'crash|slow|lag|freeze|bug'
           ) AND e.sentiment IN ('negative', 'mixed', 'neutral') THEN 'technical_issues'
           WHEN cardinality(e.feature_requests) > 0 THEN 'feature_advocate'
           WHEN 'discovery' = ANY(e.themes) OR 'recommendations' = ANY(e.themes) THEN 'discovery_seeker'
           WHEN 'podcasts' = ANY(e.themes) THEN 'podcast_listener'
           WHEN e.sentiment = 'positive' AND (f.rating IS NULL OR f.rating >= 4) THEN 'happy_promoter'
           WHEN e.sentiment = 'negative' AND (f.rating IS NULL OR f.rating <= 2) THEN 'dissatisfied_critic'
           WHEN e.sentiment = 'neutral' THEN 'neutral_observer'
           ELSE 'general'
         END AS segment
  FROM feedback_items f
  INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
) sub
WHERE emb.feedback_item_id = sub.feedback_item_id
  AND (emb.persona_segment IS NULL OR emb.persona_segment <> sub.segment);
