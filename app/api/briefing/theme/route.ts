import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateThemeBriefing } from "@/lib/insights/briefing";

export const dynamic = "force-dynamic";

const schema = z.object({
  theme: z.string().min(1),
  count: z.number(),
  change_pct: z.number().nullable().optional(),
  quotes: z.array(
    z.object({
      content: z.string(),
      source: z.string(),
      sentiment: z.string(),
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const briefing = await generateThemeBriefing(
      body.theme,
      body.count,
      body.change_pct ?? null,
      body.quotes
    );
    return NextResponse.json(briefing);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Theme briefing failed" },
      { status: 500 }
    );
  }
}
