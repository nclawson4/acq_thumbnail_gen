"use client";

import Image from "next/image";
import { useState } from "react";

type Pair = {
  videoId: string;
  title: string | null;
  oldUrl: string;
  newUrl: string;
};

const INITIAL_LIMIT = 12;

export function BeforeAfterGrid({ pairs }: { pairs: Pair[] }) {
  const [expanded, setExpanded] = useState(false);
  if (pairs.length === 0) return null;
  const visiblePairs = expanded ? pairs : pairs.slice(0, INITIAL_LIMIT);

  return (
    <section className="mt-24">
      <div className="flex items-end justify-between mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Library</h2>
        <span className="text-sm text-[color:var(--muted-foreground)]">
          {pairs.length} processed
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {visiblePairs.map((p) => (
          <PairRow key={p.videoId} pair={p} />
        ))}
      </div>
      {pairs.length > INITIAL_LIMIT && !expanded && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="h-10 px-5 rounded-lg border border-[color:var(--border)] text-sm hover:bg-[color:var(--muted)] transition-colors"
          >
            Show all {pairs.length}
          </button>
        </div>
      )}
    </section>
  );
}

function PairRow({ pair }: { pair: Pair }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] p-3 bg-[color:var(--card)]">
      <div className="grid grid-cols-2 gap-3">
        <LabeledThumb
          src={`https://i.ytimg.com/vi/${pair.videoId}/mqdefault.jpg`}
          alt={`Original thumbnail for ${pair.title ?? pair.videoId}`}
          label="Before"
          labelTone="muted"
        />
        <LabeledThumb
          src={pair.newUrl}
          alt={`Generated thumbnail for ${pair.title ?? pair.videoId}`}
          label="After"
          labelTone="accent"
        />
      </div>
      <div className="mt-3 px-1 flex items-start justify-between gap-3">
        {pair.title ? (
          <div className="text-sm leading-snug line-clamp-2 text-[color:var(--foreground)] flex-1">
            {pair.title}
          </div>
        ) : (
          <div className="text-sm text-[color:var(--muted-foreground)] flex-1">
            Untitled
          </div>
        )}
        <a
          href={`https://www.youtube.com/watch?v=${pair.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-[color:var(--muted-foreground)] hover:text-foreground underline underline-offset-4"
        >
          Watch ↗
        </a>
      </div>
    </div>
  );
}

function LabeledThumb({
  src,
  alt,
  label,
  labelTone,
}: {
  src: string;
  alt: string;
  label: string;
  labelTone: "muted" | "accent";
}) {
  return (
    <div className="space-y-1.5">
      <div
        className={`text-[10px] uppercase tracking-[0.2em] font-mono ${
          labelTone === "accent" ? "text-emerald-500" : "text-[color:var(--muted-foreground)]"
        }`}
      >
        {label}
      </div>
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-[color:var(--border)]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 50vw, 22vw"
          quality={60}
          loading="lazy"
          className="object-cover"
        />
      </div>
    </div>
  );
}
