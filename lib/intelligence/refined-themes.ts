import { getPool } from "@/lib/db";
import { buildFilterClause } from "@/lib/reports/filters";
import { formatThemeCluster } from "@/lib/intelligence/format";
import {
  refineThemeDistribution,
  resolveThemesForContent,
  type ReviewThemeInput,
} from "@/lib/intelligence/sub-theme-clustering";
import type { ReportFilters } from "@/lib/types/reports";

export interface RefinedThemeRow {
  theme: string;
  label: string;
  count: number;
  pct: number;
}

async function fetchReviewsForThemeAnalysis(
  filters: ReportFilters
): Promise<{ reviews: ReviewThemeInput[]; enrichedTotal: number }> {
  const { where, params } = buildFilterClause(filters, "f");

  const countResult = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}`,
    params
  );
  const enrichedTotal = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const result = await getPool().query<{
    id: string;
    content: string;
    themes: string[];
    sentiment: string;
  }>(
    `SELECT f.id, f.content, e.themes, e.sentiment
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}`,
    params
  );

  return {
    enrichedTotal,
    reviews: result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      themes: row.themes ?? [],
      sentiment: row.sentiment,
    })),
  };
}

/** Theme counts after secondary clustering + 15% share cap. */
export async function getRefinedThemeCounts(
  filters: ReportFilters,
  limit = 20
): Promise<{ themes: RefinedThemeRow[]; enrichedTotal: number }> {
  const { reviews, enrichedTotal } = await fetchReviewsForThemeAnalysis(filters);
  if (enrichedTotal === 0) return { themes: [], enrichedTotal: 0 };

  const distribution = refineThemeDistribution(reviews);

  const themes = distribution.slice(0, limit).map((row) => ({
    theme: row.theme,
    label: formatThemeCluster(row.theme),
    count: row.count,
    pct: Math.round((row.count / enrichedTotal) * 1000) / 10,
  }));

  return { themes, enrichedTotal };
}

export { fetchReviewsForThemeAnalysis, resolveThemesForContent };
