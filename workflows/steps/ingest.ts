import { fetchThumbnailBuffer, fetchTranscript } from "@/lib/sandbox/yt-dlp";
import { putArtifact, blobPaths } from "@/lib/blob";

export async function fetchThumbnailStep(args: {
  runId: string;
  videoUrl: string;
  sourceImageUrl?: string;
}): Promise<{ thumbnailUrl: string; title: string; thumbnailBase64: string }> {
  "use step";
  let buffer: Buffer;
  let title: string;
  if (args.sourceImageUrl) {
    // Override path: caller pre-extracted a frame (e.g. when YouTube's
    // default thumbnail is unusable). Fetch the supplied image and still
    // resolve the title from oembed so quote selection has context.
    const res = await fetch(args.sourceImageUrl);
    if (!res.ok) {
      throw new Error(`sourceImageUrl fetch failed: ${res.status}`);
    }
    buffer = Buffer.from(await res.arrayBuffer());
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(args.videoUrl)}&format=json`,
    ).catch(() => null);
    title = oembed && oembed.ok ? ((await oembed.json()) as { title?: string }).title ?? "" : "";
  } else {
    const r = await fetchThumbnailBuffer(args.videoUrl);
    buffer = r.buffer;
    title = r.title;
  }
  const { url } = await putArtifact(blobPaths.rawThumbnail(args.runId), buffer, {
    contentType: "image/jpeg",
  });
  return {
    thumbnailUrl: url,
    title,
    thumbnailBase64: buffer.toString("base64"),
  };
}

export async function fetchTranscriptStep(args: {
  runId: string;
  videoUrl: string;
}): Promise<{ transcript: string; transcriptUrl: string | null; source: "subs" | "none" }> {
  "use step";
  const { transcript, source } = await fetchTranscript(args.videoUrl);
  if (!transcript) {
    return { transcript: "", transcriptUrl: null, source };
  }
  const { url } = await putArtifact(blobPaths.transcript(args.runId), transcript, {
    contentType: "text/plain; charset=utf-8",
  });
  return { transcript, transcriptUrl: url, source };
}
