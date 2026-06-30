import { NextResponse } from "next/server";
import { warmEmbeddingModel, countEmbeddings } from "@/lib/embeddings";
import { isGroqConfigured } from "@/lib/groq";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Preload the local embedding model so the first Ask/Search query is fast. */
export async function GET() {
  try {
    await warmEmbeddingModel();
    const embeddings = await countEmbeddings();
    return NextResponse.json({
      ready: true,
      embeddings,
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
