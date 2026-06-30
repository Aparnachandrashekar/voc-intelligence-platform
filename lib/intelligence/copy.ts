/** User-facing labels — avoid internal "enriched" jargon in UI copy. */

export function formatAnalyzedReviewCount(count: number): string {
  return `${count.toLocaleString()} AI-analyzed review${count === 1 ? "" : "s"}`;
}

export function formatPctOfAnalyzed(pct: number, count?: number): string {
  const base = `${pct}% of analyzed reviews`;
  if (count !== undefined) {
    return `${base} (${count.toLocaleString()} mention${count === 1 ? "" : "s"})`;
  }
  return base;
}

export function formatAnalyzedCorpusPhrase(
  matching: number,
  pct: number,
  analyzedTotal: number
): string {
  return `${matching.toLocaleString()} AI-analyzed reviews (${pct}% of ${analyzedTotal.toLocaleString()} analyzed total)`;
}

export const INSIGHTS_SCOPE_CAPTION =
  "Insights use reviews that have been AI-analyzed for sentiment, themes, and pain points. Percentages are relative to that analyzed set, not every raw ingested review.";

export const ANALYZED_REVIEW_LABEL = "AI-analyzed reviews";

export function formatRagMethodologyCaption(meta: {
  retrieval_pool_limit?: number;
  retrieval_sample_size?: number;
  analysis_context_size?: number;
}): string {
  const pool = meta.retrieval_pool_limit ?? 40;
  const sample = meta.retrieval_sample_size ?? 0;
  const context = meta.analysis_context_size ?? 12;
  return `Hybrid search pulled up to ${pool} candidates; ${sample} passed the relevance threshold. The AI read the top ${context} closest matches to write this answer. Corpus statistics below cover the full analyzed database.`;
}

export const RAG_REDDIT_FOOTNOTE =
  "Reddit counts reflect ingested forum-source rows in the database (from live scrape when enabled).";

export function formatCorpusIndexedLine(stats: {
  total_reviews: number;
  indexed_count: number;
}): string {
  const { total_reviews, indexed_count } = stats;
  if (total_reviews <= 0) return "No reviews indexed yet";
  if (indexed_count >= total_reviews) {
    return `${indexed_count.toLocaleString()} reviews indexed`;
  }
  return `${indexed_count.toLocaleString()} of ${total_reviews.toLocaleString()} reviews indexed`;
}

export function formatCorpusSearchIntro(stats: {
  total_reviews: number;
  indexed_count: number;
}): string {
  const { total_reviews, indexed_count } = stats;
  if (indexed_count <= 0) {
    return "Search App Store and Play Store reviews once indexing completes.";
  }
  if (indexed_count >= total_reviews) {
    return `Search across ${indexed_count.toLocaleString()} App Store and Play Store reviews`;
  }
  return `Search across ${indexed_count.toLocaleString()} indexed App Store and Play Store reviews (${total_reviews.toLocaleString()} in corpus)`;
}

export function formatCorpusRagIntro(stats: {
  total_reviews: number;
  indexed_count: number;
}): string {
  const { total_reviews, indexed_count } = stats;
  if (indexed_count <= 0) {
    return "Ask anything about what Spotify users feel, want, and struggle with — indexing is still in progress.";
  }
  if (indexed_count >= total_reviews) {
    return `${indexed_count.toLocaleString()} real user reviews. Ask anything about what Spotify users feel, want, and struggle with.`;
  }
  return `${indexed_count.toLocaleString()} searchable reviews (${total_reviews.toLocaleString()} in corpus). Ask anything about what Spotify users feel, want, and struggle with.`;
}

export function formatCorpusSegmentsIntro(stats: {
  total_reviews: number;
  enriched_count: number;
}): string {
  const { total_reviews, enriched_count } = stats;
  if (enriched_count <= 0) {
    return "Segments appear after reviews are AI-analyzed for sentiment and themes.";
  }
  return `Segments derived from AI clustering of ${enriched_count.toLocaleString()} analyzed App Store and Play Store reviews (${total_reviews.toLocaleString()} in corpus).`;
}
