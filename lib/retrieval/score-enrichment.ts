import { fetchEmbeddingVectors } from "@/lib/embeddings";
import { cosineSimilarity } from "@/lib/retrieval/mmr";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

/** Fill in cosine scores for keyword-only RRF hits so gates rank by true semantic relevance. */
export async function attachMissingSimilarityScores(
  queryVector: number[],
  items: RetrievedFeedbackItem[]
): Promise<RetrievedFeedbackItem[]> {
  const missing = items.filter((item) => (item.similarity_score ?? 0) <= 0);
  if (missing.length === 0) return items;

  const vectors = await fetchEmbeddingVectors(missing.map((item) => item.id));

  return items.map((item) => {
    if ((item.similarity_score ?? 0) > 0) return item;
    const vector = vectors.get(item.id);
    if (!vector) return item;
    return {
      ...item,
      similarity_score: cosineSimilarity(queryVector, vector),
    };
  });
}
