import { put, del, list } from "@vercel/blob";

export const blobPaths = {
  rawThumbnail: (runId: string) => `runs/${runId}/00-raw-thumbnail.jpg`,
  transcript: (runId: string) => `runs/${runId}/01-transcript.txt`,
  leftRaw: (runId: string) => `runs/${runId}/02-left-raw.jpg`,
  rightRaw: (runId: string) => `runs/${runId}/02-right-raw.jpg`,
  frameSample: (runId: string, side: "left" | "right", idx: number) =>
    `runs/${runId}/03-frames-${side}-${idx}.jpg`,
  leftUpscaled: (runId: string) => `runs/${runId}/04-left-upscaled.png`,
  rightUpscaled: (runId: string) => `runs/${runId}/04-right-upscaled.png`,
  composite: (runId: string, variantId: string) =>
    `runs/${runId}/05-composite-${variantId}.png`,
  final: (runId: string, variantId: string) =>
    `runs/${runId}/final/${variantId}.png`,
} as const;

export async function putArtifact(
  path: string,
  body: Buffer | ReadableStream | string,
  options: { contentType?: string; access?: "public" | "private" } = {},
): Promise<{ url: string; pathname: string }> {
  const result = await put(path, body, {
    access: options.access ?? "public",
    contentType: options.contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: result.url, pathname: result.pathname };
}

export async function fetchArtifactBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch artifact ${url}: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteRunArtifacts(runId: string): Promise<void> {
  const { blobs } = await list({ prefix: `runs/${runId}/` });
  if (blobs.length > 0) {
    await del(blobs.map((b) => b.url));
  }
}
