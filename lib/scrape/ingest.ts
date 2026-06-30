import { readFileSync } from "fs";
import path from "path";
import {
  completeIngestionRun,
  createIngestionRun,
  insertFeedbackItem,
} from "@/lib/db";
import type { InsertFeedbackItemInput } from "@/lib/types/feedback";
import { fetchAppStoreReviews } from "@/lib/scrape/sources/app-store";
import { fetchPlayStoreReviews } from "@/lib/scrape/sources/play-store";
import { fetchRedditPosts } from "@/lib/scrape/sources/reddit";
import type {
  ScrapedItem,
  ScrapeTargetsConfig,
  SourceFetchResult,
} from "@/lib/scrape/types";

export interface SourceIngestSummary {
  source: string;
  enabled: boolean;
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
  skippedReason?: string;
}

export interface LiveScrapeSummary {
  product_name: string;
  sources: SourceIngestSummary[];
  total_inserted: number;
}

const DEFAULT_CONFIG_PATH = path.join(
  process.cwd(),
  "config",
  "scrape-targets.spotify.json"
);

export function loadScrapeTargets(configPath?: string): ScrapeTargetsConfig {
  const raw = readFileSync(configPath ?? DEFAULT_CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as ScrapeTargetsConfig;
}

async function persistItems(
  productName: string,
  items: ScrapedItem[]
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  const fetchedAt = new Date();

  let processed = 0;
  for (const item of items) {
    const input: InsertFeedbackItemInput = {
      ingestion_pipeline: "live_scrape",
      source: item.source,
      source_id: item.source_id,
      source_url: item.source_url,
      product_name: productName,
      title: item.title ?? null,
      content: item.content,
      rating: item.rating ?? null,
      author: item.author ?? null,
      created_at: item.created_at ?? null,
      fetched_at: fetchedAt,
      metadata: { ...(item.metadata ?? {}), scrape_target_url: item.source_url },
    };

    try {
      const row = await insertFeedbackItem(input);
      if (row) inserted++;
      else skipped++;
    } catch {
      skipped++;
    }

    processed++;
    if (processed % 1000 === 0) {
      console.log(`    persisted ${processed}/${items.length} (${inserted} new)`);
    }
  }

  return { inserted, skipped };
}

async function runSource(
  source: string,
  enabled: boolean,
  fetcher: () => Promise<ScrapedItem[]>,
  note?: string
): Promise<SourceFetchResult & { fetched: number; inserted: number; skipped: number }> {
  if (!enabled) {
    return {
      source: source as SourceFetchResult["source"],
      enabled: false,
      items: [],
      fetched: 0,
      inserted: 0,
      skipped: 0,
      skippedReason: note ?? "disabled in config",
    };
  }

  try {
    const items = await fetcher();
    return {
      source: source as SourceFetchResult["source"],
      enabled: true,
      items,
      fetched: items.length,
      inserted: 0,
      skipped: 0,
    };
  } catch (error) {
    return {
      source: source as SourceFetchResult["source"],
      enabled: true,
      items: [],
      fetched: 0,
      inserted: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Pipeline 2 — live scrape orchestration.
 * Fetches Spotify feedback from feasible sources (App Store, Play Store,
 * Reddit), inserts into feedback_items, and records an ingestion_runs row per
 * source. Quora / X are gracefully skipped (no API access).
 */
export async function ingestLiveScrape(options?: {
  configPath?: string;
  only?: string[];
}): Promise<LiveScrapeSummary> {
  const config = loadScrapeTargets(options?.configPath);
  const only = options?.only;
  const wants = (s: string) => !only || only.includes(s);

  const summaries: SourceIngestSummary[] = [];

  const plans: Array<{
    source: string;
    enabled: boolean;
    fetcher: () => Promise<ScrapedItem[]>;
    note?: string;
  }> = [
    {
      source: "app_store",
      enabled: config.app_store.enabled && wants("app_store"),
      fetcher: () => fetchAppStoreReviews(config.app_store, (m) => console.log(m)),
    },
    {
      source: "play_store",
      enabled: config.play_store.enabled && wants("play_store"),
      fetcher: () => fetchPlayStoreReviews(config.play_store, (m) => console.log(m)),
    },
    {
      source: "forum",
      enabled: config.forum.enabled && wants("forum"),
      fetcher: () => fetchRedditPosts(config.forum),
    },
    {
      source: "quora",
      enabled: false,
      fetcher: async () => [],
      note: config.quora?.note ?? "skipped",
    },
    {
      source: "twitter",
      enabled: false,
      fetcher: async () => [],
      note: config.twitter?.note ?? "skipped",
    },
  ];

  let totalInserted = 0;

  for (const plan of plans) {
    const fetchResult = await runSource(
      plan.source,
      plan.enabled,
      plan.fetcher,
      plan.note
    );

    if (!plan.enabled) {
      summaries.push({
        source: plan.source,
        enabled: false,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        skippedReason: fetchResult.skippedReason,
      });
      continue;
    }

    const run = await createIngestionRun("live_scrape", plan.source);

    if (fetchResult.error) {
      await completeIngestionRun(run.id, {
        status: "failed",
        error_message: fetchResult.error,
      });
      summaries.push({
        source: plan.source,
        enabled: true,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        error: fetchResult.error,
      });
      continue;
    }

    const { inserted, skipped } = await persistItems(
      config.product_name,
      fetchResult.items
    );
    totalInserted += inserted;

    await completeIngestionRun(run.id, {
      status: "completed",
      fetched_count: fetchResult.fetched,
      inserted_count: inserted,
      skipped_count: skipped,
    });

    summaries.push({
      source: plan.source,
      enabled: true,
      fetched: fetchResult.fetched,
      inserted,
      skipped,
    });
  }

  return {
    product_name: config.product_name,
    sources: summaries,
    total_inserted: totalInserted,
  };
}
