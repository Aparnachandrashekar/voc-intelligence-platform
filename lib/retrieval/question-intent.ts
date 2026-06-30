/** Which sentiment pool(s) to draw retrieval candidates from. */
export type RetrievalSentimentMode = "negative" | "positive" | "balanced";

const NEGATIVE_INTENT =
  /\b(why|problem|issue|fail|broken|frustrat|complain|hate|bad|worse|declin|struggle|stop|repetitive|repeat|same songs?|stale|bored|boredom|weak|poor|don't trust|distrust|inaccurate|wrong|terrible|awful|garbage|useless|horrible|disappoint|disappointment|annoy|irritat|bug|crash|slow|lag|cancel|leave|switch|alternative|wish|differently|hard to|can't find|difficult|not working|doesn't work|emotional words?)\b/i;

const POSITIVE_INTENT =
  /\b(what works|works well|love|best|great|praise|positive|happy|satisfied|recommend spotify|keep using|why users stay|what do users like|strengths?|benefits?|delight|enjoy|favorite feature|what's good)\b/i;

/**
 * Route retrieval to sentiment-specific candidate pools.
 * - Problems / failure → negative only
 * - What works well → positive only
 * - Everything else → balanced (proportional mix)
 */
export function classifyRetrievalSentimentMode(
  question: string
): RetrievalSentimentMode {
  const q = question.trim();
  const negative = NEGATIVE_INTENT.test(q);
  const positive = POSITIVE_INTENT.test(q);

  if (negative && !positive) return "negative";
  if (positive && !negative) return "positive";
  if (negative && positive) return "balanced";
  return "balanced";
}

/** Prefix query embedding with intent so vectors align with sentiment-aware documents. */
export function buildQueryEmbeddingText(
  question: string,
  mode: RetrievalSentimentMode
): string {
  const base = question.trim();
  switch (mode) {
    case "negative":
      return `Research question about user problems, frustrations, and failures: ${base}`;
    case "positive":
      return `Research question about what users praise and what works well: ${base}`;
    default:
      return `Balanced research question about user feedback: ${base}`;
  }
}
