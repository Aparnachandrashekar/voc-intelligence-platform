/** Cosine similarity between two L2-normalized vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

export interface MmrCandidate {
  id: string;
  /** Fused retrieval score (e.g. RRF) — higher = more relevant to query. */
  relevance: number;
  vector: number[];
}

/**
 * Maximal Marginal Relevance — select diverse results by penalizing
 * similarity to already-selected documents.
 *
 * score(d) = λ * combinedRelevance(d) - (1-λ) * max_{s ∈ selected} sim(d, s)
 * combinedRelevance blends vector similarity with fused retrieval rank.
 */
export function maximalMarginalRelevance(
  queryVector: number[],
  candidates: MmrCandidate[],
  topK: number,
  lambda = 0.65
): string[] {
  if (candidates.length === 0 || topK <= 0) return [];

  const maxFused = Math.max(...candidates.map((c) => c.relevance), 1e-9);

  const selected: MmrCandidate[] = [];
  const remaining = [...candidates].sort((a, b) => a.id.localeCompare(b.id));

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const vectorSim = cosineSimilarity(queryVector, candidate.vector);
      const fusedNorm = candidate.relevance / maxFused;
      const combinedRelevance = 0.55 * vectorSim + 0.45 * fusedNorm;
      const maxRedundancy =
        selected.length === 0
          ? 0
          : Math.max(
              ...selected.map((s) =>
                cosineSimilarity(candidate.vector, s.vector)
              )
            );
      const mmrScore = lambda * combinedRelevance - (1 - lambda) * maxRedundancy;

      if (
        mmrScore > bestScore ||
        (Math.abs(mmrScore - bestScore) <= 1e-12 &&
          candidate.id.localeCompare(remaining[bestIdx]!.id) < 0)
      ) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]!);
    remaining.splice(bestIdx, 1);
  }

  return selected.map((c) => c.id);
}
