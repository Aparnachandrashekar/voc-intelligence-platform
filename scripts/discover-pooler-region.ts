import "./load-env";
import { Pool } from "pg";
import { getEnv } from "../lib/env";

const REGIONS = [
  "us-east-1",
  "us-west-1",
  "eu-west-1",
  "eu-central-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-northeast-1",
  "sa-east-1",
];

function supabaseProjectRef(databaseUrl: string): string | null {
  const parsed = new URL(databaseUrl);
  const direct = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (direct) return direct[1];
  const poolerUser = decodeURIComponent(parsed.username).match(/^postgres\.([a-z0-9]+)$/i);
  if (poolerUser) return poolerUser[1];
  return null;
}

async function tryPooler(
  ref: string,
  password: string,
  database: string,
  host: string,
  port: number
): Promise<{ ok: boolean; error?: string }> {
  const pool = new Pool({
    host,
    port,
    user: `postgres.${ref}`,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  const { DATABASE_URL } = getEnv();
  const parsed = new URL(DATABASE_URL);
  const ref = supabaseProjectRef(DATABASE_URL);
  if (!ref) {
    console.error("DATABASE_URL is not a Supabase direct or pooler URL.");
    process.exit(1);
  }

  const password = decodeURIComponent(parsed.password);
  const database = parsed.pathname.replace(/^\//, "") || "postgres";

  console.log(`Probing Supabase session pooler for project ${ref}...\n`);

  // Dedicated PgBouncer on project host (IPv6; may work if IPv4 add-on enabled)
  process.stdout.write(`  db.${ref}.supabase.co:6543 (postgres user) ... `);
  {
    const pool = new Pool({
      host: `db.${ref}.supabase.co`,
      port: 6543,
      user: "postgres",
      password,
      database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await pool.query("SELECT 1");
      console.log("OK");
      console.log("\nUse dedicated pooler in .env.local DATABASE_URL:");
      console.log(
        `  postgresql://postgres:[PASSWORD]@db.${ref}.supabase.co:6543/postgres`
      );
      console.log("  SUPABASE_USE_POOLER=false");
      return;
    } catch (error) {
      console.log(
        `no (${error instanceof Error ? error.message.slice(0, 60) : "failed"})`
      );
    } finally {
      await pool.end().catch(() => {});
    }
  }

  const hostPatterns = (region: string) => [
    `aws-0-${region}.pooler.supabase.com`,
    `aws-${region}.pooler.supabase.com`,
  ];

  for (const region of REGIONS) {
    for (const host of hostPatterns(region)) {
      for (const port of [5432, 6543]) {
        const label = `${host}:${port}`;
        process.stdout.write(`  ${label} ... `);
        const result = await tryPooler(ref, password, database, host, port);
        if (result.ok) {
          console.log("OK");
          console.log(`\nAdd to .env.local:`);
          console.log(`  SUPABASE_POOLER_REGION=${region}`);
          if (port === 6543) {
            console.log(`  SUPABASE_POOLER_PORT=6543`);
          }
          if (host.startsWith("aws-") && !host.startsWith("aws-0-")) {
            console.log(`  SUPABASE_POOLER_HOST_PREFIX=aws`);
          }
          console.log(
            "\nKeep your existing DATABASE_URL (direct db.*.supabase.co is fine)."
          );
          return;
        }
        console.log(`no (${result.error?.slice(0, 60) ?? "failed"})`);
      }
    }
  }

  console.error(
    "\nNo pooler endpoint matched. In Supabase Dashboard → Connect → Session pooler, copy the full URI into DATABASE_URL."
  );
  process.exit(1);
}

main();
