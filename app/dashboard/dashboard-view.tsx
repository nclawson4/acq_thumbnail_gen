"use client";

import { useEffect, useState } from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Run = {
  id: string;
  youtubeUrl: string;
  videoTitle: string | null;
  status: string;
  createdAt: string;
};
type CostByMode = { mode: string; total: number; count: number };
type CostByStep = { step: string; total: number; count: number };

type DashboardData = {
  recentRuns: Run[];
  costByMode: CostByMode[];
  costByStep: CostByStep[];
  todayDemoSpend: number;
  dailyCap: number;
};

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p>Loading...</p>;

  const pct = Math.min(
    100,
    Math.round((data.todayDemoSpend / Math.max(data.dailyCap, 0.001)) * 100),
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardTitle>Today&apos;s demo spend</CardTitle>
          <p className="mt-2 text-3xl font-semibold">
            ${data.todayDemoSpend.toFixed(2)}
          </p>
          <CardDescription className="mt-1">
            of ${data.dailyCap.toFixed(2)} daily cap
          </CardDescription>
          <div className="mt-3 h-2 w-full rounded-full bg-[color:var(--muted)] overflow-hidden">
            <div
              className="h-full bg-foreground"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>
        {data.costByMode.map((m) => (
          <Card key={m.mode}>
            <CardTitle className="capitalize">{m.mode} mode</CardTitle>
            <p className="mt-2 text-3xl font-semibold">
              ${m.total.toFixed(2)}
            </p>
            <CardDescription className="mt-1">
              {m.count} model calls (lifetime)
            </CardDescription>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle>Cost by step</CardTitle>
        <CardDescription>
          Where the tokens (and dollars) go across all runs.
        </CardDescription>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-[color:var(--muted-foreground)] text-xs uppercase tracking-wider">
              <th className="py-2">Step</th>
              <th className="py-2">Calls</th>
              <th className="py-2 text-right">Total USD</th>
            </tr>
          </thead>
          <tbody>
            {data.costByStep.map((s) => (
              <tr
                key={s.step}
                className="border-t border-[color:var(--border)]"
              >
                <td className="py-2 font-mono">{s.step}</td>
                <td className="py-2">{s.count}</td>
                <td className="py-2 text-right">${s.total.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardTitle>Recent runs</CardTitle>
        <div className="mt-3 space-y-2">
          {data.recentRuns.map((r) => (
            <a
              key={r.id}
              href={`/runs/${r.id}`}
              className="flex items-center justify-between rounded-md border border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--muted)]"
            >
              <span className="truncate text-sm">
                {r.videoTitle ?? r.youtubeUrl}
              </span>
              <Badge tone={r.status === "done" ? "success" : r.status === "error" ? "error" : "default"}>
                {r.status}
              </Badge>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
