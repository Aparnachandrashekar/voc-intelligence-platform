import "./load-env";
import { getPool, insertFeedbackItem } from "../lib/db";

async function seed() {
  const row = await insertFeedbackItem({
    ingestion_pipeline: "huggingface",
    source: "huggingface",
    source_id: "phase0-test-001",
    product_name: "Spotify",
    content:
      "Phase 0 test row — delete after verification. Discovery playlists feel repetitive.",
    author: "test_user",
    metadata: { phase: 0, test: true },
  });

  if (row) {
    console.log("Inserted test feedback item:", row.id);
  } else {
    console.log("Test row already exists (deduplicated).");
  }

  await getPool().end();
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
