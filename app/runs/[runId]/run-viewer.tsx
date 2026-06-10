"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

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

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        const res = await fetch(`/api/runs/${runId}`);
        if (res.ok) {
          const j = await res.json();
          setRun(j.run);
          if (j.run?.status === "done" || j.run?.status === "error") {
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

      {run?.error && (
        <Card>
          <CardTitle>Error</CardTitle>
          <CardDescription className="mt-1 text-red-600 dark:text-red-400">
            {run.error}
          </CardDescription>
        </Card>
      )}

      {variants.length > 0 && (
        <Card>
          <CardTitle>Final variants</CardTitle>
          <CardDescription>
            Pick the one you like best. Hover to inspect detail. Right-click to save.
          </CardDescription>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 pb-32 md:pb-0">
            {variants.map((v) => (
              <div key={v.id} className="space-y-2">
                <div className="relative aspect-video">
                  <div className="absolute inset-0 rounded-md border border-[color:var(--border)] overflow-hidden transition-transform duration-200 ease-out origin-center hover:scale-[2.5] hover:z-50 hover:relative hover:shadow-2xl">
                    <Image
                      src={v.url}
                      alt={`Variant ${v.id}`}
                      width={1280}
                      height={720}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  </div>
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
    </div>
  );
}
