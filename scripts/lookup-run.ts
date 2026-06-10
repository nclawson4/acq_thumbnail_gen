import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const prefix = process.argv[2];
  if (!prefix) {
    console.error("usage: lookup-run.ts <id-prefix>");
    process.exit(1);
  }
  const db = getDb();
  const rows = await db.execute(
    sql`SELECT id, workflow_run_id, status, current_step, video_title, error, updated_at FROM runs WHERE id LIKE ${prefix + "%"} ORDER BY created_at DESC LIMIT 5`,
  );
  console.log(JSON.stringify(rows.rows ?? rows, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
