import "./load-env";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { getPool } from "../lib/db";

async function migrate() {
  const migrationsDir = path.join(process.cwd(), "db/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pool = getPool();

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
  }

  console.log("All migrations complete.");
  await pool.end();
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
