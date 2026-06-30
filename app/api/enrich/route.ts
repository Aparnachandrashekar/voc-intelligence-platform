import { NextRequest, NextResponse } from "next/server";
import { enrichBatch } from "@/lib/enrichment";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await enrichBatch({
      limit: body.limit ?? 50,
      force: Boolean(body.force),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const { countEnrichedItems } = await import("@/lib/enrichment");
  const enriched = await countEnrichedItems();
  return NextResponse.json({ enriched_count: enriched });
}
