/**
 * Broadens retrieval beyond literal keyword overlap.
 * Maps user phrasing (e.g. "same songs", "repeat") to related concepts
 * for embedding, full-text search, and enrichment-theme boosts.
 */

export interface QueryExpansion {
  original: string;
  /** Appended to the query vector — conceptual context for MiniLM. */
  conceptPhrase: string;
  /** Short variants embedded separately and averaged with the main query. */
  embeddingVariants: string[];
  /** OR-joined terms for websearch_to_tsquery. */
  ftsTerms: string[];
  /** enrichment_results.themes values to boost */
  themes: string[];
  /** Optional regex for content ~* fallback */
  contentPattern?: string;
}

interface ConceptCluster {
  id: string;
  triggers: RegExp;
  concepts: string[];
  ftsTerms: string[];
  themes: string[];
  contentPattern: string;
}

const CONCEPT_CLUSTERS: ConceptCluster[] = [
  {
    id: "repetition",
    triggers:
      /\b(repeat|repetitive|repeating|same songs?|same music|same tracks?|over and over|again and again|keep playing|plays the same|stale|bored|boring|listening habits?|listen to the same|no variety|lack of variety|frustration|boredom|disappointment|frustrated|disappointed)\b/i,
    concepts: [
      "algorithm quality",
      "music recommendation trust",
      "discovery failure",
      "personalized suggestions",
      "radio autoplay",
      "playlist rotation",
      "listening habits",
      "repetitive recommendations",
    ],
    ftsTerms: [
      "repeat",
      "same songs",
      "algorithm",
      "recommendation",
      "recommend",
      "recommendations",
      "repetitive",
      "suggest",
      "discover",
      "personalization",
      "radio",
      "playlist",
      "variety",
      "stale",
      "bored",
      "frustrated",
      "frustration",
      "disappointed",
      "disappointment",
      "boredom",
    ],
    themes: ["discovery", "recommendations", "playback"],
    contentPattern:
      "(repeat|same song|same music|repetitive|algorithm|recommend|suggest|discover|personaliz|radio|variety|stale|bored|listening habit|autoplay|frustrat|disappoint)",
  },
  {
    id: "mood_vibe",
    triggers:
      /\b(mood|vibe|feeling|energy|atmosphere|wrong music|wrong song|doesn't fit|not fit|context|activity|workout|study|relax|calm|chill)\b/i,
    concepts: [
      "recommendation mood mismatch",
      "wrong vibe for activity",
      "playlist doesn't match moment",
      "algorithm suggests wrong energy",
      "music doesn't fit context",
      "recommendations feel off",
    ],
    ftsTerms: [
      "mood",
      "vibe",
      "feeling",
      "energy",
      "wrong",
      "fit",
      "match",
      "recommend",
      "suggest",
      "algorithm",
      "playlist",
      "discover",
      "shuffle",
      "for you",
      "interrupt",
      "calm",
      "chill",
      "workout",
    ],
    themes: ["discovery", "recommendations", "playback"],
    contentPattern:
      "(mood|vibe|feeling|energy|wrong|fit|match|recommend|suggest|algorithm|playlist|discover|shuffle|interrupt|calm|chill|workout|study)",
  },
  {
    id: "algorithm",
    triggers:
      /\b(algorithm|algorithms|recommendation engine|recommendations?|suggest(ed|ions?)?|personaliz(ed|ation)?|for you|made for you|daily mix|discover weekly|release radar|autoplay|smart shuffle)\b/i,
    concepts: [
      "recommendation quality",
      "algorithm trust",
      "discovery experience",
      "personalized playlists",
      "suggestion accuracy",
      "music discovery failure",
    ],
    ftsTerms: [
      "algorithm",
      "recommend",
      "recommendation",
      "suggest",
      "personalize",
      "discover",
      "daily mix",
      "for you",
      "playlist",
      "trust",
      "accuracy",
    ],
    themes: ["recommendations", "discovery"],
    contentPattern:
      "(algorithm|recommend|suggest|personaliz|discover|for you|autoplay|shuffle)",
  },
  {
    id: "discovery",
    triggers:
      /\b(discover(y|ing)?|find new music|new music|explore|exploring|music discovery|hidden gems|broaden|expand taste)\b/i,
    concepts: [
      "finding new artists",
      "exploration features",
      "recommendation discovery",
      "search and browse",
      "playlist discovery",
    ],
    ftsTerms: [
      "discover",
      "discovery",
      "find new",
      "explore",
      "recommendation",
      "search",
      "playlist",
      "new music",
      "artist",
    ],
    themes: ["discovery", "recommendations"],
    contentPattern: "(discover|find new|explore|recommendation|search|new music|hidden gem)",
  },
  {
    id: "trust",
    triggers:
      /\b(trust|distrust|don't trust|unreliable|inaccurate|wrong songs?|bad suggestions?|poor recommendations?|useless algorithm)\b/i,
    concepts: [
      "recommendation accuracy",
      "algorithm reliability",
      "suggestion quality",
      "personalization failure",
    ],
    ftsTerms: [
      "trust",
      "accurate",
      "inaccurate",
      "wrong",
      "bad recommendation",
      "algorithm",
      "suggest",
      "recommend",
    ],
    themes: ["recommendations", "discovery"],
    contentPattern:
      "(trust|accura|inaccura|wrong|bad recommend|poor suggest|useless|algorithm|doesn't know)",
  },
];

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

const PLAYLIST_FEATURE =
  /\b(discover weekly|release radar|daily mix|made for you|for you mix)\b/i;

function playlistConcepts(question: string): string[] {
  if (!PLAYLIST_FEATURE.test(question)) return [];
  const concepts: string[] = [];
  if (/discover weekly/i.test(question)) concepts.push("discover weekly");
  if (/release radar/i.test(question)) concepts.push("release radar");
  if (/daily mix/i.test(question)) concepts.push("daily mix");
  if (/made for you|for you mix/i.test(question)) concepts.push("made for you");
  return concepts;
}

/** Expand a user question for wider semantic + keyword + theme retrieval. */
export function expandQuery(question: string): QueryExpansion {
  const original = question.trim();
  const matched = CONCEPT_CLUSTERS.filter((c) => c.triggers.test(original));

  if (matched.length === 0) {
    return {
      original,
      conceptPhrase: original,
      embeddingVariants: [],
      ftsTerms: [],
      themes: [],
    };
  }

  const concepts = uniqueStrings([
    ...matched.flatMap((c) => c.concepts),
    ...playlistConcepts(original),
  ]);
  const ftsTerms = uniqueStrings(matched.flatMap((c) => c.ftsTerms));
  const themes = uniqueStrings(matched.flatMap((c) => c.themes));
  const patterns = matched.map((c) => c.contentPattern).filter(Boolean);

  const conceptPhrase = `${original}. Related topics: ${concepts.slice(0, 8).join(", ")}`;

  const embeddingVariants = uniqueStrings(
    matched.flatMap((c) =>
      c.concepts.slice(0, 3).map((concept) => `Spotify users discuss ${concept}`)
    )
  ).slice(0, 4);

  return {
    original,
    conceptPhrase,
    embeddingVariants,
    ftsTerms,
    themes,
    contentPattern:
      patterns.length > 0 ? patterns.map((p) => `(?:${p})`).join("|") : undefined,
  };
}

/** Build a websearch-style OR query for Postgres full-text search. */
export function buildFtsOrQuery(expansion: QueryExpansion): string {
  if (expansion.ftsTerms.length > 0) {
    return uniqueStrings(expansion.ftsTerms).slice(0, 16).join(" OR ");
  }

  const terms = uniqueStrings([
    ...expansion.original.split(/\s+/).filter((w) => w.length > 3),
  ]).slice(0, 16);

  if (terms.length === 0) return expansion.original;
  return terms.join(" OR ");
}
