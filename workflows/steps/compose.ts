import { upscaleReference, generateComposite } from "@/lib/ai/gemini";
import { applyTextOverlay, normalizeFinal, adjustSaturation } from "@/lib/image/sharp";
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
  quoteScore: number;
  style: StyleGuide;
  keys: ProviderKeys;
  accessMode: "demo" | "byok";
  useGeminiCompose: boolean;
}): Promise<Variant> {
  "use step";
  const left = Buffer.from(args.leftUpscaledBase64, "base64");
  const right = Buffer.from(args.rightUpscaledBase64, "base64");
  let composite: Buffer;

  if (args.useGeminiCompose) {
    composite = await generateComposite(args.keys, {
      leftUpscaled: left,
      rightUpscaled: right,
      quote: args.quote,
      styleNotes: stylePromptFromGuide(args.style),
      seedDescription: `Variant ${args.variantId}: ${variantSeed(args.variantId, args.style)}`,
    });
    await recordCost({
      runId: args.runId,
      step: `compose_${args.variantId}`,
      provider: "google",
      model: "gemini-3-pro-image-preview",
      estimatedUsd: estimateUsd("google/gemini-flash-image", { imageCount: 1 }),
      accessMode: args.accessMode,
    });
  } else {
    const { composeSideBySide } = await import("@/lib/image/sharp");
    composite = await composeSideBySide(left, right);
  }

  const withText = await applyTextOverlay(composite, {
    text: args.quote,
    position: args.style.text.position,
    fontFamily: args.style.text.fontFamily,
    color: args.style.text.color,
    strokeColor: args.style.text.strokeColor,
    strokeWidth: args.style.text.strokeWidth,
    sizeRatio: args.style.text.sizeRatio,
    allCaps: args.style.text.allCaps,
    shading: args.style.shading.behindText,
    shadingIntensity: args.style.shading.intensity,
  });
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

function stylePromptFromGuide(style: StyleGuide): string {
  return [
    `Text style: ${style.text.fontFamily}, color ${style.text.color}`,
    style.text.strokeColor
      ? `with ${style.text.strokeWidth}px ${style.text.strokeColor} outline`
      : "no outline",
    `positioned at ${style.text.position}`,
    style.shading.behindText !== "none"
      ? `with a ${style.shading.behindText} shadow behind it (intensity ${style.shading.intensity})`
      : "",
    style.notes ?? "",
  ]
    .filter(Boolean)
    .join(". ");
}

function variantSeed(variantId: string, style: StyleGuide): string {
  const seeds = [
    `Accent color ${style.accent.primaryColor} highlighted.`,
    `Slightly punchier saturation, emphasis on facial expressions.`,
    `Use ${style.accent.secondaryColor ?? style.accent.primaryColor} as a secondary accent.`,
  ];
  const idx = ["a", "b", "c"].indexOf(variantId.toLowerCase());
  return seeds[idx >= 0 ? idx : 0];
}
