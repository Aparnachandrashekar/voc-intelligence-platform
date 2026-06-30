import { NextRequest, NextResponse } from "next/server";
import { getSegmentsReport } from "@/lib/segments/aggregations";
import { parseReportFilters } from "@/lib/reports/filters";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const filters = parseReportFilters(request.nextUrl.searchParams);
    const report = await getSegmentsReport(filters);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Segments failed" },
      { status: 500 }
    );
  }
}
