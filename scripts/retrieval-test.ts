import "./load-env";
import { warmEmbeddingModel } from "../lib/embeddings";
import { getPool } from "../lib/db";
import { getEnv } from "../lib/env";
import { hybridSearch, hybridSearchDebug } from "../lib/search";

const TEST_QUESTIONS = [
  "Why do users stop discovering new music?",
  "What makes Spotify recommendations feel repetitive?",
  "What do users wish Spotify did differently for music discovery?",
  "What do users love most about Spotify's playlists?",
  "Which user segments struggle most with discovery?",
];

function analyzeOverlap(results: Array<{ question: string; ids: string[] }>) {
  const idCounts = new Map<string, number>();
  for (const r of results) {
    for (const id of r.ids) {
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }
  }
  return [...idCounts.entries()]
    .filter(([, count]) => count > 2)
    .sort((a, b) => b[1] - a[1]);
}

async function main() {
  console.log("RAG retrieval architecture test");
  console.log("================================\n");

  await warmEmbeddingModel();
  const poolLimit = getEnv().RAG_RETRIEVE_POOL;

  console.log("--- Per-question retrieval (independent queries) ---\n");

  const independent: Array<{
    question: string;
    sentiment_mode: string;
    ids: string[];
  }> = [];

  for (const question of TEST_QUESTIONS) {
    const debug = await hybridSearchDebug({ query: question, limit: poolLimit });
    const items = await hybridSearch({ query: question, limit: poolLimit });
    const ids = items.map((i) => i.id);

    independent.push({
      question,
      sentiment_mode: debug.sentiment_mode,
      ids,
    });

    console.log(`Q: ${question}`);
    console.log(`  Sentiment pool: ${debug.sentiment_mode}`);
    console.log(`  Retrieved (${ids.length}):`);
    for (const id of ids.slice(0, 10)) {
      console.log(`    ${id}`);
    }
    if (ids.length > 10) {
      console.log(`    … +${ids.length - 10} more`);
    }
    console.log("");
  }

  const independentRepeaters = analyzeOverlap(independent);
  console.log("=== Independent-query overlap (MMR within each query) ===");
  if (independentRepeaters.length === 0) {
    console.log("No ID appears in more than 2/5 independent queries.");
  } else {
    console.log(
      "Note: similar negative discovery questions may share corpus matches."
    );
    console.log("IDs in 3+ independent queries:");
    for (const [id, count] of independentRepeaters.slice(0, 8)) {
      console.log(`  ${id} → ${count}/5`);
    }
  }

  const positiveQ = independent.find((r) =>
    r.question.includes("love most")
  );
  const negativeQs = independent.filter((r) => r !== positiveQ);
  const posIds = new Set(positiveQ?.ids ?? []);
  const crossPoolOverlap = negativeQs.some((r) =>
    r.ids.some((id) => posIds.has(id))
  );
  console.log(
    `\nSentiment pool isolation (positive Q vs negative Qs): ${
      crossPoolOverlap ? "FAIL — shared IDs across pools" : "PASS — zero overlap"
    }`
  );

  console.log("\n--- Session simulation (cumulative excludeIds, matches UI) ---\n");

  const sessionSeen: string[] = [];
  const sessionResults: Array<{ question: string; ids: string[] }> = [];

  for (const question of TEST_QUESTIONS) {
    const items = await hybridSearch({
      query: question,
      limit: poolLimit,
      excludeIds: sessionSeen,
    });
    const ids = items.map((i) => i.id);
    sessionResults.push({ question, ids });
    sessionSeen.push(...ids);

    console.log(`Q: ${question}`);
    console.log(`  Excluded ${sessionSeen.length - ids.length} prior IDs`);
    console.log(`  Retrieved (${ids.length}): ${ids.slice(0, 6).join(", ")}${
      ids.length > 6 ? " …" : ""
    }`);
    console.log("");
  }

  const sessionRepeaters = analyzeOverlap(sessionResults);
  console.log("=== Session overlap (production RagPanel behavior) ===");
  if (sessionRepeaters.length === 0) {
    console.log(
      "✓ PASS — no review ID appears in more than 2 questions with session exclusion."
    );
  } else {
    console.log("✗ FAIL — session exclusion did not prevent repeats:");
    for (const [id, count] of sessionRepeaters) {
      console.log(`  ${id} → ${count}/5`);
    }
    process.exitCode = 1;
  }

  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
