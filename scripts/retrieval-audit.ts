import "./load-env";
import { getPool } from "../lib/db";
import {
  auditVectorIndex,
  formatVectorIndexAudit,
} from "../lib/retrieval/index-audit";

async function main() {
  const audit = await auditVectorIndex();
  console.log(formatVectorIndexAudit(audit));

  if (audit.active_corpus_missing_embeddings > 0) {
    console.log(
      `\n⚠ ${audit.active_corpus_missing_embeddings} active-corpus reviews lack vectors.`
    );
    console.log("  Run: npm run embed:active -- --force");
    process.exitCode = 1;
  } else {
    console.log("\n✓ Active RAG corpus is fully indexed.");
  }

  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
