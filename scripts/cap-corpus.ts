import "./load-env";
import { getPool } from "../lib/db";

const DEFAULT_COUNTRIES = ["us", "gb", "in"];
const DEFAULT_MAX = 5500;

function parseCountries(): string[] {
  const arg = process.argv.find((a) => a.startsWith("--countries="));
  if (!arg) return DEFAULT_COUNTRIES;
  return arg
    .split("=")[1]
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

function parseMax(): number {
  const arg = process.argv.find((a) => a.startsWith("--max="));
  return arg ? parseInt(arg.split("=")[1], 10) : DEFAULT_MAX;
}

async function countByCountry() {
  const result = await getPool().query<{ country: string; count: string }>(
    `SELECT COALESCE(metadata->>'country', '(none)') AS country, COUNT(*)::text AS count
     FROM feedback_items
     WHERE ingestion_pipeline = 'live_scrape'
     GROUP BY 1
     ORDER BY count DESC`
  );
  return result.rows;
}

async function main() {
  const countries = parseCountries();
  const maxTotal = parseMax();
  const perBucket = Math.ceil(maxTotal / (countries.length * 2));

  console.log("Corpus cap — keep target markets, trim to representative sample");
  console.log(`  countries: ${countries.join(", ")}`);
  console.log(`  max total: ${maxTotal} (~${perBucket} per source × country bucket)\n`);

  const beforeTotal = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM feedback_items WHERE ingestion_pipeline = 'live_scrape'`
  );
  console.log("Before:");
  console.log(`  live_scrape rows: ${beforeTotal.rows[0]?.count ?? 0}`);
  for (const row of await countByCountry()) {
    console.log(`    ${row.country}: ${row.count}`);
  }

  const removedOtherMarkets = await getPool().query<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM feedback_items
       WHERE ingestion_pipeline = 'live_scrape'
         AND COALESCE(metadata->>'country', '') <> ALL($1::text[])
       RETURNING id
     )
     SELECT COUNT(*)::text AS count FROM deleted`,
    [countries]
  );
  console.log(`\nRemoved non-target markets: ${removedOtherMarkets.rows[0]?.count ?? 0}`);

  const removedOverflow = await getPool().query<{ count: string }>(
    `WITH ranked AS (
       SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY source, COALESCE(metadata->>'country', 'unknown')
           ORDER BY created_at DESC NULLS LAST, ingested_at DESC
         ) AS rn
       FROM feedback_items
       WHERE ingestion_pipeline = 'live_scrape'
         AND metadata->>'country' = ANY($1::text[])
     ),
     deleted AS (
       DELETE FROM feedback_items
       WHERE id IN (SELECT id FROM ranked WHERE rn > $2)
       RETURNING id
     )
     SELECT COUNT(*)::text AS count FROM deleted`,
    [countries, perBucket]
  );
  console.log(`Removed overflow (>${perBucket} per source×country): ${removedOverflow.rows[0]?.count ?? 0}`);

  const afterTotal = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM feedback_items WHERE ingestion_pipeline = 'live_scrape'`
  );
  console.log("\nAfter:");
  console.log(`  live_scrape rows: ${afterTotal.rows[0]?.count ?? 0}`);
  for (const row of await countByCountry()) {
    console.log(`    ${row.country}: ${row.count}`);
  }

  const bySource = await getPool().query<{ source: string; count: string }>(
    `SELECT source, COUNT(*)::text AS count
     FROM feedback_items
     WHERE ingestion_pipeline = 'live_scrape'
     GROUP BY source
     ORDER BY source`
  );
  console.log("\nBy source:");
  for (const row of bySource.rows) {
    console.log(`  ${row.source}: ${row.count}`);
  }

  console.log("\nNext: npm run enrich -- --force && npm run embed:active");
  await getPool().end();
}

main().catch((error) => {
  console.error("Cap failed:", error);
  process.exit(1);
});
