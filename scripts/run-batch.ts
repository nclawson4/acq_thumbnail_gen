/**
 * Runs the configured batch of YouTube URLs through the live API.
 * Use against a deployed instance (set BASE_URL) or local dev server.
 *
 * Usage:
 *   BASE_URL=https://your-app.vercel.app DEMO_PASSCODE=... npm run batch:run
 *   BASE_URL=http://localhost:3000 DEMO_PASSCODE=demo2026 npm run batch:run
 */
import fs from "node:fs";
import path from "node:path";

const BATCH_FILE =
  process.env.BATCH_FILE ?? path.join(process.cwd(), "evals", "batch.json");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSCODE = process.env.DEMO_PASSCODE ?? "";

async function start(videoUrl: string) {
  const res = await fetch(`${BASE_URL}/api/runs/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "demo",
      passcode: PASSCODE,
      videoUrl,
      hostSide: "right",
      styleId: "two-host-interview-default",
    }),
  });
  const j = await res.json();
  if (!res.ok) {
    return { videoUrl, ok: false, error: j.error ?? `HTTP ${res.status}` };
  }
  return { videoUrl, ok: true, runId: j.runId };
}

async function main() {
  if (!fs.existsSync(BATCH_FILE)) {
    console.error(`No batch file at ${BATCH_FILE}`);
    process.exit(1);
  }
  const batch: string[] = JSON.parse(fs.readFileSync(BATCH_FILE, "utf-8"));
  console.log(`Starting ${batch.length} runs against ${BASE_URL}...`);
  const results: Array<{
    videoUrl: string;
    ok: boolean;
    runId?: string;
    error?: string;
  }> = [];
  for (const url of batch) {
    const r = await start(url);
    results.push(r);
    console.log(r.ok ? `✓ ${url} -> ${r.runId}` : `✗ ${url}: ${r.error}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const outFile = path.join(process.cwd(), "evals", "results", `batch-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`Saved results to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
