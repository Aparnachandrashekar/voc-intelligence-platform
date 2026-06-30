import type { DiscoveryBriefReport } from "@/lib/types/discovery";
import type {
  SegmentsIntelligenceReport,
  VocIntelligenceReport,
} from "@/lib/types/intelligence";
import type { ReportFilters } from "@/lib/types/reports";

/** Run server-side data loaders without crashing the page when PostgreSQL is down. */
export async function safeServerLoad<T>(
  label: string,
  load: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[server:${label}]`, error);
    return fallback;
  }
}

export function emptyVocIntelligenceReport(
  filters: ReportFilters
): VocIntelligenceReport {
  return {
    top_frictions: [],
    top_opportunities: [],
    fastest_growing: [],
    most_polarizing: [],
    filters,
    has_insights: false,
  };
}

export function emptySegmentsPersonasReport(
  filters: ReportFilters
): SegmentsIntelligenceReport {
  return {
    personas: [],
    enriched_count: 0,
    filters,
    has_insights: false,
  };
}

export function emptyDiscoveryBriefReport(
  filters: ReportFilters
): DiscoveryBriefReport {
  return {
    sentiment: {
      total_reviews: 0,
      positive_pct: 0,
      negative_pct: 0,
      neutral_pct: 0,
      net_score: 0,
    },
    top_complaints: [],
    negative_discovery_complaints: [],
    discovery_persona: null,
    feature_requests: [],
    filters,
    has_insights: false,
  };
}
