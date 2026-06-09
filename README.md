# Thumbnail Studio

**AI-powered YouTube thumbnail generator for two-host interview videos.**

🌐 **Live demo:** [https://acq-thumbnail-gen.vercel.app](https://acq-thumbnail-gen.vercel.app) *(passcode-gated; contact the operator)*

> Paste a YouTube URL. The pipeline crops the host and guest, upscales each with Gemini, mines the transcript for an impactful 2–6 word headline, and composes three on-brand thumbnail variants — all in one durable agentic workflow.

This project is open-source on GitHub and deployable to Vercel in one click.

---

## What it demonstrates

- **Durable multi-step agentic workflow** — Vercel Workflow DevKit orchestrates a 9-step pipeline with automatic retry, caching, and crash recovery. Edit any intermediate artifact and re-run from that step.
- **Generative media pipeline** — Gemini Nano Banana (Gemini 3 Pro Image Preview) for upscale + compose; Claude Sonnet 4.5 vision for crop detection, quality rating, and quote selection.
- **Sandboxed ingest** — Vercel Sandbox runs `yt-dlp` and `ffmpeg` in an ephemeral Firecracker microVM per job.
- **Production guardrails** — Vercel BotID, per-IP rate limit, daily spend cap, BYOK isolation, cost logging to Postgres.
- **Human-in-the-loop UI** — non-technical visitors can run the pipeline, intervene at any step, and download the chosen variant.
- **Built-in evaluation harness** — manifest-driven checks + dashboard tracking pass rate, cost per step, and recent failures.

## Architecture

```
Next.js 16 App Router
├─ Workflow DevKit            durable multi-step orchestration
├─ Vercel Sandbox             yt-dlp + ffmpeg per job
├─ Anthropic Claude Sonnet    vision (crop, quality, style) + text (quotes)
├─ Google Gemini 3 Pro Image  upscale + compose
├─ Vercel Blob                artifacts (public + private)
├─ Neon Postgres              runs, presets, cost log, evals
└─ Upstash Redis              rate limit + daily spend counter
```

### Pipeline

| # | Step              | Tech                                  |
|---|-------------------|---------------------------------------|
| 1 | Fetch thumbnail   | yt-dlp in Vercel Sandbox              |
| 2 | Fetch transcript  | yt-dlp auto-subs in Vercel Sandbox    |
| 3 | Detect crop       | Claude vision returns `splitX` pixel  |
| 4 | Crop halves       | Sharp; both halves to Blob            |
| 5 | Quality check     | Claude rates each; scrubs frames if poor |
| 6 | Upscale halves    | Gemini Nano Banana → 4K               |
| 7 | Pick quotes       | Claude reads transcript → scored list |
| 8 | Compose variants  | 3 final 1280×720 thumbnails           |
| 9 | Finalize          | Sharp normalize + persist             |

## Run it locally

### Prereqs

- Node.js 22+
- A Vercel account (free)
- Gemini, Anthropic, and (optional) Fal API keys

### Setup

```bash
git clone https://github.com/nclawson4/acq_thumbnail_gen
cd acq_thumbnail_gen
npm install
cp .env.example .env.local
# Fill in keys in .env.local

# Link to Vercel + provision storage
vercel link
vercel integration add neon         # Provisions DATABASE_URL
vercel integration add upstash      # Provisions UPSTASH_REDIS_REST_*
vercel env pull .env.local --yes

# Push schema and seed default style preset
npm run db:push
npm run seed:style

# Optional: bake the yt-dlp sandbox snapshot for fast cold starts
npm run sandbox:snapshot
# Copy the printed snapshot id into INGEST_SANDBOX_SNAPSHOT_ID

npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### Run a batch through the deployed API

```bash
BASE_URL=https://your-app.vercel.app DEMO_PASSCODE=... npm run batch:run
```

## Deploy

```bash
vercel deploy --prod
```

The Vercel project picks up `next.config.ts` automatically. Make sure these env vars are present in **Production**: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `DEMO_PASSCODE`, `INGEST_SANDBOX_SNAPSHOT_ID`, plus the Marketplace-provisioned `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `BLOB_READ_WRITE_TOKEN`.

## Access modes

| Mode | How it works |
|------|--------------|
| **Demo** | Passcode-gated. Uses operator's keys. Hard daily spend cap. |
| **BYOK** | Visitor pastes their own Gemini + Anthropic keys. Keys live in `sessionStorage` only and are sent per-request. No persistence. No spend cap. |

## Repository layout

```
app/                Next.js App Router pages + API routes
  api/runs/start    Kicks off generate-thumbnail workflow
  api/styles/...    List + extract style presets
  api/dashboard     Aggregate cost + recent runs
  generate/         Interactive form
  runs/[runId]/     Live progress + variant picker
  styles/           Style preset builder
  dashboard/        Cost dashboard
workflows/          Durable Workflow DevKit pipelines
  steps/            Individual "use step" units
lib/
  ai/               Claude + Gemini wrappers
  sandbox/          Vercel Sandbox runners (yt-dlp, ffmpeg)
  image/            Sharp helpers (crop, compose, overlay)
  db/               Drizzle schema + lazy client
  auth.ts           Passcode + BYOK validation
  rate-limit.ts     Upstash sliding window
  cost.ts           Daily spend cap + cost log
  style.ts          Style guide schema
components/ui/      Tailwind UI primitives
scripts/            CLI helpers (sandbox snapshot, seed, batch)
evals/              Batch input + check manifest
```

## License

MIT. See LICENSE.
