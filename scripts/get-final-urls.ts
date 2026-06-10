import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: get-final-urls.ts <runId>");
    process.exit(1);
  }
  const rows = await getDb()
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, id))
    .limit(1);
  console.log(JSON.stringify(rows[0]?.finalUrls ?? null, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
