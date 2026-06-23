import "./load-env";
import { readFileSync } from "fs";
import path from "path";
import { getPool } from "../lib/db";

async function migrate() {
  const sqlPath = path.join(process.cwd(), "db/migrations/001_init.sql");
  const sql = readFileSync(sqlPath, "utf-8");
  const pool = getPool();

  console.log("Running migration: 001_init.sql");
  await pool.query(sql);
  console.log("Migration complete.");

  const ext = await pool.query(
    "SELECT extname FROM pg_extension WHERE extname = 'vector'"
  );
  console.log(
    ext.rows.length > 0
      ? "pgvector extension: enabled"
      : "pgvector extension: MISSING"
  );

  await pool.end();
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
