import { Sandbox } from "@vercel/sandbox";

const YTDLP_INSTALL = `
set -e
sudo dnf install -y --skip-broken python3 python3-pip ffmpeg 2>&1 || sudo dnf install -y --skip-broken python3 python3-pip 2>&1
python3 -m pip install --quiet --upgrade yt-dlp
which yt-dlp || ls -la /usr/local/bin/yt-dlp || echo no-ytdlp
which ffmpeg || ls -la /usr/bin/ffmpeg || echo no-ffmpeg
`;

function sandboxCredentials() {
  const t = process.env.VERCEL_TOKEN;
  const team = process.env.VERCEL_TEAM_ID;
  const proj = process.env.VERCEL_PROJECT_ID;
  if (t && team && proj) return { token: t, teamId: team, projectId: proj };
  return {};
}

async function createSandbox(timeoutMs: number) {
  const snapshotId = process.env.INGEST_SANDBOX_SNAPSHOT_ID?.trim();
  const creds = sandboxCredentials();
  if (snapshotId) {
    return Sandbox.create({
      ...creds,
      source: { type: "snapshot", snapshotId },
      timeout: timeoutMs,
    });
  }
  const sandbox = await Sandbox.create({
    ...creds,
    runtime: "node24",
    timeout: timeoutMs,
  });
  await sandbox.runCommand("sh", ["-c", YTDLP_INSTALL]);
  return sandbox;
}

import { youtubeIdFromUrl } from "@/lib/utils";

export async function fetchThumbnailBuffer(
  videoUrl: string,
): Promise<{ buffer: Buffer; title: string }> {
  const id = youtubeIdFromUrl(videoUrl);
  if (!id) throw new Error(`Invalid YouTube URL: ${videoUrl}`);

  const buffer = await fetchYoutubeThumbnail(id);
  if (buffer.length === 0) {
    throw new Error(`No thumbnail available for ${videoUrl}`);
  }
  const title = await fetchYoutubeTitle(videoUrl);
  return { buffer, title };
}

async function fetchYoutubeThumbnail(videoId: string): Promise<Buffer> {
  const candidates = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
  for (const url of candidates) {
    const res = await fetch(url);
    if (res.ok) {
      const arr = await res.arrayBuffer();
      if (arr.byteLength > 1024) return Buffer.from(arr);
    }
  }
  return Buffer.alloc(0);
}

async function fetchYoutubeTitle(videoUrl: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
    );
    if (!res.ok) return "";
    const json = (await res.json()) as { title?: string };
    return json.title ?? "";
  } catch {
    return "";
  }
}

export async function fetchTranscript(
  videoUrl: string,
): Promise<{ transcript: string; title: string; source: "subs" | "none" }> {
  const sandbox = await createSandbox(180_000);
  try {
    // videoUrl is passed as a direct argv entry — no shell interpolation,
    // so `; rm -rf /` or backtick payloads in the URL string can't escape.
    const ytdlp = await sandbox.runCommand("yt-dlp", [
      "--no-warnings",
      "--skip-download",
      "--print",
      "%(title)s",
      "--write-auto-subs",
      "--sub-lang",
      "en",
      "--sub-format",
      "vtt",
      "-o",
      "/tmp/sub.%(ext)s",
      videoUrl,
    ]);
    const title = (await ytdlp.stdout()).trim();
    // Path is a hardcoded literal; sh -c here has no untrusted input.
    const catCmd = await sandbox.runCommand("sh", [
      "-c",
      "cat /tmp/sub.en.vtt 2>/dev/null || true",
    ]);
    const vtt = await catCmd.stdout();
    if (!vtt.includes("-->")) {
      return { transcript: "", title, source: "none" };
    }
    const transcript = vttToText(vtt);
    return { transcript, title, source: "subs" };
  } finally {
    await sandbox.stop();
  }
}

export async function scrubFrames(
  videoUrl: string,
  count: number,
): Promise<Buffer[]> {
  const sandbox = await createSandbox(300_000);
  try {
    // videoUrl is passed as a direct argv entry — no shell, no injection.
    await sandbox.runCommand("yt-dlp", [
      "--no-warnings",
      "-f",
      "best[height<=720]",
      "-o",
      "/tmp/video.mp4",
      videoUrl,
    ]);
    const check = await sandbox.runCommand("sh", [
      "-c",
      `stat -c %s /tmp/video.mp4 2>/dev/null || echo 0`,
    ]);
    const size = Number((await check.stdout()).trim()) || 0;
    if (size < 100_000) {
      throw new Error(
        `yt-dlp failed to download video (got ${size} bytes) — likely YouTube bot wall`,
      );
    }
    const meta = await sandbox.runCommand("sh", [
      "-c",
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 /tmp/video.mp4`,
    ]);
    const durStr = (await meta.stdout()).trim();
    const duration = Number(durStr) || 60;
    const buffers: Buffer[] = [];
    for (let i = 0; i < count; i++) {
      const t = ((i + 1) / (count + 1)) * duration;
      const frameOut = `/tmp/frame-${i}.jpg`;
      await sandbox.runCommand("sh", [
        "-c",
        `ffmpeg -y -ss ${t.toFixed(2)} -i /tmp/video.mp4 -vframes 1 -q:v 3 ${frameOut} 2>/dev/null`,
      ]);
      const b64 = await sandbox.runCommand("base64", ["-w", "0", frameOut]);
      const buf = Buffer.from((await b64.stdout()).trim(), "base64");
      if (buf.length === 0) {
        throw new Error(`ffmpeg produced empty frame ${i}`);
      }
      buffers.push(buf);
    }
    return buffers;
  } finally {
    await sandbox.stop();
  }
}

function vttToText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  let lastLine = "";
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.includes("-->")) continue;
    if (/^WEBVTT/i.test(line)) continue;
    if (/^Kind:|^Language:|^NOTE/i.test(line)) continue;
    const cleaned = line
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    if (!cleaned) continue;
    if (cleaned === lastLine) continue;
    out.push(cleaned);
    lastLine = cleaned;
  }
  return out.join(" ");
}
