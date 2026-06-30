import { NextResponse } from "next/server";
import {
  checkDatabaseConnection,
  checkPgvectorExtension,
  countFeedbackItems,
  getLatestIngestionRun,
} from "@/lib/db";
import { isGroqConfigured, testGroqConnection } from "@/lib/groq";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();
  const checks = {
    database: { ok: false, feedback_count: 0 },
    pgvector: { ok: false },
    groq: { configured: false, ok: false, model: null as string | null },
    live_scrape: {
      allowlist: env.SCRAPE_ALLOWLIST.split(",").map((d) => d.trim()),
      latest_run: null as unknown,
    },
  };

  try {
    checks.database.ok = await checkDatabaseConnection();
    if (checks.database.ok) {
      checks.database.feedback_count = await countFeedbackItems();
      checks.pgvector.ok = await checkPgvectorExtension();
    }
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        phase: 1,
        checks,
        error: error instanceof Error ? error.message : "Database unreachable",
      },
      { status: 503 }
    );
  }

  checks.groq.configured = isGroqConfigured();
  if (checks.groq.configured) {
    try {
      const result = await testGroqConnection();
      checks.groq.ok = result.ok;
      checks.groq.model = result.model;
    } catch {
      checks.groq.ok = false;
    }
  }

  if (checks.database.ok) {
    checks.live_scrape.latest_run = await getLatestIngestionRun(
      "live_scrape"
    ).catch(() => null);
  }

  const allCoreOk = checks.database.ok && checks.pgvector.ok;

  return NextResponse.json(
    {
      status: allCoreOk ? "ok" : "degraded",
      phase: 1,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allCoreOk ? 200 : 503 }
  );
}
