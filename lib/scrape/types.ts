import type { LiveScrapeSource } from "@/lib/types/feedback";

/** A normalized item produced by a live-scrape source fetcher. */
export interface ScrapedItem {
  source: LiveScrapeSource;
  source_id: string;
  source_url: string;
  title?: string | null;
  content: string;
  rating?: number | null;
  author?: string | null;
  created_at?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface SourceFetchResult {
  source: LiveScrapeSource;
  enabled: boolean;
  items: ScrapedItem[];
  error?: string;
  skippedReason?: string;
}

export interface ScrapeTargetsConfig {
  product_name: string;
  app_store: {
    enabled: boolean;
    app_id: string;
    app_slug: string;
    /** Storefronts to fetch; each yields a separate review pool (Apple caps ~500/country). */
    countries: string[];
    /** RSS pages per country (1..10; Apple stops returning data past ~page 10). */
    pages: number;
    throttle_ms?: number;
    /** Back-compat: single-country fallback if `countries` is absent. */
    country?: string;
  };
  play_store: {
    enabled: boolean;
    lang: string;
    app_id: string;
    /** Review sort order; "newest" recommended for stable token pagination. */
    sort?: "newest" | "rating" | "helpfulness";
    /** Storefronts to fetch; each is a separate review pool. */
    countries: string[];
    /** Max reviews to collect per country before moving on. */
    max_per_country: number;
    throttle_ms?: number;
    /** Back-compat fields. */
    country?: string;
    num?: number;
  };
  forum: {
    enabled: boolean;
    subreddits: string[];
    listing: string;
    limit: number;
  };
  quora: { enabled: boolean; note?: string };
  twitter: { enabled: boolean; note?: string };
}
