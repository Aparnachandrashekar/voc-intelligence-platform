import { NextResponse } from "next/server";
import {
  checkDatabaseConnection,
  checkPgvectorExtension,
  countFeedbackItems,
} from "@/lib/db";
import { isGroqConfigured, testGroqConnection } from "@/lib/groq";
import {
  getHuggingFaceConfig,
  validateHuggingFaceConnection,
} from "@/lib/huggingface";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    database: { ok: false, feedback_count: 0 },
    pgvector: { ok: false },
    groq: { configured: false, ok: false, model: null as string | null },
    huggingface: {
      configured: false,
      ok: false,
      datasetId: null as string | null,
      message: "",
    },
    n8n: {
      webhook_base: "http://localhost:5678",
      app_webhook_target: "http://host.docker.internal:3000/api",
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
        phase: 0,
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
    } catch (error) {
      checks.groq.ok = false;
    }
  }

  const hfConfig = getHuggingFaceConfig();
  checks.huggingface.configured = hfConfig.configured;
  checks.huggingface.datasetId = hfConfig.datasetId;
  checks.huggingface.message = hfConfig.message;

  if (hfConfig.configured) {
    try {
      const hf = await validateHuggingFaceConnection();
      checks.huggingface.ok = hf.ok;
      checks.huggingface.message = hf.message;
    } catch {
      checks.huggingface.ok = false;
      checks.huggingface.message = "Failed to reach Hugging Face Hub.";
    }
  }

  const allCoreOk = checks.database.ok && checks.pgvector.ok;

  return NextResponse.json(
    {
      status: allCoreOk ? "ok" : "degraded",
      phase: 0,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allCoreOk ? 200 : 503 }
  );
}
