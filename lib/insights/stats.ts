import { getPool } from "@/lib/db";
import { parseDashboardRange } from "@/lib/dashboard/aggregations";
import { getRefinedThemeCounts } from "@/lib/intelligence/refined-themes";
import { formatThemeCluster, MIN_GROWTH_MENTIONS, MIN_MENTIONS } from "@/lib/intelligence/format";
import { normalizeClusterLabel, sharePctValue } from "@/lib/intelligence/display";
import { buildFilterClause } from "@/lib/reports/filters";
import {
  getOverviewReport,
  getPainPointsReport,
} from "@/lib/reports/aggregations";
import type { DashboardRange } from "@/lib/types/dashboard";
import type {
  InsightStatsSnapshot,
  RisingItem,
} from "@/lib/types/insights";
import type { QuoteEvidence, ReportFilters } from "@/lib/types/reports";

function rangeToDays(range: DashboardRange): number | null {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "all":
      return null;
  }
}

function periodWindows(range: DashboardRange): {
  currentStart: string | null;
  previousStart: string | null;
  previousEnd: string | null;
} {
  const days = rangeToDays(range);
  if (days === null) {
    return { currentStart: null, previousStart: null, previousEnd: null };
  }
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - days);
  const previousEnd = new Date(currentStart);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - days);
  return {
    currentStart: currentStart.toISOString().slice(0, 10),
    previousStart: previousStart.toISOString().slice(0, 10),
    previousEnd: previousEnd.toISOString().slice(0, 10),
  };
}

async function praiseThemeCounts(
  filters: ReportFilters,
  limit = 10
): Promise<{ label: string; count: number }[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const result = await getPool().query<{ theme: string; count: string }>(
    `SELECT label AS theme, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(e.themes) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
       AND e.sentiment IN ('positive', 'mixed')
       AND (f.rating IS NULL OR f.rating >= 4)
     GROUP BY label
     HAVING COUNT(*) >= ${MIN_MENTIONS}
     ORDER BY count DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  return result.rows.map((r) => ({
    label: formatThemeCluster(r.theme),
    count: parseInt(r.count, 10),
  }));
}

async function gapSignalCounts(
  filters: ReportFilters,
  limit = 10
): Promise<{ label: string; count: number }[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const result = await getPool().query<{ label: string; count: string }>(
    `SELECT label, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(
       COALESCE(e.user_goals, ARRAY[]::text[]) ||
       COALESCE(e.feature_requests, ARRAY[]::text[])
     ) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
     GROUP BY label
     HAVING COUNT(*) >= ${MIN_MENTIONS}
     ORDER BY count DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  return result.rows.map((r) => ({
    label: normalizeClusterLabel(r.label),
    count: parseInt(r.count, 10),
  }));
}

function buildFrustrationThemes(
  refinedThemes: Awaited<ReturnType<typeof getRefinedThemeCounts>>["themes"],
  painPoints: { label: string; count: number }[],
  enrichedCount: number
): Array<{ label: string; count: number; pct: number }> {
  const merged = new Map<string, number>();

  for (const theme of refinedThemes) {
    if (theme.theme === "general_positive") continue;
    merged.set(theme.label, theme.count);
  }

  for (const pain of painPoints) {
    const label = normalizeClusterLabel(pain.label);
    merged.set(label, (merged.get(label) ?? 0) + pain.count);
  }

  return [...merged.entries()]
    .map(([label, count]) => ({
      label,
      count,
      pct: sharePctValue(count, enrichedCount),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

async function qualifiedFeatureRequests(
  filters: ReportFilters,
  limit = 15
): Promise<{ label: string; count: number }[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const result = await getPool().query<{ label: string; count: string }>(
    `SELECT label, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(e.feature_requests) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
     GROUP BY label
     HAVING COUNT(*) >= 5
     ORDER BY count DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  return result.rows.map((r) => ({
    label: r.label,
    count: parseInt(r.count, 10),
  }));
}

function joinForFilters(filters: ReportFilters): string {
  return filters.sentiment
    ? "INNER JOIN enrichment_results e ON e.feedback_item_id = f.id"
    : "";
}

function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current >= MIN_GROWTH_MENTIONS ? 100 : null;
  const raw = ((current - previous) / previous) * 100;
  if (!Number.isFinite(raw)) return null;
  const signed = Math.round(raw * 10) / 10;
  return Math.min(Math.max(signed, -999), 999);
}

export async function labelCountsInWindow(
  filters: ReportFilters,
  column: "pain_points" | "feature_requests" | "themes",
  dateFrom: string | null,
  dateTo: string | null,
  limit = 15
): Promise<Map<string, number>> {
  const windowFilters = { ...filters };
  if (dateFrom) windowFilters.dateFrom = dateFrom;
  if (dateTo) windowFilters.dateTo = dateTo;

  const { where, params } = buildFilterClause(windowFilters, "f");
  const join =
    column === "themes" || filters.sentiment
      ? "INNER JOIN enrichment_results e ON e.feedback_item_id = f.id"
      : "INNER JOIN enrichment_results e ON e.feedback_item_id = f.id";

  const result = await getPool().query<{ label: string; count: string }>(
    `SELECT label, COUNT(*)::text AS count
     FROM feedback_items f
     ${join}
     CROSS JOIN LATERAL unnest(e.${column}) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
     GROUP BY label
     ORDER BY count DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.label, parseInt(row.count, 10));
  }
  return map;
}

function computeRising(
  current: Map<string, number>,
  previous: Map<string, number>,
  limit = 5
): RisingItem[] {
  const items: RisingItem[] = [];
  for (const [label, current_count] of current) {
    const previous_count = previous.get(label) ?? 0;
    const delta = current_count - previous_count;
    if (delta <= 0 && previous_count > 0) continue;
    if (current_count < 3 && delta < 2) continue;
    items.push({
      label,
      current_count,
      previous_count,
      change_pct: changePct(current_count, previous_count),
    });
  }
  return items
    .sort((a, b) => b.current_count - a.current_count - (a.previous_count - b.previous_count))
    .slice(0, limit);
}

async function sentimentAndRating(
  filters: ReportFilters,
  dateFrom: string | null,
  dateTo: string | null
) {
  const windowFilters = { ...filters };
  if (dateFrom) windowFilters.dateFrom = dateFrom;
  if (dateTo) windowFilters.dateTo = dateTo;
  const { where, params } = buildFilterClause(windowFilters, "f");
  const join = joinForFilters(windowFilters);

  const sentResult = await getPool().query<{ sentiment: string; count: string }>(
    `SELECT e.sentiment, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}
     GROUP BY e.sentiment`,
    params
  );

  let total = 0;
  const counts: Record<string, number> = {};
  for (const row of sentResult.rows) {
    const c = parseInt(row.count, 10);
    counts[row.sentiment] = c;
    total += c;
  }

  const pct = (n: number) =>
    total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

  const ratingWhere = where
    ? `${where} AND f.rating IS NOT NULL`
    : "WHERE f.rating IS NOT NULL";
  const ratingResult = await getPool().query<{ avg: string | null }>(
    `SELECT AVG(f.rating)::text AS avg
     FROM feedback_items f
     ${join}
     ${ratingWhere}`,
    params
  );

  const volumeResult = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS count
     FROM feedback_items f
     ${join}
     ${where}`,
    params
  );

  return {
    positive_pct: pct(counts.positive ?? 0),
    negative_pct: pct(counts.negative ?? 0),
    neutral_pct: pct(counts.neutral ?? 0),
    avg_rating: ratingResult.rows[0]?.avg
      ? parseFloat(ratingResult.rows[0].avg)
      : null,
    volume: parseInt(volumeResult.rows[0]?.count ?? "0", 10),
  };
}

export async function collectInsightStats(
  filters: ReportFilters,
  rangeInput?: string
): Promise<InsightStatsSnapshot> {
  const range = parseDashboardRange(rangeInput);
  const windows = periodWindows(range);

  const rangeFilters = { ...filters };
  if (windows.currentStart) {
    rangeFilters.dateFrom = windows.currentStart;
  }

  const [overview, painReport, qualifiedFr, currentStats, previousStats, refined, praiseThemes, gapSignals] =
    await Promise.all([
      getOverviewReport(rangeFilters),
      getPainPointsReport(rangeFilters),
      qualifiedFeatureRequests(rangeFilters),
      sentimentAndRating(filters, windows.currentStart, null),
      sentimentAndRating(
        filters,
        windows.previousStart,
        windows.previousEnd
      ),
      getRefinedThemeCounts(rangeFilters, 20),
      praiseThemeCounts(rangeFilters),
      gapSignalCounts(rangeFilters),
    ]);

  const [currentPain, previousPain, currentFr, previousFr] = await Promise.all([
    labelCountsInWindow(
      filters,
      "pain_points",
      windows.currentStart,
      null
    ),
    labelCountsInWindow(
      filters,
      "pain_points",
      windows.previousStart,
      windows.previousEnd
    ),
    labelCountsInWindow(
      filters,
      "feature_requests",
      windows.currentStart,
      null
    ),
    labelCountsInWindow(
      filters,
      "feature_requests",
      windows.previousStart,
      windows.previousEnd
    ),
  ]);

  const rising_pain_points = computeRising(currentPain, previousPain);
  const rising_feature_requests = computeRising(currentFr, previousFr);

  const sample_quotes: QuoteEvidence[] = [];
  for (const item of painReport.pain_points.slice(0, 2)) {
    if (item.quotes[0]) sample_quotes.push(item.quotes[0]);
  }
  for (const item of qualifiedFr.slice(0, 2)) {
    const quotes = await getPool().query<{ id: string; content: string; source: string; sentiment: string }>(
      `SELECT f.id, f.content, f.source, e.sentiment
       FROM feedback_items f
       INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
       WHERE $1 = ANY(e.feature_requests)
       LIMIT 1`,
      [item.label]
    );
    if (quotes.rows[0]) {
      sample_quotes.push({
        feedback_item_id: quotes.rows[0].id,
        content: quotes.rows[0].content,
        source: quotes.rows[0].source,
        author: null,
        created_at: null,
        sentiment: quotes.rows[0].sentiment,
      });
    }
  }

  const top_pain_points = painReport.pain_points
    .slice(0, 8)
    .map((p) => ({ label: normalizeClusterLabel(p.label), count: p.count }));

  const top_frustration_themes = buildFrustrationThemes(
    refined.themes,
    top_pain_points,
    refined.enrichedTotal || overview.enriched_count
  );

  return {
    range,
    total_reviews: overview.total_feedback,
    enriched_count: overview.enriched_count,
    positive_pct: currentStats.positive_pct,
    negative_pct: currentStats.negative_pct,
    neutral_pct: currentStats.neutral_pct,
    avg_rating: currentStats.avg_rating,
    volume_current: currentStats.volume,
    volume_previous: previousStats.volume,
    top_themes: refined.themes.map((t) => ({ label: t.label, count: t.count })),
    top_pain_points,
    top_feature_requests: qualifiedFr.slice(0, 8),
    top_praise_themes: praiseThemes,
    top_gap_signals: gapSignals,
    top_frustration_themes,
    rising_pain_points,
    rising_feature_requests,
    sample_quotes,
    filters: rangeFilters,
  };
}

export { parseDashboardRange };
