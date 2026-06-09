import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { extractStyleGuideWorkflow } from "@/workflows/extract-style-guide";
import {
  AccessDeniedError,
  authorizeRequest,
  getClientIp,
  resolveAiKeys,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertDemoBudget } from "@/lib/cost";
import { isValidYoutubeUrl } from "@/lib/utils";

const BodySchema = z.object({
  mode: z.enum(["demo", "byok"]),
  passcode: z.string().optional(),
  keys: z
    .object({
      geminiApiKey: z.string(),
      anthropicApiKey: z.string(),
    })
    .optional(),
  name: z.string().min(2).max(80),
  description: z.string().max(400).default(""),
  videoUrls: z.array(z.string().url()).min(3).max(12),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  for (const u of parsed.data.videoUrls) {
    if (!isValidYoutubeUrl(u)) {
      return NextResponse.json(
        { error: `Not a YouTube URL: ${u}` },
        { status: 400 },
      );
    }
  }
  const ip = await getClientIp();
  const rate = await checkRateLimit(ip);
  if (!rate.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  let grant;
  try {
    grant = await authorizeRequest(parsed.data);
  } catch (e) {
    if (e instanceof AccessDeniedError) {
      return NextResponse.json({ error: e.reason }, { status: 401 });
    }
    throw e;
  }
  if (grant.mode === "demo") {
    try {
      await assertDemoBudget();
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "budget exhausted" },
        { status: 402 },
      );
    }
  }
  const keys = resolveAiKeys(grant);
  const presetId = crypto.randomUUID();
  await start(extractStyleGuideWorkflow, [
    {
      presetId,
      name: parsed.data.name,
      description: parsed.data.description,
      videoUrls: parsed.data.videoUrls,
      isBuiltin: false,
      keys,
    },
  ]);
  return NextResponse.json({ presetId });
}
