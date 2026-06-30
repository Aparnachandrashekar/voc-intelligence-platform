import { expandQuery } from "@/lib/query-expansion";
import {
  buildQueryEmbeddingText,
  type RetrievalSentimentMode,
} from "@/lib/retrieval/question-intent";
import { isNarrowSpecificQuery } from "@/lib/retrieval/intent-alignment";

/** Build the text embedded for semantic search — avoid over-broadening narrow questions. */
export function buildSemanticQueryText(
  question: string,
  mode: RetrievalSentimentMode
): string {
  const base = buildQueryEmbeddingText(question, mode);
  if (isNarrowSpecificQuery(question)) {
    return base;
  }

  const expansion = expandQuery(question);
  if (expansion.ftsTerms.length === 0) {
    return base;
  }

  return `${base} Key concepts: ${expansion.conceptPhrase.slice(0, 160)}`;
}
