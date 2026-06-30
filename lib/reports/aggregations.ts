import { getPool } from "@/lib/db";
import { formatSentiment, formatSource, formatThemeCluster } from "@/lib/intelligence/format";
import { getRefinedThemeCounts } from "@/lib/intelligence/refined-themes";
import { isSpecificNamedTheme } from "@/lib/intelligence/theme-chart";
import { buildFilterClause } from "@/lib/reports/filters";
import type {
  FeatureRequestsReport,
  OverviewReport,
  PainPointsReport,
  QuoteEvidence,
  ReportFilters,
  TrendsReport,
} from "@/lib/types/reports";

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

async function getFilteredFeedbackIds(
  filters: ReportFilters
): Promise<{ total: number; enriched: number }> {
  const { where, params } = buildFilterClause(filters, "f");
  const join = filters.sentiment
    ? "INNER JOIN enrichment_results e ON e.feedback_item_id = f.id"
    : "LEFT JOIN enrichment_results e ON e.feedback_item_id = f.id";

  const result = await getPool().query<{ total: string; enriched: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS total,
            COUNT(DISTINCT e.feedback_item_id)::text AS enriched
     FROM feedback_items f
     ${join}
     ${where}`,
    params
  );
  return {
    total: parseInt(result.rows[0]?.total ?? "0", 10),
    enriched: parseInt(result.rows[0]?.enriched ?? "0", 10),
  };
}

async function fetchQuotesForLabel(
  filters: ReportFilters,
  column: "pain_points" | "feature_requests" | "themes",
  label: string,
  limit = 3
): Promise<QuoteEvidence[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const labelIdx = params.length + 1;
  const limitIdx = params.length + 2;
  const labelClause = `$${labelIdx} = ANY(e.${column})`;
  const fullWhere = where
    ? `${where} AND ${labelClause}`
    : `WHERE ${labelClause}`;

  const result = await getPool().query(
    `SELECT f.id AS feedback_item_id, f.content, f.source, f.author,
            f.created_at, e.sentiment
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${fullWhere}
     ORDER BY f.ingested_at DESC
     LIMIT $${limitIdx}`,
    [...params, label, limit]
  );

  return result.rows.map((row) => ({
    feedback_item_id: row.feedback_item_id,
    content: row.content,
    source: row.source,
    author: row.author,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
    sentiment: row.sentiment,
  }));
}

export async function getOverviewReport(
  filters: ReportFilters
): Promise<OverviewReport> {
  const { total, enriched } = await getFilteredFeedbackIds(filters);
  const { where, params } = buildFilterClause(filters, "f");
  const joinClause = filters.sentiment
    ? "INNER JOIN enrichment_results e ON e.feedback_item_id = f.id"
    : "LEFT JOIN enrichment_results e ON e.feedback_item_id = f.id";

  const sentimentResult = await getPool().query<{ sentiment: string; count: string }>(
    `SELECT e.sentiment, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}
     GROUP BY e.sentiment
     ORDER BY count DESC`,
    params
  );

  const sourceResult = await getPool().query<{ source: string; count: string }>(
    `SELECT f.source, COUNT(*)::text AS count
     FROM feedback_items f
     ${joinClause}
     ${where}
     GROUP BY f.source
     ORDER BY count DESC`,
    params
  );

  const themeResult = await getRefinedThemeCounts(filters, 24);

  return {
    total_feedback: total,
    enriched_count: enriched,
    sentiment_distribution: sentimentResult.rows.map((r) => ({
      label: formatSentiment(r.sentiment),
      count: parseInt(r.count, 10),
      percentage: pct(parseInt(r.count, 10), enriched),
    })),
    source_breakdown: sourceResult.rows.map((r) => ({
      label: formatSource(r.source),
      count: parseInt(r.count, 10),
      percentage: pct(parseInt(r.count, 10), total),
    })),
    top_themes: themeResult.themes
      .filter((r) => isSpecificNamedTheme(r.theme, r.label))
      .slice(0, 10)
      .map((r) => ({
        label: r.label,
        count: r.count,
      })),
    filters,
  };
}

export async function getPainPointsReport(
  filters: ReportFilters
): Promise<PainPointsReport> {
  const { total } = await getFilteredFeedbackIds(filters);
  const { where, params } = buildFilterClause(filters, "f");

  const ranked = await getPool().query<{ label: string; count: string }>(
    `SELECT label, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(e.pain_points) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
     GROUP BY label
     ORDER BY count DESC
     LIMIT 15`,
    params
  );

  const pain_points = await Promise.all(
    ranked.rows.map(async (row) => ({
      label: row.label,
      count: parseInt(row.count, 10),
      quotes: await fetchQuotesForLabel(filters, "pain_points", row.label),
    }))
  );

  return { total_feedback: total, pain_points, filters };
}

export async function getFeatureRequestsReport(
  filters: ReportFilters
): Promise<FeatureRequestsReport> {
  const { total } = await getFilteredFeedbackIds(filters);
  const { where, params } = buildFilterClause(filters, "f");

  const ranked = await getPool().query<{ label: string; count: string }>(
    `SELECT label, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(e.feature_requests) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
     AND label <> ''
     GROUP BY label
     ORDER BY count DESC
     LIMIT 15`,
    params
  );

  const feature_requests = await Promise.all(
    ranked.rows.map(async (row) => ({
      label: row.label,
      count: parseInt(row.count, 10),
      quotes: await fetchQuotesForLabel(filters, "feature_requests", row.label),
    }))
  );

  return { total_feedback: total, feature_requests, filters };
}

export async function getTrendsReport(
  filters: ReportFilters
): Promise<TrendsReport> {
  const { total } = await getFilteredFeedbackIds(filters);
  const { where, params } = buildFilterClause(filters, "f");

  const sentimentTrend = await getPool().query<{
    period: string;
    sentiment: string;
    count: string;
  }>(
    `SELECT to_char(date_trunc('month', COALESCE(f.created_at, f.ingested_at)), 'YYYY-MM') AS period,
            e.sentiment,
            COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}
     GROUP BY period, e.sentiment
     ORDER BY period ASC`,
    params
  );

  const themeTrend = await getPool().query<{
    period: string;
    theme: string;
    count: string;
  }>(
    `SELECT to_char(date_trunc('month', COALESCE(f.created_at, f.ingested_at)), 'YYYY-MM') AS period,
            label AS theme,
            COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(e.themes) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
     GROUP BY period, label
     ORDER BY period ASC, count DESC`,
    params
  );

  const topThemes = new Set<string>();
  for (const row of themeTrend.rows) {
    topThemes.add(row.theme);
    if (topThemes.size >= 5) break;
  }

  return {
    total_feedback: total,
    sentiment_over_time: sentimentTrend.rows.map((r) => ({
      period: r.period,
      sentiment: r.sentiment,
      count: parseInt(r.count, 10),
    })),
    top_themes_over_time: themeTrend.rows
      .filter((r) => topThemes.has(r.theme))
      .map((r) => ({
        period: r.period,
        theme: r.theme,
        count: parseInt(r.count, 10),
      })),
    filters,
  };
}
