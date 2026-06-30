import type { QuoteEvidence, ReportFilters } from "@/lib/types/reports";

export interface ClusterSentiment {
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
  negative_pct: number;
  positive_pct: number;
}

export interface ThemeCluster {
  id: string;
  label: string;
  display_name: string;
  count: number;
  change_pct: number | null;
  sentiment: ClusterSentiment;
  polarizing_score: number;
  quotes: QuoteEvidence[];
}

export interface VocIntelligenceReport {
  top_frictions: ThemeCluster[];
  top_opportunities: ThemeCluster[];
  fastest_growing: ThemeCluster[];
  most_polarizing: ThemeCluster[];
  filters: ReportFilters;
  has_insights: boolean;
}

export interface RoadmapItem {
  id: string;
  label: string;
  display_name: string;
  count: number;
  change_pct: number | null;
  sentiment: ClusterSentiment;
  polarizing_score: number;
  loved_score: number;
  quotes: QuoteEvidence[];
}

export interface RoadmapIntelligenceReport {
  most_requested: RoadmapItem[];
  fastest_growing: RoadmapItem[];
  most_loved: RoadmapItem[];
  most_controversial: RoadmapItem[];
  filters: ReportFilters;
  has_insights: boolean;
}

export interface SegmentPersona {
  segment: string;
  label: string;
  description: string;
  confidence_label: string;
  volume: number;
  percentage: number;
  sentiment: ClusterSentiment;
  top_complaints: { label: string; count: number }[];
  top_requests: { label: string; count: number }[];
  top_opportunities: string[];
  quotes: QuoteEvidence[];
}

export interface SegmentsIntelligenceReport {
  personas: SegmentPersona[];
  enriched_count: number;
  filters: ReportFilters;
  has_insights: boolean;
}

export interface ExploreInsightCard {
  headline: string;
  summary: string;
  stat_line: string;
  themes: string[];
  quotes: QuoteEvidence[];
}
