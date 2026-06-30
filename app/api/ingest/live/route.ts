import { NextRequest, NextResponse } from "next/server";
import { ingestLiveScrape } from "@/lib/scrape/ingest";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

function verifyWebhookSecret(request: NextRequest): boolean {
  const secret = getEnv().N8N_WEBHOOK_SECRET;
  if (!secret) return true;
  return request.headers.get("x-webhook-secret") === secret;
}

/**
 * POST /api/ingest/live
 * Trigger live scrape across feasible Spotify sources (App Store, Play Store,
 * Reddit). Optional body: { only: ["app_store", "forum"] }.
 */
export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let only: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.only)) only = body.only;
  } catch {
    // no body is fine
  }

  try {
    const summary = await ingestLiveScrape({ only });
    return NextResponse.json({ pipeline: "live_scrape", ...summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Live scrape failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
