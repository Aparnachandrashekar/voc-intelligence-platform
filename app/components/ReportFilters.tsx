"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { formatPersona, formatSentiment, formatSource } from "@/lib/intelligence/format";
import { UI_FILTER_SOURCES } from "@/lib/sources/ui-sources";
import type { DashboardRange } from "@/lib/types/dashboard";

const PERSONA_SEGMENTS = [
  "discovery_seeker",
  "feature_advocate",
  "price_sensitive",
  "technical_issues",
  "happy_promoter",
  "dissatisfied_critic",
  "neutral_observer",
  "general",
  "podcast_listener",
] as const;

const SOURCES = ["", ...UI_FILTER_SOURCES] as const;
const SENTIMENTS = ["", "positive", "negative", "neutral", "mixed"];
const RANGES: { value: DashboardRange | ""; label: string }[] = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "all", label: "All Time" },
];

export function ReportFilters({
  basePath,
  variant = "default",
  showPersonaFilter = false,
}: {
  basePath: string;
  variant?: "default" | "compact";
  showPersonaFilter?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${basePath}?${next.toString()}`);
  }

  if (variant === "compact") {
    const currentSource = params.get("source") ?? "";
    const currentSentiment = params.get("sentiment") ?? "";
    const currentSegment = params.get("segment") ?? "";
    const currentRange = (params.get("range") ?? "30d") as DashboardRange;

    return (
      <div className="filter-pills-row" role="group" aria-label="Filters">
        <label className="filter-pill-wrap">
          <span className="visually-hidden">Source</span>
          <select
            className="filter-pill"
            value={currentSource}
            onChange={(e) => update("source", e.target.value)}
          >
            <option value="">All Sources</option>
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
            value={currentSentiment}
            onChange={(e) => update("sentiment", e.target.value)}
          >
            <option value="">All Sentiments</option>
            {SENTIMENTS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {formatSentiment(s)}
              </option>
            ))}
          </select>
        </label>
        {showPersonaFilter && (
          <label className="filter-pill-wrap">
            <span className="visually-hidden">Persona segment</span>
            <select
              className="filter-pill"
              value={currentSegment}
              onChange={(e) => update("segment", e.target.value)}
            >
              <option value="">All Personas</option>
              {PERSONA_SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {formatPersona(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="filter-pill-wrap">
          <span className="visually-hidden">Date range</span>
          <select
            className="filter-pill"
            value={currentRange}
            onChange={(e) => update("range", e.target.value)}
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  return (
    <div className="filters">
      <label>
        Source
        <select
          value={params.get("source") ?? ""}
          onChange={(e) => update("source", e.target.value)}
        >
          <option value="">All Sources</option>
          {SOURCES.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {formatSource(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sentiment
        <select
          value={params.get("sentiment") ?? ""}
          onChange={(e) => update("sentiment", e.target.value)}
        >
          <option value="">All Sentiments</option>
          {SENTIMENTS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {formatSentiment(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        From
        <input
          type="date"
          value={params.get("date_from") ?? ""}
          onChange={(e) => update("date_from", e.target.value)}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={params.get("date_to") ?? ""}
          onChange={(e) => update("date_to", e.target.value)}
        />
      </label>
    </div>
  );
}
