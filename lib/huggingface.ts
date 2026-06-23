import { getEnv } from "@/lib/env";

export interface HuggingFaceConfigStatus {
  configured: boolean;
  datasetId: string | null;
  split: string;
  tokenPresent: boolean;
  message: string;
}

export function getHuggingFaceConfig(): HuggingFaceConfigStatus {
  const env = getEnv();
  const datasetId = env.HF_DATASET_ID ?? null;

  if (!datasetId) {
    return {
      configured: false,
      datasetId: null,
      split: env.HF_DATASET_SPLIT,
      tokenPresent: Boolean(env.HF_TOKEN),
      message:
        "HF_DATASET_ID is not set. Provide the dataset ID to enable imports.",
    };
  }

  return {
    configured: true,
    datasetId,
    split: env.HF_DATASET_SPLIT,
    tokenPresent: Boolean(env.HF_TOKEN),
    message: "Hugging Face connector configured and ready for Phase 1 import.",
  };
}

/** Validate that the requested dataset matches the configured allowlist. */
export function assertAllowedDataset(datasetId: string): void {
  const env = getEnv();
  if (!env.HF_DATASET_ID) {
    throw new Error(
      "HF_DATASET_ID is not configured. Set it in environment before importing."
    );
  }
  if (datasetId !== env.HF_DATASET_ID) {
    throw new Error(
      `Dataset "${datasetId}" is not allowed. Only "${env.HF_DATASET_ID}" may be imported.`
    );
  }
}

/**
 * Phase 0 stub — validates config and Hub reachability.
 * Full batch import is implemented in Phase 1.
 */
export async function validateHuggingFaceConnection(): Promise<{
  ok: boolean;
  datasetId: string | null;
  hubReachable: boolean;
  message: string;
}> {
  const config = getHuggingFaceConfig();

  if (!config.configured) {
    return {
      ok: false,
      datasetId: null,
      hubReachable: false,
      message: config.message,
    };
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.tokenPresent) {
    headers.Authorization = `Bearer ${getEnv().HF_TOKEN}`;
  }

  const url = `https://huggingface.co/api/datasets/${config.datasetId}`;
  const response = await fetch(url, { headers });

  return {
    ok: response.ok,
    datasetId: config.datasetId,
    hubReachable: true,
    message: response.ok
      ? `Dataset "${config.datasetId}" is reachable on Hugging Face Hub.`
      : `Hub returned ${response.status} for dataset "${config.datasetId}".`,
  };
}

/** Phase 1 placeholder — returns zero rows in Phase 0. */
export async function importHuggingFaceDataset(): Promise<{
  fetched: number;
  inserted: number;
  skipped: number;
  message: string;
}> {
  const config = getHuggingFaceConfig();
  if (!config.configured) {
    throw new Error(config.message);
  }

  assertAllowedDataset(config.datasetId!);

  return {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    message:
      "Phase 0 stub: configuration valid. Batch import will run in Phase 1.",
  };
}
