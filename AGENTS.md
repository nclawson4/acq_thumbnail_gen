# Agent guidelines for this repo

This repo is a public-source AI thumbnail-generation pipeline. It is a portfolio demonstration of production-grade agentic workflows + generative media pipelines.

## Hard rules

1. **No secrets in commits.** API keys, passcodes, and tokens live in `.env.local` and Vercel project env. The `.env.example` file lists variable names only. Pre-commit hooks scan for accidental leaks.
2. **No branding leakage.** Do not name specific companies, hosts, or job descriptions in code, comments, README, or commit messages. Use generic language: "two-host interview", "host" / "guest", "podcast-style content".
3. **Workflow steps do I/O.** All file I/O, network calls, and library calls happen in `"use step"` functions. The `"use workflow"` orchestrator only sequences steps. See `node_modules/workflow/docs/foundations/` if unsure.
4. **Lazy-init external clients.** Anything that reads `process.env` at module load (Neon, AI SDK clients) must be wrapped in a getter — top-level instantiation breaks `next build` when env is missing.
5. **Cost-gate every paid call.** Every code path that hits Gemini, Claude, or Fal must check the demo passcode/BYOK header and the daily spend counter first. Log estimated cost to Postgres after the call.
6. **Artifact every step.** Every workflow step that produces an image, transcript, or text saves the artifact to Vercel Blob keyed by `runId/stepName/...`. The UI uses these for the "edit and re-run from step N" UX.

## Next.js notes

This repo uses Next.js 16 App Router. Several APIs renamed: `middleware.ts` is now `proxy.ts`, server actions use the `'use server'` directive, cache components require the `cacheComponents` config flag. Read `node_modules/next/dist/docs/` before assuming an API.

## Adding a new pipeline step

1. Add a `"use step"` async function in `workflows/steps/`.
2. Wire it into `workflows/generate-thumbnail.ts`.
3. Add an artifact path in `lib/blob.ts`.
4. Add an entry to the `Step` enum and the run-viewer UI.
5. Add an eval check in `evals/checks/`.

## Adding a new model or provider

Use the Vercel AI Gateway provider (`@ai-sdk/gateway`) rather than per-provider SDKs unless there's a specific need (e.g., Anthropic vision-specific features). Fetch current model IDs from `https://ai-gateway.vercel.sh/v1/models` — never hardcode model IDs from memory.
