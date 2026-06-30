/** Shared persona classification SQL — requires enrichment_results alias `e` and feedback_items `f`. */
export const SEGMENT_CASE_SQL = `
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
  END
`;

export const DISCOVERY_SCOPE_SQL = `
  (
    'discovery' = ANY(e.themes)
    OR 'recommendations' = ANY(e.themes)
    OR (${SEGMENT_CASE_SQL}) = 'discovery_seeker'
  )
`;
