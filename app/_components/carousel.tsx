"use client";

import { useEffect, useRef, useState } from "react";

type Pair = {
  videoId: string;
  title: string | null;
  oldUrl: string;
  newUrl: string;
};

const SLOTS_VISIBLE = 5;
const SWIPE_MS = 1100;
const HOLD_AFTER_SWIPE_MS = 700;
const SLIDE_MS = 600;

function thumbFallback(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function youtubeMaxRes(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

export function BeforeAfterCarousel({ pairs }: { pairs: Pair[] }) {
  // Need at least SLOTS_VISIBLE pairs; pad by repeating if fewer.
  const items: Pair[] = (() => {
    if (pairs.length === 0) return [];
    if (pairs.length >= SLOTS_VISIBLE) return pairs;
    const out: Pair[] = [];
    while (out.length < SLOTS_VISIBLE) out.push(...pairs);
    return out.slice(0, Math.max(SLOTS_VISIBLE, pairs.length));
  })();

  // Render the strip twice so we can slide left indefinitely and snap back invisibly.
  const strip: Pair[] = items.length > 0 ? [...items, ...items] : [];

  // virtualIndex = how far we've slid left. Center is virtualIndex + 2.
  const [virtualIndex, setVirtualIndex] = useState(0);
  const [swipePct, setSwipePct] = useState(0);
  const [transitionsOn, setTransitionsOn] = useState(true);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function step() {
      if (cancelled) return;
      // Phase 1: swipe to reveal new
      setSwipePct(100);
      timeout = setTimeout(() => {
        if (cancelled) return;
        // Phase 2: brief hold, then slide left by 1
        timeout = setTimeout(() => {
          if (cancelled) return;
          setVirtualIndex((v) => v + 1);
          // Phase 3: after slide, reset swipe for new center (instant)
          timeout = setTimeout(() => {
            if (cancelled) return;
            // Disable transitions briefly to instantly reset center swipe state
            setTransitionsOn(false);
            setSwipePct(0);
            timeout = setTimeout(() => {
              if (cancelled) return;
              setTransitionsOn(true);
              step();
            }, 40);
          }, SLIDE_MS);
        }, HOLD_AFTER_SWIPE_MS);
      }, SWIPE_MS);
    }

    step();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [items.length]);

  // When virtualIndex hits items.length, snap back to 0 invisibly
  useEffect(() => {
    if (items.length === 0) return;
    if (virtualIndex >= items.length) {
      // Wait for the current slide transition to finish, then snap
      const t = setTimeout(() => {
        setTransitionsOn(false);
        setVirtualIndex(0);
        const t2 = setTimeout(() => setTransitionsOn(true), 40);
        return () => clearTimeout(t2);
      }, SLIDE_MS + 20);
      return () => clearTimeout(t);
    }
  }, [virtualIndex, items.length]);

  if (items.length === 0) {
    return (
      <div className="aspect-[5/1.4] w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)]/30 grid place-items-center text-sm text-[color:var(--muted-foreground)]">
        No processed videos yet — submit one below.
      </div>
    );
  }

  // visible slots are stripIndex = virtualIndex + 0..(SLOTS_VISIBLE-1)
  // center is at slot index 2 (0-based)
  const slotWidthPct = 100 / SLOTS_VISIBLE;

  return (
    <div className="relative w-full overflow-hidden">
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-background to-transparent" />

      <div
        ref={stripRef}
        className="flex"
        style={{
          width: `${(strip.length / SLOTS_VISIBLE) * 100}%`,
          transform: `translateX(-${(virtualIndex / strip.length) * 100}%)`,
          transition: transitionsOn ? `transform ${SLIDE_MS}ms ease` : "none",
        }}
      >
        {strip.map((p, i) => {
          const slotPos = i - virtualIndex; // 0..4 are visible; 2 is center
          const isCenter = slotPos === 2;
          const isLeftOfCenter = slotPos < 2;
          // Left of center = already-revealed (show new). Right of center = pending (show old).
          const showNewFully = !isCenter && isLeftOfCenter;
          return (
            <div
              key={`${p.videoId}-${i}`}
              className="px-2 box-border"
              style={{ width: `${slotWidthPct}%` }}
            >
              <PairTile
                pair={p}
                showNewFully={showNewFully}
                swipePct={isCenter ? swipePct : (isLeftOfCenter ? 100 : 0)}
                emphasized={isCenter}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PairTile({
  pair,
  showNewFully,
  swipePct,
  emphasized,
}: {
  pair: Pair;
  showNewFully: boolean;
  swipePct: number;
  emphasized: boolean;
}) {
  return (
    <div
      className={`relative aspect-video w-full rounded-xl overflow-hidden border border-[color:var(--border)] bg-black transition-all ${
        emphasized ? "scale-100 shadow-2xl ring-2 ring-[color:var(--accent)]" : "scale-90 opacity-70"
      }`}
    >
      {/* Old thumbnail (base layer) */}
      <img
        src={youtubeMaxRes(pair.videoId)}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = thumbFallback(pair.videoId);
        }}
        alt={pair.title ?? pair.videoId}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* New thumbnail revealed via clip-path swipe */}
      <img
        src={pair.newUrl}
        alt={`Generated thumbnail for ${pair.title ?? pair.videoId}`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          clipPath: showNewFully
            ? "inset(0 0 0 0)"
            : `inset(0 ${100 - swipePct}% 0 0)`,
          transition: showNewFully ? "none" : `clip-path ${SWIPE_MS}ms ease`,
        }}
      />
      {/* Swipe edge highlight */}
      {!showNewFully && swipePct > 0 && swipePct < 100 && (
        <div
          className="absolute inset-y-0 w-[2px] bg-white/80 shadow-[0_0_18px_4px_rgba(255,255,255,0.55)]"
          style={{
            left: `${swipePct}%`,
            transition: `left ${SWIPE_MS}ms ease`,
          }}
        />
      )}
      {/* Label */}
      <div className="absolute bottom-2 left-2 z-10 flex gap-1.5 text-[10px] font-mono">
        <span
          className={`px-1.5 py-0.5 rounded ${
            showNewFully || swipePct >= 100 ? "bg-white/15 text-white/60" : "bg-white text-black"
          }`}
        >
          BEFORE
        </span>
        <span
          className={`px-1.5 py-0.5 rounded ${
            showNewFully || swipePct >= 100 ? "bg-emerald-500 text-white" : "bg-white/15 text-white/60"
          }`}
        >
          AFTER
        </span>
      </div>
    </div>
  );
}
