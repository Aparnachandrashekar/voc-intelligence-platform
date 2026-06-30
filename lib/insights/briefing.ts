import { getEnv } from "@/lib/env";
import { getGroqClient, isGroqConfigured } from "@/lib/groq";
import { formatAnalyzedReviewCount } from "@/lib/intelligence/copy";
import { normalizeClusterLabel, sharePctValue } from "@/lib/intelligence/display";
import { MIN_MENTIONS, formatLabel } from "@/lib/intelligence/format";
import {
  buildExecutiveHeadlineFromStats,
  dedupeInsights,
  frustrationInsightFor,
  opportunityInsightFor,
  themeSummaryFor,
} from "@/lib/intelligence/theme-descriptions";
import { collectInsightStats } from "@/lib/insights/stats";
import type {
  ActionBullet,
  BriefingBullet,
  ExecutiveBriefing,
  ThemeBriefing,
} from "@/lib/types/briefing";
import type { RisingItem } from "@/lib/types/insights";
import type { ReportFilters } from "@/lib/types/reports";

const BRIEFING_PROMPT = `You are a senior product intelligence analyst writing an executive briefing for Spotify leadership.
You receive PRE-COMPUTED SQL statistics. Use ONLY those numbers and labels — never invent metrics.
Write in crisp editorial prose. No chatbot tone.
Return valid JSON:
{
  "executive_headline": "one powerful sentence, 12-20 words, editorial tone — MUST name the top frustration theme by volume from top_frustration_themes",
  "frustration_insights": ["5 one-line insights, each under 14 words, for top_frustration_themes in order — unique per theme, no template reuse"],
  "opportunity_insights": ["5 one-line insights for top_opportunity_signals in order — must NOT repeat frustration themes"],
  "action_insights": ["5 one-line insights for recommended PM actions in order"]
}
Insights should explain why the item matters — not repeat the label. No invented numbers. No duplicate phrasing across items.`;

const THEME_PROMPT = `You are a Spotify product strategist. Given theme stats and sample quotes, return JSON:
{
  "ai_summary": "2 unique sentences specific to this theme — no generic filler",
  "suggested_actions": ["2-3 specific product actions unique to this theme"]
}
Use only provided data. Editorial tone. Never reuse phrasing from other themes.`;

function pct(count: number, total: number): number {
  return sharePctValue(count, total);
}

function risingMap(items: RisingItem[]): Map<string, RisingItem> {
  return new Map(items.map((r) => [r.label.toLowerCase(), r]));
}

function buildFrustrationBullets(
  stats: Awaited<ReturnType<typeof collectInsightStats>>,
  insights: string[] = []
): BriefingBullet[] {
  const rising = risingMap(stats.rising_pain_points);
  type FrustrationItem = { label: string; count: number; pct: number };
  const items: FrustrationItem[] =
    stats.top_frustration_themes.length > 0
      ? stats.top_frustration_themes
      : stats.top_pain_points.map((p) => ({
          label: normalizeClusterLabel(p.label),
          count: p.count,
          pct: pct(p.count, stats.enriched_count),
        }));

  const cleanedInsights = dedupeInsights(insights);

  return items.slice(0, 5).map((item, i) => ({
    label: item.label,
    pct: item.pct,
    count: item.count,
    insight:
      cleanedInsights[i]?.trim() ||
      frustrationInsightFor(
        item.label,
        rising.get(item.label.toLowerCase())?.change_pct
      ),
  }));
}

function buildOpportunityBullets(
  stats: Awaited<ReturnType<typeof collectInsightStats>>,
  insights: string[] = []
): BriefingBullet[] {
  const risingFr = risingMap(stats.rising_feature_requests);
  const frustrationLabels = new Set(
    stats.top_frustration_themes.map((t) => t.label.toLowerCase())
  );

  type OppItem = { label: string; count: number; source: "praise" | "request" | "gap" };

  const candidates: OppItem[] = [];

  for (const item of stats.top_praise_themes) {
    if (item.count < MIN_MENTIONS) continue;
    if (frustrationLabels.has(item.label.toLowerCase())) continue;
    candidates.push({
      label: normalizeClusterLabel(item.label),
      count: item.count,
      source: "praise",
    });
  }

  for (const item of stats.rising_feature_requests) {
    if (item.current_count < MIN_MENTIONS) continue;
    const label = normalizeClusterLabel(item.label);
    if (frustrationLabels.has(label.toLowerCase())) continue;
    candidates.push({ label, count: item.current_count, source: "request" });
  }

  for (const item of stats.top_feature_requests) {
    if (item.count < MIN_MENTIONS) continue;
    const label = normalizeClusterLabel(item.label);
    if (frustrationLabels.has(label.toLowerCase())) continue;
    candidates.push({ label, count: item.count, source: "request" });
  }

  for (const item of stats.top_gap_signals) {
    if (item.count < MIN_MENTIONS) continue;
    const label = normalizeClusterLabel(item.label);
    if (frustrationLabels.has(label.toLowerCase())) continue;
    candidates.push({ label, count: item.count, source: "gap" });
  }

  const seen = new Set<string>();
  const items: OppItem[] = [];
  for (const item of candidates) {
    const key = item.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= 5) break;
  }

  const cleanedInsights = dedupeInsights(insights);

  return items.map((item, i) => ({
    label: item.label,
    pct: pct(item.count, stats.enriched_count),
    count: item.count,
    insight:
      cleanedInsights[i]?.trim() ||
      opportunityInsightFor(
        item.label,
        item.source,
        risingFr.get(item.label.toLowerCase())?.change_pct
      ),
  }));
}

function buildActionBullets(
  actions: string[],
  stats: Awaited<ReturnType<typeof collectInsightStats>>,
  insights: string[] = []
): ActionBullet[] {
  const topFrustration = stats.top_frustration_themes[0];
  const cleanedInsights = dedupeInsights(insights);

  return actions.slice(0, 5).map((action, i) => ({
    label: action,
    insight:
      cleanedInsights[i]?.trim() ||
      (topFrustration
        ? `Addresses ${topFrustration.label.toLowerCase()} — the highest-volume frustration at ${topFrustration.pct}% of reviews.`
        : `Targets a leading user pain signal in the current review corpus.`),
  }));
}

function fallbackBriefing(
  stats: Awaited<ReturnType<typeof collectInsightStats>>
): ExecutiveBriefing {
  const headline = buildExecutiveHeadlineFromStats({
    enriched_count: stats.enriched_count,
    negative_pct: stats.negative_pct,
    frustration_items: stats.top_frustration_themes,
  });

  const frustrations = buildFrustrationBullets(stats);
  const opportunities = buildOpportunityBullets(stats);
  const actions = buildActionBullets(
    [
      frustrations[0]
        ? `Reduce friction in ${frustrations[0].label.toLowerCase()}`
        : "Investigate top playback complaints",
      opportunities[0]
        ? `Expand ${opportunities[0].label.toLowerCase()} capabilities users praise or request`
        : "Validate top feature request with user research",
      "Audit recommendation diversity in personalized feeds",
      "Improve offline download reliability for Premium users",
      "Review free-tier ad pacing against session length",
    ],
    stats
  );

  return {
    status: "completed",
    executive_headline: headline,
    what_changed: `Positive sentiment sits at ${stats.positive_pct}% with ${stats.negative_pct}% negative across ${formatAnalyzedReviewCount(stats.enriched_count)}. Volume shifted from ${stats.volume_previous.toLocaleString()} to ${stats.volume_current.toLocaleString()} in the selected window.`,
    biggest_frustrations: frustrations.map(
      (b) => `${b.label} — ${b.pct}% (${b.count.toLocaleString()})`
    ),
    emerging_opportunities: opportunities.map(
      (b) => `${b.label} — ${b.pct}% (${b.count.toLocaleString()})`
    ),
    recommended_actions: actions.map((b) => b.label),
    frustration_bullets: frustrations,
    opportunity_bullets: opportunities,
    action_bullets: actions,
    supporting_evidence: stats.sample_quotes.slice(0, 3),
    generated_at: new Date().toISOString(),
    groq_used: false,
  };
}

export async function generateExecutiveBriefing(
  filters: ReportFilters,
  range?: string
): Promise<ExecutiveBriefing> {
  const stats = await collectInsightStats(filters, range);

  if (stats.enriched_count === 0) {
    return {
      status: "unavailable",
      executive_headline: "Waiting for AI-analyzed review data",
      what_changed: "",
      biggest_frustrations: [],
      emerging_opportunities: [],
      recommended_actions: [],
      frustration_bullets: [],
      opportunity_bullets: [],
      action_bullets: [],
      supporting_evidence: [],
      generated_at: new Date().toISOString(),
      groq_used: false,
    };
  }

  if (!isGroqConfigured()) {
    return fallbackBriefing(stats);
  }

  try {
    const groq = getGroqClient();
    const env = getEnv();
    const response = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: BRIEFING_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            stats: {
              total_reviews: stats.total_reviews,
              positive_pct: stats.positive_pct,
              negative_pct: stats.negative_pct,
              neutral_pct: stats.neutral_pct,
              avg_rating: stats.avg_rating,
              volume_current: stats.volume_current,
              volume_previous: stats.volume_previous,
              top_frustration_themes: stats.top_frustration_themes,
              top_praise_themes: stats.top_praise_themes,
              top_feature_requests: stats.top_feature_requests,
              top_gap_signals: stats.top_gap_signals,
              rising_feature_requests: stats.rising_feature_requests,
            },
          }),
        },
      ],
    });

    const parsed = JSON.parse(
      response.choices[0]?.message?.content ?? "{}"
    ) as Partial<{
      executive_headline: string;
      frustration_insights: string[];
      opportunity_insights: string[];
      action_insights: string[];
      recommended_actions: string[];
    }>;

    const fallback = fallbackBriefing(stats);
    const frustrations = buildFrustrationBullets(
      stats,
      parsed.frustration_insights
    );
    const opportunities = buildOpportunityBullets(
      stats,
      parsed.opportunity_insights
    );
    const actionLabels =
      parsed.recommended_actions?.length
        ? parsed.recommended_actions
        : fallback.action_bullets.map((a) => a.label);
    const actions = buildActionBullets(
      actionLabels,
      stats,
      parsed.action_insights
    );

    const dynamicHeadline = buildExecutiveHeadlineFromStats({
      enriched_count: stats.enriched_count,
      negative_pct: stats.negative_pct,
      frustration_items: stats.top_frustration_themes,
    });

    return {
      status: "completed",
      executive_headline: parsed.executive_headline?.trim() || dynamicHeadline,
      what_changed: "",
      biggest_frustrations: frustrations.map(
        (b) => `${b.label} — ${b.pct}% (${b.count.toLocaleString()})`
      ),
      emerging_opportunities: opportunities.map(
        (b) => `${b.label} — ${b.pct}% (${b.count.toLocaleString()})`
      ),
      recommended_actions: actions.map((a) => a.label),
      frustration_bullets: frustrations,
      opportunity_bullets: opportunities,
      action_bullets: actions,
      supporting_evidence: stats.sample_quotes.slice(0, 4),
      generated_at: new Date().toISOString(),
      groq_used: true,
    };
  } catch {
    return fallbackBriefing(stats);
  }
}

export async function generateThemeBriefing(
  theme: string,
  count: number,
  changePct: number | null,
  quotes: { content: string; source: string; sentiment: string }[]
): Promise<ThemeBriefing> {
  const fallback: ThemeBriefing = {
    theme,
    ai_summary: themeSummaryFor(theme, count, changePct, quotes[0]?.sentiment),
    suggested_actions: [
      `Prioritize a focused sprint on ${formatLabel(theme).toLowerCase()} based on ${count} review mentions.`,
      `Validate user expectations with targeted interviews on ${formatLabel(theme).toLowerCase()} before shipping changes.`,
    ],
    quotes: quotes.map((q, i) => ({
      feedback_item_id: `theme-${i}`,
      content: q.content,
      source: q.source,
      author: null,
      created_at: null,
      sentiment: q.sentiment,
    })),
  };

  if (!isGroqConfigured()) return fallback;

  try {
    const groq = getGroqClient();
    const env = getEnv();
    const response = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: THEME_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ theme, count, changePct, quotes }),
        },
      ],
    });
    const parsed = JSON.parse(
      response.choices[0]?.message?.content ?? "{}"
    ) as Partial<{ ai_summary: string; suggested_actions: string[] }>;
    return {
      ...fallback,
      ai_summary: parsed.ai_summary ?? fallback.ai_summary,
      suggested_actions: dedupeInsights(
        parsed.suggested_actions ?? fallback.suggested_actions
      ),
    };
  } catch {
    return fallback;
  }
}
