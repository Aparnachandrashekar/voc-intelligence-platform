import { getPool } from "@/lib/db";
import { getVocIntelligenceReport } from "@/lib/intelligence/aggregations";
import { formatFeatureRequest, formatThemeCluster } from "@/lib/intelligence/format";
import { buildFilterClause } from "@/lib/reports/filters";
import { getSegmentsPersonasReport } from "@/lib/segments/aggregations";
import type {
  DiscoveryBriefReport,
  DiscoveryComplaint,
  DiscoverySentimentScore,
} from "@/lib/types/discovery";
import type { QuoteEvidence, ReportFilters } from "@/lib/types/reports";

/** Discovery-specific complaint signals in negative review text. */
const NEGATIVE_DISCOVERY_COMPLAINTS: {
  id: string;
  label: string;
  pattern: RegExp;
}[] = [
  {
    id: "repetitive_recommendations",
    label: "Repetitive recommendations",
    pattern:
      /same song|same music|same track|repeat|repetitive|over and over|recycle|stale|no variety|predictable|bored|hear the same|plays the same|again and again/i,
  },
  {
    id: "weak_discovery",
    label: "Weak music discovery",
    pattern:
      /can't find|hard to find|difficult to find|no new music|stop discovering|discovery is weak|find new artist|narrow rotation|same artist|keep hearing the same|discover new/i,
  },
  {
    id: "algorithm_mistrust",
    label: "Untrustworthy algorithm",
    pattern:
      /algorithm|recommend|suggest|personaliz|discover weekly|daily mix|for you|wrong song|doesn't know|inaccurate|miss my taste|bad suggestion|poor recommendation/i,
  },
  {
    id: "shuffle_autoplay",
    label: "Shuffle & autoplay frustration",
    pattern:
      /shuffle|autoplay|radio|not random|on repeat|loop the same|predictable queue/i,
  },
];

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

async function getDiscoverySentiment(
  filters: ReportFilters
): Promise<DiscoverySentimentScore> {
  const { where, params } = buildFilterClause(filters, "f");

  const result = await getPool().query<{ sentiment: string; count: string }>(
    `SELECT e.sentiment, COUNT(*)::text AS count
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${where}
     GROUP BY e.sentiment`,
    params
  );

  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    counts[row.sentiment] = parseInt(row.count, 10);
  }

  const positive = counts.positive ?? 0;
  const negative = counts.negative ?? 0;
  const neutral = (counts.neutral ?? 0) + (counts.mixed ?? 0);
  const total = positive + negative + neutral;

  const positive_pct = pct(positive, total);
  const negative_pct = pct(negative, total);
  const neutral_pct = pct(neutral, total);

  return {
    total_reviews: total,
    positive_pct,
    negative_pct,
    neutral_pct,
    net_score: Math.round((positive_pct - negative_pct) * 10) / 10,
  };
}

async function fetchNegativeQuoteMatchingPattern(
  filters: ReportFilters,
  pattern: RegExp
): Promise<QuoteEvidence | null> {
  const { where, params } = buildFilterClause(filters, "f");
  const sentimentClause = `e.sentiment = 'negative'`;
  const fullWhere = where
    ? `${where} AND ${sentimentClause}`
    : `WHERE ${sentimentClause}`;

  const result = await getPool().query(
    `SELECT f.id AS feedback_item_id, f.content, f.source, f.author,
            f.created_at, e.sentiment
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${fullWhere}
     ORDER BY f.ingested_at DESC
     LIMIT 200`,
    params
  );

  const row = result.rows.find((r) => pattern.test(String(r.content)));
  if (!row) return null;

  return {
    feedback_item_id: row.feedback_item_id,
    content: row.content.slice(0, 280),
    source: row.source,
    author: row.author,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
    sentiment: row.sentiment,
  };
}

async function getNegativeDiscoveryComplaints(
  filters: ReportFilters
): Promise<DiscoveryComplaint[]> {
  const { where, params } = buildFilterClause(filters, "f");
  const sentimentClause = `e.sentiment = 'negative'`;
  const fullWhere = where
    ? `${where} AND ${sentimentClause}`
    : `WHERE ${sentimentClause}`;

  const result = await getPool().query<{ content: string }>(
    `SELECT f.content
     FROM feedback_items f
     INNER JOIN enrichment_results e ON e.feedback_item_id = f.id
     ${fullWhere}`,
    params
  );

  const ranked = NEGATIVE_DISCOVERY_COMPLAINTS.map((complaint) => ({
    ...complaint,
    count: result.rows.filter((row) => complaint.pattern.test(row.content)).length,
  }))
    .filter((c) => c.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const complaints: DiscoveryComplaint[] = [];
  for (const row of ranked) {
    const quote = await fetchNegativeQuoteMatchingPattern(filters, row.pattern);
    complaints.push({
      label: row.label,
      count: row.count,
      quote,
    });
  }
  return complaints;
}

export async function getDiscoveryBriefReport(
  filters: ReportFilters = {}
): Promise<DiscoveryBriefReport> {
  const discoveryFilters: ReportFilters = {
    ...filters,
    discoveryScope: true,
  };

  const [sentiment, vocReport, personasReport, negative_discovery_complaints] =
    await Promise.all([
      getDiscoverySentiment(discoveryFilters),
      getVocIntelligenceReport(discoveryFilters),
      getSegmentsPersonasReport(discoveryFilters),
      getNegativeDiscoveryComplaints(discoveryFilters),
    ]);

  const top_complaints = vocReport.top_frictions.slice(0, 5).map((cluster) => ({
    label: cluster.display_name,
    count: cluster.count,
    quote: cluster.quotes[0] ?? null,
  }));

  const feature_requests = vocReport.top_opportunities
    .slice(0, 5)
    .map((item) => ({
      label: formatFeatureRequest(item.label),
      count: item.count,
    }));

  const discovery_persona =
    personasReport.personas.find((p) => p.segment === "discovery_seeker") ??
    null;

  const has_insights =
    sentiment.total_reviews > 0 &&
    (top_complaints.length > 0 ||
      negative_discovery_complaints.length > 0 ||
      discovery_persona !== null ||
      feature_requests.length > 0);

  return {
    sentiment,
    top_complaints,
    negative_discovery_complaints,
    discovery_persona,
    feature_requests,
    filters: discoveryFilters,
    has_insights,
  };
}
