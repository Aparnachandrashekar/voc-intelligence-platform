import { formatPersona } from "@/lib/intelligence/format";
import { expandQuery } from "@/lib/query-expansion";
import { extractQuestionTopicTerms } from "@/lib/rag-topics";
import type { QuoteBackedFinding } from "@/lib/quote-backed-findings";
import type { CorpusBucketStat } from "@/lib/rag-corpus-aggregate";

export interface SummaryOptions {
  total_analyzed?: number;
  bucketStats?: CorpusBucketStat[];
}

const STOP = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "being",
  "could",
  "does",
  "don't",
  "from",
  "have",
  "just",
  "like",
  "make",
  "more",
  "much",
  "music",
  "only",
  "really",
  "same",
  "some",
  "spotify",
  "that",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "very",
  "want",
  "what",
  "when",
  "with",
  "would",
  "your",
]);

const THEME_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "repetitive recommendations", pattern: /same song|repeat|repetitive|recycle|over and over/i },
  { label: "weak discovery", pattern: /discover|find new|new music|explore|narrow/i },
  { label: "algorithm mistrust", pattern: /algorithm|recommend|suggest|personaliz|discover weekly|daily mix/i },
  { label: "pricing or ads", pattern: /premium|subscription|price|paywall|\bad\b|\bads\b/i },
  { label: "playback or shuffle", pattern: /shuffle|autoplay|radio|playback|skip/i },
  { label: "crashes or performance", pattern: /crash|slow|lag|freeze|bug|performance/i },
  { label: "offline or downloads", pattern: /offline|download/i },
  { label: "praise for playlists", pattern: /love|great|best|perfect|awesome|playlist/i },
];

function significantWords(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []).filter(
    (w) => !STOP.has(w)
  );
}

function themesFromQuotes(quotes: string[]): string[] {
  const hits = new Map<string, number>();
  for (const quote of quotes) {
    for (const { label, pattern } of THEME_PATTERNS) {
      if (pattern.test(quote)) {
        hits.set(label, (hits.get(label) ?? 0) + 1);
      }
    }
  }
  return [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label);
}

function sharedKeywords(quotes: string[]): string[] {
  if (quotes.length === 0) return [];
  const counts = new Map<string, number>();
  for (const quote of quotes) {
    for (const word of new Set(significantWords(quote))) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= Math.min(2, quotes.length))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);
}

function clipPhrase(text: string, max = 90): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function questionTerms(question: string): string[] {
  const expansion = expandQuery(question);
  return [
    ...new Set([
      ...extractQuestionTopicTerms(question),
      ...expansion.ftsTerms,
      ...(question.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []),
    ]),
  ].filter((t) => t.length >= 3 && !STOP.has(t));
}

/** Score how directly a quote addresses the user's question. */
export function scoreQuoteRelevanceToQuestion(
  quote: string,
  question: string
): number {
  const lower = quote.toLowerCase();
  const q = question.toLowerCase();
  let score = 0;

  for (const term of questionTerms(question)) {
    if (lower.includes(term.toLowerCase())) {
      score += term.length >= 7 ? 6 : 4;
    }
  }

  const quoteWords = new Set(significantWords(quote));
  for (const word of significantWords(question)) {
    if (quoteWords.has(word)) score += 3;
  }

  for (const { pattern } of THEME_PATTERNS) {
    if (pattern.test(q) && pattern.test(lower)) score += 5;
    if (pattern.test(lower)) score += 1;
  }

  if (/segment|persona|user type|which user|struggle/.test(q) && lower.length >= 40) {
    score += 2;
  }

  if (/same song|repeat|repetitive|discover|recommend|algorithm/.test(q)) {
    if (/same song|repeat|repetitive|discover|recommend|algorithm/.test(lower)) {
      score += 8;
    }
  }

  if (
    /\b(why|problem|frustrat|hate|bad|weak|fail|struggle|stop|wish)\b/.test(q) &&
    /\b(but|however|hate|bad|frustrat|problem|issue|weak|fail|can't|won't|doesn't)\b/.test(
      lower
    )
  ) {
    score += 4;
  }

  if (/outstanding|best app|love this app|five stars|perfect app/i.test(lower)) {
    if (!/\b(but|however|except|weak|bad|hate|same|repeat|issue)\b/.test(lower)) {
      score -= 6;
    }
  }

  return score;
}

function selectMostRelevantQuote(quotes: string[], question: string): string {
  if (quotes.length === 0) return "";
  let best = quotes[0]!;
  let bestScore = -Infinity;

  for (const quote of quotes) {
    const score = scoreQuoteRelevanceToQuestion(quote, question);
    if (score > bestScore) {
      bestScore = score;
      best = quote;
    }
  }

  return best;
}

function segmentBreakdown(findings: QuoteBackedFinding[]): string | null {
  const counts = new Map<string, number>();
  for (const f of findings) {
    if (!f.segment) continue;
    counts.set(f.segment, (counts.get(f.segment) ?? 0) + 1);
  }
  if (counts.size < 2) return null;

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([seg, n]) => `${formatPersona(seg)} (${n})`);

  return `Voices in this sample span ${parts.join(", ")}.`;
}

/**
 * Build executive / research summary from corpus counts + illustrative quotes.
 */
export function synthesizeSummaryFromFindings(
  findings: QuoteBackedFinding[],
  question = "",
  options?: SummaryOptions
): string {
  if (findings.length === 0 && !options?.total_analyzed) return "";

  const quotes = findings.map((f) => f.quote.trim()).filter(Boolean);
  const bucketStats = options?.bucketStats ?? [];
  const totalAnalyzed = options?.total_analyzed;

  const parts: string[] = [];

  if (totalAnalyzed && totalAnalyzed > 0 && bucketStats.length > 0) {
    const breakdown = bucketStats
      .slice(0, 5)
      .map(
        (b) =>
          `${b.pct}% ${b.label.toLowerCase()} (${b.count.toLocaleString()} reviews)`
      )
      .join(", ");
    parts.push(`Analyzed ${totalAnalyzed.toLocaleString()} reviews. ${breakdown}.`);
  } else if (totalAnalyzed && totalAnalyzed > 0) {
    parts.push(`Analyzed ${totalAnalyzed.toLocaleString()} reviews.`);
  }

  if (quotes.length > 0) {
    const themes = themesFromQuotes(quotes);
    const keywords = sharedKeywords(quotes);
    const anchor = clipPhrase(selectMostRelevantQuote(quotes, question));
    const segmentNote = segmentBreakdown(findings);

    if (!totalAnalyzed) {
      parts.push(
        `Users most often raise ${themes.length > 0 ? themes.join(", ") : keywords.slice(0, 3).join(", ") || "the themes below"}.`
      );
    }

    if (anchor) {
      parts.push(`One reviewer puts it this way: "${anchor}"`);
    }

    if (keywords.length > 0 && themes.length > 0) {
      parts.push(
        `Shared language across illustrative quotes includes "${keywords.slice(0, 3).join('", "')}".`
      );
    }

    if (segmentNote) {
      parts.push(segmentNote);
    }

    if (/segment|persona|user type|which user/i.test(question) && !segmentNote) {
      parts.push(
        "Segment labels were not available for these quotes — re-run embed:active to index persona tags."
      );
    }
  }

  return parts.join(" ");
}

/** @deprecated Use synthesizeSummaryFromFindings with total_analyzed — kept for callers without corpus context. */
export function synthesizeRetrievalSummaryFromFindings(
  findings: QuoteBackedFinding[],
  question = ""
): string {
  if (findings.length === 0) return "";
  const quotes = findings.map((f) => f.quote.trim()).filter(Boolean);
  const themes = themesFromQuotes(quotes);
  const keywords = sharedKeywords(quotes);
  const anchor = clipPhrase(selectMostRelevantQuote(quotes, question));
  const segmentNote = segmentBreakdown(findings);
  const parts: string[] = [];
  parts.push(
    `Users most often raise ${themes.length > 0 ? themes.join(", ") : keywords.slice(0, 3).join(", ") || "the themes below"}.`
  );
  if (anchor) parts.push(`One reviewer puts it this way: "${anchor}"`);
  if (segmentNote) parts.push(segmentNote);
  return parts.join(" ");
}
