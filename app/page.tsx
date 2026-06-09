import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PIPELINE_STEPS = [
  { name: "Ingest", body: "Pulls thumbnail + transcript from YouTube via Vercel Sandbox running yt-dlp." },
  { name: "Detect split", body: "Claude vision returns the pixel column splitting host from guest." },
  { name: "Crop halves", body: "Sharp crops left + right halves and saves each to Vercel Blob." },
  { name: "Quality check", body: "Claude rates each half. If poor, scrubs video frames and picks the best one." },
  { name: "Upscale", body: "Gemini Nano Banana upscales each half to 4K while preserving identity." },
  { name: "Pick quotes", body: "Claude reads the transcript and returns scored 2–6 word headline candidates." },
  { name: "Compose variants", body: "Generates 3 variants with text overlay, shading, accent color from your style preset." },
];

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <section className="flex flex-col items-start gap-6 max-w-3xl">
        <span className="text-xs font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
          AI media pipeline · Live demo
        </span>
        <h1 className="text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
          Production-grade thumbnails for two-host interview videos.
        </h1>
        <p className="text-lg text-[color:var(--muted-foreground)] leading-relaxed">
          Paste a YouTube URL. The pipeline crops the host and guest, upscales each with Gemini,
          mines the transcript for an impactful headline, and composes three on-brand variants.
          Built as a Vercel-native agentic workflow with full observability and human-in-the-loop
          editing.
        </p>
        <div className="flex gap-3">
          <Link href="/generate">
            <Button size="lg">Try the demo</Button>
          </Link>
          <Link href="/styles">
            <Button size="lg" variant="outline">
              Build a style preset
            </Button>
          </Link>
        </div>
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Demo mode is passcode-gated and capped at ${process.env.DEMO_DAILY_SPEND_CAP_USD ?? "5"} / day.
          Bring your own keys for unlimited runs.
        </p>
      </section>

      <section className="mt-20">
        <h2 className="text-2xl font-semibold tracking-tight mb-6">
          The pipeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PIPELINE_STEPS.map((s, i) => (
            <Card key={s.name}>
              <CardTitle>
                <span className="text-[color:var(--muted-foreground)] mr-2">
                  0{i + 1}
                </span>
                {s.name}
              </CardTitle>
              <CardDescription className="mt-1">{s.body}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardTitle>Durable</CardTitle>
          <CardDescription className="mt-1">
            Every step runs in Vercel Workflow DevKit with automatic retry, caching, and crash recovery. Edit any intermediate artifact and re-run from that step.
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Observable</CardTitle>
          <CardDescription className="mt-1">
            Per-step cost, latency, and pass-rate logged to Postgres. Built-in dashboard tracks the daily spend cap and recent failures.
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Safe</CardTitle>
          <CardDescription className="mt-1">
            Vercel BotID, per-IP rate limit, daily spend cap, and BYOK isolation keep the public demo from burning the operator&apos;s budget.
          </CardDescription>
        </Card>
      </section>
    </div>
  );
}
