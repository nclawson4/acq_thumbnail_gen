"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Preset = {
  id: string;
  name: string;
  description: string | null;
  isBuiltin: number;
  referenceUrls: string[];
};

export function StylesView() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [urls, setUrls] = useState("");
  const [mode, setMode] = useState<"demo" | "byok">("demo");
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/styles/list")
      .then((r) => r.json())
      .then((j) => setPresets(j.presets ?? []));
  }, []);

  async function refresh() {
    const r = await fetch("/api/styles/list");
    const j = await r.json();
    setPresets(j.presets ?? []);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const videoUrls = urls
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const byok = sessionStorage.getItem("byok");
      const keys = byok ? JSON.parse(byok) : undefined;
      const res = await fetch("/api/styles/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          passcode: mode === "demo" ? passcode : undefined,
          keys: mode === "byok" ? keys : undefined,
          name,
          description,
          videoUrls,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setMessage(`Started extraction for "${name}". Check back in a minute.`);
      setName("");
      setDescription("");
      setUrls("");
      setTimeout(refresh, 5000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardTitle>Create preset</CardTitle>
          <CardDescription>Reference thumbnails are fetched via yt-dlp.</CardDescription>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Mode</Label>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "demo" ? "primary" : "outline"}
                  onClick={() => setMode("demo")}
                >
                  Demo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "byok" ? "primary" : "outline"}
                  onClick={() => setMode("byok")}
                >
                  BYOK
                </Button>
              </div>
            </div>
            {mode === "demo" && (
              <div>
                <Label htmlFor="pc">Passcode</Label>
                <Input
                  id="pc"
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="desc">Description (optional)</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="urls">Reference YouTube URLs (one per line, 3-12)</Label>
              <Textarea
                id="urls"
                rows={6}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=..."
                required
              />
            </div>
            {message && <p className="text-sm">{message}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Starting..." : "Extract style"}
            </Button>
          </div>
        </Card>
      </form>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--muted-foreground)]">
          Existing presets
        </h2>
        {presets.length === 0 && (
          <p className="text-sm text-[color:var(--muted-foreground)]">
            None yet.
          </p>
        )}
        {presets.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <CardTitle>{p.name}</CardTitle>
              {p.isBuiltin ? <Badge tone="success">built-in</Badge> : null}
            </div>
            {p.description && (
              <CardDescription className="mt-1">{p.description}</CardDescription>
            )}
            <p className="text-xs text-[color:var(--muted-foreground)] mt-2">
              {p.referenceUrls.length} references
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
