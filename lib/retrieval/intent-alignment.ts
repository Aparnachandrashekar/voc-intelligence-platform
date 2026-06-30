import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

const PLATFORM_ENTITIES =
  /\b(tiktok|instagram|snapchat|twitter|youtube|facebook|reddit)\b/gi;

/** Concrete product features — literal mention helps, but not required alone. */
const FEATURE_ENTITIES =
  /\b(shuffle|autoplay|offline|premium|podcast|lyrics|equalizer|ads|advertisement|subscription|discover weekly|release radar|daily mix)\b/gi;

const MOOD_VIBE_QUERY =
  /\b(mood|vibe|feeling|energy|atmosphere|context|activity|doing|moment)\b/i;

const EMOTIONAL_REPETITION_QUERY =
  /\b(emotional|frustration|boredom|disappointment|frustrated|bored|disappointed|annoyed)\b/i;

const REPETITION_QUERY =
  /\b(repetitive|repeat|repeating|same songs?|same music|same tracks?|stale|no variety|over and over)\b/i;

const RECOMMENDATION_IN_TEXT =
  /\b(recommend|suggest|algorithm|discover|personaliz|for you|daily mix|release radar|discover weekly|playlist|shuffle|radio|autoplay|made for you)\b/i;

const MOOD_VIBE_IN_TEXT =
  /\b(mood|vibe|feeling|feelings|energy|calm|chill|relax|upbeat|sad|happy|workout|study|emotion|emotional|atmosphere)\b/i;

const EMOTION_IN_TEXT =
  /\b(frustrat|bored|disappoint|annoy|hate|tired of|sick of|angry|upset|irritat)\b/i;

const REPETITION_IN_TEXT =
  /\b(same song|same music|same track|repeat|repetitive|over and over|again and again|stale|no variety|bored|predictable|not random|recycle|narrow rotation|hear the same|plays the same)\b/i;

const MISMATCH_IN_TEXT =
  /\b(wrong|mismatch|doesn't fit|does not fit|not fit|off\b|doesn't match|does not match|interrupt|ruin|breaks)\b/i;

const STOP_WORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "about",
  "users",
  "user",
  "spotify",
  "reviews",
  "review",
  "mention",
  "mentions",
  "discovering",
  "songs",
  "searching",
  "them",
  "their",
  "they",
  "does",
  "have",
  "many",
  "some",
  "that",
  "this",
  "with",
  "from",
  "then",
  "for",
  "and",
  "the",
  "are",
  "how",
  "why",
  "do",
  "any",
  "ask",
  "question",
  "words",
  "describe",
  "describing",
  "recommending",
  "recommendations",
  "recommendation",
  "wrong",
  "they're",
  "use",
  "uses",
]);

/** Platform names — must appear literally in evidence. */
export function extractPlatformEntities(question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of question.matchAll(PLATFORM_ENTITIES)) {
    const term = match[0].toLowerCase();
    if (!seen.has(term)) {
      seen.add(term);
      out.push(term);
    }
  }
  return out;
}

/** Legacy export — platforms + concrete features only (not mood/vibe). */
export function extractSpecificEntities(question: string): string[] {
  return [
    ...extractPlatformEntities(question),
    ...extractFeatureEntities(question),
  ];
}

export function extractFeatureEntities(question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of question.matchAll(FEATURE_ENTITIES)) {
    const term = match[0].toLowerCase();
    if (!seen.has(term)) {
      seen.add(term);
      out.push(term);
    }
  }
  return out;
}

export function isMoodVibeQuestion(question: string): boolean {
  return MOOD_VIBE_QUERY.test(question);
}

export function isEmotionalRepetitionQuestion(question: string): boolean {
  return (
    EMOTIONAL_REPETITION_QUERY.test(question) &&
    (REPETITION_QUERY.test(question) || /\brecommend/i.test(question))
  );
}

export function isConceptualMetaQuestion(question: string): boolean {
  return isEmotionalRepetitionQuestion(question) || isMoodVibeQuestion(question);
}

/** Whether review text substantively answers a mood/vibe or emotional-repetition question. */
export function isConceptualOnTopic(question: string, content: string): boolean {
  if (isEmotionalRepetitionQuestion(question)) {
    return (
      (EMOTION_IN_TEXT.test(content) &&
        (REPETITION_IN_TEXT.test(content) || RECOMMENDATION_IN_TEXT.test(content))) ||
      REPETITION_IN_TEXT.test(content) ||
      (EMOTION_IN_TEXT.test(content) && RECOMMENDATION_IN_TEXT.test(content))
    );
  }
  if (isMoodVibeQuestion(question)) {
    return (
      (MOOD_VIBE_IN_TEXT.test(content) && RECOMMENDATION_IN_TEXT.test(content)) ||
      (MISMATCH_IN_TEXT.test(content) && RECOMMENDATION_IN_TEXT.test(content))
    );
  }
  return false;
}

/** Significant tokens from the question for overlap scoring. */
export function extractQueryAnchors(question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of question
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)) {
    if (token.length < 4 || STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/** Share of anchor terms found in review text (0–1). */
export function intentAlignmentScore(question: string, content: string): number {
  const anchors = extractQueryAnchors(question);
  if (anchors.length === 0) return 1;
  const text = content.toLowerCase();
  let hits = 0;
  for (const anchor of anchors) {
    if (text.includes(anchor)) hits++;
  }
  return hits / anchors.length;
}

/** Narrow queries skip broad keyword expansion — but conceptual questions need it. */
export function isNarrowSpecificQuery(question: string): boolean {
  if (extractPlatformEntities(question).length > 0) return true;
  if (isMoodVibeQuestion(question)) return false;
  if (isEmotionalRepetitionQuestion(question)) return false;
  if (extractFeatureEntities(question).length >= 2) return true;
  if (extractFeatureEntities(question).length >= 1 && question.length > 40) {
    return true;
  }
  const anchors = extractQueryAnchors(question);
  return anchors.length >= 8;
}

function passesMoodVibeIntent(content: string, sim: number): boolean {
  const text = content.toLowerCase();
  if (MOOD_VIBE_IN_TEXT.test(text) && RECOMMENDATION_IN_TEXT.test(text)) {
    return true;
  }
  if (MISMATCH_IN_TEXT.test(text) && RECOMMENDATION_IN_TEXT.test(text)) {
    return true;
  }
  if (REPETITION_IN_TEXT.test(text) && sim >= 0.4) return true;
  if (RECOMMENDATION_IN_TEXT.test(text) && sim >= 0.44) return true;
  return false;
}

function passesEmotionalRepetitionIntent(content: string, sim: number): boolean {
  const text = content.toLowerCase();
  const hasEmotion = EMOTION_IN_TEXT.test(text);
  const hasRepetition = REPETITION_IN_TEXT.test(text);
  const hasRec = RECOMMENDATION_IN_TEXT.test(text);

  if (hasEmotion && (hasRepetition || hasRec)) return true;
  if (hasRepetition && hasRec) return true;
  if (hasRepetition) return true;
  if (hasEmotion && sim >= 0.35) return true;
  if (hasRec && sim >= 0.4 && /hate|bad|worst|terrible|awful|disappoint|frustrat|annoy|bored/.test(text)) {
    return true;
  }
  return sim >= 0.45 && (hasRec || hasRepetition);
}

function filterEmotionalRepetitionItems(
  items: RetrievedFeedbackItem[]
): RetrievedFeedbackItem[] {
  const strict = items.filter((item) => {
    const text = item.content.toLowerCase();
    return (
      EMOTION_IN_TEXT.test(text) &&
      (REPETITION_IN_TEXT.test(text) || RECOMMENDATION_IN_TEXT.test(text))
    );
  });
  if (strict.length >= 3) return strict;

  const medium = items.filter((item) =>
    passesEmotionalRepetitionIntent(
      item.content,
      item.similarity_score ?? 0
    )
  );
  if (medium.length >= 3) return medium;

  const loose = items.filter((item) => {
    const text = item.content.toLowerCase();
    return (
      REPETITION_IN_TEXT.test(text) ||
      RECOMMENDATION_IN_TEXT.test(text) ||
      EMOTION_IN_TEXT.test(text)
    );
  });
  return loose.length > 0 ? loose : items;
}

/**
 * Drop loosely related hits when the question names specific platforms/features.
 * Conceptual questions (mood, emotional language) use synonym-aware matching.
 */
export function filterBySpecificIntent(
  question: string,
  items: RetrievedFeedbackItem[]
): RetrievedFeedbackItem[] {
  const platforms = extractPlatformEntities(question);
  if (platforms.length > 0) {
    return items.filter((item) => {
      const text = item.content.toLowerCase();
      return platforms.some((p) => text.includes(p));
    });
  }

  if (isMoodVibeQuestion(question)) {
    const filtered = items.filter((item) =>
      passesMoodVibeIntent(item.content, item.similarity_score ?? 0)
    );
    return filtered.length > 0 ? filtered : items;
  }

  if (isEmotionalRepetitionQuestion(question)) {
    return filterEmotionalRepetitionItems(items);
  }

  const features = extractFeatureEntities(question);
  if (features.length === 0) return items;

  return items.filter((item) => {
    const text = item.content.toLowerCase();
    const entityHits = features.filter((e) => text.includes(e)).length;
    const alignment = intentAlignmentScore(question, item.content);
    const sim = item.similarity_score ?? 0;
    const kw = item.keyword_score ?? 0;

    if (entityHits >= 1 && (sim >= 0.32 || kw >= 0.25 || alignment >= 0.2)) {
      return true;
    }
    if (sim >= 0.48 && alignment >= 0.15) return true;
    return false;
  });
}
