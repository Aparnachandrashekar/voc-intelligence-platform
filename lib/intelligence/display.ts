import { formatLabel, formatThemeCluster } from "@/lib/intelligence/format";

const THEME_KEYWORDS: Record<string, string> = {
  shuffle: "Shuffle & Playback",
  ads: "Advertising",
  premium: "Pricing & Premium",
  discover: "Music Discovery",
  playlist: "Playlists",
  offline: "Offline Playback",
  podcast: "Podcasts",
  crash: "App Stability",
  slow: "Performance",
  price: "Pricing",
  download: "Downloads",
  search: "Search",
  playback: "Playback Quality",
  recommend: "Recommendations",
};

export function normalizeClusterLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "General Feedback";

  if (trimmed.length <= 40 && /^[\w\s&-]+$/.test(trimmed) && !trimmed.includes("  ")) {
    return formatLabel(trimmed);
  }

  const lower = trimmed.toLowerCase();
  for (const [key, label] of Object.entries(THEME_KEYWORDS)) {
    if (lower.includes(key)) return label;
  }

  return formatThemeCluster(trimmed.split(/\s+/).slice(0, 3).join("_"));
}

export function reviewDisplaySummary(
  content: string,
  sentiment?: string
): string {
  const text = content.trim().replace(/\s+/g, " ");
  if (!text) return "Summary unavailable.";

  const theme = normalizeClusterLabel(text);
  const tone =
    sentiment === "negative"
      ? "Negative signal"
      : sentiment === "positive"
        ? "Positive signal"
        : sentiment
          ? `${sentiment.charAt(0).toUpperCase()}${sentiment.slice(1)} signal`
          : "User signal";

  return `${tone} around ${theme.toLowerCase()} — synthesized from review patterns, not a direct quote.`;
}

/** Show actual review text in RAG supporting signals (truncated cleanly). */
export {
  cleanQuoteForDisplay,
  formatReviewExcerpt,
} from "@/lib/intelligence/quote-display";

export type MetricDeltaKind = "percent" | "rating" | "relative";

/** Cap absurd relative swings (e.g. 0 → 5 reviews). */
export function capRelativeChangePct(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    if (current === 0) return null;
    return current >= 10 ? 100 : null;
  }
  const raw = ((current - previous) / previous) * 100;
  if (!Number.isFinite(raw)) return null;
  return Math.min(Math.round(Math.abs(raw) * 10) / 10, 999);
}

/**
 * Compact delta for KPI cards: arrow + magnitude only.
 * Sentiment uses absolute %-point change; rating uses star delta.
 */
export function formatMetricDelta(
  delta: number,
  kind: MetricDeltaKind = "percent"
): string | null {
  if (Math.abs(delta) < 0.05) return null;
  const arrow = delta > 0 ? "↑" : "↓";
  const abs = Math.abs(delta);
  if (kind === "rating") {
    return `${arrow} ${abs.toFixed(1)}`;
  }
  if (kind === "relative") {
    const capped = Math.min(abs, 999);
    return `${arrow} ${capped.toFixed(capped >= 10 ? 0 : 1)}%`;
  }
  return `${arrow} ${abs.toFixed(1)}%`;
}

export function formatSharePct(count: number, total: number): string {
  if (total <= 0 || count <= 0) return "0%";
  const raw = (count / total) * 100;
  if (raw < 0.1) return "<0.1%";
  return `${Math.round(raw * 10) / 10}%`;
}

export function sharePctValue(count: number, total: number): number {
  if (total <= 0) return 0;
  const raw = (count / total) * 100;
  return Math.round(raw * 10) / 10;
}
