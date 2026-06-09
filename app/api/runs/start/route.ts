import { NextResponse } from "next/server";
import { z } from "zod";
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
  const youtubeId = youtubeIdFromUrl(parsed.data.videoUrl)!;

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
