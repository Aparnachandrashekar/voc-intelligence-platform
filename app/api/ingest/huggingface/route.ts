import { NextRequest, NextResponse } from "next/server";
import {
  completeIngestionRun,
  createIngestionRun,
  getLatestIngestionRun,
} from "@/lib/db";
import {
  getHuggingFaceConfig,
  importHuggingFaceDataset,
  validateHuggingFaceConnection,
} from "@/lib/huggingface";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

function verifyWebhookSecret(request: NextRequest): boolean {
  const secret = getEnv().N8N_WEBHOOK_SECRET;
  if (!secret) return true;
  return request.headers.get("x-webhook-secret") === secret;
}

/** GET — connector status (for n8n pre-flight and dashboard) */
export async function GET() {
  const config = getHuggingFaceConfig();
  const latestRun = await getLatestIngestionRun("huggingface").catch(
    () => null
  );

  let hubStatus = null;
  if (config.configured) {
    hubStatus = await validateHuggingFaceConnection().catch((error) => ({
      ok: false,
      datasetId: config.datasetId,
      hubReachable: false,
      message: error instanceof Error ? error.message : "Hub check failed",
    }));
  }

  return NextResponse.json({
    pipeline: "huggingface",
    phase: 0,
    stub: true,
    config,
    hub: hubStatus,
    latest_run: latestRun,
    message: config.configured
      ? "Connector configured. POST to trigger Phase 0 validation import (0 rows)."
      : "Set HF_DATASET_ID in .env.local to enable Hugging Face imports.",
  });
}

/** POST — trigger stub import (Phase 0 validates config; Phase 1 loads rows) */
export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await createIngestionRun("huggingface", "huggingface");

  try {
    const result = await importHuggingFaceDataset();
    await completeIngestionRun(run.id, {
      status: "completed",
      fetched_count: result.fetched,
      inserted_count: result.inserted,
      skipped_count: result.skipped,
    });

    return NextResponse.json({
      pipeline: "huggingface",
      phase: 0,
      stub: true,
      run_id: run.id,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await completeIngestionRun(run.id, {
      status: "failed",
      error_message: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
