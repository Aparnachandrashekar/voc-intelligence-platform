/** Themes too generic for the Top Themes volume chart (post sub-clustering). */
const GENERIC_THEME_IDS = new Set([
  "general",
  "uncategorized_feedback",
  "uncategorized_positive",
  "uncategorized_negative",
  "uncategorized_neutral",
  "uncategorized_mixed",
  "general_positive",
  "general_negative",
]);

const GENERIC_THEME_LABELS = new Set([
  "Other Topics",
  "Uncategorized Feedback",
  "Positive General Feedback",
  "Negative General Feedback",
  "Neutral General Feedback",
  "Mixed General Feedback",
  "Broad Positive Sentiment",
  "Broad Negative Sentiment",
]);

export function isSpecificNamedTheme(themeId: string, label: string): boolean {
  if (GENERIC_THEME_IDS.has(themeId)) return false;
  if (GENERIC_THEME_LABELS.has(label)) return false;
  if (/^uncategorized/i.test(label)) return false;
  if (/^broad (positive|negative)/i.test(label)) return false;
  return true;
}

/** Single neutral color for theme volume bars — not sentiment-encoded. */
export const THEME_VOLUME_BAR_COLOR = "#6B8CAE";
