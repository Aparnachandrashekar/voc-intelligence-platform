/**
 * COLD / OPTIONAL — Groq HTML extraction for Quora, X, and other unstructured pages.
 * Not used by the main live-scrape path (App Store + Play Store are structured, Groq-free).
 * See docs/phase-wise-architecture.md — Groq usage policy.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { filterGroundedExtractions } from "@/lib/guardrails/extraction-validator";
import { extractFeedbackFromPage, isGroqConfigured } from "@/lib/groq";
import { isUrlAllowlisted, sourceFromUrl } from "@/lib/allowed-sources";
import { insertFeedbackItem } from "@/lib/db";
import type { InsertFeedbackItemInput } from "@/lib/types/feedback";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

function verifyWebhookSecret(request: NextRequest): boolean {
  const secret = getEnv().N8N_WEBHOOK_SECRET;
  if (!secret) return true;
  return request.headers.get("x-webhook-secret") === secret;
}

/**
 * POST /api/scrape/extract
 * Used for HTML sources (e.g. forums/Quora) that need LLM parsing: the caller
 * sends raw page text after fetch; Groq extracts and the grounding validator
 * rejects anything not present in the page. Grounded items are inserted into
 * feedback_items (live_scrape) unless `dry_run` is set.
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
  const productName = (body.product_name as string | undefined) ?? "Spotify";
  const dryRun = body.dry_run === true;

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

  const source = sourceFromUrl(sourceUrl);
  if (!source) {
    return NextResponse.json(
      { error: `Could not map URL to a live-scrape source: ${sourceUrl}` },
      { status: 400 }
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

    let inserted = 0;
    let skipped = 0;
    if (!dryRun) {
      const fetchedAt = new Date();
      for (const item of accepted) {
        const sourceId = createHash("md5")
          .update(`${sourceUrl}|${item.content}`)
          .digest("hex");
        const input: InsertFeedbackItemInput = {
          ingestion_pipeline: "live_scrape",
          source,
          source_id: sourceId,
          source_url: sourceUrl,
          product_name: productName,
          content: item.content,
          rating: item.rating,
          author: item.author,
          created_at: item.created_at ? new Date(item.created_at) : null,
          fetched_at: fetchedAt,
          metadata: { scrape_source: "groq_extract", scrape_target_url: sourceUrl },
        };
        try {
          const row = await insertFeedbackItem(input);
          if (row) inserted++;
          else skipped++;
        } catch {
          skipped++;
        }
      }
    }

    return NextResponse.json({
      pipeline: "live_scrape",
      source,
      source_url: sourceUrl,
      dry_run: dryRun,
      extracted_count: extracted.length,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      inserted,
      skipped,
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
