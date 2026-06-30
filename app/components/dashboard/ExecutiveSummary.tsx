"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import gsap from "gsap";
import { KpiCard } from "@/app/components/premium/KpiCard";
import { KpiIconConversations, KpiIconRating } from "@/app/components/premium/KpiIcons";
import { SentimentSplitKpi } from "@/app/components/premium/SentimentSplitKpi";
import { ChartCard } from "@/app/components/dashboard/ChartCard";
import type { DashboardRange, DashboardSummary } from "@/lib/types/dashboard";
import { PASTEL_SENTIMENT } from "@/lib/intelligence/colors";

const RANGES: DashboardRange[] = ["7d", "30d", "90d", "all"];
const AXIS = { fill: "rgba(255,255,255,0.45)", fontSize: 11 };
const TOOLTIP_STYLE = {
  background: "#151517",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#fff",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const SENTIMENT_LINES = [
  { key: "positive_pct", name: "Positive", color: PASTEL_SENTIMENT.positive, countKey: "positive" as const },
  { key: "negative_pct", name: "Negative", color: PASTEL_SENTIMENT.negative, countKey: "negative" as const },
  { key: "neutral_pct", name: "Neutral", color: PASTEL_SENTIMENT.neutral, countKey: "neutral" as const },
];

function absoluteDelta(kpi: DashboardSummary["avg_rating"]): number | null {
  if (kpi.direction === "flat") return null;
  return kpi.delta;
}

function formatPeriod(period: string, range: DashboardRange): string {
  const d = new Date(`${period}T12:00:00`);
  if (range === "all") {
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function priorPeriodLabel(range: DashboardRange): string {
  switch (range) {
    case "7d":
      return "last week";
    case "30d":
      return "last month";
    case "90d":
      return "prior 90 days";
    default:
      return "prior period";
  }
}

function isSentimentTrendFlat(
  data: DashboardSummary["sentiment_chart"]
): boolean {
  if (data.length < 2) return true;
  const spread = (key: "positive_pct" | "negative_pct" | "neutral_pct") =>
    Math.max(...data.map((d) => d[key])) - Math.min(...data.map((d) => d[key]));
  return (
    spread("positive_pct") < 1.5 &&
    spread("negative_pct") < 1.5 &&
    spread("neutral_pct") < 1.5
  );
}

function sentimentInsight(
  data: DashboardSummary["sentiment_chart"],
  range: DashboardRange
): string | null {
  if (data.length === 0) return null;

  if (isSentimentTrendFlat(data)) {
    return "Sentiment stable over this period — positive, negative, and neutral shares stayed within a narrow band.";
  }

  if (data.length < 2) return null;
  const latest = data[data.length - 1];
  const previous = data[data.length - 2];
  const negDelta = latest.negative_pct - previous.negative_pct;
  const posDelta = latest.positive_pct - previous.positive_pct;

  const periodLabel =
    range === "7d" ? "day" : range === "all" ? "month" : "week";

  if (Math.abs(negDelta) >= 2) {
    const dir = negDelta > 0 ? "rose" : "fell";
    return `Negative share ${dir} ${Math.abs(negDelta).toFixed(1)}% versus the prior ${periodLabel} (${latest.negative_pct}% vs ${previous.negative_pct}%).`;
  }
  if (Math.abs(posDelta) >= 2) {
    const dir = posDelta > 0 ? "rose" : "fell";
    return `Positive share ${dir} ${Math.abs(posDelta).toFixed(1)}% versus the prior ${periodLabel}.`;
  }
  return `Sentiment has been stable over this period — ${latest.positive_pct}% positive, ${latest.negative_pct}% negative in the latest ${periodLabel}.`;
}

export function ExecutiveSummary({
  summary,
  basePath,
  hideRange = false,
}: {
  summary: DashboardSummary;
  basePath: string;
  hideRange?: boolean;
}) {
  const searchParams = useSearchParams();
  const chartRef = useRef<HTMLDivElement>(null);
  const currentRange = summary.range;

  function rangeHref(range: DashboardRange): string {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", range);
    return `${basePath}?${next.toString()}`;
  }

  const chartData = summary.sentiment_chart.map((p) => ({
    ...p,
    label: formatPeriod(p.period, currentRange),
  }));

  const insight = sentimentInsight(summary.sentiment_chart, currentRange);
  const trendIsFlat = isSentimentTrendFlat(summary.sentiment_chart);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.65, ease: "power3.out", delay: 0.2 }
    );
  }, [summary.range]);

  return (
    <section className="executive-summary">
      {!hideRange && (
        <div className="premium-range-pills" role="tablist" aria-label="Date range">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={rangeHref(range)}
              className={`premium-range-pill ${currentRange === range ? "premium-range-pill-active" : ""}`}
              role="tab"
              aria-selected={currentRange === range}
            >
              {range === "all" ? "All time" : range.toUpperCase()}
            </Link>
          ))}
        </div>
      )}

      <div className="premium-kpi-grid premium-kpi-grid-three">
        <KpiCard
          label="Total conversations"
          value={summary.total_reviews}
          icon={<KpiIconConversations />}
        />
        <KpiCard
          label="Avg rating"
          value={summary.avg_rating.value}
          decimals={1}
          suffix={summary.avg_rating.value > 0 ? " ★" : ""}
          delta={absoluteDelta(summary.avg_rating)}
          deltaKind="rating"
          icon={<KpiIconRating />}
        />
        <SentimentSplitKpi
          positive={summary.positive_pct}
          negative={summary.negative_pct}
          range={currentRange}
        />
      </div>

      <div ref={chartRef}>
        <ChartCard
          premium
          title="Sentiment trend"
          caption="Share of positive, negative, and neutral reviews over time — based on AI-analyzed conversations."
          ariaLabel="Sentiment trend over time"
          insight={!trendIsFlat ? (insight ?? undefined) : undefined}
          explainer={
            trendIsFlat && chartData.length > 0 ? (
              <p className="chart-stable-callout" role="status">
                <strong>Sentiment stable over this period.</strong>{" "}
                Lines look flat because the mix of positive, negative, and neutral
                reviews barely shifted week to week — not a chart error.
                {insight ? ` ${insight}` : ""}
              </p>
            ) : undefined
          }
        >
          {chartData.length === 0 ? (
            <p className="muted">No AI-analyzed reviews in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ left: 8, right: 16, bottom: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "Time period",
                    position: "insideBottom",
                    offset: -4,
                    fill: "rgba(255,255,255,0.35)",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  label={{
                    value: "% of reviews",
                    angle: -90,
                    position: "insideLeft",
                    fill: "rgba(255,255,255,0.35)",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name, item) => {
                    const row = item.payload as (typeof chartData)[number];
                    const line = SENTIMENT_LINES.find((l) => l.name === name);
                    const count = line ? row[line.countKey] : 0;
                    const pct = typeof value === "number" ? value : 0;
                    return [`${pct}% (${count.toLocaleString()} reviews)`, name];
                  }}
                />
                <Legend />
                {SENTIMENT_LINES.map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: line.color }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
