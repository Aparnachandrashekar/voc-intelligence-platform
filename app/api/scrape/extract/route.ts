import { NextRequest, NextResponse } from "next/server";
import { filterGroundedExtractions } from "@/lib/guardrails/extraction-validator";
import { extractFeedbackFromPage, isGroqConfigured } from "@/lib/groq";
import { isUrlAllowlisted } from "@/lib/allowed-sources";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

function verifyWebhookSecret(request: NextRequest): boolean {
  const secret = getEnv().N8N_WEBHOOK_SECRET;
  if (!secret) return true;
  return request.headers.get("x-webhook-secret") === secret;
}

/**
 * POST /api/scrape/extract
 * n8n sends raw page text after fetch; Groq extracts and grounding validator filters.
 * Phase 0: extraction + validation only (no DB insert — that is Phase 1).
 */
export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGroqConfigured()) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const sourceUrl = body.source_url as string | undefined;
  const rawText = body.raw_text as string | undefined;
  const productName = (body.product_name as string | undefined) ?? "Unknown";

  if (!sourceUrl || !rawText) {
    return NextResponse.json(
      { error: "source_url and raw_text are required" },
      { status: 400 }
    );
  }

  if (!isUrlAllowlisted(sourceUrl)) {
    return NextResponse.json(
      { error: `URL not in SCRAPE_ALLOWLIST: ${sourceUrl}` },
      { status: 403 }
    );
  }

  try {
    const extracted = await extractFeedbackFromPage(rawText, {
      sourceUrl,
      productName,
    });
    const { accepted, rejected } = filterGroundedExtractions(
      extracted,
      rawText
    );

    return NextResponse.json({
      phase: 0,
      source_url: sourceUrl,
      extracted_count: extracted.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      items: accepted,
      rejected: rejected.map((r) => ({
        reason: r.reason,
        similarity: r.similarity,
        content_preview: r.item.content.slice(0, 80),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Extraction failed",
      },
      { status: 500 }
    );
  }
}
