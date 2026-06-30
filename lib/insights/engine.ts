import { getEnv } from "@/lib/env";
import { getGroqClient, isGroqConfigured } from "@/lib/groq";
import { INSIGHT_ENGINE_SYSTEM_PROMPT } from "@/lib/guardrails/prompts";
import { formatAnalyzedReviewCount } from "@/lib/intelligence/copy";
import { normalizeClusterLabel } from "@/lib/intelligence/display";
import { collectInsightStats } from "@/lib/insights/stats";
import type {
  InsightReport,
  InsightSection,
  InsightStatsSnapshot,
} from "@/lib/types/insights";
import type { ReportFilters } from "@/lib/types/reports";

const SECTION_FOCUS: Record<InsightSection, string> = {
  dashboard:
    "Executive dashboard: balanced view of praise, friction, and opportunities — lead with the biggest shift, not only complaints.",
  overview:
    "Overview report: summarize volume, sentiment mix, and dominant themes.",
  "pain-points":
    "Pain points report: focus on rising complaints and what product teams should address first.",
  "feature-requests":
    "Feature requests report: focus on most-requested capabilities and rising demand.",
  trends:
    "Trends report: describe what is rising vs the prior period and likely drivers.",
};

function buildFallbackReport(
  section: InsightSection,
  stats: InsightStatsSnapshot
): InsightReport {
  const rangeLabel =
    stats.range === "all"
      ? "all time"
      : `the last ${stats.range.replace("d", " days")}`;

  const topPain = stats.top_pain_points[0];
  const topFr = stats.top_feature_requests[0];
  const topTheme = stats.top_themes[0];
  const risingPain = stats.rising_pain_points[0];
  const risingFr = stats.rising_feature_requests[0];

  const headline =
    stats.top_frustration_themes[0]
      ? `${stats.top_frustration_themes[0].label} leads frustration volume at ${stats.top_frustration_themes[0].pct}% of analyzed reviews`
      : stats.positive_pct >= stats.negative_pct && topTheme
        ? `${normalizeClusterLabel(topTheme.label)} leads conversations (${topTheme.count} mentions) — ${stats.positive_pct}% positive overall`
        : risingPain
          ? `Rising friction: ${normalizeClusterLabel(risingPain.label)} (+${risingPain.change_pct ?? "new"}% vs prior period)`
          : topTheme
            ? `Top theme: ${normalizeClusterLabel(topTheme.label)} (${topTheme.count} mentions)`
            : `${stats.total_reviews.toLocaleString()} reviews analyzed`;

  const bullets: string[] = [
    `${stats.total_reviews.toLocaleString()} reviews (${formatAnalyzedReviewCount(stats.enriched_count)}) over ${rangeLabel}.`,
    `Sentiment mix: ${stats.positive_pct}% positive, ${stats.negative_pct}% negative, ${stats.neutral_pct}% neutral.`,
  ];

  if (stats.avg_rating !== null) {
    bullets.push(`Average rating: ${stats.avg_rating.toFixed(1)} stars.`);
  }
  if (topTheme) {
    bullets.push(
      `Most discussed theme: ${normalizeClusterLabel(topTheme.label)} (${topTheme.count} mentions).`
    );
  }
  if (topPain) {
    bullets.push(
      `Top friction theme: ${normalizeClusterLabel(topPain.label)} (${topPain.count} mentions).`
    );
  }
  if (topFr) {
    bullets.push(
      `Top feature request: ${normalizeClusterLabel(topFr.label)} (${topFr.count} mentions).`
    );
  }
  if (risingFr) {
    bullets.push(
      `Rising demand: ${normalizeClusterLabel(risingFr.label)} (+${risingFr.change_pct ?? "new"}% vs prior period).`
    );
  }

  const opportunities: string[] = [];
  for (const item of stats.top_praise_themes.slice(0, 2)) {
    opportunities.push(
      `Users praise ${normalizeClusterLabel(item.label)} in ${item.count} positive reviews — protect and expand this strength.`
    );
  }
  for (const item of stats.rising_feature_requests.slice(0, 2)) {
    opportunities.push(
      `Rising request: ${normalizeClusterLabel(item.label)} (${item.current_count} mentions, was ${item.previous_count}).`
    );
  }
  for (const item of stats.top_gap_signals.slice(0, 2)) {
    opportunities.push(
      `Users describe an unmet need: ${normalizeClusterLabel(item.label)} (${item.count} mentions).`
    );
  }
  if (opportunities.length === 0 && topFr) {
    opportunities.push(
      `Prioritize roadmap exploration for ${normalizeClusterLabel(topFr.label)}.`
    );
  }

  return {
    status: "completed",
    section,
    headline,
    summary: bullets.slice(0, 2).join(" "),
    narrative_bullets: bullets,
    opportunities,
    rising_complaints: stats.rising_pain_points,
    rising_requests: stats.rising_feature_requests,
    stats,
    generated_at: new Date().toISOString(),
    groq_used: false,
  };
}

export async function generateInsights(
  section: InsightSection,
  filters: ReportFilters,
  range?: string
): Promise<InsightReport> {
  const stats = await collectInsightStats(filters, range);

  if (stats.enriched_count === 0) {
    return {
      status: "unavailable",
      section,
      headline: "No AI-analyzed reviews yet",
      summary: "Run enrichment after ingestion to generate insights.",
      narrative_bullets: [],
      opportunities: [],
      rising_complaints: [],
      rising_requests: [],
      stats,
      generated_at: new Date().toISOString(),
      groq_used: false,
    };
  }

  if (!isGroqConfigured()) {
    return buildFallbackReport(section, stats);
  }

  const env = getEnv();
  const groq = getGroqClient();
  const focus = SECTION_FOCUS[section];

  const payload = {
    focus,
    stats: {
      range: stats.range,
      total_reviews: stats.total_reviews,
      enriched_count: stats.enriched_count,
      positive_pct: stats.positive_pct,
      negative_pct: stats.negative_pct,
      neutral_pct: stats.neutral_pct,
      avg_rating: stats.avg_rating,
      volume_current: stats.volume_current,
      volume_previous: stats.volume_previous,
      top_themes: stats.top_themes.map((t) => ({
        ...t,
        label: normalizeClusterLabel(t.label),
      })),
      top_pain_points: stats.top_pain_points.map((p) => ({
        ...p,
        label: normalizeClusterLabel(p.label),
      })),
      top_feature_requests: stats.top_feature_requests.map((f) => ({
        ...f,
        label: normalizeClusterLabel(f.label),
      })),
      rising_pain_points: stats.rising_pain_points.map((r) => ({
        ...r,
        label: normalizeClusterLabel(r.label),
      })),
      rising_feature_requests: stats.rising_feature_requests.map((r) => ({
        ...r,
        label: normalizeClusterLabel(r.label),
      })),
    },
  };

  try {
    const response = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INSIGHT_ENGINE_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      headline?: string;
      summary?: string;
      narrative_bullets?: string[];
      opportunities?: string[];
    };

    return {
      status: "completed",
      section,
      headline: parsed.headline ?? buildFallbackReport(section, stats).headline,
      summary: parsed.summary ?? "",
      narrative_bullets: parsed.narrative_bullets ?? [],
      opportunities: parsed.opportunities ?? [],
      rising_complaints: stats.rising_pain_points,
      rising_requests: stats.rising_feature_requests,
      stats,
      generated_at: new Date().toISOString(),
      groq_used: true,
    };
  } catch {
    return buildFallbackReport(section, stats);
  }
}
