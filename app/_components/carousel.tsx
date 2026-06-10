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
const CENTER_OFFSET = Math.floor(SLOTS_VISIBLE / 2); // 2 → slot 0 is the visual center
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

  // Duplicate the strip so the slide can advance past the end and snap back invisibly.
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
      while (!cancelled) {
        await wait(PAUSE_OLD_MS);
        if (cancelled) return;
        setSwipePct(100);
        await wait(SWIPE_MS);
        if (cancelled) return;
        await wait(PAUSE_NEW_MS);
        if (cancelled) return;
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

  useEffect(() => {
    if (items.length === 0) return;
    if (virtualIndex >= items.length) {
      const t = setTimeout(() => {
        // Disable BOTH transitions before snap. Otherwise the items at the new
        // visible-window positions (which had slotPos << 0 and were rendering
        // "fully new") suddenly get slotPos 0/+1/+2 and their clip-path flips
        // from 0% to 100%. With swipeOn=true, CSS animates that flip → 2-3
        // tiles do a reverse swipe at once. Disabling swipeOn makes the
        // clip-path change snap instantly, invisibly.
        setSlideOn(false);
        setSwipeOn(false);
        setVirtualIndex(0);
        const t2 = setTimeout(() => {
          setSlideOn(true);
          setSwipeOn(true);
        }, 30);
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
    <div className="w-full">
      {/* Carousel viewport — pad vertically so the scaled-up center has room. */}
      <div className="relative w-full overflow-hidden py-16 md:py-20">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-20 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-20 bg-gradient-to-l from-background to-transparent" />

        <div
          className="flex items-center"
          style={{
            width: `${(strip.length / SLOTS_VISIBLE) * 100}%`,
            transform: `translateX(-${(virtualIndex / strip.length) * 100}%)`,
            transition: slideOn ? `transform ${SLIDE_MS}ms ease` : "none",
          }}
        >
          {strip.map((p, i) => {
            const slotPos = i - virtualIndex - CENTER_OFFSET;
            const isCenter = slotPos === 0;
            const isLeftOfCenter = slotPos < 0;
            const isVisible = slotPos >= -CENTER_OFFSET && slotPos <= CENTER_OFFSET;
            const tileSwipePct = isCenter ? swipePct : isLeftOfCenter ? 100 : 0;
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
                  isCenter={isCenter}
                  visible={isVisible}
                  priority={priority}
                  swipeOn={swipeOn}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Off-image label indicator — fades between BEFORE and AFTER as the center swipes. */}
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] uppercase tracking-[0.3em] font-mono">
        <span
          className={`transition-colors ${
            swipePct < 50 ? "text-foreground" : "text-[color:var(--muted-foreground)]/50"
          }`}
        >
          Before
        </span>
        <span aria-hidden className="text-[color:var(--muted-foreground)]/50">
          →
        </span>
        <span
          className={`transition-colors ${
            swipePct >= 50 ? "text-emerald-500" : "text-[color:var(--muted-foreground)]/50"
          }`}
        >
          After
        </span>
      </div>
    </div>
  );
}

function PairTile({
  pair,
  swipePct,
  isCenter,
  visible,
  priority,
  swipeOn,
}: {
  pair: Pair;
  swipePct: number;
  isCenter: boolean;
  visible: boolean;
  priority: boolean;
  swipeOn: boolean;
}) {
  return (
    <div
      className={`relative aspect-video w-full rounded-xl overflow-hidden border border-[color:var(--border)] bg-black transition-transform ${
        isCenter
          ? "z-10 scale-[2] shadow-2xl ring-2 ring-emerald-500/60"
          : "scale-100 opacity-80"
      }`}
      style={{ transformOrigin: "center" }}
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
        // Center tile is CSS-scaled 2×, so request a bigger source.
        sizes="(max-width: 768px) 60vw, 40vw"
        quality={92}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className="object-cover"
        style={{
          clipPath: `inset(0 ${100 - swipePct}% 0 0)`,
          transition: swipeOn ? `clip-path ${SWIPE_MS}ms ease` : "none",
        }}
      />
      {visible && isCenter && swipePct > 0 && swipePct < 100 && (
        <div
          className="absolute inset-y-0 w-[2px] bg-white/80 shadow-[0_0_18px_4px_rgba(255,255,255,0.55)]"
          style={{
            left: `${swipePct}%`,
            transition: swipeOn ? `left ${SWIPE_MS}ms ease` : "none",
          }}
        />
      )}
    </div>
  );
}
