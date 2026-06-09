import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function updateRunStep(args: {
  runId: string;
  patch: Partial<{
    status: string;
    currentStep: string;
    finalUrls: string[];
    error: string;
    videoTitle: string;
  }>;
}): Promise<void> {
  "use step";
  await getDb()
    .update(schema.runs)
    .set({ ...args.patch, updatedAt: new Date() })
    .where(eq(schema.runs.id, args.runId));
}

export async function loadStyleStep(args: {
  styleId: string | null;
}): Promise<{ id: string; styleGuide: unknown } | null> {
  "use step";
  if (!args.styleId) return null;
  const rows = await getDb()
    .select()
    .from(schema.stylePresets)
    .where(eq(schema.stylePresets.id, args.styleId))
    .limit(1);
  if (rows.length === 0) return null;
  return { id: rows[0].id, styleGuide: rows[0].styleGuide };
}
