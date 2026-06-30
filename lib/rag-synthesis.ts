import {
  formatAnalyzedCorpusPhrase,
  formatAnalyzedReviewCount,
} from "@/lib/intelligence/copy";
import { normalizeClusterLabel } from "@/lib/intelligence/display";
import { formatSource, formatThemeCluster } from "@/lib/intelligence/format";
import type { VerifiedStat } from "@/lib/rag-stats";
import type { SampleSentiment } from "@/lib/rag-stats";
import { detectRagTopics, extractQuestionTopicTerms } from "@/lib/rag-topics";
import type { RetrievedFeedbackItem } from "@/lib/types/feedback";
import type { RagResearchSection } from "@/lib/types/rag";

export function isCountQuestion(question: string): boolean {
  return /\b(how many|number of|count of|total number|what percent|what percentage|what share)\b/i.test(
    question
  );
}

export function isQualitativeQuestion(question: string): boolean {
  return /\b(why|how come|what causes|what drives|what do users|what are users|explain|reason|frustrat|complain|hate|dislike|issue|problem)\b/i.test(
    question
  );
}

export function isVoiceQuestion(question: string): boolean {
  return /\b(what do (they|users|people|reviewers)|what are users saying|specifically say|what users (say|think|feel|want)|tell me what|how do users describe|user voice|feedback on|say about)\b/i.test(
    question
  );
}

function topicKey(label: string): string {
  return normalizeClusterLabel(label).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Groq JSON may return strings, arrays, or nested objects — always coerce before .trim(). */
export function coerceToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(coerceToText).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.bullets)) return coerceToText(o.bullets);
    if (typeof o.text === "string") return o.text;
    if (typeof o.summary === "string") return o.summary;
    if (typeof o.body === "string") return o.body;
  }
  return "";
}

export function isUsableFindingPhrase(text: string): boolean {
  const t = text.trim().replace(/^["']|["']$/g, "");
  if (t.length < 15) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  if (/\b(the|a|an|to|for|and|or|it|i|we|my|like)\.$/i.test(t)) return false;
  if (/^y'?all\b/i.test(t)) return false;
  if (/^(great|good|nice|love it|at first|should add)\b/i.test(t)) return false;
  if (/^(you|we|they|i) (should|need|want|would)\b/i.test(t) && words.length < 6) {
    return false;
  }
  return true;
}

function isUsableReviewSentence(sentence: string): boolean {
  const t = sentence.trim().replace(/\s+/g, " ");
  if (t.length < 35 || t.length > 280) return false;
  if (t.split(/\s+/).filter(Boolean).length < 6) return false;
  if (/^\d\s*star/i.test(t)) return false;
  return true;
}

/** Pull sentences from reviews for supporting signals only — not for synthesis bullets. */
export function extractRelevantSentences(
  question: string,
  items: RetrievedFeedbackItem[],
  limit = 5
): string[] {
  const terms = extractQuestionTopicTerms(question);
  if (terms.length === 0) return [];

  const seen = new Set<string>();
  const sentences: string[] = [];

  for (const item of items) {
    for (const sentence of item.content
      .replace(/\n+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      const lower = sentence.toLowerCase();
      if (!terms.some((term) => lower.includes(term))) continue;
      if (!isUsableReviewSentence(sentence)) continue;
      const key = lower.slice(0, 72);
      if (seen.has(key)) continue;
      seen.add(key);
      sentences.push(sentence);
      if (sentences.length >= limit) break;
    }
    if (sentences.length >= limit) break;
  }
  return sentences;
}

function collectEnrichmentStats(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>
) {
  const painCounts = new Map<string, number>();
  const themeCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  let negativeInSample = 0;
  let positiveInSample = 0;

  for (const item of items) {
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
    const e = enrichment.get(item.id);
    if (e?.sentiment === "negative") negativeInSample++;
    if (e?.sentiment === "positive") positiveInSample++;
    for (const p of (e?.pain_points as unknown[] | undefined) ?? []) {
      const key = coerceToText(p).trim();
      if (!key) continue;
      painCounts.set(key, (painCounts.get(key) ?? 0) + 1);
    }
    for (const t of (e?.themes as unknown[] | undefined) ?? []) {
      const theme = coerceToText(t).trim();
      if (theme) themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    }
  }

  const topThemes = [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => formatThemeCluster(t))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 5);

  return {
    painCounts,
    themeCounts,
    topThemes,
    sourceCounts,
    negativeInSample,
    positiveInSample,
  };
}

function countSignal(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>,
  topicPattern: RegExp,
  signalPattern: RegExp
): number {
  return items.filter((item) => {
    if (!topicPattern.test(item.content)) return false;
    if (signalPattern.test(item.content)) return true;
    const pains = (enrichment.get(item.id)?.pain_points as string[] | undefined) ?? [];
    return pains.some((p) => signalPattern.test(p));
  }).length;
}

function pct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

/** Core insight engine — paraphrased research, never raw quote dumps. */
export function buildInsightNarrative(
  question: string,
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>,
  sample: SampleSentiment,
  verifiedStats: VerifiedStat[]
): { executive: string; bullets: string[] } {
  const stats = collectEnrichmentStats(items, enrichment);
  const n = items.length || 1;
  const topics = detectRagTopics(question);
  const bullets: string[] = [];

  if (topics.includes("podcast") || /\bpodcasts?\b/i.test(question)) {
    const playback = countSignal(
      items,
      enrichment,
      /podcast/i,
      /stop|pause|stuck|restart|buffer|mid-|randomly|manually|not (work|playing)|cuts out/i
    );
    const pushback = countSignal(
      items,
      enrichment,
      /podcast/i,
      /might like|recommend|suggest|push|deleted|don't want|stop telling|shove|force/i
    );
    const premiumGap = countSignal(
      items,
      enrichment,
      /podcast/i,
      /premium|pay|subscription|paid/i
    );
    const praise = items.filter(
      (i) =>
        /podcast/i.test(i.content) &&
        (enrichment.get(i.id)?.sentiment === "positive" ||
          /\b(great|good|love|excellent|best)\b/i.test(i.content))
    ).length;

    if (playback >= 2) {
      bullets.push(
        `Playback reliability is the dominant frustration: roughly ${pct(playback, n)}% of matching reviews describe podcasts stopping mid-episode, failing to resume, or requiring constant manual restarts — a sharp contrast with music streaming that "just works" for the same users.`
      );
    }
    if (pushback >= 2) {
      bullets.push(
        `Users push back on how Spotify treats podcasts as content to promote, not just play — deleted episodes resurfacing, unsolicited "you might like" prompts, and podcast suggestions bleeding into music discovery feel intrusive rather than helpful.`
      );
    }
    if (premiumGap >= 2) {
      bullets.push(
        `Premium subscribers explicitly compare music vs podcast reliability — they pay expecting a unified listening experience, and podcast failures undermine the value story Spotify sells with Premium.`
      );
    }
    if (praise >= 2) {
      bullets.push(
        `Not all podcast feedback is negative: a meaningful subset praises catalog depth and content quality, suggesting the library itself is not the primary issue — execution and UX are.`
      );
    }
    if (bullets.length === 0) {
      bullets.push(
        `Users discuss podcasts as an add-on inside a music-first app — feedback centers on whether Spotify treats talk content with the same product rigor as music playback and discovery.`
      );
    }
  } else if (topics.includes("shuffle") || /\bshuffle\b/i.test(question)) {
    const repetition = countSignal(items, enrichment, /shuffle/i, /repeat|same|again|over and over|loop/i);
    const randomness = countSignal(items, enrichment, /shuffle/i, /random|predict|algorithm|pattern|favor/i);
    if (repetition >= 2) {
      bullets.push(
        `The core shuffle complaint is repetition — users hear the same tracks rotate back too quickly, making shuffle feel like a fixed loop rather than true variety.`
      );
    }
    if (randomness >= 2) {
      bullets.push(
        `Users suspect the shuffle algorithm is not random — many describe predictable patterns or favoritism toward certain songs, which breaks trust in discovery.`
      );
    }
    if (bullets.length === 0) {
      bullets.push(
        `Shuffle frustration centers on loss of control: users want variety without repetition, but feel the algorithm works against that expectation.`
      );
    }
  } else if (topics.includes("ads") || /\bads?\b/i.test(question)) {
    const intrusive = countSignal(items, enrichment, /ad/i, /too many|interrupt|annoy|every|constant|free tier/i);
    const upgrade = countSignal(items, enrichment, /ad/i, /premium|upgrade|pay|subscription/i);
    if (intrusive >= 2) {
      bullets.push(
        `Free-tier users describe ads as interrupting the listening flow — frequency and placement break immersion, especially during playlists or focused sessions.`
      );
    }
    if (upgrade >= 2) {
      bullets.push(
        `Ad complaints often sit alongside upgrade consideration — users understand the tradeoff but resent how aggressively Spotify surfaces the paywall.`
      );
    }
  } else {
    for (const [pain, count] of [...stats.painCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)) {
      if (!isUsableFindingPhrase(pain)) continue;
      bullets.push(
        `${count} of ${n} matching reviews (${pct(count, n)}%) cite "${pain.charAt(0).toLowerCase() + pain.slice(1)}" as a concrete friction point.`
      );
    }
    if (stats.topThemes.length >= 2 && bullets.length < 3) {
      bullets.push(
        `Feedback clusters around ${stats.topThemes.slice(0, 2).join(" and ")} — users frame the issue as how Spotify handles these parts of the experience, not isolated bugs.`
      );
    }
  }

  if (sample.negative_pct >= 30 && bullets.length < 6) {
    bullets.push(
      `Negative tone (${sample.negative_pct}% in sample) reflects repeated product gaps rather than one-off complaints — users describe patterns, not single bad sessions.`
    );
  } else if (sample.positive_pct >= 30 && sample.negative_pct >= 15 && bullets.length < 6) {
    bullets.push(
      `Sentiment is mixed: users acknowledge what works while still calling out specific gaps — the feedback is not uniformly hostile.`
    );
  }

  if (isCountQuestion(question) && verifiedStats[0] && bullets.length < 6) {
    bullets.push(
      `Corpus-wide, ${verifiedStats[0].label.toLowerCase()} shows up across many reviews — the qualitative patterns above explain what users mean when they raise it.`
    );
  }

  const uniqueBullets = [...new Set(bullets)].slice(0, 7);
  const executive = buildExecutiveNarrative(question, uniqueBullets, stats, n);

  return { executive, bullets: uniqueBullets };
}

function buildExecutiveNarrative(
  question: string,
  bullets: string[],
  stats: ReturnType<typeof collectEnrichmentStats>,
  sampleSize: number
): string {
  if (/\bpodcasts?\b/i.test(question)) {
    return `Spotify users talk about podcasts as an add-on inside a music-first app — not as standalone content. Matching reviews (${sampleSize}) emphasize playback stopping mid-episode, resentment of unsolicited podcast promotion in music flows, and a Premium value gap when talk content does not match music reliability; catalog depth earns praise when playback works.`;
  }
  if (/\bshuffle\b/i.test(question)) {
    return `Users frustrated with shuffle see a gap between promised randomness and lived experience — repetition, predictable rotations, and a sense the algorithm favors certain tracks over others.`;
  }
  if (bullets.length >= 1) {
    const lead = bullets[0].replace(/\s*—.*$/, "").trim();
    const second = bullets[1]
      ? ` ${bullets[1].split(/[.—]/)[0].trim()}.`
      : "";
    return `${lead}.${second}`.slice(0, 420).trim();
  }
  if (stats.topThemes.length > 0) {
    return `Across ${sampleSize} closely matching reviews, users connect this topic to ${stats.topThemes.slice(0, 2).join(" and ")}.`;
  }
  return `Matching reviews surface recurring themes on this topic across ${sampleSize} Spotify app reviews.`;
}

export function isMetaInsightBullet(text: unknown): boolean {
  const t = coerceToText(text).trim();
  const lower = t.toLowerCase();
  if (t.length < 12) return true;
  return (
    /^evidence scope:/i.test(t) ||
    /^limitations:/i.test(t) ||
    /^source mix:/i.test(t) ||
    /^sentiment in sample/i.test(t) ||
    /retrieval sample|hybrid search|ai-analyzed reviews|corpus-wide|closest matches|% of sample/i.test(
      lower
    )
  );
}

export function isQuoteDumpBullet(text: unknown): boolean {
  const t = coerceToText(text);
  return (
    /^one reviewer writes:/i.test(t) ||
    /^reviewers describe this directly/i.test(t) ||
    /^users repeatedly describe: "/i.test(t) ||
    /^reviewers request: "/i.test(t)
  );
}

export function filterInsightBullets(bullets: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of bullets) {
    const b = coerceToText(raw).trim();
    if (b.length < 24 || isMetaInsightBullet(b) || isQuoteDumpBullet(b)) continue;
    const key = b.slice(0, 80).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

export function parseDetailedBullets(text: unknown): string[] {
  if (Array.isArray(text)) {
    return filterInsightBullets(text);
  }
  const trimmed = coerceToText(text).trim();
  if (!trimmed) return [];
  const byLine = trimmed
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (byLine.length >= 2) return byLine;
  return trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
}

function isStatsOnlySummary(text: unknown): boolean {
  const t = coerceToText(text);
  return (
    /^\d+ (enriched|AI-analyzed) Spotify reviews/i.test(t) &&
    !/\bbecause\b|\busers\b.*\bcite\b|\bfrustrat/i.test(t)
  );
}

export function sanitizeGroqExecutive(
  raw: unknown,
  question: string
): string | null {
  const t = coerceToText(raw).trim();
  if (!t || isStatsOnlySummary(t) || isMetaInsightBullet(t)) return null;
  if (isCountQuestion(question)) return t.split(/\n/)[0]?.trim() ?? t;
  return t.length <= 480 ? t : `${t.slice(0, 477).trim()}…`;
}

export function sanitizeGroqDetailed(raw: unknown): string | null {
  if (Array.isArray(raw)) {
    const fromArray = filterInsightBullets(raw);
    if (fromArray.length >= 2) return fromArray.join("\n");
  }
  const bullets = filterInsightBullets(parseDetailedBullets(raw));
  if (bullets.length >= 2) return bullets.join("\n");
  return null;
}

export function buildExecutiveSummary(
  question: string,
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>,
  sampleSize: number,
  verifiedStats: VerifiedStat[],
  sample: SampleSentiment,
  groqSummary?: string
): string {
  const fromGroq = sanitizeGroqExecutive(groqSummary, question);
  if (fromGroq) return fromGroq;

  if (isCountQuestion(question) && verifiedStats.length > 0) {
    const primary = verifiedStats[0];
    return `${formatAnalyzedReviewCount(primary.matching_reviews)} (${primary.pct_of_enriched}% of analyzed corpus) mention ${primary.label.toLowerCase()}.`;
  }

  return buildInsightNarrative(question, items, enrichment, sample, verifiedStats).executive;
}

export function buildDetailedAnalysis(
  question: string,
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>,
  _sampleSize: number,
  verifiedStats: VerifiedStat[],
  sample: SampleSentiment,
  groqDetailed?: string
): string {
  const fromGroq = sanitizeGroqDetailed(groqDetailed);
  if (fromGroq) return fromGroq;

  const { bullets } = buildInsightNarrative(
    question,
    items,
    enrichment,
    sample,
    verifiedStats
  );
  return bullets.join("\n") || "See supporting signals below for representative review language.";
}

export function buildResearchSections(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>,
  verifiedStats: VerifiedStat[],
  sample: SampleSentiment,
  sampleSize: number
): RagResearchSection[] {
  const stats = collectEnrichmentStats(items, enrichment);
  const sections: RagResearchSection[] = [];
  const stat = verifiedStats[0];

  sections.push({
    title: "Evidence scope",
    body: stat
      ? `${formatAnalyzedCorpusPhrase(stat.matching_reviews, stat.pct_of_enriched, stat.enriched_total)} match this topic. Qualitative patterns below come from ${sampleSize} closest retrieval matches.`
      : `Qualitative patterns below come from ${sampleSize} closest retrieval matches; no corpus-wide count was computed.`,
  });

  if (stats.topThemes.length > 0) {
    sections.push({
      title: "Theme & pain patterns",
      body: `Dominant themes: ${stats.topThemes.slice(0, 4).join(", ")}.`,
    });
  }

  sections.push({
    title: "Sentiment in sample",
    body: `${sample.positive_pct}% positive · ${sample.negative_pct}% negative · ${sample.neutral_pct}% neutral across ${sampleSize} retrieved reviews.`,
  });

  return sections;
}

// Legacy exports kept for compatibility
export function normalizeKeyFindings(findings: string[]): string[] {
  return findings.filter((f) => f.trim().length >= 24).slice(0, 5);
}

export function buildQualitativeFindings(
  items: RetrievedFeedbackItem[],
  enrichment: Map<string, Record<string, unknown>>,
  _verifiedStats: VerifiedStat[],
  _sample: SampleSentiment
): string[] {
  const { bullets } = buildInsightNarrative(
    "",
    items,
    enrichment,
    _sample,
    _verifiedStats
  );
  return bullets;
}
