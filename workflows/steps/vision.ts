import {
  detectCropPoints,
  pickBestFrame,
  pickQuotes,
  rateCropQuality,
  type CropPoints,
  type QualityRating,
  type QuoteCandidates,
} from "@/lib/ai/claude";
import { putArtifact, blobPaths, fetchArtifactBuffer } from "@/lib/blob";
import { cropHalvesFromThumbnail, frameSubjectHalf } from "@/lib/image/sharp";
import { scrubFrames } from "@/lib/sandbox/yt-dlp";
import type { ProviderKeys } from "@/lib/ai/providers";
import { recordCost, estimateUsd } from "@/lib/cost";

const VISION_INPUT_TOKENS = 2400;
const VISION_OUTPUT_TOKENS = 600;

export async function detectCropStep(args: {
  runId: string;
  thumbnailBase64: string;
  hostSide: "left" | "right";
  keys: ProviderKeys;
  accessMode: "demo" | "byok";
}): Promise<CropPoints> {
  "use step";
  const buffer = Buffer.from(args.thumbnailBase64, "base64");
  const result = await detectCropPoints(args.keys, buffer, args.hostSide);
  await recordCost({
    runId: args.runId,
    step: "detect_crop",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    inputTokens: VISION_INPUT_TOKENS,
    outputTokens: VISION_OUTPUT_TOKENS,
    estimatedUsd: estimateUsd("anthropic/claude-sonnet", {
      inputTokens: VISION_INPUT_TOKENS,
      outputTokens: VISION_OUTPUT_TOKENS,
    }),
    accessMode: args.accessMode,
  });
  return result;
}

export async function cropHalvesStep(args: {
  runId: string;
  thumbnailBase64: string;
  splitX: number;
  leftBbox?: CropPoints["leftBbox"];
  rightBbox?: CropPoints["rightBbox"];
}): Promise<{ leftUrl: string; rightUrl: string; leftBase64: string; rightBase64: string }> {
  "use step";
  const buffer = Buffer.from(args.thumbnailBase64, "base64");

  let leftJpeg: Buffer;
  let rightJpeg: Buffer;
  if (args.leftBbox && args.rightBbox) {
    const [leftRes, rightRes] = await Promise.all([
      frameSubjectHalf(buffer, args.leftBbox),
      frameSubjectHalf(buffer, args.rightBbox),
    ]);
    leftJpeg = leftRes.jpeg;
    rightJpeg = rightRes.jpeg;
  } else {
    const fallback = await cropHalvesFromThumbnail(buffer, args.splitX);
    leftJpeg = fallback.leftJpeg;
    rightJpeg = fallback.rightJpeg;
  }

  const [left, right] = await Promise.all([
    putArtifact(blobPaths.leftRaw(args.runId), leftJpeg, {
      contentType: "image/jpeg",
    }),
    putArtifact(blobPaths.rightRaw(args.runId), rightJpeg, {
      contentType: "image/jpeg",
    }),
  ]);
  return {
    leftUrl: left.url,
    rightUrl: right.url,
    leftBase64: leftJpeg.toString("base64"),
    rightBase64: rightJpeg.toString("base64"),
  };
}

export async function qualityCheckStep(args: {
  runId: string;
  side: "left" | "right";
  imageBase64: string;
  keys: ProviderKeys;
  accessMode: "demo" | "byok";
}): Promise<QualityRating> {
  "use step";
  const buffer = Buffer.from(args.imageBase64, "base64");
  const result = await rateCropQuality(args.keys, args.side, buffer);
  await recordCost({
    runId: args.runId,
    step: `quality_${args.side}`,
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputTokens: 1200,
    outputTokens: 200,
    estimatedUsd: estimateUsd("anthropic/claude-haiku", {
      inputTokens: 1200,
      outputTokens: 200,
    }),
    accessMode: args.accessMode,
  });
  return result;
}

export async function scrubFramesStep(args: {
  runId: string;
  videoUrl: string;
  side: "left" | "right";
  count: number;
  personDescription: string;
  keys: ProviderKeys;
  accessMode: "demo" | "byok";
}): Promise<{ chosenUrl: string; chosenBase64: string; rationale: string }> {
  "use step";
  const frames = await scrubFrames(args.videoUrl, args.count);
  await Promise.all(
    frames.map((b, i) =>
      putArtifact(blobPaths.frameSample(args.runId, args.side, i), b, {
        contentType: "image/jpeg",
      }),
    ),
  );
  const { chosenIdx, rationale } = await pickBestFrame(
    args.keys,
    args.side,
    args.personDescription,
    frames.map((buffer, idx) => ({ idx, buffer })),
  );
  await recordCost({
    runId: args.runId,
    step: `scrub_${args.side}`,
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputTokens: 2000 + frames.length * 1200,
    outputTokens: 300,
    estimatedUsd: estimateUsd("anthropic/claude-haiku", {
      inputTokens: 2000 + frames.length * 1200,
      outputTokens: 300,
    }),
    accessMode: args.accessMode,
  });
  const chosen = frames[chosenIdx] ?? frames[0];
  return {
    chosenUrl: `runs/${args.runId}/03-frames-${args.side}-${chosenIdx}.jpg`,
    chosenBase64: chosen.toString("base64"),
    rationale,
  };
}

export async function pickQuotesStep(args: {
  runId: string;
  transcript: string;
  videoTitle: string | null;
  keys: ProviderKeys;
  accessMode: "demo" | "byok";
}): Promise<QuoteCandidates> {
  "use step";
  // Always call Claude — when transcript is missing, ask it to invent
  // punchy paraphrases from the title alone. This way we always get
  // 3+ quotes with proper emphasisWords for the yellow highlight.
  const transcriptForPrompt = args.transcript ||
    `[Transcript unavailable — invent 3-5 plausible punchy thumbnail lines based on the video title: "${args.videoTitle ?? "unknown topic"}"]`;
  const result = await pickQuotes(args.keys, transcriptForPrompt, args.videoTitle);
  await recordCost({
    runId: args.runId,
    step: "pick_quotes",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    inputTokens: Math.min(18000, args.transcript.length / 4),
    outputTokens: 800,
    estimatedUsd: estimateUsd("anthropic/claude-sonnet", {
      inputTokens: Math.min(18000, args.transcript.length / 4),
      outputTokens: 800,
    }),
    accessMode: args.accessMode,
  });
  return result;
}
