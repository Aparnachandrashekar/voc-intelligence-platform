import "./load-env";
import { getPool } from "../lib/db";
import { ingestLiveScrape } from "../lib/scrape/ingest";

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.split("=")[1].split(",") : undefined;

  console.log("Pipeline 2 — live scrape (Spotify)");
  if (only) console.log(`  sources: ${only.join(", ")}`);

  try {
    const summary = await ingestLiveScrape({ only });
    console.log("");
    for (const s of summary.sources) {
      if (!s.enabled) {
        console.log(`  ${s.source.padEnd(11)} skipped (${s.skippedReason})`);
      } else if (s.error) {
        console.log(`  ${s.source.padEnd(11)} FAILED: ${s.error}`);
      } else {
        console.log(
          `  ${s.source.padEnd(11)} fetched ${s.fetched}, inserted ${s.inserted}, skipped ${s.skipped}`
        );
      }
    }
    console.log(`\nTotal new items: ${summary.total_inserted}`);
    console.log("Next: npm run enrich");
  } catch (error) {
    console.error(
      `\nLive scrape failed: ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}

main();
