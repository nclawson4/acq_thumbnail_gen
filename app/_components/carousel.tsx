"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Pair = {
  videoId: string;
  title: string | null;
  oldUrl: string;
  newUrl: string;
};

const SLOTS_VISIBLE = 5;
const PAUSE_OLD_MS = 1000;
const SWIPE_MS = 500;
const PAUSE_NEW_MS = 1000;
const SLIDE_MS = 500;

function youtubeMqDefault(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function BeforeAfterCarousel({ pairs }: { pairs: Pair[] }) {
  const items: Pair[] = (() => {
    if (pairs.length === 0) return [];
    if (pairs.length >= SLOTS_VISIBLE) return pairs;
    const out: Pair[] = [];
    while (out.length < SLOTS_VISIBLE) out.push(...pairs);
    return out.slice(0, Math.max(SLOTS_VISIBLE, pairs.length));
  })();

  // Duplicate the strip once so the slide can keep advancing past the end,
  // then snap back invisibly.
  const strip: Pair[] = items.length > 0 ? [...items, ...items] : [];

  const [virtualIndex, setVirtualIndex] = useState(0);
  const [swipePct, setSwipePct] = useState(0);
  const [slideOn, setSlideOn] = useState(true);
  const [swipeOn, setSwipeOn] = useState(true);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function wait(ms: number) {
      return new Promise<void>((res) => {
        timer = setTimeout(res, ms);
      });
    }

    async function loop() {
      // Center starts showing OLD (swipePct=0)
      while (!cancelled) {
        await wait(PAUSE_OLD_MS);
        if (cancelled) return;
        // Swipe to NEW
        setSwipePct(100);
        await wait(SWIPE_MS);
        if (cancelled) return;
        await wait(PAUSE_NEW_MS);
        if (cancelled) return;
        // Silently reset the swipe state for the incoming center,
        // then advance virtualIndex to trigger the slide.
        setSwipeOn(false);
        setSwipePct(0);
        setVirtualIndex((v) => v + 1);
        await wait(20);
        if (cancelled) return;
        setSwipeOn(true);
        await wait(SLIDE_MS - 20);
      }
    }
    loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [items.length]);

  // When virtualIndex reaches items.length, snap back to 0 invisibly
  useEffect(() => {
    if (items.length === 0) return;
    if (virtualIndex >= items.length) {
      const t = setTimeout(() => {
        setSlideOn(false);
        setVirtualIndex(0);
        const t2 = setTimeout(() => setSlideOn(true), 30);
        return () => clearTimeout(t2);
      }, SLIDE_MS + 30);
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

  return (
    <div className="relative w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-background to-transparent" />

      <div
        className="flex"
        style={{
          width: `${(strip.length / SLOTS_VISIBLE) * 100}%`,
          transform: `translateX(-${(virtualIndex / strip.length) * 100}%)`,
          transition: slideOn ? `transform ${SLIDE_MS}ms ease` : "none",
        }}
      >
        {strip.map((p, i) => {
          const slotPos = i - virtualIndex;
          const isCenter = slotPos === 0;
          const isLeftOfCenter = slotPos < 0;
          const isVisible = slotPos >= -2 && slotPos <= 2;
          const tileSwipePct = isCenter ? swipePct : isLeftOfCenter ? 100 : 0;
          // Prioritize loading for the first 5 items only — rest stay lazy.
          const priority = i < SLOTS_VISIBLE;
          return (
            <div
              key={`${p.videoId}-${i}`}
              className="px-2 box-border"
              style={{ width: `${100 / strip.length}%` }}
            >
              <PairTile
                pair={p}
                swipePct={tileSwipePct}
                emphasized={isCenter}
                visible={isVisible}
                priority={priority}
                swipeOn={swipeOn}
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
  swipePct,
  emphasized,
  visible,
  priority,
  swipeOn,
}: {
  pair: Pair;
  swipePct: number;
  emphasized: boolean;
  visible: boolean;
  priority: boolean;
  swipeOn: boolean;
}) {
  return (
    <div
      className={`relative aspect-video w-full rounded-xl overflow-hidden border border-[color:var(--border)] bg-black transition-all ${
        emphasized
          ? "scale-100 shadow-2xl ring-2 ring-emerald-500/60"
          : "scale-90 opacity-70"
      }`}
    >
      <Image
        src={youtubeMqDefault(pair.videoId)}
        alt={pair.title ?? pair.videoId}
        fill
        sizes="(max-width: 768px) 30vw, 20vw"
        quality={70}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className="object-cover"
      />
      <Image
        src={pair.newUrl}
        alt={`Generated thumbnail for ${pair.title ?? pair.videoId}`}
        fill
        sizes="(max-width: 768px) 30vw, 20vw"
        quality={70}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className="object-cover"
        style={{
          clipPath: `inset(0 ${100 - swipePct}% 0 0)`,
          transition: swipeOn ? `clip-path ${SWIPE_MS}ms ease` : "none",
        }}
      />
      {/* Swipe edge highlight only on currently-swiping center */}
      {visible && swipePct > 0 && swipePct < 100 && (
        <div
          className="absolute inset-y-0 w-[2px] bg-white/80 shadow-[0_0_18px_4px_rgba(255,255,255,0.55)]"
          style={{
            left: `${swipePct}%`,
            transition: swipeOn ? `left ${SWIPE_MS}ms ease` : "none",
          }}
        />
      )}
      <div className="absolute bottom-2 left-2 z-10 flex gap-1.5 text-[10px] font-mono">
        <span
          className={`px-1.5 py-0.5 rounded ${
            swipePct >= 100 ? "bg-white/15 text-white/60" : "bg-white text-black"
          }`}
        >
          BEFORE
        </span>
        <span
          className={`px-1.5 py-0.5 rounded ${
            swipePct >= 100 ? "bg-emerald-500 text-white" : "bg-white/15 text-white/60"
          }`}
        >
          AFTER
        </span>
      </div>
    </div>
  );
}
