import "./load-env";
import { getPool } from "../lib/db";
import {
  countEmbeddings,
  embedActiveCorpus,
  embedBatch,
} from "../lib/embeddings";

async function main() {
  const force = process.argv.includes("--force");
  const activeOnly = process.argv.includes("--active") || process.argv.includes("--active-only");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 10000;

  console.log("Embedding pipeline (Transformers.js, sentiment-aware)");
  console.log(`  force: ${force}`);
  console.log(`  active corpus only: ${activeOnly}`);
  if (!activeOnly) console.log(`  limit: ${limit}`);
  console.log("  (first run downloads the model to .cache/transformers)\n");

  try {
    const embedded = activeOnly
      ? await embedActiveCorpus({
          force,
          onProgress: (done, total) =>
            console.log(`    embedded ${done}/${total}`),
        })
      : await embedBatch({
          limit,
          force,
          onProgress: (done, total) =>
            console.log(`    embedded ${done}/${total}`),
        });
    const total = await countEmbeddings();
    console.log(`\n  processed ${embedded} rows this run`);
    console.log(`  total vectors in DB: ${total}`);
    if (force && activeOnly) {
      console.log("\n  Re-embedded active corpus with sentiment-aware document text.");
    }
  } catch (error) {
    console.error(
      `\nEmbedding failed: ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}

main();
