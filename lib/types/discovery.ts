import type { SegmentPersona } from "@/lib/types/intelligence";
import type { QuoteEvidence, ReportFilters } from "@/lib/types/reports";

export interface DiscoverySentimentScore {
  total_reviews: number;
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
  /** Net positive minus negative share (can be negative). */
  net_score: number;
}

export interface DiscoveryComplaint {
  label: string;
  count: number;
  quote: QuoteEvidence | null;
}

export interface DiscoveryFeatureAsk {
  label: string;
  count: number;
}

export interface DiscoveryBriefReport {
  sentiment: DiscoverySentimentScore;
  top_complaints: DiscoveryComplaint[];
  /** Top pain themes from discovery-tagged reviews with negative sentiment only. */
  negative_discovery_complaints: DiscoveryComplaint[];
  discovery_persona: SegmentPersona | null;
  feature_requests: DiscoveryFeatureAsk[];
  filters: ReportFilters;
  has_insights: boolean;
}
