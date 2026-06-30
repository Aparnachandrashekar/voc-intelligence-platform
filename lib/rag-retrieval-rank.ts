import type { RetrievedFeedbackItem } from "@/lib/types/feedback";

const PROBLEM_QUESTION =
  /\b(why|stop|struggle|repetitive|repeat|same songs?|wish|differently|frustrat|complain|hate|bad|weak|fail|declin|poor|worse|issue|problem|don't trust|distrust|inaccurate|stale|bored|no variety|hard to find|can't find|difficult)\b/i;

const GENERIC_PRAISE =
  /\b(outstanding|incredible selection|best app|love this app|great app|five stars|5 stars|perfect app|gold standard|dominate|premier|wajib|elite|easily become|just keeps getting better)\b/i;

const DISCOVER_WEEKLY_PRAISE =
  /\b(discover weekly|release radar).{0,80}\b(love|great|best|perfect|brilliant|reads my mind|curated|gold standard)\b/i;

export function isProblemFramedQuestion(question: string): boolean {
  return PROBLEM_QUESTION.test(question);
}

function praisePenalty(content: string, question: string): number {
  let penalty = 0;
  if (GENERIC_PRAISE.test(content)) penalty += 0.14;
  if (DISCOVER_WEEKLY_PRAISE.test(content)) penalty += 0.18;
  if (
    isProblemFramedQuestion(question) &&
    /\b(love|great|best|perfect|outstanding|excellent|amazing)\b/i.test(content) &&
    !/\b(but|however|except|weak|bad|hate|poor|same|repeat|stale|bored|issue|problem|declin)\b/i.test(
      content
    )
  ) {
    penalty += 0.1;
  }
  return penalty;
}

function sentimentBoost(
  sentiment: string | undefined,
  question: string
): number {
  if (!isProblemFramedQuestion(question)) return 0;
  switch (sentiment) {
    case "negative":
      return 0.16;
    case "mixed":
      return 0.1;
    case "neutral":
      return 0.04;
    case "positive":
      return -0.06;
    default:
      return 0;
  }
}

/** Re-rank retrieved items for question intent and session freshness. */
export function rerankRetrievedForQuestion(
  items: RetrievedFeedbackItem[],
  question: string,
  enrichment: Map<string, Record<string, unknown>>
): RetrievedFeedbackItem[] {
  if (items.length <= 1) return items;

  const scored = items.map((item, index) => {
    const base =
      item.hybrid_score ??
      item.similarity_score ??
      item.keyword_score ??
      0;
    const e = enrichment.get(item.id);
    const sentiment = e?.sentiment as string | undefined;
    const adjusted =
      base +
      sentimentBoost(sentiment, question) -
      praisePenalty(item.content, question) -
      index * 0.0001;

    return { item, adjusted };
  });

  scored.sort((a, b) => b.adjusted - a.adjusted);
  return scored.map(({ item }) => item);
}
