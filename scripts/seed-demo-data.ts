import "./load-env";
import { insertFeedbackItem } from "../lib/db";
import { enrichFeedbackItem } from "../lib/enrichment";

const DEMO_ITEMS = [
  {
    source: "app_store" as const,
    source_id: "demo-as-001",
    source_url: "https://apps.apple.com/app/spotify/review/demo-as-001",
    content:
      "Love the app but discovery is weak — I keep hearing the same artists on Discover Weekly. Hard to find niche genres.",
    rating: 3,
    author: "musicfan42",
  },
  {
    source: "play_store" as const,
    source_id: "demo-gp-001",
    source_url: "https://play.google.com/store/apps/details?id=com.spotify.music&review=demo-gp-001",
    content:
      "Recommendations are terrible lately. I liked rock playlists but now it's all pop. Please fix the algorithm.",
    rating: 2,
    author: "android_user",
  },
  {
    source: "play_store" as const,
    source_id: "demo-gp-ads-001",
    source_url: "https://play.google.com/store/apps/details?id=com.spotify.music&review=demo-gp-ads-001",
    content:
      "The free tier has too many ads between songs. Considering switching to a competitor. Price increase was not justified.",
    rating: 2,
    author: "free_tier_user",
  },
  {
    source: "app_store" as const,
    source_id: "demo-as-002",
    source_url: "https://apps.apple.com/app/spotify/review/demo-as-002",
    content:
      "Great sound quality and offline mode works perfectly. Best music app for commuting. Love the daily mixes.",
    rating: 5,
    author: "happy_listener",
  },
  {
    source: "play_store" as const,
    source_id: "demo-gp-002",
    source_url: "https://play.google.com/store/apps/details?id=com.spotify.music&review=demo-gp-002",
    content:
      "Can't find how to see friend activity anymore. Social features were removed and I miss sharing playlists with friends.",
    rating: 2,
    author: "social_user",
  },
  {
    source: "play_store" as const,
    source_id: "demo-gp-shuffle-001",
    source_url: "https://play.google.com/store/apps/details?id=com.spotify.music&review=demo-gp-shuffle-001",
    content:
      "Discovery playlists repeat artists too often. I want to hear completely new music, not the same indie bands every week.",
    rating: 3,
    author: "shuffle_user",
  },
];

async function seed() {
  for (const item of DEMO_ITEMS) {
    const row = await insertFeedbackItem({
      ingestion_pipeline: "live_scrape",
      source: item.source,
      source_id: item.source_id,
      source_url: item.source_url,
      product_name: "Spotify",
      content: item.content,
      rating: item.rating,
      author: item.author,
      created_at: new Date(
        Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000
      ),
      metadata: { demo: true },
    });

    if (row) {
      await enrichFeedbackItem(row.id, row.content, { force: true });
      console.log("Seeded:", item.source_id);
    } else {
      console.log("Skipped (exists):", item.source_id);
    }
  }

  console.log("Demo seed complete.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
