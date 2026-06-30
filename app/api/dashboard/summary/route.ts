import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardSummary,
  parseDashboardRange,
} from "@/lib/dashboard/aggregations";
import { parseReportFilters } from "@/lib/reports/filters";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const range = parseDashboardRange(params.get("range"));
    const filters = parseReportFilters(params);
    const summary = await getDashboardSummary(range, filters);
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Summary failed" },
      { status: 500 }
    );
  }
}
