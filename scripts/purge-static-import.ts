import "./load-env";
import { getPool } from "../lib/db";

/**
 * Remove Kaggle / static_import rows from the database.
 * Run after switching to live App Store + Play Store scrape only.
 *
 * Usage: npx tsx scripts/purge-static-import.ts
 */
async function main() {
  const pool = getPool();

  const count = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM feedback_items WHERE ingestion_pipeline = 'static_import'`
  );
  const n = parseInt(count.rows[0]?.count ?? "0", 10);
  if (n === 0) {
    console.log("No static_import rows to delete.");
    await pool.end();
    return;
  }

  console.log(`Deleting ${n.toLocaleString()} static_import rows…`);

  await pool.query(
    `DELETE FROM embeddings WHERE feedback_item_id IN (
       SELECT id FROM feedback_items WHERE ingestion_pipeline = 'static_import'
     )`
  );
  await pool.query(
    `DELETE FROM enrichment_results WHERE feedback_item_id IN (
       SELECT id FROM feedback_items WHERE ingestion_pipeline = 'static_import'
     )`
  );
  await pool.query(
    `DELETE FROM feedback_items WHERE ingestion_pipeline = 'static_import'`
  );

  console.log("Done. Re-run: npm run enrich && npm run embed");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
