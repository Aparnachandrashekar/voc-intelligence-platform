import { getEnv } from "@/lib/env";
import {
  itemQualifiesForEvidence,
} from "@/lib/guardrails/retrieval-score";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";
import type { RagResponse } from "@/lib/types/rag";

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
  items: RetrievedFeedbackItem[],
  question?: string
): EvidenceGateResult {
  const env = getEnv();
  const minScore = env.MIN_RETRIEVAL_SCORE;
  const minItems = env.MIN_EVIDENCE_ITEMS;

  const qualifying = items.filter((item) =>
    itemQualifiesForEvidence(item, minScore, question)
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

export function insufficientEvidenceResponse(meta: EvidenceGateResult["meta"]): RagResponse {
  return {
    status: "insufficient_evidence",
    executive_summary:
      "Not enough relevant reviews found for this query.",
    detailed_analysis: "",
    key_findings: [],
    supporting_quotes: [],
    theme_breakdown: [],
    source_attribution: [],
    product_recommendations: [],
    meta: {
      ...meta,
      message:
        "All answers must come from ingested App Store, Play Store, Reddit, or historical archive data only.",
    },
  };
}
