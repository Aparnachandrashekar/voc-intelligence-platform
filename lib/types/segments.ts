import type { QuoteEvidence, ReportFilters } from "@/lib/types/reports";

export interface SegmentBucket {
  segment: string;
  label: string;
  description: string;
  count: number;
  percentage: number;
  avg_rating: number | null;
  dominant_sentiment: string;
  sample_quotes: QuoteEvidence[];
}

export interface SegmentsReport {
  total_feedback: number;
  enriched_count: number;
  segments: SegmentBucket[];
  filters: ReportFilters;
}
