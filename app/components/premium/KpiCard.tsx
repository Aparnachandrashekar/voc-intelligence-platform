"use client";

import { CountUp } from "./CountUp";
import { formatMetricDelta, type MetricDeltaKind } from "@/lib/intelligence/display";

export function KpiCard({
  label,
  value,
  suffix = "",
  decimals = 0,
  delta,
  deltaKind = "percent",
  invertDelta = false,
  icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  delta?: number | null;
  deltaKind?: MetricDeltaKind;
  invertDelta?: boolean;
  icon?: React.ReactNode;
}) {
  const deltaUp = (delta ?? 0) > 0;
  const good = invertDelta ? !deltaUp : deltaUp;
  const deltaLabel =
    delta !== null && delta !== undefined
      ? formatMetricDelta(delta, deltaKind)
      : null;

  return (
    <article className="premium-kpi premium-kpi-unified" data-reveal>
      <div className="premium-kpi-top">
        {icon && <span className="premium-kpi-icon">{icon}</span>}
        <p className="premium-kpi-label">{label}</p>
      </div>
      <div className="premium-kpi-tag-row" aria-hidden>
        <span className="premium-kpi-tag-spacer" />
      </div>
      <div className="premium-kpi-value-zone">
        <p className="premium-kpi-value">
          <CountUp value={value} decimals={decimals} suffix={suffix} />
        </p>
      </div>
      <div className="premium-kpi-delta-zone">
        {deltaLabel ? (
          <p className={`premium-kpi-delta ${good ? "up" : "down"}`}>
            {deltaLabel}
          </p>
        ) : (
          <span className="premium-kpi-delta-placeholder" aria-hidden />
        )}
      </div>
    </article>
  );
}
