import { fetchJson } from "@/lib/scrape/fetch";
import type { ScrapedItem, ScrapeTargetsConfig } from "@/lib/scrape/types";

interface RedditChild {
  kind: string;
  data: {
    id: string;
    name: string;
    title?: string;
    selftext?: string;
    author?: string;
    created_utc?: number;
    permalink?: string;
    stickied?: boolean;
  };
}

interface RedditListing {
  data?: { children?: RedditChild[] };
}

/**
 * Reddit posts (source = forum) via the public .json listing endpoint.
 * Structured output, so no LLM extraction is needed.
 */
export async function fetchRedditPosts(
  config: ScrapeTargetsConfig["forum"]
): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  for (const subreddit of config.subreddits) {
    const url = `https://www.reddit.com/r/${subreddit}/${config.listing}.json?limit=${config.limit}`;
    const data = await fetchJson<RedditListing>(url);
    const children = data.data?.children ?? [];

    for (const child of children) {
      if (child.kind !== "t3") continue;
      const post = child.data;
      if (post.stickied) continue;

      const body = (post.selftext ?? "").trim();
      const title = (post.title ?? "").trim();
      // Skip removed/deleted bodies; fall back to the title as the signal.
      const cleanBody =
        body === "[removed]" || body === "[deleted]" ? "" : body;
      const content = cleanBody ? `${title}\n\n${cleanBody}`.trim() : title;
      if (content.length === 0) continue;

      const created = post.created_utc
        ? new Date(post.created_utc * 1000)
        : null;

      items.push({
        source: "forum",
        source_id: post.name,
        source_url: `https://www.reddit.com${post.permalink ?? `/r/${subreddit}/`}`,
        title: title || null,
        content,
        rating: null,
        author: post.author?.trim() || null,
        created_at: created,
        metadata: { scrape_source: "reddit_json", subreddit },
      });
    }
  }

  return items;
}
