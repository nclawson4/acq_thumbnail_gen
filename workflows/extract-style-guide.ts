import { getDb, schema } from "@/lib/db";
import type { ProviderKeys } from "@/lib/ai/providers";
import { extractStyleGuide } from "@/lib/ai/claude";
import { fetchThumbnailBuffer } from "@/lib/sandbox/yt-dlp";
import { youtubeIdFromUrl } from "@/lib/utils";

async function fetchThumbnailsStep(args: { videoUrls: string[] }) {
  "use step";
  const buffers = await Promise.all(
    args.videoUrls.map(async (url) => {
      const { buffer } = await fetchThumbnailBuffer(url);
      return { url, buffer };
    }),
  );
  return buffers.map((b) => ({
    url: b.url,
    base64: b.buffer.toString("base64"),
  }));
}

async function extractStep(args: {
  references: { url: string; base64: string }[];
  keys: ProviderKeys;
}) {
  "use step";
  const refs = args.references.map((r) => ({
    url: r.url,
    buffer: Buffer.from(r.base64, "base64"),
  }));
  return extractStyleGuide(args.keys, refs);
}

async function persistStep(args: {
  presetId: string;
  name: string;
  description: string;
  styleGuide: unknown;
  referenceUrls: string[];
  isBuiltin: boolean;
}) {
  "use step";
  await getDb()
    .insert(schema.stylePresets)
    .values({
      id: args.presetId,
      name: args.name,
      description: args.description,
      styleGuide: args.styleGuide,
      referenceUrls: args.referenceUrls,
      isBuiltin: args.isBuiltin ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: schema.stylePresets.id,
      set: {
        name: args.name,
        description: args.description,
        styleGuide: args.styleGuide,
        referenceUrls: args.referenceUrls,
      },
    });
}

export async function extractStyleGuideWorkflow(args: {
  presetId: string;
  name: string;
  description: string;
  videoUrls: string[];
  isBuiltin: boolean;
  keys: ProviderKeys;
}): Promise<{ presetId: string; rationale: string }> {
  "use workflow";

  for (const url of args.videoUrls) {
    if (!youtubeIdFromUrl(url)) {
      throw new Error(`Invalid YouTube URL: ${url}`);
    }
  }

  const refs = await fetchThumbnailsStep({ videoUrls: args.videoUrls });
  const { styleGuide, rationale } = await extractStep({
    references: refs,
    keys: args.keys,
  });
  await persistStep({
    presetId: args.presetId,
    name: args.name,
    description: args.description,
    styleGuide,
    referenceUrls: args.videoUrls,
    isBuiltin: args.isBuiltin,
  });
  return { presetId: args.presetId, rationale };
}
