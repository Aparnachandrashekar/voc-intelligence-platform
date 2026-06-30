import dns from "dns";
import { execSync } from "child_process";
import { Pool, type PoolConfig, type QueryResultRow } from "pg";
import { getEnv } from "@/lib/env";
import { assertInsertAllowed } from "@/lib/allowed-sources";
import type { FeedbackItem, InsertFeedbackItemInput } from "@/lib/types/feedback";

dns.setDefaultResultOrder("ipv4first");

let pool: Pool | null = null;

/** Prefer IPv4 — Supabase direct hosts are IPv6-only and fail on many networks. */
function resolveIpv4Host(hostname: string): string {
  try {
    const v4 = execSync(`dig +short ${hostname} A`, {
      encoding: "utf8",
      timeout: 5000,
    })
      .trim()
      .split("\n")
      .find(Boolean);
    if (v4) return v4;
  } catch {
    // fall through
  }
  return hostname;
}

function parsePgConfig(connectionString: string): PoolConfig & { isLocal: boolean } {
  const parsed = new URL(connectionString);
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const password = decodeURIComponent(parsed.password);
  const database = parsed.pathname.replace(/^\//, "") || "postgres";
  const port = parsed.port ? Number(parsed.port) : 5432;

  if (parsed.hostname.includes(".pooler.supabase.com")) {
    return {
      host: parsed.hostname,
      port,
      user: decodeURIComponent(parsed.username),
      password,
      database,
      isLocal: false,
    };
  }

  const supabaseDirect = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  const env = getEnv();
  const usePooler =
    Boolean(supabaseDirect) &&
    env.SUPABASE_USE_POOLER?.toLowerCase() !== "false";

  if (usePooler && supabaseDirect) {
    const region = env.SUPABASE_POOLER_REGION ?? "us-east-1";
    const prefix = env.SUPABASE_POOLER_HOST_PREFIX ?? "aws-0";
    const poolPort = env.SUPABASE_POOLER_PORT ?? 5432;
    return {
      host: `${prefix}-${region}.pooler.supabase.com`,
      port: poolPort,
      user: `postgres.${supabaseDirect[1]}`,
      password,
      database,
      isLocal: false,
    };
  }

  return {
    host: isLocal ? parsed.hostname : resolveIpv4Host(parsed.hostname),
    port,
    user: decodeURIComponent(parsed.username),
    password,
    database,
    isLocal,
  };
}

export function getPool(): Pool {
  if (!pool) {
    const config = parsePgConfig(getEnv().DATABASE_URL);
    const { isLocal, ...poolConfig } = config;
    pool = new Pool({
      ...poolConfig,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      max: isLocal ? 10 : 5,
      idleTimeoutMillis: 20_000,
    });
  }
  return pool;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}

export async function checkPgvectorExtension(): Promise<boolean> {
  const result = await getPool().query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_extension WHERE extname = 'vector'
     ) AS exists`
  );
  return result.rows[0]?.exists ?? false;
}

function mapRow(row: QueryResultRow): FeedbackItem {
  return {
    id: row.id,
    ingestion_pipeline: row.ingestion_pipeline,
    source: row.source,
    source_id: row.source_id,
    source_url: row.source_url,
    product_name: row.product_name,
    title: row.title ?? null,
    content: row.content,
    rating: row.rating,
    author: row.author,
    created_at: row.created_at,
    ingested_at: row.ingested_at,
    fetched_at: row.fetched_at,
    metadata: row.metadata ?? {},
  };
}

export async function insertFeedbackItem(
  input: InsertFeedbackItemInput
): Promise<FeedbackItem | null> {
  assertInsertAllowed(input);

  const result = await getPool().query(
    `INSERT INTO feedback_items (
       ingestion_pipeline, source, source_id, source_url,
       product_name, title, content, rating, author, created_at, fetched_at, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (ingestion_pipeline, source, source_id) DO NOTHING
     RETURNING *`,
    [
      input.ingestion_pipeline,
      input.source,
      input.source_id,
      input.source_url ?? null,
      input.product_name ?? "Unknown",
      input.title ?? null,
      input.content,
      input.rating ?? null,
      input.author ?? null,
      input.created_at ?? null,
      input.fetched_at ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function countFeedbackItems(): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM feedback_items"
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function getLatestIngestionRun(pipeline: string) {
  const result = await getPool().query(
    `SELECT * FROM ingestion_runs
     WHERE pipeline = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [pipeline]
  );
  return result.rows[0] ?? null;
}

export async function createIngestionRun(pipeline: string, source?: string) {
  const result = await getPool().query(
    `INSERT INTO ingestion_runs (pipeline, source, status)
     VALUES ($1, $2, 'running')
     RETURNING *`,
    [pipeline, source ?? null]
  );
  return result.rows[0];
}

export async function completeIngestionRun(
  id: string,
  stats: {
    status: "completed" | "failed";
    fetched_count?: number;
    inserted_count?: number;
    skipped_count?: number;
    error_message?: string;
  }
) {
  await getPool().query(
    `UPDATE ingestion_runs
     SET status = $2,
         fetched_count = COALESCE($3, fetched_count),
         inserted_count = COALESCE($4, inserted_count),
         skipped_count = COALESCE($5, skipped_count),
         error_message = $6,
         completed_at = NOW()
     WHERE id = $1`,
    [
      id,
      stats.status,
      stats.fetched_count ?? null,
      stats.inserted_count ?? null,
      stats.skipped_count ?? null,
      stats.error_message ?? null,
    ]
  );
}
