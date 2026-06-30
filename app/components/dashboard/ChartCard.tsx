import type { ReactNode } from "react";

export function ChartCard({
  title,
  caption,
  explainer,
  insight,
  ariaLabel,
  children,
  tableFallback,
  premium = false,
}: {
  title: string;
  caption?: string;
  explainer?: ReactNode;
  insight?: string;
  ariaLabel: string;
  children: ReactNode;
  tableFallback?: ReactNode;
  premium?: boolean;
}) {
  return (
    <article
      className={`chart-card ${premium ? "premium-chart" : ""}`}
      aria-label={ariaLabel}
      data-reveal
    >
      <div className="chart-card-header">
        <h3>{title}</h3>
        {caption && <p className="chart-caption">{caption}</p>}
      </div>
      {explainer && <div className="chart-explainer">{explainer}</div>}
      <div className="chart-body">{children}</div>
      {insight && <p className="chart-insight">{insight}</p>}
      {tableFallback && (
        <div className="chart-table-fallback visually-hidden">{tableFallback}</div>
      )}
    </article>
  );
}
