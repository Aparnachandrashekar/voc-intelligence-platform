import { fetchJson, sleep } from "@/lib/scrape/fetch";
import type { ScrapedItem, ScrapeTargetsConfig } from "@/lib/scrape/types";

interface RssLabel {
  label?: string;
}

interface RssReviewEntry {
  id?: RssLabel;
  title?: RssLabel;
  content?: RssLabel;
  author?: { name?: RssLabel };
  updated?: RssLabel;
  "im:rating"?: RssLabel;
}

interface RssFeed {
  feed?: { entry?: RssReviewEntry[] };
}

function mapEntry(
  entry: RssReviewEntry,
  reviewsUrl: string,
  country: string,
  page: number
): ScrapedItem | null {
  // The app-info entry has no rating; skip it.
  const ratingLabel = entry["im:rating"]?.label;
  const content = entry.content?.label?.trim();
  const id = entry.id?.label;
  if (!ratingLabel || !content || !id) return null;

  const rating = parseInt(ratingLabel, 10);
  const created = entry.updated?.label ? new Date(entry.updated.label) : null;

  return {
    source: "app_store",
    source_id: id,
    source_url: reviewsUrl,
    title: entry.title?.label?.trim() || null,
    content,
    rating: Number.isNaN(rating) ? null : rating,
    author: entry.author?.name?.label?.trim() || null,
    created_at: created && !Number.isNaN(created.getTime()) ? created : null,
    metadata: { scrape_source: "itunes_rss", country, page },
  };
}

/**
 * Apple App Store reviews via the public iTunes RSS JSON endpoint.
 * No API key required; structured data so no LLM extraction is needed.
 * Apple caps the customer-reviews feed at ~500 reviews (~10 pages) per
 * storefront, so we fetch across multiple countries to grow the corpus and
 * continue past any failing country instead of aborting the whole run.
 */
export async function fetchAppStoreReviews(
  config: ScrapeTargetsConfig["app_store"],
  onProgress?: (msg: string) => void
): Promise<ScrapedItem[]> {
  const { app_id, app_slug, pages } = config;
  const countries =
    config.countries && config.countries.length > 0
      ? config.countries
      : [config.country ?? "us"];
  const throttle = config.throttle_ms ?? 500;
  const maxPages = Math.max(1, pages);
  const items: ScrapedItem[] = [];

  for (const country of countries) {
    const reviewsUrl = `https://apps.apple.com/${country}/app/${app_slug}/id${app_id}?see-all=reviews`;
    let countryCount = 0;

    for (let page = 1; page <= maxPages; page++) {
      const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${app_id}/sortby=mostrecent/json`;

      let entries: RssReviewEntry[] = [];
      try {
        const data = await fetchJson<RssFeed>(url);
        entries = data.feed?.entry ?? [];
      } catch (error) {
        onProgress?.(
          `  app_store ${country}: stopped at page ${page} (${
            error instanceof Error ? error.message : String(error)
          })`
        );
        break;
      }

      let added = 0;
      for (const entry of entries) {
        const mapped = mapEntry(entry, reviewsUrl, country, page);
        if (mapped) {
          items.push(mapped);
          added++;
        }
      }
      countryCount += added;

      // The first entry on page 1 is app metadata; a page with no usable
      // review entries means we've reached the end of the feed.
      if (added === 0) break;
      if (page < maxPages) await sleep(throttle);
    }

    onProgress?.(`  app_store ${country}: ${countryCount} reviews`);
  }

  return items;
}
