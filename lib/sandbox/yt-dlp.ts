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
  const snapshotId = process.env.INGEST_SANDBOX_SNAPSHOT_ID;
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

export async function fetchThumbnailBuffer(
  videoUrl: string,
): Promise<{ buffer: Buffer; title: string }> {
  const sandbox = await createSandbox(120_000);
  try {
    const out = "/tmp/thumb.jpg";
    const cmd = await sandbox.runCommand("sh", [
      "-c",
      `yt-dlp --no-warnings --skip-download --print "%(title)s" --write-thumbnail --convert-thumbnails jpg -o "/tmp/thumb.%(ext)s" "${videoUrl}" && cp /tmp/thumb.jpg ${out}`,
    ]);
    const title = (await cmd.stdout()).trim();
    const b64 = await sandbox.runCommand("base64", ["-w", "0", out]);
    const buffer = Buffer.from((await b64.stdout()).trim(), "base64");
    return { buffer, title };
  } finally {
    await sandbox.stop();
  }
}

export async function fetchTranscript(
  videoUrl: string,
): Promise<{ transcript: string; title: string; source: "subs" | "none" }> {
  const sandbox = await createSandbox(180_000);
  try {
    const cmd = await sandbox.runCommand("sh", [
      "-c",
      `yt-dlp --no-warnings --skip-download --print "%(title)s" --write-auto-subs --sub-lang en --sub-format vtt -o "/tmp/sub.%(ext)s" "${videoUrl}" 2>/dev/null && cat /tmp/sub.en.vtt 2>/dev/null || true`,
    ]);
    const output = await cmd.stdout();
    const lines = output.split("\n");
    const title = lines[0]?.trim() ?? "";
    const vtt = lines.slice(1).join("\n");
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
    await sandbox.runCommand("sh", [
      "-c",
      `yt-dlp --no-warnings -f "best[height<=720]" -o /tmp/video.mp4 "${videoUrl}"`,
    ]);
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
      buffers.push(Buffer.from((await b64.stdout()).trim(), "base64"));
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
