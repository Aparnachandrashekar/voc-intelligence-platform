import {
  FEEDBACK_SOURCES,
  INGESTION_PIPELINES,
  LIVE_SCRAPE_SOURCES,
  STATIC_IMPORT_SOURCES,
  type FeedbackSource,
  type IngestionPipeline,
  type LiveScrapeSource,
  type StaticImportSource,
} from "@/lib/types/feedback";
import { getScrapeAllowlist } from "@/lib/env";

export function isIngestionPipeline(value: string): value is IngestionPipeline {
  return (INGESTION_PIPELINES as readonly string[]).includes(value);
}

export function isFeedbackSource(value: string): value is FeedbackSource {
  return (FEEDBACK_SOURCES as readonly string[]).includes(value);
}

export function isLiveScrapeSource(value: string): value is LiveScrapeSource {
  return (LIVE_SCRAPE_SOURCES as readonly string[]).includes(value);
}

export function isStaticImportSource(
  value: string
): value is StaticImportSource {
  return (STATIC_IMPORT_SOURCES as readonly string[]).includes(value);
}

/** Map a URL hostname to a feedback source (live scrape only). */
export function sourceFromUrl(url: string): LiveScrapeSource | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }

  if (hostname.includes("apps.apple.com") || hostname === "itunes.apple.com") {
    return "app_store";
  }
  if (hostname.includes("play.google.com")) {
    return "play_store";
  }
  if (hostname.includes("quora.com")) {
    return "quora";
  }
  if (hostname === "twitter.com" || hostname === "x.com") {
    return "twitter";
  }
  // Forums: reddit and other allowlisted domains
  if (
    hostname.includes("reddit.com") ||
    hostname.endsWith(".forum") ||
    hostname.includes("discourse")
  ) {
    return "forum";
  }
  return null;
}

/** Returns true if the URL hostname is in SCRAPE_ALLOWLIST. */
export function isUrlAllowlisted(url: string): boolean {
  const allowlist = getScrapeAllowlist();
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return allowlist.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

export function assertInsertAllowed(input: {
  ingestion_pipeline: IngestionPipeline;
  source: FeedbackSource;
  source_url?: string | null;
}): void {
  if (!isIngestionPipeline(input.ingestion_pipeline)) {
    throw new Error(`Invalid ingestion_pipeline: ${input.ingestion_pipeline}`);
  }
  if (!isFeedbackSource(input.source)) {
    throw new Error(`Invalid source: ${input.source}`);
  }

  if (input.ingestion_pipeline === "static_import") {
    throw new Error(
      "static_import (Kaggle) pipeline is removed — use live_scrape for App Store and Play Store only"
    );
  }

  if (input.ingestion_pipeline === "huggingface") {
    if (input.source !== "huggingface") {
      throw new Error("Hugging Face pipeline requires source=huggingface");
    }
    return;
  }

  if (input.ingestion_pipeline === "live_scrape") {
    if (input.source !== "app_store" && input.source !== "play_store") {
      throw new Error(
        `Only app_store and play_store are enabled; got: ${input.source}`
      );
    }
    if (!isLiveScrapeSource(input.source)) {
      throw new Error(`Invalid live_scrape source: ${input.source}`);
    }
    if (!input.source_url) {
      throw new Error("live_scrape items require source_url");
    }
    if (!isUrlAllowlisted(input.source_url)) {
      throw new Error(`URL not in SCRAPE_ALLOWLIST: ${input.source_url}`);
    }
  }
}
