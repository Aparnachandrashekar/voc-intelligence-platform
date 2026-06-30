/** Light-touch cleanup for review quotes — preserve user voice, improve readability. */

const TYPO_FIXES: [RegExp, string][] = [
  [/\breccommend\b/gi, "recommend"],
  [/\breccomend\b/gi, "recommend"],
  [/\brecomend\b/gi, "recommend"],
  [/\bdefinately\b/gi, "definitely"],
  [/\bdefinetly\b/gi, "definitely"],
  [/\bseperate\b/gi, "separate"],
  [/\boccured\b/gi, "occurred"],
  [/\buntill\b/gi, "until"],
  [/\bteh\b/gi, "the"],
  [/\bwa\s+nt\b/gi, "want"],
  [/\bspoitfy\b/gi, "Spotify"],
  [/\bspotifyy\b/gi, "Spotify"],
  [/\bplaylsit\b/gi, "playlist"],
  [/\bplaylsits\b/gi, "playlists"],
  [/\breccomendations\b/gi, "recommendations"],
  [/\brecommendatoins\b/gi, "recommendations"],
  [/\balot\b/gi, "a lot"],
  [/\bcould of\b/gi, "could have"],
  [/\bshould of\b/gi, "should have"],
  [/\bwould of\b/gi, "would have"],
];

/** Sentence-start fillers only — do not strip meaningful "like" or "just". */
const LEADING_FILLER = /^(?:um+|uh+|er+|hmm+|like,|so,|well,|okay,|ok,)\s+/i;

const TRAILING_FILLER = /\s+(?:um+|uh+|er+)\.?$/i;

function fixObviousTypos(text: string): string {
  let out = text;
  for (const [pattern, replacement] of TYPO_FIXES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function removeFillerWords(text: string): string {
  return text
    .replace(LEADING_FILLER, "")
    .replace(TRAILING_FILLER, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function endsCompleteSentence(text: string): boolean {
  return /[.!?…"']$/.test(text.trim()) || /\[…\]$/.test(text.trim());
}

const TRUNCATION_MARKER = "[…]";

function truncateWithMarker(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    if (!endsCompleteSentence(text)) {
      return `${text.trim()} ${TRUNCATION_MARKER}`;
    }
    return text;
  }

  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const excerpt =
    lastSpace > maxLen * 0.55 ? cut.slice(0, lastSpace) : cut.trim();
  return `${excerpt.trim()} ${TRUNCATION_MARKER}`;
}

/**
 * Clean a review quote for display: fix obvious typos, trim fillers,
 * mark incomplete/truncated excerpts. Keeps wording close to the original.
 */
export function cleanQuoteForDisplay(raw: string, maxLen = 280): string {
  if (!raw?.trim()) return "—";

  let text = raw.trim().replace(/\s+/g, " ");
  text = fixObviousTypos(text);
  text = removeFillerWords(text);

  if (!text) return "—";

  return truncateWithMarker(text, maxLen);
}

/** @deprecated Use cleanQuoteForDisplay — kept for existing imports. */
export function formatReviewExcerpt(content: string, maxLen = 240): string {
  return cleanQuoteForDisplay(content, maxLen);
}
