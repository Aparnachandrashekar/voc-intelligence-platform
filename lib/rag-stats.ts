import { getPool } from "@/lib/db";
import { formatAnalyzedCorpusPhrase } from "@/lib/intelligence/copy";
import { liveStoreScopeClause } from "@/lib/data-scope";
import {
  detectRagTopics,
  extractQuestionTopicTerms,
  questionHasKnownTopic,
  RAG_TOPIC_MAP,
} from "@/lib/rag-topics";

export { extractQuestionTopicTerms, questionHasKnownTopic };

export interface VerifiedStat {
  topic: string;
  label: string;
  matching_reviews: number;
  total_reviews: number;
  enriched_total: number;
  pct_of_enriched: number;
}

export interface SampleSentiment {
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
}

const TOPIC_MAP = RAG_TOPIC_MAP;

function detectTopics(question: string): string[] {
  return detectRagTopics(question);
}

async function getTotals(): Promise<{
  total_reviews: number;
  enriched_total: number;
}> {
  const result = await getPool().query<{ count: string; enriched: string }>(
    `SELECT COUNT(*)::text AS count,
            (SELECT COUNT(*)::text FROM enrichment_results e
             INNER JOIN feedback_items f2 ON f2.id = e.feedback_item_id
             WHERE f2.ingestion_pipeline = 'live_scrape'
               AND f2.source IN ('app_store', 'play_store')) AS enriched
     FROM feedback_items f
     WHERE f.ingestion_pipeline = 'live_scrape'
       AND f.source IN ('app_store', 'play_store')`
  );
  return {
    total_reviews: parseInt(result.rows[0]?.count ?? "0", 10),
    enriched_total: parseInt(result.rows[0]?.enriched ?? "0", 10),
  };
}

async function countTopicMentions(topicKey: string): Promise<number> {
  const config = TOPIC_MAP[topicKey];
  if (!config) return 0;

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (config.theme) {
    params.push(config.theme);
    clauses.push(`$${params.length} = ANY(e.themes)`);
  }
  if (config.contentPattern) {
    params.push(config.contentPattern);
    clauses.push(`f.content ~* $${params.length}`);
  }

  if (clauses.length === 0) return 0;

  const scope = liveStoreScopeClause("f", params.length + 1);
  params.push(...scope.params);

  const result = await getPool().query<{ count: string }>(
    `SELECT COUNT(DISTINCT f.id)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     WHERE (${clauses.join(" OR ")}) AND ${scope.clause}`,
    params
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function computeVerifiedStats(
  question: string
): Promise<VerifiedStat[]> {
  const topics = detectTopics(question);
  if (topics.length === 0) return [];

  const { total_reviews, enriched_total } = await getTotals();
  const stats: VerifiedStat[] = [];

  for (const topic of topics) {
    const matching = await countTopicMentions(topic);
    const config = TOPIC_MAP[topic];
    stats.push({
      topic,
      label: config.label,
      matching_reviews: matching,
      total_reviews,
      enriched_total,
      pct_of_enriched:
        enriched_total > 0
          ? Math.round((matching / enriched_total) * 1000) / 10
          : 0,
    });
  }

  return stats;
}

export function computeSampleSentiment(
  sentiments: (string | undefined)[]
): SampleSentiment {
  const counts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  for (const s of sentiments) {
    const key = (s ?? "neutral") as keyof typeof counts;
    if (key in counts) counts[key]++;
  }
  const total =
    counts.positive + counts.negative + counts.neutral + counts.mixed || 1;
  return {
    ...counts,
    positive_pct: Math.round((counts.positive / total) * 1000) / 10,
    negative_pct: Math.round((counts.negative / total) * 1000) / 10,
    neutral_pct: Math.round((counts.neutral / total) * 1000) / 10,
  };
}

export function formatVerifiedStatsBlock(stats: VerifiedStat[]): string {
  if (stats.length === 0) return "";
  return stats
    .map(
      (s) =>
        `- ${s.label}: ${formatAnalyzedCorpusPhrase(s.matching_reviews, s.pct_of_enriched, s.enriched_total)}`
    )
    .join("\n");
}
