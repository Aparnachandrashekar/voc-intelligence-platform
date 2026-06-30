"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/app/components/dashboard/ChartCard";
import { useGsapReveal } from "@/app/components/premium/useGsapReveal";
import { formatPctOfAnalyzed } from "@/lib/intelligence/copy";
import { THEME_VOLUME_BAR_COLOR } from "@/lib/intelligence/theme-chart";
import type { DashboardMetrics, ThemeMetric } from "@/lib/types/dashboard";

const TOOLTIP_STYLE = {
  background: "#151517",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#fff",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const AXIS = { fill: "rgba(255,255,255,0.45)", fontSize: 11 };

function themesInsight(themes: ThemeMetric[]): string {
  const top = themes[0];
  if (!top) return "";
  return `${top.label} leads this period at ${formatPctOfAnalyzed(top.pct, top.count)} of analyzed reviews.`;
}

function ratingInsight(
  ratingData: { rating: string; count: number; pct: number }[],
  total: number
): string {
  if (total <= 0) return "";
  const top = [...ratingData].sort((a, b) => b.count - a.count)[0];
  return `${top.rating} ratings represent ${top.pct}% of reviews — a quick read on overall satisfaction.`;
}

function ThemeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ThemeMetric & { theme: string } }>;
}) {
  if (!active || !payload?.[0]) return null;
  const item = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className="chart-tooltip">
      <strong>{item.theme}</strong>
      <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "#aaa" }}>
        {formatPctOfAnalyzed(item.pct, item.count)}
      </p>
    </div>
  );
}

const SHARED_EXPLAINER =
  "Top Themes ranks specific AI-assigned topics from analyzed reviews — bar length shows what share of conversations mention each named theme. Rating Distribution shows how store reviewers scored the app at each star level as a percentage of all rated reviews in the selected period.";

export function DashboardMetricsGrid({ metrics }: { metrics: DashboardMetrics }) {
  const ref = useGsapReveal();

  const ratingTotal = metrics.rating_distribution.reduce((s, r) => s + r.count, 0);
  const ratingData = [1, 2, 3, 4, 5].map((rating) => {
    const found = metrics.rating_distribution.find((r) => r.rating === rating);
    const count = found?.count ?? 0;
    return {
      rating: `${rating}★`,
      count,
      pct: ratingTotal > 0 ? Math.round((count / ratingTotal) * 1000) / 10 : 0,
    };
  });
  const hasRatings = ratingData.some((r) => r.count > 0);

  const themesData = [...metrics.top_themes]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((t) => ({
      theme: t.label,
      pct: t.pct,
      count: t.count,
    }));

  const hasCharts = themesData.length > 0 || hasRatings;
  if (!hasCharts) return null;

  return (
    <div className="dashboard-metrics-block" ref={ref}>
      <div className="dashboard-grid dashboard-grid-charts">
        {themesData.length > 0 && (
          <ChartCard
            premium
            title="Top Themes"
            ariaLabel="Top review themes by share of analyzed reviews"
            insight={themesInsight(metrics.top_themes)}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={themesData} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, "auto"]}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                  label={{
                    value: "% of analyzed reviews",
                    position: "insideBottom",
                    offset: -2,
                    fill: "rgba(255,255,255,0.35)",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="theme"
                  width={130}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                  label={{
                    value: "Theme",
                    angle: -90,
                    position: "insideLeft",
                    fill: "rgba(255,255,255,0.35)",
                    fontSize: 11,
                  }}
                />
                <Tooltip content={<ThemeTooltip />} />
                <Bar
                  dataKey="pct"
                  radius={[0, 6, 6, 0]}
                  fill={THEME_VOLUME_BAR_COLOR}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {hasRatings && (
          <ChartCard
            premium
            title="Rating Distribution"
            ariaLabel="Star rating distribution"
            insight={ratingInsight(ratingData, ratingTotal)}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ratingData} margin={{ bottom: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="rating"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "Star rating",
                    position: "insideBottom",
                    offset: -4,
                    fill: "rgba(255,255,255,0.35)",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  label={{
                    value: "% of rated reviews",
                    angle: -90,
                    position: "insideLeft",
                    fill: "rgba(255,255,255,0.35)",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, _name, item) => {
                    const row = item.payload as { pct: number; count: number };
                    const pctVal = typeof value === "number" ? value : row.pct;
                    return [`${pctVal}% (${row.count.toLocaleString()} reviews)`, "Share"];
                  }}
                />
                <Bar dataKey="pct" fill="#1ed760" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      <div className="charts-shared-explainer" role="note">
        <p>
          <strong>What this shows:</strong> {SHARED_EXPLAINER}
        </p>
      </div>
    </div>
  );
}
