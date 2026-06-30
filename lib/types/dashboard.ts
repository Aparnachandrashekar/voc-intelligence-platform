import type { CountItem, QuoteEvidence, ReportFilters } from "@/lib/types/reports";

export type DashboardRange = "7d" | "30d" | "90d" | "all";
export type PipelineHealth = "online" | "stale" | "offline";

export interface PipelineSourceStatus {
  label: string;
  pipeline: string;
  source: string | null;
  health: PipelineHealth;
  last_updated: string | null;
  inserted_count: number;
  error_message?: string | null;
}

export interface PipelineStatusResponse {
  sources: PipelineSourceStatus[];
  global_status: "online" | "degraded";
  last_refresh: string | null;
}

export interface KpiDelta {
  value: number;
  previous: number;
  delta: number;
  delta_pct: number | null;
  direction: "up" | "down" | "flat";
}

export interface DashboardSummary {
  range: DashboardRange;
  total_reviews: number;
  live_count: number;
  historical_count: number;
  avg_rating: KpiDelta;
  positive_pct: KpiDelta;
  negative_pct: KpiDelta;
  neutral_pct: KpiDelta;
  volume: KpiDelta;
  net_sentiment: KpiDelta;
  headline: string;
  sentiment_chart: SentimentChartPoint[];
  filters: ReportFilters;
}

export interface SentimentChartPoint {
  period: string;
  positive: number;
  negative: number;
  neutral: number;
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
  total: number;
}

export interface PrimaryChartPoint {
  period: string;
  volume: number;
  avg_rating: number | null;
}

export interface RatingBucket {
  rating: number;
  count: number;
}

export interface DailyPoint {
  period: string;
  count: number;
  avg_rating: number | null;
}

export interface SentimentPeriodPoint {
  period: string;
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
}

export interface PipelineComparison {
  has_historical: boolean;
  live: {
    count: number;
    avg_rating: number | null;
    positive_pct: number;
    negative_pct: number;
    neutral_pct: number;
  };
  historical: {
    count: number;
    avg_rating: number | null;
    positive_pct: number;
    negative_pct: number;
    neutral_pct: number;
  };
}

export interface ThemeMetric {
  label: string;
  count: number;
  pct: number;
  dominant_sentiment: string;
}

export interface DashboardMetrics {
  range: DashboardRange;
  enriched_count: number;
  rating_distribution: RatingBucket[];
  daily_volume: DailyPoint[];
  daily_rating: DailyPoint[];
  sentiment_over_time: SentimentPeriodPoint[];
  source_breakdown: CountItem[];
  top_themes: ThemeMetric[];
  pain_points: { label: string; count: number; quotes: QuoteEvidence[] }[];
  feature_requests: { label: string; count: number; quotes: QuoteEvidence[] }[];
  live_vs_historical: PipelineComparison;
  filters: ReportFilters;
}
