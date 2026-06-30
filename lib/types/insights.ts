import type { DashboardRange } from "@/lib/types/dashboard";
import type { QuoteEvidence, ReportFilters } from "@/lib/types/reports";

export type InsightSection =
  | "dashboard"
  | "overview"
  | "pain-points"
  | "feature-requests"
  | "trends";

export interface RisingItem {
  label: string;
  current_count: number;
  previous_count: number;
  change_pct: number | null;
}

export interface InsightStatsSnapshot {
  range: DashboardRange;
  total_reviews: number;
  enriched_count: number;
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
  avg_rating: number | null;
  volume_current: number;
  volume_previous: number;
  top_themes: Array<{ label: string; count: number }>;
  top_pain_points: Array<{ label: string; count: number }>;
  top_feature_requests: Array<{ label: string; count: number }>;
  top_praise_themes: Array<{ label: string; count: number }>;
  top_gap_signals: Array<{ label: string; count: number }>;
  top_frustration_themes: Array<{ label: string; count: number; pct: number }>;
  rising_pain_points: RisingItem[];
  rising_feature_requests: RisingItem[];
  sample_quotes: QuoteEvidence[];
  filters: ReportFilters;
}

export interface InsightReport {
  status: "completed" | "unavailable" | "failed";
  section: InsightSection;
  headline: string;
  summary: string;
  narrative_bullets: string[];
  opportunities: string[];
  rising_complaints: RisingItem[];
  rising_requests: RisingItem[];
  stats: InsightStatsSnapshot;
  generated_at: string;
  groq_used: boolean;
}
