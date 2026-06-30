import { getPool } from "@/lib/db";
import { labelCountsInWindow } from "@/lib/insights/stats";
import { getRefinedThemeCounts } from "@/lib/intelligence/refined-themes";
import { SUB_THEME_RULES } from "@/lib/intelligence/sub-theme-clustering";
import { buildFilterClause } from "@/lib/reports/filters";
import {
  formatFeatureRequest,
  formatThemeCluster,
  meetsThreshold,
  MIN_GROWTH_MENTIONS,
} from "@/lib/intelligence/format";
import type {
  ClusterSentiment,
  ExploreInsightCard,
  RoadmapIntelligenceReport,
  RoadmapItem,
  ThemeCluster,
  VocIntelligenceReport,
} from "@/lib/types/intelligence";
import type { QuoteEvidence, ReportFilters } from "@/lib/types/reports";

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

function polarizingScore(s: ClusterSentiment): number {
  if (s.positive === 0 || s.negative === 0) return 0;
  const total = s.positive + s.negative + s.neutral + s.mixed;
  return Math.round((Math.min(s.positive, s.negative) / total) * 1000) / 10;
}

function lovedScore(s: ClusterSentiment, count: number): number {
  return Math.round(s.positive_pct * count) / 100;
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
  const fullWhere = where ? `${where} AND ${labelClause}` : `WHERE ${labelClause}`;

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
    content: row.content.slice(0, 280),
    source: row.source,
    author: row.author,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
    sentiment: row.sentiment,
  }));
}

async function labelSentimentCounts(
  filters: ReportFilters,
  column: "pain_points" | "feature_requests" | "themes"
): Promise<Map<string, ClusterSentiment>> {
  const { where, params } = buildFilterClause(filters, "f");
  const result = await getPool().query<{ label: string; sentiment: string; count: string }>(
    `SELECT label, e.sentiment, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(e.${column}) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
     GROUP BY label, e.sentiment`,
    params
  );

  const map = new Map<string, Record<string, number>>();
  for (const row of result.rows) {
    const counts = map.get(row.label) ?? {};
    counts[row.sentiment] = parseInt(row.count, 10);
    map.set(row.label, counts);
  }

  return new Map(
    [...map.entries()].map(([label, counts]) => [label, buildSentiment(counts)])
  );
}

async function rankedLabels(
  filters: ReportFilters,
  column: "pain_points" | "feature_requests" | "themes",
  limit = 20
): Promise<{ label: string; count: number }[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const result = await getPool().query<{ label: string; count: string }>(
    `SELECT label, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     CROSS JOIN LATERAL unnest(e.${column}) AS label
     ${where ? `${where} AND label <> ''` : "WHERE label <> ''"}
     GROUP BY label
     HAVING COUNT(*) >= ${5}
     ORDER BY count DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );
  return result.rows.map((r) => ({
    label: r.label,
    count: parseInt(r.count, 10),
  }));
}

function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current >= MIN_GROWTH_MENTIONS ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function buildClusters(
  filters: ReportFilters,
  column: "pain_points" | "feature_requests" | "themes",
  formatName: (raw: string) => string,
  rangeDays = 30
): Promise<ThemeCluster[]> {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - rangeDays);
  const previousEnd = new Date(currentStart);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - rangeDays);

  const [ranked, sentiments, currentMap, previousMap] = await Promise.all([
    rankedLabels(filters, column),
    labelSentimentCounts(filters, column),
    labelCountsInWindow(
      filters,
      column,
      currentStart.toISOString().slice(0, 10),
      null
    ),
    labelCountsInWindow(
      filters,
      column,
      previousStart.toISOString().slice(0, 10),
      previousEnd.toISOString().slice(0, 10)
    ),
  ]);

  const clusters: ThemeCluster[] = [];
  for (const row of ranked) {
    if (!meetsThreshold(row.count)) continue;
    const sentiment = sentiments.get(row.label) ?? buildSentiment({});
    const current = currentMap.get(row.label) ?? row.count;
    const previous = previousMap.get(row.label) ?? 0;
    const delta = current - previous;
    const change =
      delta >= MIN_GROWTH_MENTIONS || (previous > 0 && delta !== 0)
        ? changePct(current, previous)
        : null;

    clusters.push({
      id: row.label,
      label: row.label,
      display_name: formatName(row.label),
      count: row.count,
      change_pct: change,
      sentiment,
      polarizing_score: polarizingScore(sentiment),
      quotes: await fetchQuotesForLabel(filters, column, row.label, 3),
    });
  }
  return clusters;
}

async function buildRefinedThemeClusters(
  filters: ReportFilters,
  rangeDays = 30
): Promise<ThemeCluster[]> {
  const { themes } = await getRefinedThemeCounts(filters, 15);
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - rangeDays);

  const clusters: ThemeCluster[] = [];
  for (const row of themes) {
    if (!meetsThreshold(row.count)) continue;
    const rule = SUB_THEME_RULES.find((r) => r.id === row.theme);
    const quotes = rule
      ? await fetchQuotesByContentPattern(filters, rule.pattern, 3)
      : await fetchQuotesForLabel(filters, "themes", row.theme, 3);

    clusters.push({
      id: row.theme,
      label: row.theme,
      display_name: row.label,
      count: row.count,
      change_pct: null,
      sentiment: buildSentiment({}),
      polarizing_score: 0,
      quotes,
    });
  }
  return clusters;
}

async function fetchQuotesByContentPattern(
  filters: ReportFilters,
  pattern: RegExp,
  limit: number
): Promise<QuoteEvidence[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const result = await getPool().query(
    `SELECT f.id AS feedback_item_id, f.content, f.source, f.author,
            f.created_at, e.sentiment
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}
     ORDER BY f.ingested_at DESC
     LIMIT 500`,
    params
  );

  return result.rows
    .filter((row) => pattern.test(String(row.content)))
    .slice(0, limit)
    .map((row) => ({
      feedback_item_id: row.feedback_item_id,
      content: String(row.content).slice(0, 280),
      source: row.source,
      author: row.author,
      created_at: row.created_at?.toISOString?.() ?? row.created_at,
      sentiment: row.sentiment,
    }));
}

export async function getVocIntelligenceReport(
  filters: ReportFilters
): Promise<VocIntelligenceReport> {
  const [frictionsFromPain, opportunitiesFromRequests, themeClusters, refinedThemes] =
    await Promise.all([
      buildClusters(filters, "pain_points", formatThemeCluster),
      buildClusters(filters, "feature_requests", formatFeatureRequest),
      buildClusters(filters, "themes", formatThemeCluster),
      buildRefinedThemeClusters(filters),
    ]);

  /** pain_points / feature_requests are often unique raw strings — fall back to themes. */
  const frictionPool =
    frictionsFromPain.length > 0
      ? frictionsFromPain
      : themeClusters.filter(
          (c) =>
            c.sentiment.negative_pct >= c.sentiment.positive_pct ||
            /negative|pricing|ads|performance|playback|offline|ui_ux|account|shuffle|discovery|recommendations|general_negative|uncategorized_negative/.test(
              c.id
            )
        );

  const opportunityPool =
    opportunitiesFromRequests.length > 0
      ? opportunitiesFromRequests
      : themeClusters.filter(
          (c) =>
            c.sentiment.positive_pct >= 35 ||
            /positive|praise|discovery|recommendations|offline|lyrics|audio|general_positive|uncategorized_positive/.test(
              c.id
            )
        );

  const mergedForGrowth = [...themeClusters, ...frictionsFromPain, ...refinedThemes];

  const fastest_growing = mergedForGrowth
    .filter((c) => c.change_pct !== null && c.change_pct > 0)
    .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))
    .slice(0, 6);

  const most_polarizing = mergedForGrowth
    .filter((c) => c.polarizing_score > 0)
    .sort((a, b) => b.polarizing_score - a.polarizing_score)
    .slice(0, 6);

  const top_frictions = [...frictionPool]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const top_opportunities = [...opportunityPool]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const has_insights =
    top_frictions.length > 0 ||
    top_opportunities.length > 0 ||
    fastest_growing.length > 0 ||
    most_polarizing.length > 0;

  return {
    top_frictions,
    top_opportunities,
    fastest_growing,
    most_polarizing,
    filters,
    has_insights,
  };
}

function toRoadmapItem(c: ThemeCluster): RoadmapItem {
  return {
    ...c,
    loved_score: lovedScore(c.sentiment, c.count),
  };
}

export async function getRoadmapIntelligenceReport(
  filters: ReportFilters
): Promise<RoadmapIntelligenceReport> {
  const items = (await buildClusters(
    filters,
    "feature_requests",
    formatFeatureRequest
  )).map(toRoadmapItem);

  const most_requested = [...items].sort((a, b) => b.count - a.count).slice(0, 8);
  const fastest_growing = [...items]
    .filter((i) => i.change_pct !== null && i.change_pct > 0)
    .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))
    .slice(0, 8);
  const most_loved = [...items]
    .filter((i) => i.sentiment.positive_pct >= 40)
    .sort((a, b) => b.loved_score - a.loved_score)
    .slice(0, 8);
  const most_controversial = [...items]
    .filter((i) => i.polarizing_score > 0)
    .sort((a, b) => b.polarizing_score - a.polarizing_score)
    .slice(0, 8);

  return {
    most_requested,
    fastest_growing,
    most_loved,
    most_controversial,
    filters,
    has_insights: items.length > 0,
  };
}

export function buildExploreInsightCard(
  query: string,
  results: Array<{ content: string; source: string; sentiment?: string }>,
  themes: string[],
  corpusCount?: number
): ExploreInsightCard {
  const sampleCount = results.length;
  const totalMatches = corpusCount ?? sampleCount;
  const negative = results.filter((r) => r.sentiment === "negative").length;
  const positive = results.filter((r) => r.sentiment === "positive").length;
  const neutral = sampleCount - negative - positive;
  const negPct =
    sampleCount > 0 ? Math.round((negative / sampleCount) * 100) : 0;
  const posPct =
    sampleCount > 0 ? Math.round((positive / sampleCount) * 100) : 0;

  const themePhrase =
    themes.slice(0, 2).join(" and ") || "this topic";
  const headline =
    totalMatches > sampleCount
      ? `${totalMatches.toLocaleString()} reviews mention ${themePhrase}`
      : `${sampleCount} reviews surfaced for "${query.slice(0, 60)}${query.length > 60 ? "…" : ""}"`;

  const summary =
    totalMatches > sampleCount
      ? `In a sample of ${sampleCount} closely matched reviews, ${negPct}% are negative and ${posPct}% positive. Top themes include ${themes.slice(0, 3).join(", ") || "mixed signals"}.`
      : `Among matched reviews, ${negPct}% negative · ${posPct}% positive · ${Math.max(neutral, 0)} neutral. Dominant themes: ${themes.slice(0, 3).join(", ") || "mixed signals"}.`;

  return {
    headline,
    summary,
    stat_line: `${totalMatches.toLocaleString()} total · ${posPct}% positive · ${negPct}% negative (sample)`,
    themes: themes.slice(0, 5),
    quotes: results.slice(0, 3).map((r, i) => ({
      feedback_item_id: `explore-${i}`,
      content: r.content.slice(0, 220),
      source: r.source,
      author: null,
      created_at: null,
      sentiment: r.sentiment ?? "neutral",
    })),
  };
}

async function countReviewsMatchingThemes(
  themeKeys: string[]
): Promise<number> {
  if (themeKeys.length === 0) return 0;
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     WHERE e.themes && $1::text[]`,
    [themeKeys]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

async function countReviewsMatchingQuery(query: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     WHERE f.content_tsv @@ websearch_to_tsquery('english', $1)`,
    [query]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export { countReviewsMatchingThemes, countReviewsMatchingQuery };
