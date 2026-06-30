import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

const PLATFORM_ENTITIES =
  /\b(tiktok|instagram|snapchat|twitter|youtube|facebook|reddit)\b/gi;

const FEATURE_ENTITIES =
  /\b(mood|energy|shuffle|autoplay|offline|premium|podcast|lyrics|equalizer|ads|advertisement|subscription|discover weekly|release radar|daily mix)\b/gi;

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
]);

/** Platform / feature terms that must appear in evidence when the question names them. */
export function extractSpecificEntities(question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pattern of [PLATFORM_ENTITIES, FEATURE_ENTITIES]) {
    for (const match of question.matchAll(pattern)) {
      const term = match[0].toLowerCase();
      if (!seen.has(term)) {
        seen.add(term);
        out.push(term);
      }
    }
  }
  return out;
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

/** Narrow queries should not use broad concept expansion for keyword retrieval. */
export function isNarrowSpecificQuery(question: string): boolean {
  if (extractSpecificEntities(question).length >= 2) return true;
  if (extractSpecificEntities(question).length >= 1 && question.length > 40) {
    return true;
  }
  const anchors = extractQueryAnchors(question);
  return anchors.length >= 6;
}

/**
 * Drop loosely related hits when the question names specific platforms/features.
 * Never pads — may return an empty list.
 */
export function filterBySpecificIntent(
  question: string,
  items: RetrievedFeedbackItem[]
): RetrievedFeedbackItem[] {
  const entities = extractSpecificEntities(question);
  if (entities.length === 0) return items;

  const platforms = entities.filter((e) =>
    ["tiktok", "instagram", "snapchat", "twitter", "youtube", "facebook", "reddit"].includes(
      e
    )
  );

  if (platforms.length > 0) {
    return items.filter((item) => {
      const text = item.content.toLowerCase();
      return platforms.some((p) => text.includes(p));
    });
  }

  return items.filter((item) => {
    const text = item.content.toLowerCase();
    const entityHits = entities.filter((e) => text.includes(e)).length;
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
