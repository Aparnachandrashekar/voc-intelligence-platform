import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search";
import type { SearchMode } from "@/lib/types/search";
import type { ReportFilters } from "@/lib/types/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODES: SearchMode[] = ["hybrid", "semantic", "keyword"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query as string;
    if (!query?.trim()) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const mode = MODES.includes(body.mode) ? (body.mode as SearchMode) : "hybrid";

    const filters = {
      source: body.source as ReportFilters["source"],
      sentiment: body.sentiment as ReportFilters["sentiment"],
      dateFrom: body.date_from as string | undefined,
      dateTo: body.date_to as string | undefined,
    };

    const results = await search({
      query,
      ...filters,
      limit: body.limit ?? 20,
      mode,
    });

    return NextResponse.json({
      query,
      mode,
      count: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
