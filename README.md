# Thumbnail Studio

A generative pipeline that turns a YouTube URL into three production thumbnails in about 90 seconds, for $0.10 per video.

[Live demo](https://acq-thumbnails.vercel.app) · [Repo](https://github.com/nclawson4/acq_thumbnail_gen)

| Before | After |
|--------|-------|
| ![Original YouTube thumbnail](https://i.ytimg.com/vi/gOG7zvp2ub0/maxresdefault.jpg) | ![Generated thumbnail](https://waegwoxdckgi9exy.public.blob.vercel-storage.com/runs/2f639e23-002a-40c7-9555-0995b95f89e4/final/a.png) |

The left image is the YouTube default frame from a workshop video. The right image is what this pipeline produces from the same URL.

### Why this matters

Every video on the [MoreMozi](https://www.youtube.com/@MoreMozi) channel currently ships without a studio-quality thumbnail because the videos are published [autonomously](https://www.youtube.com/watch?v=NvOvFB4wmXQ). The pipeline behind that channel is set up to publish 20+ pieces of content per day, but thumbnails have not been automated. This project closes that gap: same URL in, production-grade thumbnails out, at a cost the autonomous publishing budget can absorb without thinking about it.

## The number that matters

A human editor producing one thumbnail at typical freelance rates runs $10 to $20. This pipeline does it for $0.10 in API cost. That is at least a 100x reduction at studio scale.

Per-video cost breakdown:

| Step | Provider | Cost |
|------|----------|------|
| Two image upscales | Gemini 3 Pro Image Preview at $0.04 per image | $0.08 |
| Vision calls (crop, quality, verify) | Claude Haiku 4.5 | ~$0.01 |
| Quote selection from transcript | Claude Haiku 4.5 | ~$0.01 |
| Sandbox compute (yt-dlp + ffmpeg) | Vercel Sandbox | <$0.005 |
| Blob storage of intermediates | Vercel Blob | <$0.005 |
| **Total** | | **~$0.10** |

End-to-end latency is around 90 seconds. Four groups of work run concurrently to keep the wall-clock time down.

## Live demo

[https://acq-thumbnails.vercel.app](https://acq-thumbnails.vercel.app)

Paste any YouTube URL with two people on camera (interview, podcast, panel). Demo mode is open with passcode `demo2026` and a $5 daily spend cap shared across all visitors. BYOK mode lets you run on your own keys with no cap.

## How it works

The workflow takes a YouTube URL and emits three thumbnail variants. Each step is a durable unit of work, so a crash at any point resumes from the last completed step instead of replaying the full pipeline.

```
1. Fetch source thumbnail               YouTube CDN
2. Fetch transcript                     yt-dlp inside Vercel Sandbox
3. Detect split point                   Claude vision picks the X column to cut
4. Crop and verify each half            Sharp crop, then Claude re-checks face centering
5. Quality check both halves            Claude rates; falls back to frame scrubbing if poor
6. Upscale each half                    Gemini 3 Pro Image
7. Mine the transcript for a headline   Claude Haiku ranks candidate quotes
8. Compose three variants               Sharp side-by-side, text overlay, saturation, normalize
```

Steps 1 and 2 run in parallel, both only need the URL. Steps 3, 4, and 5 are sequential, each one needs the prior output. Steps 6 and 7 run in parallel, neither needs the other. The three final composites in step 8 are independent and render in parallel too.

## Architecture

```
Next.js 16 App Router        UI and API surface
Vercel Workflow DevKit       Durable step orchestration with retry and replay
Vercel Sandbox               Firecracker microVM for yt-dlp and ffmpeg
Vercel Blob                  Every intermediate artifact, addressable by runId
Neon Postgres                Run records, URL cache, cost ledger
Upstash Redis                Per-IP rate limit and the daily spend counter
Anthropic Claude             Vision (crop detection, framing verification, quality rating)
                             Text (transcript mining, quote ranking)
Google Gemini 3 Pro Image    Half upscales
Sharp + Resvg                Crop, compose, saturate, normalize, text overlay
```

A few choices worth calling out:

**Why a durable workflow instead of one long function call.** Mid-pipeline failures used to mean re-running the whole 90 seconds. Workflow DevKit persists state between steps so a Gemini timeout in step 6 resumes from the last good artifact instead of refetching the YouTube source.

**Why Sandbox for yt-dlp.** yt-dlp is a Python tool that updates often and runs untrusted code paths. Running it in a microVM means it never touches the function host filesystem and can be killed cleanly on timeout.

**Why every step writes to Blob.** Any intermediate (cropped halves, upscaled halves, quote shortlist) can be inspected after the fact. Made debugging the "head cut off" failure mode straightforward: pull the right-raw artifact, see that the source had already lost the head before the upscale, then fix the verifier.

**Why a URL cache in Postgres.** Same video, same parameters, same output. The cache returns immediately for any `(videoId, hostSide, styleId)` triple already processed. Cuts repeat submissions from 90 seconds to roughly 200 milliseconds.

## Production guardrails

Built to run as a public demo, so it has guards a hobby project would skip.

- **Per-day spend cap.** Every Gemini and Claude call goes through `recordCost`, which writes to a Postgres ledger and increments a Redis counter. When the counter exceeds the daily cap, new demo submissions return 402 with a clear message.
- **Rate limit.** Upstash sliding window limits per-IP submissions.
- **Bot defense.** Vercel BotID gates the submit endpoint.
- **BYOK isolation.** Visitor keys travel per-request and never persist. Demo mode is gated by passcode plus the spend counter.
- **Per-step cost recording.** The `cost_log` table records provider, model, step, token counts, and estimated USD for every paid call. Easy to spot expensive runs and tune.
- **Quality audit harness.** While building this I ran an internal `/audit` route that classified every generated thumbnail into A, B, or C tiers with a reason, then surfaced re-runs at the top so I could verify whether a fix actually improved the output. The route is gone now that the catalog is stable, but the pattern (a separate eval surface that mirrors production data) scales to any quality-driven pipeline.

## Run it locally

Prerequisites: Node 22+, a Vercel account, Gemini and Anthropic API keys.

```bash
git clone https://github.com/nclawson4/acq_thumbnail_gen
cd acq_thumbnail_gen
npm install
cp .env.example .env.local
# Add your keys to .env.local

# Provision storage and pull env
vercel link
vercel integration add neon
vercel integration add upstash
vercel env pull .env.local --yes

# Push schema and seed the default style preset
npm run db:push
npm run seed:style

# Optional: pre-bake the yt-dlp sandbox snapshot for faster cold starts
npm run sandbox:snapshot
# Copy the printed snapshot id into INGEST_SANDBOX_SNAPSHOT_ID

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste a URL.

## Deploy

```bash
vercel deploy --prod
```

Production needs `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `DEMO_PASSCODE`, `INGEST_SANDBOX_SNAPSHOT_ID`, plus marketplace-provisioned `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `BLOB_READ_WRITE_TOKEN`.

## Access modes

| Mode | Behavior |
|------|----------|
| `demo` | Passcode-gated. Uses the operator's API keys. Hard daily spend cap. |
| `byok` | Visitor pastes their own Gemini and Anthropic keys. Keys live in sessionStorage and travel per-request. No persistence, no spend cap. |

## Repository layout

```
app/
  page.tsx                  Homepage: carousel + paste-a-URL form + library grid
  runs/[runId]/             Per-run page with the three variants
  api/runs/start            Workflow kickoff with cost, rate-limit, and auth gating
  api/runs/[runId]          Run status plus an SSE stream of step events
  api/admin/...             Admin endpoint for baking the sandbox snapshot
workflows/
  generate-thumbnail.ts     The 8-step durable workflow
  steps/                    Individual "use step" units (ingest, vision, compose, persistence)
lib/
  ai/                       Claude and Gemini wrappers, prompt schemas
  sandbox/                  Vercel Sandbox runners (yt-dlp, ffmpeg)
  image/                    Sharp helpers (crop, compose, overlay, saturation)
  db/                       Drizzle schema and lazy client
  auth.ts                   Passcode and BYOK validation
  rate-limit.ts             Upstash sliding window
  cost.ts                   Daily spend cap and cost log
  style.ts                  Style guide schema
scripts/                    CLI helpers (sandbox snapshot, seed, batch run, per-video craft scripts)
evals/                      Batch input and check manifest
```

## Stack

Next.js 16, Vercel Workflow DevKit, Vercel Sandbox, Vercel Blob, Neon Postgres, Upstash Redis, Anthropic Claude (Sonnet 4.6, Haiku 4.5), Google Gemini 3 Pro Image, Sharp, Resvg, Drizzle, Zod.

## License

MIT.

## Author

Nick Clawson. Contact via [nclawson4@gmail.com](mailto:nclawson4@gmail.com).
