import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateInsights } from "@/lib/insights/engine";
import { parseReportFilters } from "@/lib/reports/filters";
import type { InsightSection } from "@/lib/types/insights";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  section: z.enum([
    "dashboard",
    "overview",
    "pain-points",
    "feature-requests",
    "trends",
  ]),
  range: z.string().optional(),
  source: z.string().optional(),
  sentiment: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = bodySchema.parse(json);
    const params = new URLSearchParams();
    if (parsed.source) params.set("source", parsed.source);
    if (parsed.sentiment) params.set("sentiment", parsed.sentiment);
    if (parsed.date_from) params.set("date_from", parsed.date_from);
    if (parsed.date_to) params.set("date_to", parsed.date_to);

    const filters = parseReportFilters(params);
    const report = await generateInsights(
      parsed.section as InsightSection,
      filters,
      parsed.range
    );
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const message =
      error instanceof Error
        ? error.message ||
          (error as NodeJS.ErrnoException).code ||
          "Insight generation failed"
        : "Insight generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
