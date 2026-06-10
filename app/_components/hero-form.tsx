"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ESTIMATED_RUN_MS = 95_000;

export function HeroForm() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusLine, setStatusLine] = useState<string>("");
  const [runId, setRunId] = useState<string | null>(null);
  const startedAtRef = useRef<number>(0);

  // Drive the progress bar by wall-clock time while submitting
  useEffect(() => {
    if (!submitting) return;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      const elapsed = Date.now() - startedAtRef.current;
      const pct = Math.min(98, (elapsed / ESTIMATED_RUN_MS) * 100);
      setProgress(pct);
      requestAnimationFrame(tick);
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, [submitting]);

  // Poll the run after submission until done
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        try {
          const r = await fetch(`/api/runs/${runId}`);
          if (r.ok) {
            const j = await r.json();
            const s = j.run?.status as string | undefined;
            const step = j.run?.currentStep as string | undefined;
            if (step) setStatusLine(step.replace(/_/g, " "));
            if (s === "done") {
              setProgress(100);
              setTimeout(() => router.push(`/runs/${runId}`), 500);
              return;
            }
            if (s === "error") {
              setError(j.run?.error ?? "Run failed");
              setSubmitting(false);
              return;
            }
          }
        } catch {}
        await new Promise((res) => setTimeout(res, 2000));
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [runId, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    setProgress(0);
    setStatusLine("starting");
    startedAtRef.current = Date.now();
    try {
      const res = await fetch("/api/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "demo",
          passcode,
          videoUrl,
          hostSide: "right",
          styleId: null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Request failed");
      }
      if (json.cached) {
        setProgress(100);
        setStatusLine("served from cache");
        setTimeout(() => router.push(`/runs/${json.runId}`), 400);
        return;
      }
      setRunId(json.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  }

  const remainingSec = Math.max(
    0,
    Math.ceil((ESTIMATED_RUN_MS - (progress / 100) * ESTIMATED_RUN_MS) / 1000),
  );

  return (
    <form onSubmit={onSubmit} className="w-full max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          required
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="Paste a YouTube URL"
          disabled={submitting}
          className="flex-1 h-12 rounded-lg border border-[color:var(--border)] bg-background px-4 text-[15px] outline-none focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-60"
        />
        <input
          type="password"
          required
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          disabled={submitting}
          className="h-12 w-full sm:w-44 rounded-lg border border-[color:var(--border)] bg-background px-4 text-[15px] outline-none focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting}
          className="h-12 px-6 rounded-lg bg-foreground text-background font-medium text-[15px] hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {submitting ? "Generating..." : "Generate"}
        </button>
      </div>

      {submitting && (
        <div className="mt-4 space-y-1.5">
          <div className="h-2 w-full rounded-full bg-[color:var(--muted)] overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-200 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-[color:var(--muted-foreground)]">
            <span className="font-mono">
              {statusLine || "queued"}
              {runId && ` · run ${runId.slice(0, 8)}`}
            </span>
            <span className="font-mono">
              ~{remainingSec}s remaining
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </form>
  );
}
