/**
 * One-off: craft a corrected thumbnail for LGbS0GOZBNE only.
 *
 * The standard pipeline fails on this source because Claude picks a splitX
 * that runs through Alex's face (he straddles the centerline due to the
 * flipchart on his right). We bypass that step by manually choosing crop
 * boxes for each subject, then reuse the existing compose + overlay code.
 *
 *   STAGE=preview node --env-file=.env.local --import tsx scripts/craft-LGbS0GOZBNE.ts
 *   STAGE=upload  node --env-file=.env.local --import tsx scripts/craft-LGbS0GOZBNE.ts
 *
 * preview → writes 3 variants to .scratch/craft/ for visual review
 * upload  → uploads to Blob and inserts a "done" row in `runs`
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

const YOUTUBE_ID = "LGbS0GOZBNE";
const VIDEO_URL = `https://www.youtube.com/watch?v=${YOUTUBE_ID}`;
const VIDEO_TITLE = "Should I Take 5% to Help Grow His Business?";

// Crop boxes chosen by hand-measuring the 1280x720 source.
// Guest (left): face center ~x=230 y=240, framed head-to-chest.
// Alex  (right): face center ~x=620 y=200, framed head-to-chest. Critical: his
//   x-center is LEFT of the natural midline at 640, so any auto-split through
//   x=500..640 chops his face. We crop from x=415 instead.
const LEFT_CROP = { left: 26, top: 120, width: 409, height: 460 };
// Alex's face center is ~x=669 (measured by eye on source 1280x720).
// Tightened from 409x460 → 338x380 so his head+chest fills the crop the same way
// the guest's does in his left crop (otherwise Alex looks smaller after resize).
const RIGHT_CROP = { left: 500, top: 106, width: 338, height: 380 };

const VARIANTS = [
  {
    id: "a",
    quote: "Never work for equity alone",
    emphasisWords: ["Never", "equity"],
  },
  {
    id: "b",
    quote: "5% equity isn't enough",
    emphasisWords: ["5%", "enough"],
  },
  {
    id: "c",
    quote: "Take the cash not the equity",
    emphasisWords: ["cash", "equity"],
  },
] as const;

const STYLE = {
  text: { color: "#FFFFFF" },
  // adjustSaturation takes a DELTA — 1.0 means +100% (doubled). 0 = no boost.
  accent: { primaryColor: "#fdfc33", saturationBoost: 0 },
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
    const dir = path.join(process.cwd(), ".scratch", "craft");
    fs.mkdirSync(dir, { recursive: true });
    // Save the crops so we can spot-check framing.
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
      console.log(`Wrote .scratch/craft/${v.id}.png`);
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
