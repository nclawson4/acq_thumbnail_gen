import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";

const SYSTEM_DEPS = ["python3", "python3-pip", "ffmpeg"];

export const maxDuration = 600;

export async function POST(request: Request) {
  const provided = request.headers.get("x-admin-secret");
  const expected = process.env.ADMIN_SNAPSHOT_SECRET ?? process.env.DEMO_PASSCODE;
  if (!provided || !expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 300_000,
  });

  try {
    await sandbox.runCommand("sh", [
      "-c",
      `sudo dnf clean all && sudo dnf install -y --skip-broken ${SYSTEM_DEPS.join(" ")}`,
    ]);
    await sandbox.runCommand("sh", [
      "-c",
      `python3 -m pip install --quiet --upgrade yt-dlp`,
    ]);
    const verify = await sandbox.runCommand("sh", [
      "-c",
      `which yt-dlp && yt-dlp --version && ffmpeg -version | head -1`,
    ]);
    const verifyOut = await verify.stdout();
    const snap = await sandbox.snapshot();
    return NextResponse.json({ snapshotId: snap.snapshotId, verify: verifyOut });
  } finally {
    await sandbox.stop();
  }
}
