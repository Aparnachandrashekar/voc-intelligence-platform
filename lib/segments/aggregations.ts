import { getPool } from "@/lib/db";
import { getEnv } from "@/lib/env";
import {
  formatPersona,
  formatThemeCluster,
} from "@/lib/intelligence/format";
import { buildFilterClause } from "@/lib/reports/filters";
import { formatPersonaConfidenceLabel } from "@/lib/segments/persona-confidence";
import { SEGMENT_CASE_SQL } from "@/lib/segments/segment-sql";
import type {
  ClusterSentiment,
  SegmentPersona,
  SegmentsIntelligenceReport,
} from "@/lib/types/intelligence";
import type { QuoteEvidence, ReportFilters } from "@/lib/types/reports";

export const SEGMENT_META: Record<
  string,
  { label: string; description: string }
> = {
  discovery_seeker: {
    label: "Discovery Enthusiasts",
    description:
      "Actively hunting for new artists and fresh playlists — frustrated when recommendations recycle the same tracks or feel predictable.",
  },
  feature_advocate: {
    label: "Feature Advocates",
    description:
      "Pushing for specific product capabilities — wants Spotify to add, fix, or improve particular listening features.",
  },
  price_sensitive: {
    label: "Price & Ad-Sensitive Users",
    description:
      "Managing subscription cost and ad interruptions — pushes back when pricing or ads get in the way of listening.",
  },
  technical_issues: {
    label: "Reliability-Focused Users",
    description:
      "Expecting reliable playback on every session — blocked when the app crashes, lags, or drains battery.",
  },
  happy_promoter: {
    label: "Satisfied Promoters",
    description:
      "Getting daily value from Spotify — shares praise when discovery, playback, and library tools meet expectations.",
  },
  dissatisfied_critic: {
    label: "Frustrated Critics",
    description:
      "Weighing whether to stay on Spotify — vocal when core listening needs, especially discovery, aren't met.",
  },
  neutral_observer: {
    label: "Neutral Observers",
    description:
      "Using Spotify without strong praise or complaint — offers balanced, factual feedback on everyday use.",
  },
  general: {
    label: "General Users",
    description:
      "Reviews without a dominant behavioral signal — mixed topics spanning discovery, playback, and account issues.",
  },
  podcast_listener: {
    label: "Podcast Listeners",
    description:
      "Primarily listening to spoken-word content — outside the core music-discovery focus of this analysis.",
  },
};

function buildSentiment(counts: Record<string, number>): ClusterSentiment {
  const positive = counts.positive ?? 0;
  const negative = counts.negative ?? 0;
  const neutral = counts.neutral ?? 0;
  const mixed = counts.mixed ?? 0;
  const total = positive + negative + neutral + mixed || 1;
  return {
    positive,
    negative,
    neutral,
    mixed,
    negative_pct: Math.round((negative / total) * 1000) / 10,
    positive_pct: Math.round((positive / total) * 1000) / 10,
  };
}

async function fetchQuotesForSegment(
  filters: ReportFilters,
  segment: string,
  limit: number
): Promise<QuoteEvidence[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const segmentIdx = params.length + 1;
  const limitIdx = params.length + 2;
  const segmentClause = `(${SEGMENT_CASE_SQL}) = $${segmentIdx}`;
  const fullWhere = where
    ? `${where} AND ${segmentClause}`
    : `WHERE ${segmentClause}`;

  const result = await getPool().query(
    `SELECT f.id AS feedback_item_id, f.content, f.source, f.author,
            f.created_at, e.sentiment
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${fullWhere}
     ORDER BY f.ingested_at DESC
     LIMIT $${limitIdx}`,
    [...params, segment, limit]
  );

  return result.rows.map((row) => ({
    feedback_item_id: row.feedback_item_id,
    content: row.content.slice(0, 220),
    source: row.source,
    author: row.author,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
    sentiment: row.sentiment,
  }));
}

async function segmentTopLabels(
  filters: ReportFilters,
  segment: string,
  column: "pain_points" | "feature_requests",
  limit = 3
): Promise<{ label: string; count: number }[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const segmentIdx = params.length + 1;
  const limitIdx = params.length + 2;
  const segmentClause = `(${SEGMENT_CASE_SQL}) = $${segmentIdx}`;
  const fullWhere = where
    ? `${where} AND ${segmentClause}`
    : `WHERE ${segmentClause}`;

  const result = await getPool().query<{ label: string; count: string }>(
    `SELECT label, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(e.${column}) AS label
     ${fullWhere}
     AND label <> ''
     GROUP BY label
     HAVING COUNT(*) >= ${5}
     ORDER BY count DESC
     LIMIT $${limitIdx}`,
    [...params, segment, limit]
  );
  return result.rows.map((r) => ({
    label: formatThemeCluster(r.label),
    count: parseInt(r.count, 10),
  }));
}

/** Persona intelligence for User Personas UI and Discovery Deep Dive. */
export async function getSegmentsPersonasReport(
  filters: ReportFilters
): Promise<SegmentsIntelligenceReport> {
  const { where, params } = buildFilterClause(filters, "f");
  const personaSampleK = getEnv().PERSONA_SAMPLE_K;

  const totals = await getPool().query<{ enriched: string }>(
    `SELECT COUNT(DISTINCT e.feedback_item_id)::text AS enriched
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}`,
    params
  );
  const enriched = parseInt(totals.rows[0]?.enriched ?? "0", 10);

  const ranked = await getPool().query<{
    segment: string;
    count: string;
    positive: string;
    negative: string;
    neutral: string;
    mixed: string;
  }>(
    `WITH classified AS (
       SELECT ${SEGMENT_CASE_SQL} AS segment, e.sentiment
       FROM feedback_items f
       INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
       ${where}
     )
     SELECT segment,
            COUNT(*)::text AS count,
            COUNT(*) FILTER (WHERE sentiment = 'positive')::text AS positive,
            COUNT(*) FILTER (WHERE sentiment = 'negative')::text AS negative,
            COUNT(*) FILTER (WHERE sentiment = 'neutral')::text AS neutral,
            COUNT(*) FILTER (WHERE sentiment = 'mixed')::text AS mixed
     FROM classified
     GROUP BY segment
     HAVING COUNT(*) >= ${5}
     ORDER BY count DESC`,
    params
  );

  const personas: SegmentPersona[] = [];
  for (const row of ranked.rows) {
    const count = parseInt(row.count, 10);
    if (row.segment === "general" && count < enriched * 0.05) continue;

    const meta = SEGMENT_META[row.segment] ?? SEGMENT_META.general;
    const [complaints, requests, quotes] = await Promise.all([
      segmentTopLabels(filters, row.segment, "pain_points"),
      segmentTopLabels(filters, row.segment, "feature_requests"),
      fetchQuotesForSegment(filters, row.segment, personaSampleK),
    ]);

    const sentiment = buildSentiment({
      positive: parseInt(row.positive, 10),
      negative: parseInt(row.negative, 10),
      neutral: parseInt(row.neutral, 10),
      mixed: parseInt(row.mixed, 10),
    });

    personas.push({
      segment: row.segment,
      label: formatPersona(row.segment),
      description: meta.description,
      confidence_label: formatPersonaConfidenceLabel(count),
      volume: count,
      percentage: enriched > 0 ? Math.round((count / enriched) * 1000) / 10 : 0,
      sentiment,
      top_complaints: complaints,
      top_requests: requests,
      top_opportunities: requests
        .slice(0, 2)
        .map((r) => `Evaluate demand for ${r.label}`),
      quotes,
    });
  }

  personas.sort((a, b) => {
    if (a.segment === "podcast_listener") return 1;
    if (b.segment === "podcast_listener") return -1;
    return b.volume - a.volume;
  });

  return {
    personas,
    enriched_count: enriched,
    filters,
    has_insights: personas.length > 0,
  };
}

/** Simple JSON shape for /api/reports/segments consumers. */
export async function getSegmentsReport(filters: ReportFilters) {
  const report = await getSegmentsPersonasReport(filters);
  return {
    total_feedback: report.enriched_count,
    enriched_count: report.enriched_count,
    segments: report.personas.map((p) => ({
      segment: p.segment,
      label: p.label,
      description: p.description,
      count: p.volume,
      percentage: p.percentage,
      avg_rating: null,
      dominant_sentiment:
        p.sentiment.negative_pct > p.sentiment.positive_pct
          ? "negative"
          : "positive",
      sample_quotes: p.quotes.slice(0, 2),
    })),
    filters: report.filters,
  };
}
