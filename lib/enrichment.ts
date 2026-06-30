import { getPool } from "@/lib/db";
import { resolveThemesForContent } from "@/lib/intelligence/sub-theme-clustering";
import type { EnrichmentOutput, Sentiment } from "@/lib/types/enrichment";

const DELETED = ["[deleted]", "[removed]"];

/** Star-rating sentiment (dependable for App/Play reviews). */
export function sentimentFromRating(
  rating: number | null,
  content: string
): Sentiment {
  if (rating !== null && rating >= 1 && rating <= 5) {
    if (rating <= 2) return "negative";
    if (rating === 3) return "neutral";
    const lower = content.toLowerCase();
    const hasNegativeCue = /hate|terrible|awful|worst|broken|frustrat|annoy|bad/.test(
      lower
    );
    const hasContrast = /but|however|although|though/.test(lower);
    if (hasNegativeCue && (hasContrast || rating === 4)) return "mixed";
    return "positive";
  }
  return sentimentFromKeywords(content);
}

function sentimentFromKeywords(content: string): Sentiment {
  const lower = content.toLowerCase();
  if (/love|great|awesome|excellent|amazing|perfect/.test(lower)) {
    return /but|however|although| hate | bad | worst/.test(lower)
      ? "mixed"
      : "positive";
  }
  if (/hate|terrible|awful|worst|broken|frustrat|annoy|bad/.test(lower)) {
    return "negative";
  }
  return "neutral";
}

/** Keyword themes + optional pain points / feature requests (no LLM). */
export function enrichContentHeuristic(content: string): EnrichmentOutput {
  const lower = content.toLowerCase();
  const themes: string[] = [];
  const pain_points: string[] = [];
  const user_goals: string[] = [];
  const feature_requests: string[] = [];

  if (/discover|find new|explore|recommendation|playlist|shuffle|search/.test(lower)) {
    themes.push("discovery");
  }
  if (/recommend|suggest|algorithm|radio|daily mix/.test(lower)) {
    themes.push("recommendations");
  }
  if (/repeat|same song|same music|repetitive|stale|no variety|listening habit/.test(lower)) {
    themes.push("recommendations");
  }
  if (/price|subscription|premium|ads|payment/.test(lower)) {
    themes.push("pricing");
  }
  if (/ui|interface|design|layout|navigate/.test(lower)) {
    themes.push("ui_ux");
  }
  if (/offline|download|cache|no internet/.test(lower)) {
    themes.push("offline");
  }
  if (/podcast|episode|show/.test(lower)) {
    themes.push("podcasts");
  }
  if (/crash|slow|lag|freeze|bug/.test(lower)) {
    themes.push("performance");
  }
  if (/play|skip|pause|shuffle|queue/.test(lower)) {
    themes.push("playback");
  }

  if (/can't find|hard to|struggle|difficult|repeat|same song|missing/.test(lower)) {
    pain_points.push(content.slice(0, 120));
  }
  if (/wish|want|need|would like|should add|please add|feature/.test(lower)) {
    feature_requests.push(content.slice(0, 120));
  }
  if (/trying to|want to|listen|discover|learn|share/.test(lower)) {
    user_goals.push(content.slice(0, 120));
  }

  if (themes.length === 0) {
    themes.push(...resolveThemesForContent(content, ["general"]));
  }

  return {
    sentiment: sentimentFromKeywords(content),
    themes,
    pain_points,
    user_goals,
    feature_requests,
  };
}

/** Phase 2 default: rating-derived sentiment + keyword themes (Groq-free). */
export function enrichFromSignals(
  content: string,
  rating: number | null
): EnrichmentOutput {
  const heuristic = enrichContentHeuristic(content);
  return {
    ...heuristic,
    sentiment: sentimentFromRating(rating, content),
  };
}

export async function enrichFeedbackItem(
  feedbackItemId: string,
  content: string,
  options?: { force?: boolean; rating?: number | null }
): Promise<{ status: string; skipped?: boolean }> {
  const trimmed = content.trim();
  if (
    trimmed.length < 10 ||
    DELETED.some((d) => trimmed.toLowerCase() === d)
  ) {
    await getPool().query(
      `INSERT INTO enrichment_results (feedback_item_id, sentiment, enrichment_status)
       VALUES ($1, 'neutral', 'skipped_empty')
       ON CONFLICT (feedback_item_id) DO UPDATE SET enrichment_status = 'skipped_empty'`,
      [feedbackItemId]
    );
    return { status: "skipped_empty", skipped: true };
  }

  if (!options?.force) {
    const existing = await getPool().query(
      `SELECT id FROM enrichment_results WHERE feedback_item_id = $1 AND enrichment_status = 'completed'`,
      [feedbackItemId]
    );
    if (existing.rows.length > 0) {
      return { status: "already_enriched", skipped: true };
    }
  }

  try {
    const output = enrichFromSignals(trimmed, options?.rating ?? null);

    await getPool().query(
      `INSERT INTO enrichment_results (
         feedback_item_id, sentiment, themes, pain_points, user_goals,
         feature_requests, enrichment_status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'completed')
       ON CONFLICT (feedback_item_id) DO UPDATE SET
         sentiment = EXCLUDED.sentiment,
         themes = EXCLUDED.themes,
         pain_points = EXCLUDED.pain_points,
         user_goals = EXCLUDED.user_goals,
         feature_requests = EXCLUDED.feature_requests,
         enrichment_status = 'completed',
         enriched_at = NOW()`,
      [
        feedbackItemId,
        output.sentiment,
        output.themes,
        output.pain_points,
        output.user_goals,
        output.feature_requests,
      ]
    );
    return { status: "completed" };
  } catch (error) {
    await getPool().query(
      `INSERT INTO enrichment_results (feedback_item_id, sentiment, enrichment_status)
       VALUES ($1, 'neutral', 'failed')
       ON CONFLICT (feedback_item_id) DO UPDATE SET enrichment_status = 'failed'`,
      [feedbackItemId]
    );
    throw error;
  }
}

export async function enrichBatch(options?: {
  limit?: number;
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ processed: number; skipped: number; failed: number }> {
  const limit = options?.limit ?? 5000;
  const result = await getPool().query<{
    id: string;
    content: string;
    rating: number | null;
  }>(
    `SELECT f.id, f.content, f.rating
     FROM feedback_items f
     LEFT JOIN enrichment_results e ON e.feedback_item_id = f.id
     WHERE $1 OR e.id IS NULL OR e.enrichment_status <> 'completed'
     ORDER BY f.ingested_at ASC
     LIMIT $2`,
    [Boolean(options?.force), limit]
  );

  const rows = result.rows;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const r = await enrichFeedbackItem(row.id, row.content, {
        force: options?.force,
        rating: row.rating,
      });
      if (r.skipped) skipped++;
      else processed++;
    } catch {
      failed++;
    }
    if (options?.onProgress && (i + 1) % 500 === 0) {
      options.onProgress(i + 1, rows.length);
    }
  }

  return { processed, skipped, failed };
}

export async function countEnrichedItems(): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM enrichment_results WHERE enrichment_status = 'completed'`
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}
