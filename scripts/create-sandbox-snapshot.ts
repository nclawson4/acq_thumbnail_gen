import { Sandbox } from "@vercel/sandbox";

const SYSTEM_DEPS = ["python3", "python3-pip", "ffmpeg"];

async function main() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !teamId || !projectId) {
    throw new Error(
      "Set VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID before running.",
    );
  }

  console.log("Booting fresh sandbox to bake snapshot...");
  const sandbox = await Sandbox.create({
    token,
    teamId,
    projectId,
    runtime: "node24",
    timeout: 300_000,
  });

  try {
    console.log("Installing system deps...");
    await sandbox.runCommand("sh", [
      "-c",
      `sudo dnf clean all && sudo dnf install -y --skip-broken ${SYSTEM_DEPS.join(" ")}`,
    ]);
    console.log("Installing yt-dlp...");
    await sandbox.runCommand("sh", [
      "-c",
      `python3 -m pip install --quiet --upgrade yt-dlp`,
    ]);
    console.log("Verifying binaries...");
    await sandbox.runCommand("sh", [
      "-c",
      `which yt-dlp && yt-dlp --version && ffmpeg -version | head -1`,
    ]);

    console.log("Creating snapshot...");
    const snap = await sandbox.snapshot();
    console.log("\n✅ Snapshot created.");
    console.log(`Set INGEST_SANDBOX_SNAPSHOT_ID=${snap.snapshotId} in Vercel env.`);
  } finally {
    await sandbox.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
