import { createConnection } from "net";
import "./load-env";
import { getEnv } from "../lib/env";

function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, ""),
    user: decodeURIComponent(parsed.username),
  };
}

function checkTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(3000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function main() {
  const { DATABASE_URL } = getEnv();
  const { host, port, database, user } = parseDatabaseUrl(DATABASE_URL);

  console.log("VoC database check\n");
  console.log(`  DATABASE_URL host : ${host}`);
  console.log(`  port              : ${port}`);
  console.log(`  database          : ${database}`);
  console.log(`  user              : ${user}\n`);

  const tcpOk = await checkTcp(host, port);
  if (!tcpOk) {
    console.log("❌ Nothing is listening on that host/port.");
    console.log("\nLikely causes:");
    console.log("  • Docker Desktop is open but containers were not started");
    console.log("  • `docker compose up -d` failed or was run in the wrong folder");
    console.log("  • The postgres container exited (check Docker Desktop → Containers)\n");
    console.log("Try (from the project folder):");
    console.log('  cd "/Users/aparna/Graduation Project"');
    console.log("  docker compose up -d postgres");
    console.log("  docker compose ps          # voc-postgres should say running");
    console.log("  npm run db:migrate");
    console.log("  npm run db:seed-demo");
    process.exit(1);
  }

  console.log("✓ TCP connection to Postgres port succeeded.");

  try {
    const { getPool, checkDatabaseConnection, checkPgvectorExtension, countFeedbackItems } =
      await import("../lib/db");
    const dbOk = await checkDatabaseConnection();
    if (!dbOk) {
      console.log("❌ Connected to port but database handshake failed.");
      process.exit(1);
    }
    console.log("✓ PostgreSQL accepts connections.");

    const pgvector = await checkPgvectorExtension();
    console.log(pgvector ? "✓ pgvector extension is installed." : "⚠ pgvector extension missing — run migrations.");

    const count = await countFeedbackItems();
    console.log(`✓ feedback_items table reachable (${count} rows).`);

    if (count === 0) {
      console.log("\nDatabase is empty. Run: npm run db:seed-demo");
    } else {
      console.log("\nDatabase looks ready. Open http://localhost:3001/dashboard");
    }

    await getPool().end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("❌ Postgres is running but the app schema may be missing.");
    if (message.includes("EHOSTUNREACH") && host.includes("supabase")) {
      console.log("\nSupabase direct host (db.*.supabase.co) is IPv6-only.");
      console.log("Your network cannot reach it. Fix:");
      console.log("  1. Supabase Dashboard → Connect → Session pooler");
      console.log("  2. Copy the full URI into .env.local as DATABASE_URL");
      console.log("     (host ends in .pooler.supabase.com, user is postgres.[ref])");
      console.log("  Or run: npm run db:discover-pooler");
    } else {
      console.log("   Run: npm run db:migrate");
    }
    console.error("\nDetail:", message);
    process.exit(1);
  }
}

main();
