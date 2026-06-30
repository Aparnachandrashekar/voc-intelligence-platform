import { sleep } from "@/lib/scrape/fetch";
import type { ScrapedItem, ScrapeTargetsConfig } from "@/lib/scrape/types";

interface GplayReview {
  id: string;
  userName?: string;
  date?: string;
  score?: number;
  title?: string;
  text?: string;
  url?: string;
}

interface GplayReviewsResult {
  data: GplayReview[];
  nextPaginationToken?: string | null;
}

type ReviewsFn = (args: {
  appId: string;
  lang: string;
  country: string;
  sort?: unknown;
  num?: number;
  paginate?: boolean;
  nextPaginationToken?: string;
}) => Promise<GplayReviewsResult>;

const BATCH_SIZE = 150;

function mapReview(
  review: GplayReview,
  appPage: string,
  country: string
): ScrapedItem | null {
  const content = review.text?.trim();
  if (!content || !review.id) return null;

  const created = review.date ? new Date(review.date) : null;
  const url =
    review.url && review.url.includes("play.google.com") ? review.url : appPage;

  return {
    source: "play_store",
    source_id: review.id,
    source_url: url,
    title: review.title?.trim() || null,
    content,
    rating:
      typeof review.score === "number" && review.score >= 1 && review.score <= 5
        ? review.score
        : null,
    author: review.userName?.trim() || null,
    created_at: created && !Number.isNaN(created.getTime()) ? created : null,
    metadata: { scrape_source: "google_play_scraper", country },
  };
}

/**
 * Google Play Store reviews via the `google-play-scraper` package.
 * Structured output (no LLM extraction). Fetches across multiple storefronts
 * and follows continuation tokens to collect up to `max_per_country` per
 * country. Loaded with a dynamic import because the package is ESM-only.
 */
export async function fetchPlayStoreReviews(
  config: ScrapeTargetsConfig["play_store"],
  onProgress?: (msg: string) => void
): Promise<ScrapedItem[]> {
  const mod = await import("google-play-scraper");
  // The package exports either a default object or named functions depending
  // on version; normalize to a callable `reviews` plus the `sort` enum.
  const gplay = (mod as unknown as { default?: unknown }).default ?? mod;
  const reviewsFn = (gplay as { reviews?: unknown }).reviews as ReviewsFn;
  const sortEnum = (gplay as { sort?: Record<string, unknown> }).sort ?? {};

  const sortKey = (config.sort ?? "newest").toUpperCase();
  const sortValue =
    sortKey === "RATING"
      ? sortEnum.RATING
      : sortKey === "HELPFULNESS"
        ? sortEnum.HELPFULNESS
        : sortEnum.NEWEST;

  const countries =
    config.countries && config.countries.length > 0
      ? config.countries
      : [config.country ?? "us"];
  const maxPerCountry = config.max_per_country ?? config.num ?? 100;
  const throttle = config.throttle_ms ?? 600;
  const appPage = `https://play.google.com/store/apps/details?id=${config.app_id}`;

  const items: ScrapedItem[] = [];

  for (const country of countries) {
    let token: string | undefined;
    let got = 0;
    let pages = 0;

    do {
      let res: GplayReviewsResult;
      try {
        res = await reviewsFn({
          appId: config.app_id,
          lang: config.lang,
          country,
          sort: sortValue,
          num: BATCH_SIZE,
          paginate: true,
          nextPaginationToken: token,
        });
      } catch (error) {
        onProgress?.(
          `  play_store ${country}: stopped (${
            error instanceof Error ? error.message : String(error)
          })`
        );
        break;
      }

      const batch = res?.data ?? [];
      for (const review of batch) {
        const mapped = mapReview(review, appPage, country);
        if (mapped) items.push(mapped);
      }

      got += batch.length;
      pages += 1;
      token = res?.nextPaginationToken ?? undefined;

      if (batch.length === 0) break;
      if (token && got < maxPerCountry) await sleep(throttle);
    } while (token && got < maxPerCountry);

    onProgress?.(
      `  play_store ${country}: ${got} reviews over ${pages} page(s)`
    );
  }

  return items;
}
