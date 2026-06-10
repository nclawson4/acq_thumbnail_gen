import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import Image from "next/image";

export const dynamic = "force-dynamic";

type Tier = "A" | "B" | "C";
type Verdict = {
  tier: Tier;
  reason: string;
  subReason?: "head-cut-off" | "wrong-subject" | "size-mismatch";
  rerun?: boolean;
  previousTier?: Tier;
};

const VERDICTS: Record<string, Verdict> = {
  // A — meets criteria
  HaCf4VlnDLw: { tier: "A", reason: "Both chest-up, heads similar size." },
  Tk0e0z8h64Y: { tier: "A", reason: "Both chest-up, heads similar size." },
  "0ZwRf4Dy_MM": { tier: "A", reason: "Both chest-up, heads similar size." },
  "4J_Bo4Dbxjk": { tier: "A", reason: "Both chest-up; heads match." },
  "5rk7GElwf6M": { tier: "A", reason: "Both chest-up; right arms crossed but framing matches." },
  "Ok8cv-ivKIw": { tier: "A", reason: "Both head-to-chest, matched heads." },
  RRFXliltxFM: { tier: "A", reason: "Both chest-up; matched heads." },
  UmBWqjwfgtA: { tier: "A", reason: "Both head-to-chest, matched." },
  cvn8nPtLtfc: { tier: "A", reason: "Both chest-up, matched heads." },
  lPZOkIvVxPc: { tier: "A", reason: "Both chest-up, matched heads." },
  oNG9AXBcJ7M: { tier: "A", reason: "Both chest-up, matched heads." },
  "pEKRblMK-Xg": { tier: "A", reason: "Both chest-up, matched heads." },
  u99G6KwRWQ0: { tier: "A", reason: "Both chest-up, matched heads." },

  // B — edge cases
  gOG7zvp2ub0: { tier: "B", reason: "Right slightly wider (extended arm) but heads similar size." },
  TaeBazpcRk8: { tier: "B", reason: "Left full-body / right head-to-waist; heads still similar." },
  wRe3Umk2hec: { tier: "B", reason: "Right slightly wider, heads roughly match." },
  "_4BGku-jLh4": { tier: "B", reason: "Right hands-up gesture extends frame; heads ok." },
  JT3bePK2ens: { tier: "B", reason: "Right has table in foreground but head matches." },
  "7w1HQAvlLZk": { tier: "B", reason: "Right slightly wider, heads similar." },
  "2RYARn7GMek": { tier: "B", reason: "Right wider (arms crossed); heads similar." },
  "6WPNzaWuAic": { tier: "B", reason: "Right wider; heads similar." },
  I1NYJ8dm4Jk: { tier: "A", reason: "Re-run: both chest-up to head-to-waist, heads now match.", rerun: true, previousTier: "B" },
  IVNuDhV1uw4: { tier: "B", reason: "Right gesturing arms widen frame; heads similar." },
  OulGPT2kZ7c: { tier: "B", reason: "Mild size drift; acceptable." },
  Uw9weyjJL1A: { tier: "B", reason: "Right slightly smaller head, edge case." },
  bYGRh4ZOdUo: { tier: "B", reason: "Right head-to-waist vs left chest-up; heads similar." },

  // C — major issues
  oIvIf1Rv7vg: { tier: "A", reason: "Re-run: head fully visible. Both chest-up framing.", rerun: true, previousTier: "C" },
  "Sn5wBUC-SFk": { tier: "C", reason: "Source has no right-side host. Pipeline grabbed blurry audience members as the right subject.", subReason: "wrong-subject" },

  gMXG_HoYnRY: { tier: "C", reason: "Left chest-up vs right head-to-mid-thigh. Right head visibly smaller.", subReason: "size-mismatch" },
  zk5jD2uko_k: { tier: "C", reason: "Left chest-up vs right head-to-mid-thigh.", subReason: "size-mismatch" },
  rqJM6mFhyes: { tier: "C", reason: "Left tight head vs right head-to-mid-thigh; severe size mismatch.", subReason: "size-mismatch" },
  "85lDC9uzFWI": { tier: "C", reason: "Left full body vs right head-to-waist; mismatched framing.", subReason: "size-mismatch" },
  "3Lvhd3LIwwY": { tier: "C", reason: "Left chest-up vs right full body; right head smaller.", subReason: "size-mismatch" },
  HlK_MeYWKEs: { tier: "C", reason: "Left tight head vs right full body far back; severe mismatch.", subReason: "size-mismatch" },
  "EjBgv-DGJ-M": { tier: "C", reason: "Left chest-up vs right head-to-mid-thigh.", subReason: "size-mismatch" },
  "Ht9u-qEXTQY": { tier: "C", reason: "Left head+chest vs right head-to-thigh.", subReason: "size-mismatch" },
  "-G08--_mZaU": { tier: "C", reason: "Left chest-up vs right head-to-knee full body.", subReason: "size-mismatch" },
  "0coMtm_i1UA": { tier: "C", reason: "Re-run: still left tight head vs right head-to-mid-thigh. Persistent size mismatch.", subReason: "size-mismatch", rerun: true, previousTier: "C" },
  "2PfbKVGNgPM": { tier: "C", reason: "Left chest-up vs right head-to-mid-thigh+full body.", subReason: "size-mismatch" },
  "3t6sA6OmzHA": { tier: "B", reason: "Re-run: tighter right crop, head-to-waist. Heads roughly similar.", rerun: true, previousTier: "C" },
  YJy7PL2apUo: { tier: "C", reason: "Left chest-up vs right full body.", subReason: "size-mismatch" },
  fNPlt_C54KM: { tier: "C", reason: "Left chest-up vs right head-to-mid-thigh.", subReason: "size-mismatch" },
  lqKx0GDHFX8: { tier: "C", reason: "Left chest-up vs right full body.", subReason: "size-mismatch" },
  xRzZaHUOk4E: { tier: "C", reason: "Left chest-up vs right head-to-mid-thigh.", subReason: "size-mismatch" },
};

type Pair = {
  videoId: string;
  title: string | null;
  oldUrl: string;
  newUrl: string;
};

async function loadDonePairs(): Promise<Pair[]> {
  const db = getDb();
  const rows = (await db.execute(
    sql`
      SELECT DISTINCT ON (youtube_id) youtube_id, video_title, final_urls, created_at
      FROM runs
      WHERE status = 'done'
        AND host_side = 'right'
        AND style_id IS NULL
        AND final_urls IS NOT NULL
        AND jsonb_array_length(final_urls) = 3
      ORDER BY youtube_id, created_at DESC
    `,
  )) as unknown as { rows: Array<{ youtube_id: string; video_title: string | null; final_urls: string[]; created_at: string }> };
  const arr = (rows.rows ?? (rows as unknown as Array<{ youtube_id: string; video_title: string | null; final_urls: string[]; created_at: string }>)) ?? [];
  return arr
    .filter((r) => Array.isArray(r.final_urls) && r.final_urls.length > 0)
    .map((r) => ({
      videoId: r.youtube_id,
      title: r.video_title,
      oldUrl: `https://i.ytimg.com/vi/${r.youtube_id}/maxresdefault.jpg`,
      newUrl: r.final_urls[0]!,
    }));
}

const TIER_ORDER: Record<Tier, number> = { C: 0, B: 1, A: 2 };

export default async function AuditPage() {
  const pairs = await loadDonePairs();
  const annotated = pairs
    .map((p) => ({ ...p, verdict: VERDICTS[p.videoId] }))
    .filter((p): p is Pair & { verdict: Verdict } => p.verdict !== undefined)
    .sort((a, b) => {
      // Re-runs pin to top so user can compare improvement at a glance.
      const r = Number(!!b.verdict.rerun) - Number(!!a.verdict.rerun);
      if (r !== 0) return r;
      const t = TIER_ORDER[a.verdict.tier] - TIER_ORDER[b.verdict.tier];
      if (t !== 0) return t;
      return a.videoId.localeCompare(b.videoId);
    });

  const counts = {
    A: annotated.filter((p) => p.verdict.tier === "A").length,
    B: annotated.filter((p) => p.verdict.tier === "B").length,
    C: annotated.filter((p) => p.verdict.tier === "C").length,
  };
  const reruns = annotated.filter((p) => p.verdict.rerun);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Image audit</h1>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          {annotated.length} thumbnails classified · A={counts.A} · B={counts.B} · C={counts.C}
        </p>
        <p className="text-xs text-[color:var(--muted-foreground)] max-w-3xl">
          Criterion: each person properly zoomed in, matches source pose/clothes/background, both
          subjects share roughly the same body-part-to-head framing (e.g. both chest-up, or both
          head-to-waist). Re-runs are pinned to the top; the rest sorts C → B → A.
        </p>
      </div>

      {reruns.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Latest re-runs</h2>
            <span className="text-xs font-mono uppercase tracking-[0.15em] text-[color:var(--muted-foreground)]">
              {reruns.length} videos · {reruns.filter((p) => improved(p.verdict)).length} improved
            </span>
          </div>
          <div className="space-y-4">
            {reruns.map((p) => (
              <AuditRow key={p.videoId} pair={p} verdict={p.verdict} />
            ))}
          </div>
          <div className="my-8 border-t border-[color:var(--border)]" />
        </div>
      )}

      <div className="space-y-4">
        {annotated.filter((p) => !p.verdict.rerun).map((p) => (
          <AuditRow key={p.videoId} pair={p} verdict={p.verdict} />
        ))}
      </div>
    </div>
  );
}

function improved(v: Verdict): boolean {
  if (!v.previousTier) return false;
  return TIER_ORDER[v.tier] > TIER_ORDER[v.previousTier];
}

function AuditRow({ pair, verdict }: { pair: Pair; verdict: Verdict }) {
  const tierStyles: Record<Tier, { bg: string; text: string; label: string }> = {
    A: { bg: "bg-emerald-500/15", text: "text-emerald-500", label: "A — meets" },
    B: { bg: "bg-amber-500/15", text: "text-amber-500", label: "B — edge" },
    C: { bg: "bg-red-500/15", text: "text-red-500", label: "C — major" },
  };
  const s = tierStyles[verdict.tier];
  return (
    <div className="rounded-2xl border border-[color:var(--border)] p-4 bg-[color:var(--card)]">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-4">
        <Thumb src={`https://i.ytimg.com/vi/${pair.videoId}/maxresdefault.jpg`} label="SOURCE" />
        <Thumb src={pair.newUrl} label="GENERATED" />
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${s.bg} ${s.text} text-[11px] font-mono uppercase tracking-[0.15em] px-2 py-1 rounded`}>
              {s.label}
            </span>
            {verdict.rerun && verdict.previousTier && (
              <span
                className={`text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-0.5 rounded ${
                  improved(verdict)
                    ? "bg-emerald-500/15 text-emerald-500"
                    : verdict.previousTier === verdict.tier
                      ? "bg-[color:var(--muted)]/50 text-[color:var(--muted-foreground)]"
                      : "bg-red-500/15 text-red-500"
                }`}
              >
                Re-run · {verdict.previousTier} → {verdict.tier}
              </span>
            )}
            {verdict.subReason && (
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[color:var(--muted-foreground)] border border-[color:var(--border)] px-2 py-0.5 rounded">
                {verdict.subReason.replace(/-/g, " ")}
              </span>
            )}
          </div>
          <div className="text-sm font-medium leading-snug">
            {pair.title ?? pair.videoId}
          </div>
          <div className="text-sm text-[color:var(--muted-foreground)] leading-snug">
            {verdict.reason}
          </div>
          <div className="mt-auto flex items-center gap-3 text-xs">
            <a
              href={`https://www.youtube.com/watch?v=${pair.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--muted-foreground)] hover:text-foreground underline underline-offset-4"
            >
              Watch ↗
            </a>
            <a
              href={pair.newUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--muted-foreground)] hover:text-foreground underline underline-offset-4"
            >
              Full image ↗
            </a>
            <span className="text-[10px] font-mono text-[color:var(--muted-foreground)]">
              {pair.videoId}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Thumb({ src, label }: { src: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.2em] font-mono text-[color:var(--muted-foreground)]">
        {label}
      </div>
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-[color:var(--border)]">
        <Image
          src={src}
          alt={label}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          quality={70}
          loading="lazy"
          className="object-cover"
        />
      </div>
    </div>
  );
}
