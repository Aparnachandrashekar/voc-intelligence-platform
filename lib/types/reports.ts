import type { FeedbackSource } from "@/lib/types/feedback";
import type { Sentiment } from "@/lib/types/enrichment";

export interface ReportFilters {
  source?: FeedbackSource;
  sentiment?: Sentiment;
  dateFrom?: string;
  dateTo?: string;
  /** Persona segment key (e.g. discovery_seeker). */
  segment?: string;
  /** Restrict to discovery & recommendations themes + Discovery Enthusiasts. */
  discoveryScope?: boolean;
}

export interface CountItem {
  label: string;
  count: number;
  percentage?: number;
}

export interface QuoteEvidence {
  feedback_item_id: string;
  content: string;
  source: string;
  author: string | null;
  created_at: string | null;
  sentiment: string;
}

export interface RankedItemWithQuotes {
  label: string;
  count: number;
  quotes: QuoteEvidence[];
}

export interface OverviewReport {
  total_feedback: number;
  enriched_count: number;
  sentiment_distribution: CountItem[];
  source_breakdown: CountItem[];
  top_themes: CountItem[];
  filters: ReportFilters;
}

export interface PainPointsReport {
  total_feedback: number;
  pain_points: RankedItemWithQuotes[];
  filters: ReportFilters;
}

export interface FeatureRequestsReport {
  total_feedback: number;
  feature_requests: RankedItemWithQuotes[];
  filters: ReportFilters;
}

export interface TrendPoint {
  period: string;
  count: number;
  sentiment?: string;
  theme?: string;
}

export interface TrendsReport {
  total_feedback: number;
  sentiment_over_time: TrendPoint[];
  top_themes_over_time: TrendPoint[];
  filters: ReportFilters;
}
