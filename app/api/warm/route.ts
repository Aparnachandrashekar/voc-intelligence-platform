import { NextResponse } from "next/server";
import { warmEmbeddingModel, countEmbeddings } from "@/lib/embeddings";
import { isGroqConfigured } from "@/lib/groq";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Preload the local embedding model so the first Ask/Search query is fast. */
export async function GET() {
  try {
    await warmEmbeddingModel();

    let embeddings: number | null = null;
    let dbWarning: string | undefined;
    try {
      embeddings = await countEmbeddings();
    } catch (error) {
      dbWarning =
        error instanceof Error ? error.message : "Database unavailable";
      console.warn("[api/warm] embeddings count skipped:", dbWarning);
    }

    return NextResponse.json({
      ready: true,
      embeddings,
      db_ok: !dbWarning,
      ...(dbWarning ? { warning: dbWarning } : {}),
      groq_insights: isGroqConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        error: error instanceof Error ? error.message : "Warmup failed",
      },
      { status: 503 }
    );
  }
}
