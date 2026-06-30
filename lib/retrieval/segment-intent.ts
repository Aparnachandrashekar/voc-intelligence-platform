import { formatPersona } from "@/lib/intelligence/format";
import { PERSONA_SEGMENT_KEYS } from "@/lib/segments/classify-segment";

const COMPARE_QUESTION =
  /\b(which|what)\s+(user\s+)?(segments?|personas?|groups?|audiences?)\b/i;

const SEGMENT_PHRASES: Record<string, RegExp[]> = {
  discovery_seeker: [
    /\bdiscovery enthusiasts?\b/i,
    /\bdiscovery seekers?\b/i,
    /\bmusic discovery\b/i,
  ],
  feature_advocate: [/\bfeature advocates?\b/i],
  price_sensitive: [
    /\bprice[\s-]?sensitive\b/i,
    /\bad[\s-]?sensitive\b/i,
    /\bpremium users?\b/i,
  ],
  technical_issues: [
    /\breliability[\s-]?focused\b/i,
    /\btechnical issues?\b/i,
  ],
  happy_promoter: [/\bsatisfied promoters?\b/i, /\bhappy promoters?\b/i],
  dissatisfied_critic: [
    /\bfrustrated critics?\b/i,
    /\bdissatisfied\b/i,
  ],
  neutral_observer: [/\bneutral observers?\b/i],
  podcast_listener: [/\bpodcast listeners?\b/i],
};

export type SegmentRetrievalIntent =
  | { mode: "none" }
  | { mode: "filter"; segment: string }
  | { mode: "compare"; segments: string[] };

export function detectSegmentRetrievalIntent(
  question: string
): SegmentRetrievalIntent {
  const q = question.trim();

  for (const [segment, patterns] of Object.entries(SEGMENT_PHRASES)) {
    if (patterns.some((p) => p.test(q))) {
      return { mode: "filter", segment };
    }
  }

  if (COMPARE_QUESTION.test(q) || /\bstruggle most\b/i.test(q)) {
    return {
      mode: "compare",
      segments: [
        "discovery_seeker",
        "dissatisfied_critic",
        "price_sensitive",
        "technical_issues",
        "feature_advocate",
        "happy_promoter",
      ],
    };
  }

  if (/\bsegment\b|\bpersona\b|\buser type\b|\buser group\b/i.test(q)) {
    return {
      mode: "compare",
      segments: [
        "discovery_seeker",
        "dissatisfied_critic",
        "price_sensitive",
        "technical_issues",
        "feature_advocate",
        "happy_promoter",
      ],
    };
  }

  return { mode: "none" };
}

export function segmentLabel(segment: string): string {
  return formatPersona(segment);
}

export function isKnownSegment(segment: string): boolean {
  return (PERSONA_SEGMENT_KEYS as readonly string[]).includes(segment);
}
