import { NextRequest, NextResponse } from "next/server";
import {
  buildExploreInsightCard,
  countReviewsMatchingQuery,
  countReviewsMatchingThemes,
} from "@/lib/intelligence/aggregations";
import { formatThemeCluster } from "@/lib/intelligence/format";
import { getPool } from "@/lib/db";
import { search } from "@/lib/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = (body.query as string)?.trim();
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const results = await search({ query, mode: "hybrid", limit: 15 });
    if (results.length === 0) {
      return NextResponse.json({ has_insights: false, cards: [] });
    }

    const ids = results.map((r) => r.id);
    const enriched = await getPool().query<{
      feedback_item_id: string;
      sentiment: string;
      themes: string[];
    }>(
      `SELECT feedback_item_id, sentiment, themes
       FROM enrichment_results
       WHERE feedback_item_id = ANY($1::uuid[])`,
      [ids]
    );

    const enrichMap = new Map(
      enriched.rows.map((r) => [r.feedback_item_id, r])
    );

    const themeCounts = new Map<string, number>();
    const themeKeys: string[] = [];
    const withSentiment = results.map((r) => {
      const e = enrichMap.get(r.id);
      for (const t of e?.themes ?? []) {
        if (t) {
          themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
          if (!themeKeys.includes(t)) themeKeys.push(t);
        }
      }
      return {
        content: r.content,
        source: r.source,
        sentiment: e?.sentiment,
      };
    });

    const topThemes = [...themeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => formatThemeCluster(t));

    const [themeCorpusCount, queryCorpusCount] = await Promise.all([
      countReviewsMatchingThemes(themeKeys.slice(0, 5)),
      countReviewsMatchingQuery(query).catch(() => 0),
    ]);
    const corpusCount = Math.max(themeCorpusCount, queryCorpusCount, results.length);

    const card = buildExploreInsightCard(
      query,
      withSentiment,
      topThemes,
      corpusCount
    );

    return NextResponse.json({
      has_insights: true,
      query,
      cards: [card],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Explore failed" },
      { status: 500 }
    );
  }
}
