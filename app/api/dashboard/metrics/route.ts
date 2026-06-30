import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardMetrics,
  parseDashboardRange,
} from "@/lib/dashboard/aggregations";
import { parseReportFilters } from "@/lib/reports/filters";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const range = parseDashboardRange(params.get("range"));
    const filters = parseReportFilters(params);
    const metrics = await getDashboardMetrics(range, filters);
    return NextResponse.json(metrics);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Metrics failed" },
      { status: 500 }
    );
  }
}
