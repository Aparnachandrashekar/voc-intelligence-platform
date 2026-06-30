import { NextRequest, NextResponse } from "next/server";
import { warmEmbeddingModel } from "@/lib/embeddings";
import { answerQuestion } from "@/lib/rag";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = body.question as string;
    const segment = (body.segment as string | undefined)?.trim() || undefined;
    const excludeIds = Array.isArray(body.excludeIds)
      ? (body.excludeIds as unknown[])
          .map(String)
          .filter((id) => id.length > 0)
          .slice(0, 200)
      : undefined;
    if (!question?.trim() || question.length > 500) {
      return NextResponse.json(
        { error: "question required (max 500 chars)" },
        { status: 400 }
      );
    }

    // Avoid first-query failures when /api/warm has not finished yet.
    await warmEmbeddingModel();

    const response = await answerQuestion(question.trim(), { segment }, { excludeIds });
    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/query]", error);
    const message =
      error instanceof Error ? error.message : "Query failed";
    const hint =
      message.includes("ECONNREFUSED") || message.includes("connect")
        ? "Database unreachable — run `docker compose up -d postgres`."
        : "If you just saved code changes, wait for Next.js to finish compiling and try again.";
    return NextResponse.json(
      { error: `${message} ${hint}` },
      { status: 500 }
    );
  }
}
