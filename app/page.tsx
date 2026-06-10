import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import { BeforeAfterCarousel } from "./_components/carousel";
import { BeforeAfterGrid } from "./_components/before-after-grid";
import { HeroForm } from "./_components/hero-form";

export const dynamic = "force-dynamic";

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
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .map((r) => ({
      videoId: r.youtube_id,
      title: r.video_title,
      oldUrl: `https://i.ytimg.com/vi/${r.youtube_id}/maxresdefault.jpg`,
      newUrl: r.final_urls[0]!,
    }));
}

export default async function Home() {
  const pairs = await loadDonePairs();
  // Carousel takes up to 12 (loops).
  const carouselPairs = pairs.slice(0, 12);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <section className="space-y-10">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <span className="inline-block text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
            AI thumbnail pipeline · Live demo
          </span>
          <h1 className="text-3xl md:text-5xl font-semibold leading-[1.05] tracking-tight">
            Paste a workshop URL. Get production-grade thumbnails.
          </h1>
        </div>

        <BeforeAfterCarousel pairs={carouselPairs} />

        <HeroForm />
      </section>

      <BeforeAfterGrid pairs={pairs} />
    </div>
  );
}
