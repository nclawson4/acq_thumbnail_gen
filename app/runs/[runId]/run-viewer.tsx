"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type StepEvent = {
  type: "step" | "error" | "done";
  step?: string;
  status?: "started" | "completed";
  data?: unknown;
  message?: string;
  variants?: { id: string; url: string; quote: string; score: number }[];
};

type RunRow = {
  id: string;
  status: string;
  currentStep: string | null;
  videoTitle: string | null;
  youtubeUrl: string;
  finalUrls: string[] | null;
  error: string | null;
};

export function RunViewer({ runId }: { runId: string }) {
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [run, setRun] = useState<RunRow | null>(null);
  const [streaming, setStreaming] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        const res = await fetch(`/api/runs/${runId}`);
        if (res.ok) {
          const j = await res.json();
          setRun(j.run);
          if (j.run?.status === "done" || j.run?.status === "error") {
            setStreaming(false);
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    async function consume() {
      const res = await fetch(`/api/runs/${runId}/stream`);
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const evt = JSON.parse(line) as StepEvent;
            setEvents((e) => [...e, evt]);
          } catch {}
        }
      }
    }
    consume();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const variants =
    events.find((e) => e.type === "done")?.variants ??
    (run?.finalUrls?.map((url, i) => ({
      id: String.fromCharCode(97 + i),
      url,
      quote: "",
      score: 0,
    })) ??
      []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
      <div className="space-y-6">
        {run?.videoTitle && (
          <Card>
            <CardTitle>{run.videoTitle}</CardTitle>
            <CardDescription className="mt-1">
              <a
                href={run.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {run.youtubeUrl}
              </a>
            </CardDescription>
          </Card>
        )}

        {variants.length > 0 && (
          <Card>
            <CardTitle>Final variants</CardTitle>
            <CardDescription>
              Pick the one you like best. Right-click to save.
            </CardDescription>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {variants.map((v) => (
                <div key={v.id} className="space-y-2">
                  <div className="relative aspect-video overflow-hidden rounded-md border border-[color:var(--border)]">
                    <Image
                      src={v.url}
                      alt={`Variant ${v.id}`}
                      width={1280}
                      height={720}
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  {v.quote && (
                    <p className="text-xs font-mono text-[color:var(--muted-foreground)]">
                      &ldquo;{v.quote}&rdquo;
                    </p>
                  )}
                  <a
                    href={v.url}
                    download={`thumbnail-${v.id}.png`}
                    className="text-xs underline"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardTitle>Step log</CardTitle>
          <div className="mt-4 space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
            {events.length === 0 && streaming && (
              <p className="text-[color:var(--muted-foreground)]">
                Waiting for first event...
              </p>
            )}
            {events.map((e, i) => (
              <div
                key={i}
                className="border-b border-[color:var(--border)] pb-2 last:border-0"
              >
                {e.type === "step" && (
                  <div className="flex items-center gap-2">
                    <Badge tone={e.status === "completed" ? "success" : "muted"}>
                      {e.status}
                    </Badge>
                    <span className="font-semibold">{e.step}</span>
                  </div>
                )}
                {e.type === "error" && (
                  <div className="flex items-center gap-2">
                    <Badge tone="error">error</Badge>
                    <span>{e.message}</span>
                  </div>
                )}
                {e.type === "done" && (
                  <div className="flex items-center gap-2">
                    <Badge tone="success">done</Badge>
                    <span>Run complete.</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardTitle>Status</CardTitle>
          <div className="mt-2 space-y-2 text-sm">
            <div>
              State: <Badge tone={statusTone(run?.status)}>{run?.status ?? "..."}</Badge>
            </div>
            {run?.currentStep && (
              <div className="text-[color:var(--muted-foreground)]">
                Step: <span className="font-mono">{run.currentStep}</span>
              </div>
            )}
            {run?.error && (
              <div className="text-red-600 dark:text-red-400">{run.error}</div>
            )}
          </div>
        </Card>
        <Card>
          <CardTitle>What&apos;s happening</CardTitle>
          <CardDescription className="mt-1">
            The workflow fetches the thumbnail and transcript via Vercel Sandbox running
            yt-dlp, then Claude detects the crop point and Gemini upscales each half. Quotes are
            mined from the transcript, and three styled variants are composed.
          </CardDescription>
        </Card>
      </aside>
    </div>
  );
}

function statusTone(s: string | null | undefined) {
  if (s === "done") return "success" as const;
  if (s === "error") return "error" as const;
  return "default" as const;
}
