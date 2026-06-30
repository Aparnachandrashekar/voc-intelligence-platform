import { hybridSearch } from "@/lib/search";
import { evaluateEvidenceGate } from "@/lib/guardrails/evidence-gate";
import { evaluateRetrievalRelevance } from "@/lib/guardrails/relevance-gate";
import {
  bestRetrievalScore,
  itemQualifiesForEvidence,
} from "@/lib/guardrails/retrieval-score";
import { getEnv } from "@/lib/env";

async function main() {
  const minScore = getEnv().MIN_RETRIEVAL_SCORE;
  const questions = [
    "Why do users hate shuffle?",
    "How many reviews mention ads?",
    "What do podcast listeners want?",
    "Tell me about Spotify playlists",
    "random gibberish xyz123",
  ];

  for (const q of questions) {
    const items = await hybridSearch({ query: q, limit: 40 });
    const gate = evaluateEvidenceGate(items);
    const rel = evaluateRetrievalRelevance(gate.items, q);
    const passNew = items.filter((i) =>
      itemQualifiesForEvidence(i, minScore)
    ).length;
    console.log(
      JSON.stringify({
        q,
        retrieved: items.length,
        passNewScore: passNew,
        qualifying: gate.items.length,
        gateOk: gate.allowed,
        relOk: rel.allowed,
        relReason: rel.reason,
        top5: items.slice(0, 5).map((i) => ({
          sim: i.similarity_score,
          kw: i.keyword_score,
          best: bestRetrievalScore(i),
          qualifies: itemQualifiesForEvidence(i, minScore),
        })),
      })
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
