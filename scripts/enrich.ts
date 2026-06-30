import "./load-env";
import { getPool } from "../lib/db";
import { enrichBatch, countEnrichedItems } from "../lib/enrichment";

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 5000;
  const force = process.argv.includes("--force");

  console.log("Phase 2 — enrichment (rating + keywords, no Groq)");
  console.log(`  limit: ${limit}${force ? "  (force re-enrich)" : ""}`);

  try {
    const result = await enrichBatch({
      limit,
      force,
      onProgress: (done, total) => console.log(`    enriched ${done}/${total}`),
    });
    const total = await countEnrichedItems();
    console.log(
      `\n  processed ${result.processed}, skipped ${result.skipped}, failed ${result.failed}`
    );
    console.log(`  total enriched in DB: ${total}`);
  } catch (error) {
    console.error(
      `\nEnrichment failed: ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}

main();
