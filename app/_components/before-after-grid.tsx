type Pair = {
  videoId: string;
  title: string | null;
  oldUrl: string;
  newUrl: string;
};

export function BeforeAfterGrid({ pairs }: { pairs: Pair[] }) {
  if (pairs.length === 0) return null;
  return (
    <section className="mt-24">
      <div className="flex items-end justify-between mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Library</h2>
        <span className="text-sm text-[color:var(--muted-foreground)]">
          {pairs.length} processed
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {pairs.map((p) => (
          <PairRow key={p.videoId} pair={p} />
        ))}
      </div>
    </section>
  );
}

function PairRow({ pair }: { pair: Pair }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] p-3 bg-[color:var(--card)]">
      <div className="grid grid-cols-2 gap-2">
        <Thumb src={pair.oldUrl} label="BEFORE" labelBg="bg-white text-black" />
        <Thumb src={pair.newUrl} label="AFTER" labelBg="bg-emerald-500 text-white" />
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
  label,
  labelBg,
}: {
  src: string;
  label: string;
  labelBg: string;
}) {
  return (
    <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-[color:var(--border)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span
        className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-mono ${labelBg}`}
      >
        {label}
      </span>
    </div>
  );
}
