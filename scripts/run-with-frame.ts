/**
 * One-off: run a YouTube video through the real pipeline using a specific
 * video frame as the source image (not the YouTube default thumbnail).
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/run-with-frame.ts <youtubeUrl> <frameNumber>
 *
 * Defaults to EiUW4sCi23s frame 30 if no args.
 *
 * Pipeline:
 *   1. Sandbox: yt-dlp downloads the video, ffmpeg extracts frame N.
 *   2. Upload the frame to Blob.
 *   3. POST /api/runs/start on the deployed app with sourceImageUrl=<frame>.
 *   4. Poll DB until the workflow finishes.
 */
import fs from "node:fs";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

const VIDEO_URL = process.argv[2] ?? "https://www.youtube.com/watch?v=EiUW4sCi23s";
const FRAME_N = Number(process.argv[3] ?? "30");
const BASE_URL = "https://acq-thumbnails.vercel.app";
const POLL_INTERVAL_MS = 8000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required in .env.local`);
  return v;
}

async function extractFrame(videoUrl: string, frameN: number): Promise<Buffer> {
  console.log(`Provisioning sandbox to extract frame ${frameN}...`);
  const snapshotId = process.env.INGEST_SANDBOX_SNAPSHOT_ID?.trim();
  // Sandbox SDK falls back to VERCEL_OIDC_TOKEN when explicit creds are missing.
  const t = process.env.VERCEL_TOKEN;
  const team = process.env.VERCEL_TEAM_ID;
  const proj = process.env.VERCEL_PROJECT_ID;
  const creds = t && team && proj ? { token: t, teamId: team, projectId: proj } : {};
  const sandbox = snapshotId
    ? await Sandbox.create({ ...creds, source: { type: "snapshot", snapshotId }, timeout: 300_000 })
    : await Sandbox.create({ ...creds, runtime: "node24", timeout: 300_000 });
  try {
    if (!snapshotId) {
      console.log("  Installing yt-dlp + ffmpeg (no snapshot available)...");
      await sandbox.runCommand("sh", [
        "-c",
        "sudo dnf install -y --skip-broken python3 python3-pip ffmpeg && python3 -m pip install --quiet --upgrade yt-dlp",
      ]);
    }
    console.log("  Downloading video...");
    await sandbox.runCommand("yt-dlp", [
      "--no-warnings",
      "-f",
      "best[height<=720]",
      "-o",
      "/tmp/video.mp4",
      videoUrl,
    ]);
    console.log(`  Extracting frame ${frameN} with ffmpeg...`);
    // select=eq(n,N) picks the exact frame index. Comma needs escaping for ffmpeg's filter syntax.
    await sandbox.runCommand("ffmpeg", [
      "-y",
      "-i",
      "/tmp/video.mp4",
      "-vf",
      `select=eq(n\\,${frameN})`,
      "-vframes",
      "1",
      "-q:v",
      "2",
      "/tmp/frame.jpg",
    ]);
    const b64Cmd = await sandbox.runCommand("base64", ["-w", "0", "/tmp/frame.jpg"]);
    const b64 = (await b64Cmd.stdout()).trim();
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0) throw new Error("ffmpeg produced an empty frame");
    console.log(`  Frame extracted: ${buf.length} bytes`);
    return buf;
  } finally {
    await sandbox.stop();
  }
}

async function uploadFrame(buf: Buffer): Promise<string> {
  console.log("Uploading frame to Blob...");
  const pathname = `prestaged/${Date.now()}-${crypto.randomUUID()}.jpg`;
  const { url } = await put(pathname, buf, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
    allowOverwrite: false,
    token: requireEnv("BLOB_READ_WRITE_TOKEN"),
  });
  console.log(`  Uploaded: ${url}`);
  return url;
}

async function triggerPipeline(videoUrl: string, sourceImageUrl: string): Promise<string> {
  console.log("Triggering pipeline on deployed API...");
  const res = await fetch(`${BASE_URL}/api/runs/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "byok",
      keys: {
        geminiApiKey: requireEnv("GEMINI_API_KEY"),
        anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
      },
      videoUrl,
      hostSide: "right",
      styleId: null,
      forceRerun: true,
      sourceImageUrl,
    }),
  });
  const j = (await res.json()) as { runId?: string; error?: string };
  if (!res.ok || !j.runId) {
    throw new Error(`Pipeline trigger failed: ${j.error ?? res.status}`);
  }
  console.log(`  Run started: ${j.runId}`);
  return j.runId;
}

async function pollUntilDone(runId: string): Promise<{ status: string; finalUrls: string[] | null; error: string | null }> {
  const sql = neon(requireEnv("DATABASE_URL"));
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const rows = (await sql`SELECT status, final_urls, error FROM runs WHERE id = ${runId}`) as Array<{
      status: string;
      final_urls: string[] | null;
      error: string | null;
    }>;
    const row = rows[0];
    if (row && (row.status === "done" || row.status === "error")) {
      return { status: row.status, finalUrls: row.final_urls, error: row.error };
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for pipeline");
}

async function main() {
  console.log(`Video: ${VIDEO_URL}`);
  console.log(`Frame: ${FRAME_N}`);
  console.log("---");

  const frame = await extractFrame(VIDEO_URL, FRAME_N);

  const outDir = path.join(process.cwd(), ".scratch", "frame-runs");
  fs.mkdirSync(outDir, { recursive: true });
  const localPath = path.join(outDir, `${Date.now()}-frame.jpg`);
  fs.writeFileSync(localPath, frame);
  console.log(`  Saved local copy: ${localPath}`);

  const sourceImageUrl = await uploadFrame(frame);
  const runId = await triggerPipeline(VIDEO_URL, sourceImageUrl);

  console.log("Polling DB for completion...");
  const result = await pollUntilDone(runId);
  console.log("");
  if (result.status === "error") {
    console.error(`FAILED: ${result.error}`);
    process.exit(1);
  }
  console.log(`DONE (run ${runId})`);
  console.log("Variants:");
  for (const u of result.finalUrls ?? []) console.log(`  ${u}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
