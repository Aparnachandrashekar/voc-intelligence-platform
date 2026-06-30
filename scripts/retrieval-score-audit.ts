import "./load-env";
import { getPool } from "../lib/db";
import { evaluateEvidenceGate } from "../lib/guardrails/evidence-gate";
import { evaluateRetrievalRelevance } from "../lib/guardrails/relevance-gate";
import {
  itemQualifiesForEvidence,
  bestRetrievalScore,
} from "../lib/guardrails/retrieval-score";
import { applyRelevanceCutoff } from "../lib/retrieval/relevance-filter";
import {
  extractSpecificEntities,
  filterBySpecificIntent,
  intentAlignmentScore,
} from "../lib/retrieval/intent-alignment";
import { hybridSearch } from "../lib/search";
import { getEnv } from "../lib/env";

const QUERY =
  process.argv[2] ??
  "Do users mention discovering songs on TikTok or Instagram and then searching for them on Spotify?";

async function main() {
  const env = getEnv();
  const minScore = env.MIN_RETRIEVAL_SCORE;
  const poolLimit = env.RAG_RETRIEVE_POOL;

  console.log(`Query: ${QUERY}\n`);
  console.log(
    `Thresholds: MIN_RETRIEVAL_SCORE=${minScore}, MIN_ANSWER_SIMILARITY=${env.MIN_ANSWER_SIMILARITY}, MIN_ANSWER_AVG_SIMILARITY=${env.MIN_ANSWER_AVG_SIMILARITY}, MIN_EVIDENCE_ITEMS=${env.MIN_EVIDENCE_ITEMS}`
  );
  console.log(`Specific entities: ${extractSpecificEntities(QUERY).join(", ") || "(none)"}\n`);

  const raw = await hybridSearch({ query: QUERY, limit: poolLimit });
  const top10 = [...raw]
    .sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0))
    .slice(0, 10);

  console.log("Top 10 candidates BEFORE filtering:");
  console.log("─".repeat(100));
  for (const [i, item] of top10.entries()) {
    const qualifies = itemQualifiesForEvidence(item, minScore);
    const alignment = intentAlignmentScore(QUERY, item.content);
    console.log(
      `${String(i + 1).padStart(2)}. sim=${(item.similarity_score ?? 0).toFixed(3)} kw=${(item.keyword_score ?? 0).toFixed(3)} best=${bestRetrievalScore(item).toFixed(3)} align=${alignment.toFixed(2)} pass=${qualifies ? "yes" : "no"}`
    );
    console.log(`    ${item.content.slice(0, 140).replace(/\s+/g, " ")}…`);
  }

  const intentFiltered = filterBySpecificIntent(QUERY, raw);
  const cutoff = applyRelevanceCutoff(intentFiltered, poolLimit);
  const gate = evaluateEvidenceGate(cutoff);
  const relevance = evaluateRetrievalRelevance(gate.items, QUERY);

  console.log("\nAfter intent + relevance filters:");
  console.log(`  raw candidates: ${raw.length}`);
  console.log(`  after intent filter: ${intentFiltered.length}`);
  console.log(`  after score cutoff: ${cutoff.length}`);
  console.log(`  evidence gate: ${gate.allowed ? "PASS" : "FAIL"} (${gate.items.length} qualifying)`);
  console.log(`  relevance gate: ${relevance.allowed ? "PASS" : "FAIL"}`);
  if (!relevance.allowed) {
    console.log(`  reason: ${relevance.reason}`);
  }
  console.log(
    `  max_similarity=${relevance.max_similarity?.toFixed(3) ?? "n/a"} avg_top3=${relevance.avg_top_similarity?.toFixed(3) ?? "n/a"}`
  );

  if (cutoff.length > 0) {
    console.log("\nFinal qualifying reviews:");
    for (const [i, item] of cutoff.slice(0, 5).entries()) {
      console.log(
        `${i + 1}. sim=${(item.similarity_score ?? 0).toFixed(3)} — ${item.content.slice(0, 120).replace(/\s+/g, " ")}…`
      );
    }
  } else {
    console.log(
      "\nConclusion: corpus likely lacks on-topic reviews for this query (or similarity is below threshold)."
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end().catch(() => undefined);
  });
