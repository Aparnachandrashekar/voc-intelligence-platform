import { NextRequest, NextResponse } from "next/server";
import { getPainPointsReport } from "@/lib/reports/aggregations";
import { parseReportFilters } from "@/lib/reports/filters";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const filters = parseReportFilters(request.nextUrl.searchParams);
    const report = await getPainPointsReport(filters);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report failed" },
      { status: 500 }
    );
  }
}
