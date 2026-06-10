/**
 * Run every URL in evals/batch.json through the deployed API, skipping
 * already-done URLs based on a DB pre-check. Submits at <10 req/60s to
 * respect the rate limiter, then polls until every workflow finishes.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/run-all-with-cache.ts
 */
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const BATCH_FILE = path.join(process.cwd(), "evals", "batch.json");
const BASE_URL = "https://acqthumbnailgen.vercel.app";
const SUBMIT_INTERVAL_MS = 7000; // 10/60s = stay safely under
const POLL_INTERVAL_MS = 15000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

function youtubeIdFromUrl(url: string): string | null {
  const m = url.match(/[?&]v=([^&]+)/);
  return m ? m[1]! : null;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!dbUrl || !geminiApiKey || !anthropicApiKey) {
    throw new Error("DATABASE_URL, GEMINI_API_KEY, ANTHROPIC_API_KEY required");
  }
  const sql = neon(dbUrl);

  const urls: string[] = JSON.parse(fs.readFileSync(BATCH_FILE, "utf-8"));
  console.log(`Loaded ${urls.length} URLs from batch.json`);

  // Pre-check DB for already-done youtube_ids under the canonical config
  // (host_side='right', style_id=null) so we don't waste rate-limit budget.
  const doneRows = (await sql`
    SELECT DISTINCT youtube_id
    FROM runs
    WHERE status = 'done'
      AND host_side = 'right'
      AND style_id IS NULL
      AND final_urls IS NOT NULL
      AND jsonb_array_length(final_urls) = 3
  `) as Array<{ youtube_id: string }>;
  const doneSet = new Set(doneRows.map((r) => r.youtube_id));
  console.log(`Already-done youtube_ids: ${doneSet.size}`);

  const todo: Array<{ url: string; youtubeId: string }> = [];
  const skipped: string[] = [];
  for (const url of urls) {
    const id = youtubeIdFromUrl(url);
    if (!id) {
      console.warn(`Skipping unparseable URL: ${url}`);
      continue;
    }
    if (doneSet.has(id)) skipped.push(id);
    else todo.push({ url, youtubeId: id });
  }
  console.log(`Skipping ${skipped.length} already done. Submitting ${todo.length}.`);

  // Submit at safe pace
  const submitted: Array<{
    youtubeId: string;
    runId: string;
    cached: boolean;
  }> = [];
  const failed: Array<{ youtubeId: string; error: string }> = [];
  for (let i = 0; i < todo.length; i++) {
    const { url, youtubeId } = todo[i]!;
    const res = await fetch(`${BASE_URL}/api/runs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "byok",
        keys: { geminiApiKey, anthropicApiKey },
        videoUrl: url,
        hostSide: "right",
        styleId: null,
      }),
    });
    const j = (await res.json()) as { runId?: string; cached?: boolean; error?: string };
    if (!res.ok || !j.runId) {
      const msg = j.error ?? `HTTP ${res.status}`;
      console.log(`✗ [${i + 1}/${todo.length}] ${youtubeId}: ${msg}`);
      failed.push({ youtubeId, error: msg });
    } else {
      const tag = j.cached ? "CACHED" : "queued";
      console.log(`✓ [${i + 1}/${todo.length}] ${youtubeId} -> ${j.runId} (${tag})`);
      submitted.push({ youtubeId, runId: j.runId, cached: !!j.cached });
    }
    if (i < todo.length - 1) {
      await new Promise((r) => setTimeout(r, SUBMIT_INTERVAL_MS));
    }
  }
  console.log(
    `\nSubmitted ${submitted.length}, failed ${failed.length}. Polling for completion...`,
  );

  // Poll DB for each non-cached run
  const pending = submitted.filter((s) => !s.cached).map((s) => s.runId);
  const startedAt = Date.now();
  const completed = new Map<string, "done" | "error">();
  while (pending.length > 0 && Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const rows = (await sql`
      SELECT id, status FROM runs WHERE id = ANY(${pending}::text[])
    `) as Array<{ id: string; status: string }>;
    for (const r of rows) {
      if (r.status === "done" || r.status === "error") {
        if (!completed.has(r.id)) {
          completed.set(r.id, r.status as "done" | "error");
          const submittedEntry = submitted.find((s) => s.runId === r.id);
          console.log(`  ${r.status === "done" ? "✓" : "✗"} ${submittedEntry?.youtubeId} (${r.status})`);
        }
      }
    }
    const remaining = pending.filter((id) => !completed.has(id));
    if (remaining.length === 0) break;
    console.log(`  ...waiting on ${remaining.length} runs`);
    pending.length = 0;
    pending.push(...remaining);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Final report — pull all final_urls for the runs we submitted
  const allRunIds = submitted.map((s) => s.runId);
  const finalRows = allRunIds.length
    ? ((await sql`
        SELECT id, youtube_id, video_title, status, final_urls
        FROM runs
        WHERE id = ANY(${allRunIds}::text[])
      `) as Array<{
        id: string;
        youtube_id: string;
        video_title: string | null;
        status: string;
        final_urls: string[] | null;
      }>)
    : [];

  const outDir = path.join(process.cwd(), "evals", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `batch-cache-${Date.now()}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        submitted,
        failed,
        finalRows,
        skipped,
      },
      null,
      2,
    ),
  );

  console.log(`\n=== SUMMARY ===`);
  console.log(`Skipped (cached pre-filter): ${skipped.length}`);
  console.log(`Cache-hit at API:            ${submitted.filter((s) => s.cached).length}`);
  console.log(`Workflow runs completed:     ${finalRows.filter((r) => r.status === "done").length}`);
  console.log(`Errors:                      ${finalRows.filter((r) => r.status === "error").length + failed.length}`);
  console.log(`Saved details to: ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
