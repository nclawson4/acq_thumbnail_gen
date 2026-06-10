import { getDb } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  const r = (await db.execute(
    sql`SELECT DISTINCT youtube_id, video_title FROM runs WHERE (video_title ILIKE '%distracted%' OR video_title ILIKE '%winning%') AND status='done' LIMIT 10`,
  )) as unknown as { rows: Array<{ youtube_id: string; video_title: string | null }> };
  const arr = r.rows ?? (r as unknown as Array<{ youtube_id: string; video_title: string | null }>);
  for (const row of arr) console.log(`${row.youtube_id}  ${row.video_title}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
