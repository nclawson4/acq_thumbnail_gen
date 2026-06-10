import { getWritable } from "workflow";
import type { ProviderKeys } from "@/lib/ai/providers";
import { StyleGuideSchema, TWO_HOST_DEFAULT_STYLE, type StyleGuide } from "@/lib/style";
import { youtubeIdFromUrl } from "@/lib/utils";
import {
  loadStyleStep,
  updateRunStep,
} from "./steps/persistence";
import {
  fetchThumbnailStep,
  fetchTranscriptStep,
} from "./steps/ingest";
import {
  cropHalvesStep,
  detectCropStep,
  pickQuotesStep,
  qualityCheckStep,
  scrubFramesStep,
} from "./steps/vision";
import {
  composeVariantStep,
  upscaleHalfStep,
  type Variant,
} from "./steps/compose";

export type GenerateInput = {
  runId: string;
  videoUrl: string;
  styleId: string | null;
  hostSide: "left" | "right";
  accessMode: "demo" | "byok";
  keys: ProviderKeys;
  useGeminiCompose?: boolean;
  // Optional escape hatch when YouTube's default thumbnail is unusable
  // (e.g. autonomous-publishing channels that ship without a generated
  // hero frame). Caller pre-extracts a frame and supplies its URL.
  sourceImageUrl?: string;
};

export type GenerateProgress =
  | { type: "step"; step: string; status: "started" | "completed"; data?: unknown }
  | { type: "error"; message: string }
  | { type: "done"; variants: Variant[] };

async function emit(event: GenerateProgress) {
  "use step";
  const writer = getWritable<GenerateProgress>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

export async function generateThumbnailWorkflow(
  input: GenerateInput,
): Promise<{ runId: string; variants: Variant[] }> {
  "use workflow";

  const youtubeId = youtubeIdFromUrl(input.videoUrl);
  if (!youtubeId) {
    throw new Error(`Invalid YouTube URL: ${input.videoUrl}`);
  }

  try {
  // Resolve style
  await emit({ type: "step", step: "load_style", status: "started" });
  const stylePreset = await loadStyleStep({ styleId: input.styleId });
  let style: StyleGuide = TWO_HOST_DEFAULT_STYLE;
  if (stylePreset) {
    const parsed = StyleGuideSchema.safeParse(stylePreset.styleGuide);
    if (parsed.success) style = parsed.data;
  }
  await emit({ type: "step", step: "load_style", status: "completed", data: { name: stylePreset?.id ?? "default" } });

  // 1+2. Fetch thumbnail + transcript in parallel — both only need videoUrl
  await updateRunStep({ runId: input.runId, patch: { currentStep: "ingest" } });
  const [thumb, transcript] = await Promise.all([
    (async () => {
      await emit({ type: "step", step: "fetch_thumbnail", status: "started" });
      const r = await fetchThumbnailStep({
        runId: input.runId,
        videoUrl: input.videoUrl,
        sourceImageUrl: input.sourceImageUrl,
      });
      await updateRunStep({
        runId: input.runId,
        patch: { videoTitle: r.title },
      });
      await emit({
        type: "step",
        step: "fetch_thumbnail",
        status: "completed",
        data: { url: r.thumbnailUrl, title: r.title },
      });
      return r;
    })(),
    (async () => {
      await emit({ type: "step", step: "fetch_transcript", status: "started" });
      const r = await fetchTranscriptStep({
        runId: input.runId,
        videoUrl: input.videoUrl,
      });
      await emit({
        type: "step",
        step: "fetch_transcript",
        status: "completed",
        data: { source: r.source, length: r.transcript.length },
      });
      return r;
    })(),
  ]);

  // 3. Detect crop points
  await emit({ type: "step", step: "detect_crop", status: "started" });
  await updateRunStep({ runId: input.runId, patch: { currentStep: "detect_crop" } });
  const crop = await detectCropStep({
    runId: input.runId,
    thumbnailBase64: thumb.thumbnailBase64,
    hostSide: input.hostSide,
    keys: input.keys,
    accessMode: input.accessMode,
  });
  await emit({
    type: "step",
    step: "detect_crop",
    status: "completed",
    data: crop,
  });

  // 4. Crop halves
  await updateRunStep({ runId: input.runId, patch: { currentStep: "crop_halves" } });
  await emit({ type: "step", step: "crop_halves", status: "started" });
  const halves = await cropHalvesStep({
    runId: input.runId,
    thumbnailBase64: thumb.thumbnailBase64,
    splitX: crop.splitX,
    leftBbox: crop.leftBbox,
    rightBbox: crop.rightBbox,
    bodyFrameLandmark: crop.bodyFrameLandmark,
    keys: input.keys,
    accessMode: input.accessMode,
  });
  await emit({
    type: "step",
    step: "crop_halves",
    status: "completed",
    data: { leftUrl: halves.leftUrl, rightUrl: halves.rightUrl },
  });

  // 5. Quality check left + right in parallel; frame scrub fallback stays sequential (shared video download)
  await updateRunStep({ runId: input.runId, patch: { currentStep: "quality_check" } });
  await emit({ type: "step", step: "quality_check", status: "started" });
  const [leftQuality, rightQuality] = await Promise.all([
    qualityCheckStep({
      runId: input.runId,
      side: "left",
      imageBase64: halves.leftBase64,
      keys: input.keys,
      accessMode: input.accessMode,
    }),
    qualityCheckStep({
      runId: input.runId,
      side: "right",
      imageBase64: halves.rightBase64,
      keys: input.keys,
      accessMode: input.accessMode,
    }),
  ]);
  await emit({
    type: "step",
    step: "quality_check",
    status: "completed",
    data: { left: leftQuality, right: rightQuality },
  });

  let leftBase64 = halves.leftBase64;
  let rightBase64 = halves.rightBase64;

  if (leftQuality.needsFrameScrub) {
    await updateRunStep({ runId: input.runId, patch: { currentStep: "scrub_left" } });
    await emit({ type: "step", step: "scrub_left", status: "started" });
    try {
      const scrubbed = await scrubFramesStep({
        runId: input.runId,
        videoUrl: input.videoUrl,
        side: "left",
        count: 5,
        personDescription: crop.leftPersonDescription,
        keys: input.keys,
        accessMode: input.accessMode,
      });
      leftBase64 = scrubbed.chosenBase64;
      await emit({
        type: "step",
        step: "scrub_left",
        status: "completed",
        data: { rationale: scrubbed.rationale },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await emit({
        type: "step",
        step: "scrub_left",
        status: "completed",
        data: { skipped: true, reason: msg },
      });
    }
  }
  if (rightQuality.needsFrameScrub) {
    await updateRunStep({ runId: input.runId, patch: { currentStep: "scrub_right" } });
    await emit({ type: "step", step: "scrub_right", status: "started" });
    try {
      const scrubbed = await scrubFramesStep({
        runId: input.runId,
        videoUrl: input.videoUrl,
        side: "right",
        count: 5,
        personDescription: crop.rightPersonDescription,
        keys: input.keys,
        accessMode: input.accessMode,
      });
      rightBase64 = scrubbed.chosenBase64;
      await emit({
        type: "step",
        step: "scrub_right",
        status: "completed",
        data: { rationale: scrubbed.rationale },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await emit({
        type: "step",
        step: "scrub_right",
        status: "completed",
        data: { skipped: true, reason: msg },
      });
    }
  }

  // 6+7. Upscale halves L+R + pickQuotes all in parallel — quotes only needs transcript+title (already available)
  await updateRunStep({ runId: input.runId, patch: { currentStep: "upscale_and_quotes" } });
  const [leftUp, rightUp, quotes] = await Promise.all([
    (async () => {
      await emit({ type: "step", step: "upscale_left", status: "started" });
      const r = await upscaleHalfStep({
        runId: input.runId,
        side: "left",
        imageBase64: leftBase64,
        keys: input.keys,
        accessMode: input.accessMode,
      });
      await emit({ type: "step", step: "upscale_left", status: "completed", data: { url: r.url } });
      return r;
    })(),
    (async () => {
      await emit({ type: "step", step: "upscale_right", status: "started" });
      const r = await upscaleHalfStep({
        runId: input.runId,
        side: "right",
        imageBase64: rightBase64,
        keys: input.keys,
        accessMode: input.accessMode,
      });
      await emit({ type: "step", step: "upscale_right", status: "completed", data: { url: r.url } });
      return r;
    })(),
    (async () => {
      await emit({ type: "step", step: "pick_quotes", status: "started" });
      const r = await pickQuotesStep({
        runId: input.runId,
        transcript: transcript.transcript,
        videoTitle: thumb.title,
        keys: input.keys,
        accessMode: input.accessMode,
      });
      await emit({ type: "step", step: "pick_quotes", status: "completed", data: r });
      return r;
    })(),
  ]);

  // 8. Compose 3 variants in parallel — independent Gemini calls, biggest single win
  await emit({ type: "step", step: "compose_variants", status: "started" });
  await updateRunStep({ runId: input.runId, patch: { currentStep: "compose_variants" } });
  const top3 = [...quotes.quotes]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const useGemini = input.useGeminiCompose ?? false;
  const variants = await Promise.all(
    top3.map((q, i) =>
      (async () => {
        const v = await composeVariantStep({
          runId: input.runId,
          variantId: String.fromCharCode(97 + i),
          leftUpscaledBase64: leftUp.base64,
          rightUpscaledBase64: rightUp.base64,
          quote: q.text,
          emphasisWords: q.emphasisWords ?? [],
          quoteScore: q.score,
          style,
          keys: input.keys,
          accessMode: input.accessMode,
          useGeminiCompose: useGemini,
        });
        await emit({
          type: "step",
          step: `variant_${v.id}`,
          status: "completed",
          data: v,
        });
        return v;
      })(),
    ),
  );

  await updateRunStep({
    runId: input.runId,
    patch: {
      status: "done",
      currentStep: "done",
      finalUrls: variants.map((v) => v.url),
    },
  });

  await emit({ type: "done", variants });
  return { runId: input.runId, variants };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateRunStep({
      runId: input.runId,
      patch: { status: "error", error: message },
    });
    await emit({ type: "error", message });
    throw err;
  }
}
