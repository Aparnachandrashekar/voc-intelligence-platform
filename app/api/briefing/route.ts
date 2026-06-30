import { NextRequest, NextResponse } from "next/server";
import { generateExecutiveBriefing } from "@/lib/insights/briefing";
import { parseReportFilters } from "@/lib/reports/filters";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const filters = parseReportFilters(params);
    const range = params.get("range") ?? "30d";
    const briefing = await generateExecutiveBriefing(filters, range);
    return NextResponse.json(briefing);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Briefing failed" },
      { status: 500 }
    );
  }
}
