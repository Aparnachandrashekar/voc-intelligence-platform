"use client";

import { useState } from "react";
import type { InsightReport, InsightSection } from "@/lib/types/insights";
import type { DashboardRange } from "@/lib/types/dashboard";
import type { ReportFilters } from "@/lib/types/reports";
import { formatSentiment, formatSource } from "@/lib/intelligence/format";
import { INSIGHTS_SCOPE_CAPTION } from "@/lib/intelligence/copy";
import { normalizeClusterLabel } from "@/lib/intelligence/display";
import { UI_FILTER_SOURCES } from "@/lib/sources/ui-sources";

const SOURCES = ["", ...UI_FILTER_SOURCES] as const;
const SENTIMENTS = ["", "positive", "negative", "neutral", "mixed"];
const RANGES: { value: DashboardRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function InsightPanel({
  section,
  filters: initialFilters = {},
  range: initialRange = "30d",
  compact = false,
  premium = false,
  showFilters = false,
}: {
  section: InsightSection;
  filters?: ReportFilters;
  range?: string;
  compact?: boolean;
  premium?: boolean;
  showFilters?: boolean;
}) {
  const [report, setReport] = useState<InsightReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState<DashboardRange>(
    (initialRange as DashboardRange) || "30d"
  );
  const [source, setSource] = useState(initialFilters.source ?? "");
  const [sentiment, setSentiment] = useState(initialFilters.sentiment ?? "");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          range,
          source: source || undefined,
          sentiment: sentiment || undefined,
          date_from: initialFilters.dateFrom,
          date_to: initialFilters.dateTo,
        }),
      });
      const data = (await res.json()) as InsightReport & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Insight generation failed");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={[
        "insight-panel",
        compact ? "insight-panel-compact" : "",
        premium ? "insight-panel-premium" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="insight-panel-header">
        <div>
          <h3>Qualitative insights</h3>
          <p className="chart-caption">
            AI narrative on SQL-computed stats — balanced view of praise,
            friction, and opportunities. Numbers are never invented.
          </p>
          <p className="chart-caption muted insight-scope-caption">
            {INSIGHTS_SCOPE_CAPTION}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "Generating…" : report ? "Refresh insights" : "Generate insights"}
        </button>
      </div>

      {showFilters && (
        <div className="filter-pills-row insight-panel-filters" role="group" aria-label="Insight filters">
          <label className="filter-pill-wrap">
            <span className="visually-hidden">Time period</span>
            <select
              className="filter-pill"
              value={range}
              onChange={(e) => setRange(e.target.value as DashboardRange)}
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-pill-wrap">
            <span className="visually-hidden">Source</span>
            <select
              className="filter-pill"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">All sources</option>
              {SOURCES.filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {formatSource(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-pill-wrap">
            <span className="visually-hidden">Sentiment</span>
            <select
              className="filter-pill"
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
            >
              <option value="">All sentiments</option>
              {SENTIMENTS.filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {formatSentiment(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && <p className="status-error">{error}</p>}

      {report && report.status === "unavailable" && (
        <p className="muted">{report.summary}</p>
      )}

      {report && report.status === "completed" && (
        <div className="insight-body">
          <p className="insight-headline">{report.headline}</p>
          {report.summary && <p className="insight-summary">{report.summary}</p>}

          {report.narrative_bullets.length > 0 && (
            <ul className="insight-bullets">
              {report.narrative_bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}

          {(report.rising_complaints.length > 0 ||
            report.rising_requests.length > 0) && (
            <div className="insight-rising insight-rising-balanced">
              {report.rising_complaints.length > 0 && (
                <div>
                  <h4>Rising frustrations</h4>
                  <ul>
                    {report.rising_complaints.slice(0, 4).map((r) => (
                      <li key={r.label}>
                        {normalizeClusterLabel(r.label)}{" "}
                        <span className="muted">
                          ({r.current_count.toLocaleString()} mentions
                          {r.change_pct !== null && `, ↑ ${Math.min(r.change_pct, 999)}%`})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.rising_requests.length > 0 && (
                <div>
                  <h4>Rising requests</h4>
                  <ul>
                    {report.rising_requests.slice(0, 4).map((r) => (
                      <li key={r.label}>
                        {normalizeClusterLabel(r.label)}{" "}
                        <span className="muted">
                          ({r.current_count.toLocaleString()} mentions
                          {r.change_pct !== null && `, ↑ ${Math.min(r.change_pct, 999)}%`})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {report.stats && (
            <p className="insight-sentiment-mix muted">
              Sentiment mix: {report.stats.positive_pct}% positive ·{" "}
              {report.stats.negative_pct}% negative · {report.stats.neutral_pct}%
              neutral
            </p>
          )}

          {report.opportunities.length > 0 && (
            <div className="insight-opportunities">
              <h4>Product opportunities</h4>
              <ul>
                {report.opportunities.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="insight-meta muted">
            {report.groq_used ? "Generated with Groq" : "SQL fallback (Groq unavailable)"}{" "}
            · {new Date(report.generated_at).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}
