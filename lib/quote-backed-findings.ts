import { cleanQuoteForDisplay } from "@/lib/intelligence/quote-display";
import { expandQuery } from "@/lib/query-expansion";
import { synthesizeSummaryFromFindings, type SummaryOptions } from "@/lib/quote-summary";
import {
  isEmotionalRepetitionQuestion,
  isMoodVibeQuestion,
} from "@/lib/retrieval/intent-alignment";
import {
  isPrimaryRepetitionComplaint,
  isRepetitionQuestion,
} from "@/lib/rag-retrieval-filter";
import { isProblemFramedQuestion } from "@/lib/rag-retrieval-rank";
import { extractQuestionTopicTerms } from "@/lib/rag-topics";
import { fuzzySimilarity } from "@/lib/guardrails/quote-validator";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";
import type { RagResponse } from "@/lib/types/rag";

export interface QuoteBackedFinding {
  insight: string;
  quote: string;
  source: string;
  theme: string;
  segment?: string;
  date: string;
  feedback_item_id: string;
}

const EMOTION_IN_QUOTE =
  /\b(frustrat|bored|disappoint|annoy|hate|tired of|sick of|angry|upset|irritat)\b/i;

const REC_SENTENCE =
  /recommend|suggest|algorithm|discover|personaliz|for you|daily mix|release radar|discover weekly|same song|same music|same track|repeat|repetitive|stale|variety|bored|listening habit|radio|autoplay|not random|predictable|shuffle.*same|discover weekly|made for you|frustrat|disappoint|annoy|mood|vibe|wrong|interrupt/i;

function matchesRepetitionOrEmotionContent(content: string): boolean {
  return (
    isPrimaryRepetitionComplaint(content) ||
    (EMOTION_IN_QUOTE.test(content) &&
      /recommend|suggest|algorithm|discover|repeat|same song|same music|repetitive|shuffle|playlist|for you|daily mix/i.test(
        content
      )) ||
    (EMOTION_IN_QUOTE.test(content) &&
      /repeat|same song|same music|repetitive|stale|bored|variety|over and over/i.test(
        content
      ))
  );
}

const GENERIC_PRAISE =
  /outstanding|incredible selection|best app|love this app|great app|five stars|5 stars|perfect app/i;

function scoreQuoteSentence(sentence: string, question = ""): number {
  const s = sentence.toLowerCase();
  const q = question.toLowerCase();
  let score = 0;
  if (/same song|same music|same track|repeat|repetitive|over and over/.test(s)) score += 12;
  if (/frustrat|disappoint|annoy|bored|tired of|sick of/.test(s)) score += 10;
  if (/mood|vibe|wrong|doesn't fit|does not fit|interrupt/.test(s)) score += 8;
  if (/algorithm|recommend|suggest|personaliz|for you|daily mix|discover weekly/.test(s)) score += 9;
  if (/discover|stale|variety|bored|not random|predictable/.test(s)) score += 7;
  if (GENERIC_PRAISE.test(s) && !/algorithm|recommend|repeat|same|discover|suggest|stale|variety/.test(s)) {
    score -= 10;
  }
  if (isProblemFramedQuestion(question) && GENERIC_PRAISE.test(s)) {
    score -= 8;
  }
  if (/repeat|same song|repetitive|stale|no variety/.test(q)) {
    if (/repeat|same song|repetitive|stale|variety|bored|predictable|not random/.test(s)) score += 8;
    if (/understand my taste|pure magic|highly accurate|love discover|elite/.test(s)) score -= 5;
  }
  return score;
}

function isUsableQuoteSentence(sentence: string, question: string): boolean {
  const t = sentence.trim().replace(/\s+/g, " ");
  if (t.length < 30 || t.length > 320) return false;
  if (t.split(/\s+/).filter(Boolean).length < 5) return false;
  if (/^\d\s*star/i.test(t)) return false;
  const terms = searchTermsForQuestion(question);
  const lower = t.toLowerCase();
  if (terms.some((term) => lower.includes(term.toLowerCase()))) return true;
  if (REC_SENTENCE.test(t)) return true;
  return t.length >= 50;
}

function searchTermsForQuestion(question: string): string[] {
  const expansion = expandQuery(question);
  return [
    ...new Set([
      ...extractQuestionTopicTerms(question),
      ...expansion.ftsTerms,
    ]),
  ].filter((t) => t.length >= 3);
}

function extractQuoteCandidates(
  question: string,
  items: RetrievedFeedbackItem[]
): Array<{ sentence: string; item: RetrievedFeedbackItem }> {
  const terms = searchTermsForQuestion(question);
  const seen = new Set<string>();
  const out: Array<{ sentence: string; item: RetrievedFeedbackItem }> = [];

  for (const item of items) {
    if (
      isRepetitionQuestion(question) &&
      !isEmotionalRepetitionQuestion(question) &&
      !isMoodVibeQuestion(question) &&
      !isPrimaryRepetitionComplaint(item.content)
    ) {
      continue;
    }
    if (
      isEmotionalRepetitionQuestion(question) &&
      !matchesRepetitionOrEmotionContent(item.content)
    ) {
      continue;
    }
    if (
      isProblemFramedQuestion(question) &&
      GENERIC_PRAISE.test(item.content) &&
      !/\b(but|however|except|weak|bad|hate|poor|same|repeat|stale|bored|issue|problem|declin|discover weekly)\b/i.test(
        item.content
      )
    ) {
      continue;
    }

    const sentences = item.content
      .replace(/\n+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const termHit =
        terms.length === 0 || terms.some((term) => lower.includes(term.toLowerCase()));
      if (!termHit && !REC_SENTENCE.test(sentence)) continue;
      if (!isUsableQuoteSentence(sentence, question)) continue;
      if (
        isRepetitionQuestion(question) &&
        !isEmotionalRepetitionQuestion(question) &&
        !isMoodVibeQuestion(question) &&
        !isPrimaryRepetitionComplaint(sentence)
      ) {
        continue;
      }
      if (
        isEmotionalRepetitionQuestion(question) &&
        !matchesRepetitionOrEmotionContent(sentence)
      ) {
        continue;
      }

      const key = lower.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sentence, item });
    }
  }

  if (out.length === 0) {
    for (const item of items) {
      if (
        isRepetitionQuestion(question) &&
        !isEmotionalRepetitionQuestion(question) &&
        !isMoodVibeQuestion(question) &&
        !isPrimaryRepetitionComplaint(item.content)
      ) {
        continue;
      }
      if (
        isProblemFramedQuestion(question) &&
        GENERIC_PRAISE.test(item.content) &&
        !/\b(but|however|except|weak|bad|hate|poor|same|repeat|stale|bored|issue|problem|declin|discover weekly)\b/i.test(
          item.content
        )
      ) {
        continue;
      }
      if (!REC_SENTENCE.test(item.content) && searchTermsForQuestion(question).length > 0) {
        const terms = searchTermsForQuestion(question);
        if (!terms.some((t) => item.content.toLowerCase().includes(t.toLowerCase()))) {
          continue;
        }
      } else if (!REC_SENTENCE.test(item.content)) {
        continue;
      }
      const snippet = item.content.replace(/\s+/g, " ").trim().slice(0, 280);
      if (snippet.length < 30) continue;
      out.push({ sentence: snippet, item });
    }
  }

  return out.sort(
    (a, b) =>
      scoreQuoteSentence(b.sentence, question) -
      scoreQuoteSentence(a.sentence, question)
  );
}

function deriveInsightFromQuote(sentence: string): string | null {
  const s = sentence.toLowerCase();

  if (/same song|same songs|same music|same track|repeat|repetitive|over and over|again and again|keep playing/.test(s)) {
    return "Users report hearing the same tracks too often — they experience recommendations as looping rather than fresh.";
  }
  if (/frustrat|annoy|irritat|sick of|tired of/.test(s)) {
    return "Reviewers use frustrated language when recommendations feel repetitive or ignore their listening context.";
  }
  if (/bored|boring|disappoint/.test(s) && /repeat|same|recommend|suggest|algorithm|discover|playlist|shuffle/.test(s)) {
    return "Users describe boredom or disappointment when Spotify keeps surfacing the same recommendations.";
  }
  if (/wrong|doesn't fit|does not fit|not fit|mismatch|interrupt|ruin|off vibe|bad mood/.test(s) && /recommend|suggest|playlist|shuffle|discover|for you|algorithm/.test(s)) {
    return "Reviewers say Spotify's suggestions miss the mood or vibe they want for what they're doing.";
  }
  if (/stale|bored|boring|no variety|lack of variety|predictable/.test(s)) {
    return "Reviewers describe their feeds as stale or predictable, with too little variety in what Spotify surfaces.";
  }
  if (/algorithm|recommend|suggest|personaliz|for you|daily mix|discover weekly|release radar/.test(s)) {
    if (/bad|wrong|terrible|awful|hate|don't trust|distrust|inaccurate|poor|useless|garbage|miss/.test(s)) {
      return "Reviewers express low trust in Spotify's recommendations — suggested music often misses their taste or mood.";
    }
    if (/good|great|love|understand|accurate|spot on|perfect|nails it|knows my taste/.test(s)) {
      return "Some users praise recommendation quality, saying Spotify's algorithm understands their taste and helps them discover music.";
    }
    return "Users discuss how Spotify's algorithm and personalized suggestions shape what they listen to day to day.";
  }
  if (/discover|find new|new music|explore|hidden gem/.test(s)) {
    if (/can't|hard|difficult|fail|never|no new|struggle|stopped/.test(s)) {
      return "Discovery feels blocked for these users — they struggle to find new artists beyond what Spotify already pushes.";
    }
    return "Users comment on whether Spotify helps them discover fresh music or keeps them in a narrow listening loop.";
  }
  if (/shuffle|autoplay|radio/.test(s) && /same|repeat|not random|predict|pattern/.test(s)) {
    return "Shuffle and autoplay feel non-random to users, reinforcing the sense that recommendations rotate the same pool of tracks.";
  }

  if (!REC_SENTENCE.test(sentence)) {
    if (sentence.trim().length < 40) return null;
    const clipped = cleanQuoteForDisplay(sentence).slice(0, 140);
    return `Reviewers note: "${clipped}${clipped.length >= 140 ? "…" : ""}"`;
  }
  if (GENERIC_PRAISE.test(sentence) && scoreQuoteSentence(sentence, "") < 1) return null;
  return null;
}

function personaSegmentForItem(
  item: RetrievedFeedbackItem,
  enrichment: Map<string, Record<string, unknown>>
): string | undefined {
  const fromMeta = item.metadata?.persona_segment as string | undefined;
  if (fromMeta) return fromMeta;
  return enrichment.get(item.id)?.persona_segment as string | undefined;
}

function findingIsGrounded(
  sentence: string,
  insight: string,
  question: string
): boolean {
  if (GENERIC_PRAISE.test(sentence) && scoreQuoteSentence(sentence, question) < 3) {
    return false;
  }
  if (insightQuoteOverlap(insight, sentence) >= 1) return true;
  return scoreQuoteSentence(sentence, question) >= 3;
}

export function buildQuoteBackedFindings(
  question: string,
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>,
  maxFindings = 6
): QuoteBackedFinding[] {
  const candidates = extractQuoteCandidates(question, items);
  const findings: QuoteBackedFinding[] = [];
  const usedItems = new Set<string>();

  for (const { sentence, item } of candidates) {
    if (usedItems.has(item.id)) continue;
    const insight = deriveInsightFromQuote(sentence);
    if (!insight || !findingIsGrounded(sentence, insight, question)) continue;

    usedItems.add(item.id);
    const themes = (enrichment.get(item.id)?.themes as string[] | undefined) ?? [];
    findings.push({
      insight,
      quote: cleanQuoteForDisplay(sentence),
      source: item.source,
      theme: themes[0] ?? "general",
      segment: personaSegmentForItem(item, enrichment),
      date: item.created_at?.toISOString?.() ?? "",
      feedback_item_id: item.id,
    });

    if (findings.length >= maxFindings) break;
  }

  return findings;
}

function insightQuoteOverlap(insight: string, quote: string): number {
  const stop = new Set([
    "about",
    "their",
    "spotify",
    "users",
    "reviewers",
    "music",
    "these",
    "what",
    "that",
    "with",
    "from",
    "they",
    "them",
    "this",
    "have",
    "feels",
  ]);
  const insightWords = new Set(
    (insight.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []).filter((w) => !stop.has(w))
  );
  const quoteWords = (quote.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []).filter(
    (w) => !stop.has(w)
  );
  return quoteWords.filter((w) => insightWords.has(w)).length;
}

/** Drop Groq insights that lack a supporting quote; pair by overlap or index. */
export function reconcileGroqFindings(
  insights: string[],
  quotes: RagResponse["supporting_quotes"]
): QuoteBackedFinding[] {
  const findings: QuoteBackedFinding[] = [];
  const usedQuotes = new Set<number>();

  for (const insight of insights) {
    let bestIdx = -1;
    let bestScore = 0;

    quotes.forEach((q, idx) => {
      if (usedQuotes.has(idx)) return;
      const overlap = insightQuoteOverlap(insight, q.quote);
      const sim = fuzzySimilarity(insight, q.quote);
      const score = overlap * 2 + sim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    if (bestIdx === -1 || bestScore < 0.35) continue;

    usedQuotes.add(bestIdx);
    const q = quotes[bestIdx];
    findings.push({
      insight,
      quote: cleanQuoteForDisplay(q.quote),
      source: q.source,
      theme: q.theme,
      date: q.date,
      feedback_item_id: q.feedback_item_id,
    });
  }

  return findings;
}

export function buildResearchSummary(
  question: string,
  findings: QuoteBackedFinding[],
  options?: SummaryOptions
): string {
  return synthesizeSummaryFromFindings(findings, question, options);
}

export function findingsToRagFields(
  findings: QuoteBackedFinding[],
  question = "",
  options?: SummaryOptions
): {
  executive_summary: string;
  detailed_analysis: string;
  research_summary: string;
  supporting_quotes: RagResponse["supporting_quotes"];
  findings: QuoteBackedFinding[];
} {
  const research_summary = buildResearchSummary(question, findings, options);
  const executive = research_summary || findings[0]?.insight || "";

  return {
    executive_summary: executive.trim(),
    research_summary,
    detailed_analysis: findings.map((f) => f.insight).join("\n"),
    supporting_quotes: findings.map((f) => ({
      quote: f.quote,
      theme: f.theme,
      source: f.source,
      date: f.date,
      feedback_item_id: f.feedback_item_id,
    })),
    findings,
  };
}
