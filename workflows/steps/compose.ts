import sharp from "sharp";
import { upscaleReference } from "@/lib/ai/gemini";
import {
  THUMB_WIDTH,
  THUMB_HEIGHT,
  composeSideBySide,
  normalizeFinal,
  adjustSaturation,
} from "@/lib/image/sharp";
import { renderTextOverlay } from "@/lib/image/text-overlay";
import { putArtifact, blobPaths } from "@/lib/blob";
import type { ProviderKeys } from "@/lib/ai/providers";
import type { StyleGuide } from "@/lib/style";
import { recordCost, estimateUsd } from "@/lib/cost";

export async function upscaleHalfStep(args: {
  runId: string;
  side: "left" | "right";
  imageBase64: string;
  keys: ProviderKeys;
  accessMode: "demo" | "byok";
}): Promise<{ url: string; base64: string }> {
  "use step";
  const buffer = Buffer.from(args.imageBase64, "base64");
  const upscaled = await upscaleReference(args.keys, buffer);
  const path =
    args.side === "left"
      ? blobPaths.leftUpscaled(args.runId)
      : blobPaths.rightUpscaled(args.runId);
  const { url } = await putArtifact(path, upscaled, {
    contentType: "image/png",
  });
  await recordCost({
    runId: args.runId,
    step: `upscale_${args.side}`,
    provider: "google",
    model: "gemini-3-pro-image-preview",
    estimatedUsd: estimateUsd("google/gemini-flash-image", { imageCount: 1 }),
    accessMode: args.accessMode,
  });
  return { url, base64: upscaled.toString("base64") };
}

export type Variant = {
  id: string;
  url: string;
  quote: string;
  score: number;
};

export async function composeVariantStep(args: {
  runId: string;
  variantId: string;
  leftUpscaledBase64: string;
  rightUpscaledBase64: string;
  quote: string;
  emphasisWords: string[];
  quoteScore: number;
  style: StyleGuide;
  keys: ProviderKeys;
  accessMode: "demo" | "byok";
  useGeminiCompose: boolean;
}): Promise<Variant> {
  "use step";
  const left = Buffer.from(args.leftUpscaledBase64, "base64");
  const right = Buffer.from(args.rightUpscaledBase64, "base64");

  // Always use sharp side-by-side; Gemini composite is unreliable for clean splits
  const base = await composeSideBySide(left, right);

  // Render text overlay as a transparent PNG, then composite over the base
  const textOverlay = await renderTextOverlay({
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    quote: args.quote,
    emphasisWords: args.emphasisWords,
    whiteColor: args.style.text.color || "#FFFFFF",
    yellowColor: args.style.accent.primaryColor || "#FCD34D",
  });
  const withText = await sharp(base)
    .composite([{ input: textOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();

  const saturated = await adjustSaturation(
    withText,
    args.style.accent.saturationBoost,
  );
  const normalized = await normalizeFinal(saturated);
  const { url } = await putArtifact(
    blobPaths.final(args.runId, args.variantId),
    normalized,
    { contentType: "image/png" },
  );
  return {
    id: args.variantId,
    url,
    quote: args.quote,
    score: args.quoteScore,
  };
}
