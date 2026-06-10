/**
 * One-off: craft a corrected thumbnail for rd_urnkST6g only.
 *
 * Pipeline gave the guest a tight chest-up shot but framed Alex full-body
 * (head-to-thigh), so heads were mismatched. Bypass per-subject framing by
 * hand-picking crop boxes that match each subject to a chest-up framing.
 *
 *   STAGE=preview node --env-file=.env.local --import tsx scripts/craft-rd_urnkST6g.ts
 *   STAGE=upload  node --env-file=.env.local --import tsx scripts/craft-rd_urnkST6g.ts
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

const YOUTUBE_ID = "rd_urnkST6g";
const VIDEO_URL = `https://www.youtube.com/watch?v=${YOUTUBE_ID}`;
const VIDEO_TITLE = "Why You're Not Winning: You're Distracted";

// Hand-measured on the 1280x720 source.
// Guest (left): face center ~x=160 y=215, head top ~y=130.
// Alex  (right): face center ~x=825 y=210, head top ~y=130.
// Both framed chest-up with matching head-to-frame ratios.
const LEFT_CROP = { left: 13, top: 110, width: 293, height: 330 };
const RIGHT_CROP = { left: 678, top: 105, width: 293, height: 330 };

const VARIANTS = [
  {
    id: "a",
    quote: "Distraction is killing your dreams",
    emphasisWords: ["Distraction", "killing"],
  },
  {
    id: "b",
    quote: "You're distracted not defeated",
    emphasisWords: ["distracted", "defeated"],
  },
  {
    id: "c",
    quote: "Focus or fail",
    emphasisWords: ["Focus", "fail"],
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
    const dir = path.join(process.cwd(), ".scratch", "craft-rd");
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
      console.log(`Wrote .scratch/craft-rd/${v.id}.png`);
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
