import { fetchThumbnailBuffer, fetchTranscript } from "@/lib/sandbox/yt-dlp";
import { putArtifact, blobPaths } from "@/lib/blob";

export async function fetchThumbnailStep(args: {
  runId: string;
  videoUrl: string;
}): Promise<{ thumbnailUrl: string; title: string; thumbnailBase64: string }> {
  "use step";
  const { buffer, title } = await fetchThumbnailBuffer(args.videoUrl);
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
