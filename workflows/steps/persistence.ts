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

export async function ensureRunStep(args: {
  runId: string;
  youtubeUrl: string;
  youtubeId: string;
  styleId: string | null;
  hostSide: "left" | "right";
  accessMode: "demo" | "byok";
}): Promise<void> {
  "use step";
  await getDb()
    .insert(schema.runs)
    .values({
      id: args.runId,
      youtubeUrl: args.youtubeUrl,
      youtubeId: args.youtubeId,
      styleId: args.styleId,
      hostSide: args.hostSide,
      status: "running",
      currentStep: "fetch_thumbnail",
      accessMode: args.accessMode,
    })
    .onConflictDoNothing({ target: schema.runs.id });
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
