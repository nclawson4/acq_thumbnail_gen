/**
 * Re-run a fixed list of YouTube IDs through the deployed pipeline.
 * Uses BYOK so we don't consume the demo budget. Submits at a safe pace,
 * then polls the DB until every run finishes.
 *
 *   node --env-file=.env.local --import tsx scripts/rerun-six.ts
 */
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const IDS = [
  "I1NYJ8dm4Jk",
  "rd_urnkST6g",
  "oIvIf1Rv7vg",
  "LGbS0GOZBNE",
  "3t6sA6OmzHA",
  "0coMtm_i1UA",
];

const BASE_URL = "https://acq-thumbnails.vercel.app";
const SUBMIT_INTERVAL_MS = 7000;
const POLL_INTERVAL_MS = 15000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!dbUrl || !geminiApiKey || !anthropicApiKey) {
    throw new Error("DATABASE_URL, GEMINI_API_KEY, ANTHROPIC_API_KEY required");
  }
  const sql = neon(dbUrl);

  const submitted: Array<{ youtubeId: string; runId: string }> = [];
  const failed: Array<{ youtubeId: string; error: string }> = [];
  for (let i = 0; i < IDS.length; i++) {
    const youtubeId = IDS[i]!;
    const url = `https://www.youtube.com/watch?v=${youtubeId}`;
    const res = await fetch(`${BASE_URL}/api/runs/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "byok",
        keys: { geminiApiKey, anthropicApiKey },
        videoUrl: url,
        hostSide: "right",
        styleId: null,
        forceRerun: true,
      }),
    });
    const j = (await res.json()) as { runId?: string; error?: string };
    if (!res.ok || !j.runId) {
      const msg = j.error ?? `HTTP ${res.status}`;
      console.log(`✗ [${i + 1}/${IDS.length}] ${youtubeId}: ${msg}`);
      failed.push({ youtubeId, error: msg });
    } else {
      console.log(`✓ [${i + 1}/${IDS.length}] ${youtubeId} -> ${j.runId}`);
      submitted.push({ youtubeId, runId: j.runId });
    }
    if (i < IDS.length - 1) await new Promise((r) => setTimeout(r, SUBMIT_INTERVAL_MS));
  }

  console.log(`\nSubmitted ${submitted.length}, failed ${failed.length}. Polling…`);
  const pending = submitted.map((s) => s.runId);
  const completed = new Map<string, "done" | "error">();
  const startedAt = Date.now();
  while (pending.length > 0 && Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const rows = (await sql`
      SELECT id, status FROM runs WHERE id = ANY(${pending}::text[])
    `) as Array<{ id: string; status: string }>;
    for (const r of rows) {
      if (r.status === "done" || r.status === "error") {
        if (!completed.has(r.id)) {
          completed.set(r.id, r.status as "done" | "error");
          const e = submitted.find((s) => s.runId === r.id);
          console.log(`  ${r.status === "done" ? "✓" : "✗"} ${e?.youtubeId} (${r.status})`);
        }
      }
    }
    const remaining = pending.filter((id) => !completed.has(id));
    if (remaining.length === 0) break;
    console.log(`  …waiting on ${remaining.length} runs`);
    pending.length = 0;
    pending.push(...remaining);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

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
  const outFile = path.join(outDir, `rerun-six-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ submitted, failed, finalRows }, null, 2));

  console.log(`\n=== SUMMARY ===`);
  console.log(`Done:   ${finalRows.filter((r) => r.status === "done").length}`);
  console.log(`Errors: ${finalRows.filter((r) => r.status === "error").length + failed.length}`);
  console.log(`Saved:  ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
