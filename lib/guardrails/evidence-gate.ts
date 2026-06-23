import { getEnv } from "@/lib/env";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

export interface EvidenceGateResult {
  allowed: boolean;
  reason?: string;
  items: RetrievedFeedbackItem[];
  meta: {
    retrieved_count: number;
    min_evidence_items: number;
    min_retrieval_score: number;
    max_similarity: number | null;
  };
}

/**
 * Blocks RAG generation when retrieval evidence is insufficient.
 * See docs/guardrails.md — Guardrail 4 & 5.
 */
export function evaluateEvidenceGate(
  items: RetrievedFeedbackItem[]
): EvidenceGateResult {
  const env = getEnv();
  const minScore = env.MIN_RETRIEVAL_SCORE;
  const minItems = env.MIN_EVIDENCE_ITEMS;

  const qualifying = items.filter(
    (item) => (item.similarity_score ?? 0) >= minScore
  );

  const maxSimilarity =
    qualifying.length > 0
      ? Math.max(...qualifying.map((i) => i.similarity_score ?? 0))
      : null;

  const meta = {
    retrieved_count: qualifying.length,
    min_evidence_items: minItems,
    min_retrieval_score: minScore,
    max_similarity: maxSimilarity,
  };

  if (qualifying.length < minItems) {
    return {
      allowed: false,
      reason: "insufficient_evidence",
      items: qualifying,
      meta,
    };
  }

  return {
    allowed: true,
    items: qualifying,
    meta,
  };
}

export function insufficientEvidenceResponse(meta: EvidenceGateResult["meta"]) {
  return {
    status: "insufficient_evidence" as const,
    executive_summary:
      "Not enough matching feedback in the database to answer this question confidently.",
    key_findings: [] as string[],
    supporting_quotes: [] as unknown[],
    theme_breakdown: [] as unknown[],
    source_attribution: [] as unknown[],
    product_recommendations: [] as string[],
    meta: {
      ...meta,
      message:
        "All answers must come from ingested App Store, Play Store, Quora, Twitter, forum, or Hugging Face data only.",
    },
  };
}
