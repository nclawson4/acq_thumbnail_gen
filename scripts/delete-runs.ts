/**
 * Delete all run rows for the given YouTube IDs.
 *
 *   node --env-file=.env.local --import tsx scripts/delete-runs.ts
 */
import { neon } from "@neondatabase/serverless";

const IDS = ["rd_urnkST6g", "LGbS0GOZBNE"];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");
  const sql = neon(dbUrl);

  const before = (await sql`
    SELECT youtube_id, COUNT(*)::int AS n
    FROM runs WHERE youtube_id = ANY(${IDS}::text[])
    GROUP BY youtube_id
  `) as Array<{ youtube_id: string; n: number }>;
  console.log("Before:", before);

  const res = (await sql`
    DELETE FROM runs WHERE youtube_id = ANY(${IDS}::text[]) RETURNING id, youtube_id
  `) as Array<{ id: string; youtube_id: string }>;
  console.log(`Deleted ${res.length} rows:`);
  for (const r of res) console.log(`  ${r.youtube_id}  ${r.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
