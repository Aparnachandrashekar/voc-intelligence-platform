import { detectRagTopics } from "@/lib/rag-topics";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

const REC_QUESTION =
  /\b(repeat|repetitive|same songs?|same music|algorithm|recommend|discover(y|ing)?|suggest|personaliz|daily mix|for you|stale|listening habits?|no variety|discover weekly|release radar)\b/i;

const REPETITION_QUESTION =
  /\b(repeat|repetitive|same songs?|same music|same tracks?|hear the same|over and over|listening habits?|no variety|staleness?|stale|recycle the same)\b/i;

/** Strong signals for repetition / shuffle / recommendation staleness. */
const REPETITION_SIGNALS =
  /same song|same music|same track|repeat|repetitive|over and over|again and again|shuffle|autoplay|radio|not random|predictable|stale|variety|bored|daily mix|discover weekly|algorithm|recommend|suggest|personaliz|for you|playlist.*same|keep playing|narrow|loop/i;

const REC_CONTENT = REPETITION_SIGNALS;

const PRICING_SIGNALS =
  /\b(premium|subscription|paywall|pricing|\bprice\b|\bcost\b|\$\d|too expensive|monthly fee|cancel subscription|free trial)\b/gi;
const ADS_SIGNALS =
  /\b(\bad\b|\bads\b|advert|advertisement|commercial|too many ads|ad frequency|free tier)\b/gi;

const REC_THEMES = new Set(["discovery", "recommendations", "playback"]);

export function isRepetitionQuestion(question: string): boolean {
  if (REPETITION_QUESTION.test(question)) return true;
  const topics = detectRagTopics(question);
  return topics.includes("repetition");
}

export function shouldApplyRecommendationFilter(question: string): boolean {
  if (isRepetitionQuestion(question)) return true;
  if (REC_QUESTION.test(question)) return true;
  const topics = detectRagTopics(question);
  return topics.includes("discovery") || topics.includes("repetition");
}

function countMatches(content: string, pattern: RegExp): number {
  return content.toLowerCase().match(pattern)?.length ?? 0;
}

function repetitionScore(content: string): number {
  let score = 0;
  score +=
    countMatches(content, /same song|same music|same track|same songs/gi) * 4;
  score +=
    countMatches(
      content,
      /\bon repeat\b|repetitive|over and over|again and again|hear the same/gi
    ) * 3;
  score +=
    countMatches(
      content,
      /\brepeats?\s+(?:the\s+)?(?:same|this|my|these|those)\b/gi
    ) * 3;
  score +=
    countMatches(
      content,
      /shuffle|autoplay|radio|not random|predictable|stale|no variety|bored|narrow|loop/gi
    ) * 2;
  score +=
    countMatches(
      content,
      /algorithm|recommend|suggest|personaliz|daily mix|discover weekly|for you/gi
    ) * 1.5;

  const lower = content.toLowerCase();
  if (/\bi repeat\b|\brepeat that\b|\brepeat,\s*(the|this|it|premium|ads)/.test(lower)) {
    score -= 4;
  }

  return Math.max(0, score);
}

/**
 * True when repetition/shuffle/staleness is the primary complaint — not pricing or ads
 * mentioned alongside an incidental "repeat".
 */
export function isPrimaryRepetitionComplaint(content: string): boolean {
  const rep = repetitionScore(content);
  const pricingScore = countMatches(content, PRICING_SIGNALS);
  const adsScore = countMatches(content, ADS_SIGNALS);

  if (rep < 1) return false;

  if (pricingScore >= 2 && pricingScore > rep) return false;
  if (adsScore >= 2 && adsScore > rep) return false;

  const lower = content.toLowerCase();
  const firstSentence = lower.split(/[.!?]/)[0] ?? "";
  const leadIsPricingOrAds =
    /\b(premium|subscription|price|paywall|ads?\b|advert)/.test(firstSentence);
  const leadHasRepetition = REPETITION_SIGNALS.test(firstSentence);

  if (leadIsPricingOrAds && !leadHasRepetition) return false;

  return rep >= 1;
}

function mentionsOffTopicWithoutRec(content: string): boolean {
  const c = content.toLowerCase();
  const hasRec = REC_CONTENT.test(c);

  const adsFocus =
    /\b(ad|ads|advert|advertisement|commercial|free tier)\b/.test(c) && !hasRec;
  const pricingFocus =
    /\b(premium|subscription|paywall|\bprice\b|\bcost\b|\$\d|too expensive)\b/.test(
      c
    ) && !hasRec;
  const uiFocus =
    /\b(ui|interface|design|layout|navigate|navigation|button|screen|font|theme)\b/.test(
      c
    ) && !hasRec;

  return adsFocus || pricingFocus || uiFocus;
}

function isRecommendationRelated(
  item: RetrievedFeedbackItem,
  enrichment: Record<string, unknown> | undefined
): boolean {
  if (REC_CONTENT.test(item.content)) return true;

  const themes = (enrichment?.themes as string[] | undefined) ?? [];
  return themes.some((t) => REC_THEMES.has(t));
}

export function filterForRepetitionPrimaryComplaint(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>
): RetrievedFeedbackItem[] {
  return items.filter((item) => {
    if (!isPrimaryRepetitionComplaint(item.content)) return false;

    const themes = (enrichment.get(item.id)?.themes as string[] | undefined) ?? [];
    const pricingOrAdsPrimary =
      (themes.includes("pricing") || themes.includes("ads")) &&
      !themes.some((t) => REC_THEMES.has(t));

    return !pricingOrAdsPrimary;
  });
}

export function filterForRecommendationContext(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>
): RetrievedFeedbackItem[] {
  return items.filter((item) => {
    const e = enrichment.get(item.id);
    if (mentionsOffTopicWithoutRec(item.content)) return false;
    return isRecommendationRelated(item, e);
  });
}

export function filterRetrievedForQuestion(
  question: string,
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>
): RetrievedFeedbackItem[] {
  if (isRepetitionQuestion(question)) {
    const strict = filterForRepetitionPrimaryComplaint(items, enrichment);
    return strict.length > 0 ? strict : filterForRecommendationContext(items, enrichment);
  }
  if (shouldApplyRecommendationFilter(question)) {
    return filterForRecommendationContext(items, enrichment);
  }
  return items;
}
