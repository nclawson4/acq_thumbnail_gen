import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { start } from "workflow/api";
import { generateThumbnailWorkflow } from "@/workflows/generate-thumbnail";
import {
  AccessDeniedError,
  authorizeRequest,
  getClientIp,
  resolveAiKeys,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertDemoBudget } from "@/lib/cost";
import { isValidYoutubeUrl, youtubeIdFromUrl } from "@/lib/utils";
import { getDb, schema } from "@/lib/db";

const BodySchema = z.object({
  mode: z.enum(["demo", "byok"]),
  passcode: z.string().optional(),
  keys: z
    .object({
      geminiApiKey: z.string(),
      anthropicApiKey: z.string(),
    })
    .optional(),
  videoUrl: z.string().url(),
  styleId: z.string().nullable().optional(),
  hostSide: z.enum(["left", "right"]).default("right"),
  useGeminiCompose: z.boolean().default(false),
  forceRerun: z.boolean().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!isValidYoutubeUrl(parsed.data.videoUrl)) {
    return NextResponse.json(
      { error: "videoUrl must be a YouTube watch URL" },
      { status: 400 },
    );
  }

  const ip = await getClientIp();
  const rate = await checkRateLimit(ip);
  if (!rate.success) {
    return NextResponse.json(
      { error: "Too many requests", resetAt: rate.reset },
      { status: 429 },
    );
  }

  let grant;
  try {
    grant = await authorizeRequest(parsed.data);
  } catch (e) {
    if (e instanceof AccessDeniedError) {
      return NextResponse.json(
        { error: "Access denied", reason: e.reason },
        { status: 401 },
      );
    }
    throw e;
  }

  const youtubeId = youtubeIdFromUrl(parsed.data.videoUrl)!;

  // Cache lookup: serve from a prior successful run if (videoUrl, styleId, hostSide) match.
  // Skipped when forceRerun=true or useGeminiCompose=true (latter isn't stored on the row).
  // Done before demo-budget check so cached runs are free to serve.
  const cacheable =
    !parsed.data.forceRerun && !parsed.data.useGeminiCompose;
  if (cacheable) {
    const styleFilter = parsed.data.styleId
      ? eq(schema.runs.styleId, parsed.data.styleId)
      : isNull(schema.runs.styleId);
    const cachedRows = await getDb()
      .select({
        finalUrls: schema.runs.finalUrls,
        videoTitle: schema.runs.videoTitle,
      })
      .from(schema.runs)
      .where(
        and(
          eq(schema.runs.youtubeId, youtubeId),
          eq(schema.runs.hostSide, parsed.data.hostSide),
          eq(schema.runs.status, "done"),
          styleFilter,
        ),
      )
      .orderBy(desc(schema.runs.createdAt))
      .limit(1);
    const cached = cachedRows[0];
    if (cached?.finalUrls && cached.finalUrls.length === 3) {
      const cachedRunId = crypto.randomUUID();
      await getDb().insert(schema.runs).values({
        id: cachedRunId,
        workflowRunId: null,
        youtubeUrl: parsed.data.videoUrl,
        youtubeId,
        videoTitle: cached.videoTitle,
        styleId: parsed.data.styleId ?? null,
        hostSide: parsed.data.hostSide,
        status: "done",
        currentStep: "done",
        finalUrls: cached.finalUrls,
        accessMode: grant.mode,
      });
      return NextResponse.json({
        runId: cachedRunId,
        cached: true,
        finalUrls: cached.finalUrls,
      });
    }
  }

  if (grant.mode === "demo") {
    try {
      await assertDemoBudget();
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "Demo budget exhausted",
        },
        { status: 402 },
      );
    }
  }

  const keys = resolveAiKeys(grant);
  const runId = crypto.randomUUID();

  const run = await start(generateThumbnailWorkflow, [
    {
      runId,
      videoUrl: parsed.data.videoUrl,
      styleId: parsed.data.styleId ?? null,
      hostSide: parsed.data.hostSide,
      accessMode: grant.mode,
      keys,
      useGeminiCompose: parsed.data.useGeminiCompose,
    },
  ]);

  await getDb()
    .insert(schema.runs)
    .values({
      id: runId,
      workflowRunId: run.runId,
      youtubeUrl: parsed.data.videoUrl,
      youtubeId,
      styleId: parsed.data.styleId ?? null,
      hostSide: parsed.data.hostSide,
      status: "running",
      currentStep: "fetch_thumbnail",
      accessMode: grant.mode,
    })
    .onConflictDoUpdate({
      target: schema.runs.id,
      set: { workflowRunId: run.runId, updatedAt: new Date() },
    });

  return NextResponse.json({ runId, workflowRunId: run.runId });
}
