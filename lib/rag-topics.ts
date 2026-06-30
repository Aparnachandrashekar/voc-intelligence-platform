/** Shared topic detection for RAG — safe to import from client components. */

export const RAG_TOPIC_MAP: Record<
  string,
  { label: string; aliases: string[]; theme?: string; contentPattern?: string }
> = {
  ads: {
    label: "Advertising & ads",
    aliases: ["ads", "advert", "advertisement", "commercial"],
    theme: "ads",
    contentPattern: "(advert|ads|\\yad\\y)",
  },
  shuffle: {
    label: "Shuffle & playback",
    aliases: ["shuffle", "shuffling"],
    theme: "shuffle",
    contentPattern: "shuffle",
  },
  premium: {
    label: "Premium & pricing",
    aliases: ["premium", "subscription", "pricing", "price", "paywall"],
    theme: "pricing",
    contentPattern: "(premium|subscription|pricing|\\yprice\\y)",
  },
  discovery: {
    label: "Music discovery",
    aliases: [
      "discovery",
      "discover",
      "recommendation",
      "recommendations",
      "algorithm",
      "suggest",
      "personalization",
    ],
    theme: "discovery",
    contentPattern: "(discover|recommendation|algorithm|suggest|personaliz)",
  },
  repetition: {
    label: "Repetitive recommendations",
    aliases: [
      "repeat",
      "repetitive",
      "same songs",
      "same song",
      "same music",
      "listening habits",
      "no variety",
      "stale",
    ],
    theme: "recommendations",
    contentPattern: "(repeat|same song|repetitive|stale|variety|listening habit)",
  },
  offline: {
    label: "Offline & downloads",
    aliases: ["offline", "download", "downloads"],
    theme: "offline",
    contentPattern: "(offline|download)",
  },
  podcast: {
    label: "Podcasts",
    aliases: ["podcast", "podcasts"],
    theme: "podcasts",
    contentPattern: "podcast",
  },
  performance: {
    label: "Performance & crashes",
    aliases: ["crash", "crashes", "slow", "lag", "bug", "bugs", "performance"],
    theme: "performance",
    contentPattern: "(crash|slow|lag|freeze|bug)",
  },
  playlist: {
    label: "Playlists",
    aliases: ["playlist", "playlists"],
    theme: "library",
    contentPattern: "playlist",
  },
};

export function detectRagTopics(question: string): string[] {
  const lower = question.toLowerCase();
  const hits: string[] = [];
  for (const [key, config] of Object.entries(RAG_TOPIC_MAP)) {
    if (config.aliases.some((a) => lower.includes(a))) {
      hits.push(key);
    }
  }
  return hits;
}

export function questionHasKnownTopic(question: string): boolean {
  return detectRagTopics(question).length > 0;
}

/** Terms for matching review sentences to the user's question. */
export function extractQuestionTopicTerms(question: string): string[] {
  const lower = question.toLowerCase();
  const terms: string[] = [];

  for (const config of Object.values(RAG_TOPIC_MAP)) {
    for (const alias of config.aliases) {
      if (lower.includes(alias)) terms.push(alias);
    }
  }

  const stop = new Set([
    "about",
    "content",
    "specifically",
    "reviews",
    "reviewers",
    "users",
    "people",
    "their",
    "what",
    "would",
    "could",
    "should",
    "spotify",
    "mention",
    "say",
    "said",
    "saying",
    "tell",
  ]);
  for (const word of lower.match(/\b[a-z]{4,}\b/g) ?? []) {
    if (!stop.has(word)) terms.push(word);
  }

  return [...new Set(terms)];
}
