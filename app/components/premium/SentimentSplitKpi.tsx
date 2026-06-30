"use client";

import { CountUp } from "./CountUp";
import { KpiIconSentiment } from "./KpiIcons";
import type { DashboardRange, KpiDelta } from "@/lib/types/dashboard";

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

function formatSentimentChange(kpi: KpiDelta, range: DashboardRange): string {
  const ref = priorPeriodLabel(range);
  if (kpi.direction === "flat" || Math.abs(kpi.delta) < 0.05) {
    return `No change vs ${ref}`;
  }
  const sign = kpi.delta > 0 ? "+" : "";
  return `${sign}${kpi.delta.toFixed(1)}% vs ${ref}`;
}

export function SentimentSplitKpi({
  positive,
  negative,
  range,
}: {
  positive: KpiDelta;
  negative: KpiDelta;
  range: DashboardRange;
}) {
  const posChange = formatSentimentChange(positive, range);
  const negChange = formatSentimentChange(negative, range);

  return (
    <article
      className="premium-kpi premium-kpi-unified sentiment-split-kpi"
      data-reveal
    >
      <div className="premium-kpi-top">
        <span className="premium-kpi-icon">
          <KpiIconSentiment />
        </span>
        <p className="premium-kpi-label">Sentiment mix</p>
      </div>
      <div className="premium-kpi-tag-row sentiment-split-tag-row">
        <div className="sentiment-split-half positive">
          <span className="sentiment-split-tag">Positive</span>
        </div>
        <div className="sentiment-split-divider sentiment-split-divider-hidden" aria-hidden />
        <div className="sentiment-split-half negative">
          <span className="sentiment-split-tag">Negative</span>
        </div>
      </div>
      <div className="premium-kpi-value-zone sentiment-split-body">
        <div className="sentiment-split-half positive">
          <p className="premium-kpi-value">
            <CountUp value={positive.value} decimals={1} suffix="%" />
          </p>
        </div>
        <div className="sentiment-split-divider" aria-hidden />
        <div className="sentiment-split-half negative">
          <p className="premium-kpi-value">
            <CountUp value={negative.value} decimals={1} suffix="%" />
          </p>
        </div>
      </div>
      <div className="premium-kpi-delta-zone sentiment-split-delta-row">
        <div className="sentiment-split-half">
          <p className="premium-kpi-delta sentiment-change-label">{posChange}</p>
        </div>
        <div className="sentiment-split-divider sentiment-split-divider-hidden" aria-hidden />
        <div className="sentiment-split-half">
          <p className="premium-kpi-delta sentiment-change-label">{negChange}</p>
        </div>
      </div>
    </article>
  );
}
