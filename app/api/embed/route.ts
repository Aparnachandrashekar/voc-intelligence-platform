import { NextRequest, NextResponse } from "next/server";
import { embedBatch } from "@/lib/embeddings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = await embedBatch(body.limit ?? 50);
    return NextResponse.json({ embedded: count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Embedding failed" },
      { status: 500 }
    );
  }
}
