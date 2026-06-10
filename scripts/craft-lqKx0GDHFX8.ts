/**
 * One-off: craft a corrected thumbnail for lqKx0GDHFX8 only.
 *
 * Pipeline gave guest chest-up but Alex full-body (head-to-thigh) because Alex
 * is side-profile and thinner in silhouette, so the auto-framer scaled him
 * differently. We hand-pick crops sized so both heads land at matching pixel
 * sizes after the 640x720 resize.
 *
 *   STAGE=preview node --env-file=.env.local --import tsx scripts/craft-lqKx0GDHFX8.ts
 *   STAGE=upload  node --env-file=.env.local --import tsx scripts/craft-lqKx0GDHFX8.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { neon } from "@neondatabase/serverless";
import {
  THUMB_WIDTH,
  THUMB_HEIGHT,
  composeSideBySide,
  normalizeFinal,
  adjustSaturation,
} from "../lib/image/sharp";
import { renderTextOverlay } from "../lib/image/text-overlay";
import { putArtifact, blobPaths } from "../lib/blob";

const YOUTUBE_ID = "lqKx0GDHFX8";
const VIDEO_URL = `https://www.youtube.com/watch?v=${YOUTUBE_ID}`;
const VIDEO_TITLE = "Phantom Equity Saves Your Company";

// Hand-measured on 1280x720 source.
// Guest (left): broad-shouldered, face ~x=235 y=215, head ~130px wide.
// Alex  (right): side-profile, face ~x=815 y=190, head ~95px wide.
// Crop widths picked so both heads land at the same pixel size after resize
// to 640x720 (alex_w = guest_w * 95/130 ≈ 0.73x).
const LEFT_CROP = { left: 57, top: 80, width: 356, height: 400 };
// Alex is in side profile + far back on stage, so his head is naturally smaller.
// Tightened crop to ~170x191 so heads land at the same size after 640x720 resize.
const RIGHT_CROP = { left: 810, top: 95, width: 170, height: 191 };

const VARIANTS = [
  {
    id: "a",
    quote: "Phantom equity saves your company",
    emphasisWords: ["Phantom", "saves"],
  },
  {
    id: "b",
    quote: "Skip the equity trap",
    emphasisWords: ["Skip", "trap"],
  },
  {
    id: "c",
    quote: "Pay without giving up control",
    emphasisWords: ["without", "control"],
  },
] as const;

const STYLE = {
  text: { color: "#FFFFFF" },
  accent: { primaryColor: "#fdfc33", saturationBoost: 1.0 },
} as const;

async function craftVariant(
  sourceJpeg: Buffer,
  variant: (typeof VARIANTS)[number],
): Promise<Buffer> {
  const leftCrop = await sharp(sourceJpeg).extract(LEFT_CROP).toBuffer();
  const rightCrop = await sharp(sourceJpeg).extract(RIGHT_CROP).toBuffer();
  const base = await composeSideBySide(leftCrop, rightCrop);
  const textOverlay = await renderTextOverlay({
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    quote: variant.quote,
    emphasisWords: [...variant.emphasisWords],
    whiteColor: STYLE.text.color,
    yellowColor: STYLE.accent.primaryColor,
  });
  const withText = await sharp(base)
    .composite([{ input: textOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
  const saturated = await adjustSaturation(withText, STYLE.accent.saturationBoost);
  return normalizeFinal(saturated);
}

async function downloadSource(): Promise<Buffer> {
  const url = `https://i.ytimg.com/vi/${YOUTUBE_ID}/maxresdefault.jpg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Source fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const stage = process.env.STAGE ?? "preview";
  const source = await downloadSource();
  const meta = await sharp(source).metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  if (stage === "preview") {
    const dir = path.join(process.cwd(), ".scratch", "craft-lq");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "left-crop.jpg"),
      await sharp(source).extract(LEFT_CROP).toBuffer(),
    );
    fs.writeFileSync(
      path.join(dir, "right-crop.jpg"),
      await sharp(source).extract(RIGHT_CROP).toBuffer(),
    );
    for (const v of VARIANTS) {
      const img = await craftVariant(source, v);
      fs.writeFileSync(path.join(dir, `${v.id}.png`), img);
      console.log(`Wrote .scratch/craft-lq/${v.id}.png`);
    }
    return;
  }

  if (stage === "upload") {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL required");
    const sql = neon(dbUrl);

    const runId = crypto.randomUUID();
    const finalUrls: string[] = [];
    for (const v of VARIANTS) {
      const img = await craftVariant(source, v);
      const { url } = await putArtifact(blobPaths.final(runId, v.id), img, {
        contentType: "image/png",
      });
      finalUrls.push(url);
      console.log(`Uploaded variant ${v.id} → ${url}`);
    }

    await sql`
      INSERT INTO runs
        (id, youtube_url, youtube_id, video_title, host_side, style_id,
         status, current_step, final_urls, access_mode, created_at, updated_at)
      VALUES
        (${runId}, ${VIDEO_URL}, ${YOUTUBE_ID}, ${VIDEO_TITLE}, 'right', NULL,
         'done', 'done', ${JSON.stringify(finalUrls)}::jsonb, 'demo', NOW(), NOW())
    `;
    console.log(`\nInserted runs row ${runId} with ${finalUrls.length} variants.`);
    return;
  }

  throw new Error(`Unknown STAGE=${stage}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
