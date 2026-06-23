import { getEnv } from "@/lib/env";
import { fuzzySimilarity } from "@/lib/guardrails/quote-validator";
import type { ExtractedFeedbackItem } from "@/lib/groq";

export interface GroundingValidationResult {
  valid: boolean;
  item: ExtractedFeedbackItem;
  similarity: number;
  reason?: string;
}

/** Reject Groq-extracted content that cannot be grounded in raw page text. */
export function validateExtractionGrounding(
  item: ExtractedFeedbackItem,
  rawPageText: string
): GroundingValidationResult {
  const threshold = getEnv().EXTRACTION_GROUNDING_THRESHOLD;
  const normalizedPage = rawPageText.toLowerCase();
  const normalizedContent = item.content.trim().toLowerCase();

  if (normalizedContent.length < 10) {
    return {
      valid: false,
      item,
      similarity: 0,
      reason: "content_too_short",
    };
  }

  if (normalizedPage.includes(normalizedContent)) {
    return { valid: true, item, similarity: 1 };
  }

  const similarity = fuzzySimilarity(item.content, rawPageText);
  if (similarity >= threshold) {
    return { valid: true, item, similarity };
  }

  return {
    valid: false,
    item,
    similarity,
    reason: "not_grounded_in_page",
  };
}

export function filterGroundedExtractions(
  items: ExtractedFeedbackItem[],
  rawPageText: string
): { accepted: ExtractedFeedbackItem[]; rejected: GroundingValidationResult[] } {
  const accepted: ExtractedFeedbackItem[] = [];
  const rejected: GroundingValidationResult[] = [];

  for (const item of items) {
    const result = validateExtractionGrounding(item, rawPageText);
    if (result.valid) {
      accepted.push(item);
    } else {
      rejected.push(result);
    }
  }

  return { accepted, rejected };
}
