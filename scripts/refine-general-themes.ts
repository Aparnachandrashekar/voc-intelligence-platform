import "./load-env";
import { getPool } from "../lib/db";
import { resolveThemesForContent } from "../lib/intelligence/sub-theme-clustering";

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 50000;
  const dryRun = process.argv.includes("--dry-run");

  console.log("Secondary clustering — re-tagging 'general' / Other Topics reviews");
  console.log(`  limit: ${limit}`);
  if (dryRun) console.log("  mode: dry-run (no writes)");

  const rows = await getPool().query<{
    feedback_item_id: string;
    content: string;
    themes: string[];
  }>(
    `SELECT e.feedback_item_id, f.content, e.themes
     FROM enrichment_results e
     INNER JOIN feedback_items f ON f.id = e.feedback_item_id
     WHERE e.enrichment_status = 'completed'
       AND ('general' = ANY(e.themes) OR cardinality(e.themes) = 0)
     ORDER BY e.enriched_at ASC NULLS LAST
     LIMIT $1`,
    [limit]
  );

  let updated = 0;
  const subThemeCounts = new Map<string, number>();

  for (const row of rows.rows) {
    const resolved = resolveThemesForContent(row.content, row.themes);
    if (resolved.join(",") === (row.themes ?? []).join(",")) continue;

    for (const t of resolved) {
      subThemeCounts.set(t, (subThemeCounts.get(t) ?? 0) + 1);
    }

    if (!dryRun) {
      await getPool().query(
        `UPDATE enrichment_results SET themes = $2, enriched_at = NOW()
         WHERE feedback_item_id = $1`,
        [row.feedback_item_id, resolved]
      );
    }
    updated++;
    if (updated % 500 === 0) {
      console.log(`    processed ${updated}/${rows.rows.length}`);
    }
  }

  console.log(`\n  retagged ${updated} reviews`);
  console.log("  sub-theme distribution (sample):");
  [...subThemeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([theme, count]) => console.log(`    ${theme}: ${count}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
