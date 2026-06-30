import { getPool } from "@/lib/db";
import { getRefinedThemeCounts } from "@/lib/intelligence/refined-themes";
import { isSpecificNamedTheme } from "@/lib/intelligence/theme-chart";
import { buildFilterClause, needsEnrichmentJoin } from "@/lib/reports/filters";
import {
  getFeatureRequestsReport,
  getOverviewReport,
  getPainPointsReport,
  getTrendsReport,
} from "@/lib/reports/aggregations";
import type {
  DashboardMetrics,
  DashboardRange,
  DashboardSummary,
  KpiDelta,
  PipelineHealth,
  PipelineSourceStatus,
  PipelineStatusResponse,
  SentimentChartPoint,
  SentimentPeriodPoint,
} from "@/lib/types/dashboard";
import type { ReportFilters } from "@/lib/types/reports";

const LIVE_FRESHNESS_DAYS = 7;

const SOURCE_TARGETS: Array<{
  label: string;
  pipeline: string;
  source: string | null;
}> = [
  { label: "Play Store", pipeline: "live_scrape", source: "play_store" },
  { label: "App Store", pipeline: "live_scrape", source: "app_store" },
];

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

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

function computeHealth(
  pipeline: string,
  status: string | null,
  completedAt: Date | null
): PipelineHealth {
  if (!status || status === "failed") return "offline";
  if (status !== "completed" || !completedAt) return "offline";

  const ageMs = Date.now() - completedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= LIVE_FRESHNESS_DAYS) return "online";
  return "stale";
}

function makeDelta(current: number, previous: number): KpiDelta {
  const delta = Math.round((current - previous) * 100) / 100;
  let delta_pct: number | null = null;
  if (previous !== 0) {
    const raw = ((current - previous) / previous) * 100;
    if (Number.isFinite(raw)) {
      delta_pct = Math.min(Math.round(Math.abs(raw) * 10) / 10, 999);
      if (raw < 0) delta_pct = -delta_pct;
    }
  } else if (current >= 10) {
    delta_pct = 100;
  }
  const direction =
    Math.abs(delta) < 0.01 ? "flat" : delta > 0 ? "up" : "down";
  return { value: current, previous, delta, delta_pct, direction };
}

async function getLatestRun(
  pipeline: string,
  source: string | null
): Promise<{
  status: string;
  inserted_count: number;
  completed_at: Date | null;
  error_message: string | null;
} | null> {
  const result = await getPool().query<{
    status: string;
    inserted_count: number;
    completed_at: Date | null;
    error_message: string | null;
  }>(
    `SELECT status, inserted_count, completed_at, error_message
     FROM ingestion_runs
     WHERE pipeline = $1
       AND (($2::text IS NULL AND source IS NULL) OR source = $2)
     ORDER BY started_at DESC
     LIMIT 1`,
    [pipeline, source]
  );
  return result.rows[0] ?? null;
}

export async function getPipelineStatus(): Promise<PipelineStatusResponse> {
  const sources: PipelineSourceStatus[] = [];
  let lastRefresh: Date | null = null;
  let anyOffline = false;
  let anyStale = false;

  for (const target of SOURCE_TARGETS) {
    const run = await getLatestRun(target.pipeline, target.source);
    const completedAt = run?.completed_at ?? null;
    const health = computeHealth(
      target.pipeline,
      run?.status ?? null,
      completedAt
    );

    if (health === "offline") anyOffline = true;
    if (health === "stale") anyStale = true;

    if (completedAt && (!lastRefresh || completedAt > lastRefresh)) {
      lastRefresh = completedAt;
    }

    sources.push({
      label: target.label,
      pipeline: target.pipeline,
      source: target.source,
      health,
      last_updated: completedAt?.toISOString() ?? null,
      inserted_count: run?.inserted_count ?? 0,
      error_message: run?.error_message ?? null,
    });
  }

  const global_status =
    anyOffline || anyStale ? "degraded" : "online";

  return {
    sources,
    global_status,
    last_refresh: lastRefresh?.toISOString() ?? null,
  };
}

function periodBounds(range: DashboardRange): {
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
    currentStart: currentStart.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString(),
  };
}

function joinForFilters(filters: ReportFilters): string {
  return needsEnrichmentJoin(filters)
    ? "INNER JOIN enrichment_results e ON e.feedback_item_id = f.id"
    : "";
}

async function countInWindow(
  filters: ReportFilters,
  start: string | null,
  end: string | null
): Promise<number> {
  const windowFilters = { ...filters };
  if (start) windowFilters.dateFrom = start.slice(0, 10);
  if (end) windowFilters.dateTo = end.slice(0, 10);
  const { where, params } = buildFilterClause(windowFilters, "f");
  const join = joinForFilters(windowFilters);
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS count
     FROM feedback_items f
     ${join}
     ${where}`,
    params
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

async function avgRatingInWindow(
  filters: ReportFilters,
  start: string | null,
  end: string | null
): Promise<number> {
  const windowFilters = { ...filters };
  if (start) windowFilters.dateFrom = start.slice(0, 10);
  if (end) windowFilters.dateTo = end.slice(0, 10);
  const { where, params } = buildFilterClause(windowFilters, "f");
  const join = joinForFilters(windowFilters);
  const ratingWhere = where
    ? `${where} AND f.rating IS NOT NULL`
    : "WHERE f.rating IS NOT NULL";
  const result = await getPool().query<{ avg: string | null }>(
    `SELECT AVG(f.rating)::text AS avg
     FROM feedback_items f
     ${join}
     ${ratingWhere}`,
    params
  );
  return result.rows[0]?.avg ? parseFloat(result.rows[0].avg) : 0;
}

async function sentimentPctsInWindow(
  filters: ReportFilters,
  start: string | null,
  end: string | null
): Promise<{ positive: number; negative: number; neutral: number }> {
  const windowFilters = { ...filters };
  if (start) windowFilters.dateFrom = start.slice(0, 10);
  if (end) windowFilters.dateTo = end.slice(0, 10);
  const { where, params } = buildFilterClause(windowFilters, "f");
  const result = await getPool().query<{ sentiment: string; count: string }>(
    `SELECT e.sentiment, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}
     GROUP BY e.sentiment`,
    params
  );
  let total = 0;
  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    const c = parseInt(row.count, 10);
    counts[row.sentiment] = c;
    total += c;
  }
  return {
    positive: pct(counts.positive ?? 0, total),
    negative: pct(counts.negative ?? 0, total),
    neutral: pct(counts.neutral ?? 0, total),
  };
}

function sentimentTrunc(range: DashboardRange): "day" | "week" | "month" {
  if (range === "7d") return "day";
  if (range === "all") return "month";
  return "week";
}

async function getSentimentTrendSeries(
  range: DashboardRange,
  filters: ReportFilters
): Promise<SentimentChartPoint[]> {
  const days = rangeToDays(range);
  const rangeFilters = { ...filters };
  if (days !== null) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    rangeFilters.dateFrom = start.toISOString().slice(0, 10);
  }

  const { where, params } = buildFilterClause(rangeFilters, "f");
  const trunc = sentimentTrunc(range);

  const result = await getPool().query<{
    period: string;
    sentiment: string;
    count: string;
  }>(
    `SELECT to_char(date_trunc('${trunc}', COALESCE(f.created_at, f.ingested_at)), 'YYYY-MM-DD') AS period,
            e.sentiment,
            COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}
     GROUP BY 1, e.sentiment
     ORDER BY 1 ASC`,
    params
  );

  const pivoted = pivotSentimentTrend(
    result.rows.map((r) => ({
      period: r.period,
      sentiment: r.sentiment,
      count: parseInt(r.count, 10),
    }))
  );

  return pivoted
    .map((p) => {
      const total = p.positive + p.negative + p.neutral + p.mixed;
      return {
        period: p.period,
        positive: p.positive,
        negative: p.negative,
        neutral: p.neutral,
        positive_pct: pct(p.positive, total),
        negative_pct: pct(p.negative, total),
        neutral_pct: pct(p.neutral, total),
        total,
      };
    })
    .filter((p) => p.total > 0);
}

async function getThemeMetrics(
  filters: ReportFilters
): Promise<DashboardMetrics["top_themes"]> {
  const refined = await getRefinedThemeCounts(filters, 24);
  return refined.themes
    .filter((r) => isSpecificNamedTheme(r.theme, r.label))
    .slice(0, 10)
    .map((r) => ({
      label: r.label,
      count: r.count,
      pct: r.pct,
      dominant_sentiment: sentimentHintForTheme(r.theme),
    }));
}

function sentimentHintForTheme(theme: string): string {
  if (theme.includes("positive") || theme === "discovery" || theme === "recommendations") {
    return "positive";
  }
  if (
    theme.includes("negative") ||
    ["performance", "pricing", "ad_frequency", "customer_support"].includes(theme)
  ) {
    return "negative";
  }
  return "mixed";
}

async function buildHeadline(
  filters: ReportFilters,
  range: DashboardRange,
  negativeDelta: KpiDelta,
  overview: Awaited<ReturnType<typeof getOverviewReport>>
): Promise<string> {
  const parts: string[] = [];
  const rangeLabel =
    range === "all" ? "all time" : `the last ${range.replace("d", " days")}`;

  if (Math.abs(negativeDelta.delta) >= 0.5) {
    const dir = negativeDelta.delta > 0 ? "rose" : "fell";
    parts.push(
      `Negative sentiment ${dir} ${Math.abs(negativeDelta.delta).toFixed(1)} pts over ${rangeLabel}`
    );
  }

  const topTheme = overview.top_themes[0];
  if (topTheme) {
    parts.push(
      `leading theme: ${topTheme.label} (${topTheme.count} mentions, ${Math.round((topTheme.count / Math.max(overview.enriched_count, 1)) * 1000) / 10}%)`
    );
  }

  if (parts.length === 0) {
    return `${overview.total_feedback.toLocaleString()} Spotify reviews analyzed over ${rangeLabel}.`;
  }

  return parts.join("; ") + ".";
}

export async function getDashboardSummary(
  range: DashboardRange,
  filters: ReportFilters
): Promise<DashboardSummary> {
  const bounds = periodBounds(range);
  const rangeFilters = { ...filters };
  if (bounds.currentStart) {
    rangeFilters.dateFrom = bounds.currentStart.slice(0, 10);
  }

  const pool = getPool();
  const { where, params } = buildFilterClause(rangeFilters, "f");
  const join = joinForFilters(rangeFilters);

  const totalsResult = await pool.query<{
    total: string;
    live: string;
    historical: string;
  }>(
    `SELECT COUNT(DISTINCT f.id)::text AS total,
            COUNT(DISTINCT f.id)::text AS live,
            '0' AS historical
     FROM feedback_items f
     ${join}
     ${where}`,
    params
  );

  const totalReviews = parseInt(totalsResult.rows[0]?.total ?? "0", 10);
  const liveCount = parseInt(totalsResult.rows[0]?.live ?? "0", 10);
  const historicalCount = parseInt(
    totalsResult.rows[0]?.historical ?? "0",
    10
  );

  const currentVolume = await countInWindow(
    filters,
    bounds.currentStart,
    null
  );
  const previousVolume = await countInWindow(
    filters,
    bounds.previousStart,
    bounds.previousEnd
  );

  const currentRating = await avgRatingInWindow(
    filters,
    bounds.currentStart,
    null
  );
  const previousRating = await avgRatingInWindow(
    filters,
    bounds.previousStart,
    bounds.previousEnd
  );

  const currentSent = await sentimentPctsInWindow(
    filters,
    bounds.currentStart,
    null
  );
  const previousSent = await sentimentPctsInWindow(
    filters,
    bounds.previousStart,
    bounds.previousEnd
  );

  const netCurrent = currentSent.positive - currentSent.negative;
  const netPrevious = previousSent.positive - previousSent.negative;

  const overview = await getOverviewReport(rangeFilters);
  const sentimentChart = await getSentimentTrendSeries(range, filters);

  const negativeDelta = makeDelta(currentSent.negative, previousSent.negative);

  return {
    range,
    total_reviews: totalReviews,
    live_count: liveCount,
    historical_count: historicalCount,
    avg_rating: makeDelta(
      Math.round(currentRating * 100) / 100,
      Math.round(previousRating * 100) / 100
    ),
    positive_pct: makeDelta(currentSent.positive, previousSent.positive),
    negative_pct: negativeDelta,
    neutral_pct: makeDelta(currentSent.neutral, previousSent.neutral),
    volume: makeDelta(currentVolume, previousVolume),
    net_sentiment: makeDelta(netCurrent, netPrevious),
    headline: await buildHeadline(filters, range, negativeDelta, overview),
    sentiment_chart: sentimentChart,
    filters: rangeFilters,
  };
}

function pivotSentimentTrend(
  rows: { period: string; sentiment: string; count: number }[]
): SentimentPeriodPoint[] {
  const byPeriod = new Map<string, SentimentPeriodPoint>();
  for (const row of rows) {
    let point = byPeriod.get(row.period);
    if (!point) {
      point = {
        period: row.period,
        positive: 0,
        negative: 0,
        neutral: 0,
        mixed: 0,
      };
      byPeriod.set(row.period, point);
    }
    const key = row.sentiment as keyof Omit<SentimentPeriodPoint, "period">;
    if (key in point) point[key] = row.count;
  }
  return Array.from(byPeriod.values()).sort((a, b) =>
    a.period.localeCompare(b.period)
  );
}

async function getLiveVsHistorical(
  _filters: ReportFilters
): Promise<DashboardMetrics["live_vs_historical"]> {
  return {
    has_historical: false,
    live: {
      count: 0,
      avg_rating: null,
      positive_pct: 0,
      negative_pct: 0,
      neutral_pct: 0,
    },
    historical: {
      count: 0,
      avg_rating: null,
      positive_pct: 0,
      negative_pct: 0,
      neutral_pct: 0,
    },
  };
}

export async function getDashboardMetrics(
  range: DashboardRange,
  filters: ReportFilters
): Promise<DashboardMetrics> {
  const days = rangeToDays(range);
  const rangeFilters = { ...filters };
  if (days !== null) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    rangeFilters.dateFrom = start.toISOString().slice(0, 10);
  }

  const { where, params } = buildFilterClause(rangeFilters, "f");
  const join = joinForFilters(rangeFilters);
  const trunc = days !== null && days <= 90 ? "day" : "week";

  const ratingDist = await getPool().query<{ rating: number; count: string }>(
    `SELECT f.rating, COUNT(*)::text AS count
     FROM feedback_items f
     ${join}
     ${where ? `${where} AND f.rating IS NOT NULL` : "WHERE f.rating IS NOT NULL"}
     GROUP BY f.rating
     ORDER BY f.rating ASC`,
    params
  );

  const dailyVolume = await getPool().query<{
    period: string;
    count: string;
    avg_rating: string | null;
  }>(
    `SELECT to_char(date_trunc('${trunc}', COALESCE(f.created_at, f.ingested_at)), 'YYYY-MM-DD') AS period,
            COUNT(*)::text AS count,
            AVG(f.rating)::text AS avg_rating
     FROM feedback_items f
     ${join}
     ${where}
     GROUP BY period
     ORDER BY period ASC`,
    params
  );

  const [overview, trends, painPoints, featureRequests, liveVsHistorical] =
    await Promise.all([
      getOverviewReport(rangeFilters),
      getTrendsReport(rangeFilters),
      getPainPointsReport(rangeFilters),
      getFeatureRequestsReport(rangeFilters),
      getLiveVsHistorical(rangeFilters),
    ]);

  const topThemes = await getThemeMetrics(rangeFilters);

  return {
    range,
    enriched_count: overview.enriched_count,
    rating_distribution: ratingDist.rows.map((r) => ({
      rating: r.rating,
      count: parseInt(r.count, 10),
    })),
    daily_volume: dailyVolume.rows.map((r) => ({
      period: r.period,
      count: parseInt(r.count, 10),
      avg_rating: r.avg_rating ? parseFloat(r.avg_rating) : null,
    })),
    daily_rating: dailyVolume.rows.map((r) => ({
      period: r.period,
      count: parseInt(r.count, 10),
      avg_rating: r.avg_rating ? parseFloat(r.avg_rating) : null,
    })),
    sentiment_over_time: pivotSentimentTrend(
      trends.sentiment_over_time.map((p) => ({
        period: p.period,
        sentiment: p.sentiment ?? "neutral",
        count: p.count,
      }))
    ),
    source_breakdown: overview.source_breakdown,
    top_themes: topThemes,
    pain_points: painPoints.pain_points.slice(0, 5),
    feature_requests: featureRequests.feature_requests.slice(0, 5),
    live_vs_historical: liveVsHistorical,
    filters: rangeFilters,
  };
}

export function parseDashboardRange(
  value: string | null | undefined
): DashboardRange {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") {
    return value;
  }
  return "30d";
}
