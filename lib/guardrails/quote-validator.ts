import { getEnv } from "@/lib/env";

/** Normalized Levenshtein similarity in [0, 1]. */
export function fuzzySimilarity(a: string, b: string): number {
  const s = a.trim().toLowerCase();
  const t = b.trim().toLowerCase();
  if (s === t) return 1;
  if (!s.length || !t.length) return 0;
  if (s.includes(t) || t.includes(s)) {
    return Math.min(s.length, t.length) / Math.max(s.length, t.length);
  }

  const matrix: number[][] = Array.from({ length: s.length + 1 }, () =>
    Array(t.length + 1).fill(0)
  );
  for (let i = 0; i <= s.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= t.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[s.length][t.length];
  const maxLen = Math.max(s.length, t.length);
  return 1 - distance / maxLen;
}

export interface QuoteValidationResult {
  valid: boolean;
  quote: string;
  matchedContent?: string;
  similarity: number;
}

/** Validate a RAG quote against retrieved feedback content. */
export function validateQuote(
  quote: string,
  retrievedContents: string[]
): QuoteValidationResult {
  const threshold = getEnv().QUOTE_MATCH_THRESHOLD;
  let best = { similarity: 0, content: "" };

  for (const content of retrievedContents) {
    const similarity = fuzzySimilarity(quote, content);
    if (similarity > best.similarity) {
      best = { similarity, content };
    }
  }

  return {
    valid: best.similarity >= threshold,
    quote,
    matchedContent:
      best.similarity >= threshold ? best.content : undefined,
    similarity: best.similarity,
  };
}

export function validateAllQuotes(
  quotes: string[],
  retrievedContents: string[]
): QuoteValidationResult[] {
  return quotes.map((quote) => validateQuote(quote, retrievedContents));
}
