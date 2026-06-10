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
      <div className="grid grid-cols-2 gap-2">
        <Thumb
          src={`https://i.ytimg.com/vi/${pair.videoId}/mqdefault.jpg`}
          alt={`Original thumbnail for ${pair.title ?? pair.videoId}`}
          label="BEFORE"
          labelBg="bg-white text-black"
        />
        <Thumb
          src={pair.newUrl}
          alt={`Generated thumbnail for ${pair.title ?? pair.videoId}`}
          label="AFTER"
          labelBg="bg-emerald-500 text-white"
        />
      </div>
      {pair.title && (
        <div className="mt-3 px-1 text-sm leading-snug line-clamp-2 text-[color:var(--foreground)]">
          {pair.title}
        </div>
      )}
    </div>
  );
}

function Thumb({
  src,
  alt,
  label,
  labelBg,
}: {
  src: string;
  alt: string;
  label: string;
  labelBg: string;
}) {
  return (
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
      <span
        className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-mono ${labelBg}`}
      >
        {label}
      </span>
    </div>
  );
}
