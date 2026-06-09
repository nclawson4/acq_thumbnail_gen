"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

type StylePreset = {
  id: string;
  name: string;
  description: string | null;
};

export function GenerateForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"demo" | "byok">("demo");
  const [passcode, setPasscode] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [hostSide, setHostSide] = useState<"left" | "right">("right");
  const [styleId, setStyleId] = useState<string>("");
  const [useGemini, setUseGemini] = useState(false);
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/styles/list")
      .then((r) => r.json())
      .then((data) => setPresets(data.presets ?? []))
      .catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("byok");
    if (saved) {
      try {
        const j = JSON.parse(saved);
        if (j.geminiApiKey) setGeminiKey(j.geminiApiKey);
        if (j.anthropicApiKey) setAnthropicKey(j.anthropicApiKey);
      } catch {}
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "byok") {
        sessionStorage.setItem(
          "byok",
          JSON.stringify({
            geminiApiKey: geminiKey,
            anthropicApiKey: anthropicKey,
          }),
        );
      }
      const res = await fetch("/api/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          passcode: mode === "demo" ? passcode : undefined,
          keys:
            mode === "byok"
              ? { geminiApiKey: geminiKey, anthropicApiKey: anthropicKey }
              : undefined,
          videoUrl,
          styleId: styleId || null,
          hostSide,
          useGeminiCompose: useGemini,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Request failed");
      }
      router.push(`/runs/${json.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardTitle>Access mode</CardTitle>
        <CardDescription>
          Demo mode uses operator-funded keys behind a passcode and a daily spend cap.
          BYOK uses your own keys directly.
        </CardDescription>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant={mode === "demo" ? "primary" : "outline"}
            onClick={() => setMode("demo")}
            size="sm"
          >
            Demo (passcode)
          </Button>
          <Button
            type="button"
            variant={mode === "byok" ? "primary" : "outline"}
            onClick={() => setMode("byok")}
            size="sm"
          >
            Bring your own keys
          </Button>
        </div>
        {mode === "demo" ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor="passcode">Passcode</Label>
            <Input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter the passcode shared with you"
              required
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="gem">Gemini API key</Label>
              <Input
                id="gem"
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIza..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ant">Anthropic API key</Label>
              <Input
                id="ant"
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                required
              />
            </div>
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Keys are kept in your browser session only — never persisted server-side.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Video</CardTitle>
        <CardDescription>YouTube URL of the source video.</CardDescription>
        <div className="mt-4 space-y-2">
          <Label htmlFor="url">YouTube URL</Label>
          <Input
            id="url"
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            required
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Host position</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={hostSide === "left" ? "primary" : "outline"}
                onClick={() => setHostSide("left")}
              >
                Left
              </Button>
              <Button
                type="button"
                size="sm"
                variant={hostSide === "right" ? "primary" : "outline"}
                onClick={() => setHostSide("right")}
              >
                Right
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="style">Style preset</Label>
            <select
              id="style"
              className="h-10 w-full rounded-md border border-[color:var(--border)] bg-background px-3 text-sm"
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
            >
              <option value="">Default — Two-host Interview</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useGemini}
            onChange={(e) => setUseGemini(e.target.checked)}
          />
          Use Gemini to compose the final image (slower, costlier, often higher-quality blending)
        </label>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? "Starting..." : "Generate thumbnails"}
      </Button>
    </form>
  );
}
