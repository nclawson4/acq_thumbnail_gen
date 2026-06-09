import sharp from "sharp";

export const THUMB_WIDTH = 1280;
export const THUMB_HEIGHT = 720;

export async function cropHalvesFromThumbnail(
  imageBuffer: Buffer,
  splitX: number,
): Promise<{ leftJpeg: Buffer; rightJpeg: Buffer; width: number; height: number }> {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("Could not read image dimensions");
  }
  const clampedSplit = Math.max(1, Math.min(width - 1, Math.round(splitX)));
  const leftJpeg = await sharp(imageBuffer)
    .extract({ left: 0, top: 0, width: clampedSplit, height })
    .jpeg({ quality: 92 })
    .toBuffer();
  const rightJpeg = await sharp(imageBuffer)
    .extract({
      left: clampedSplit,
      top: 0,
      width: width - clampedSplit,
      height,
    })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { leftJpeg, rightJpeg, width, height };
}

export async function normalizeFinal(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover", position: "center" })
    .png({ compressionLevel: 7 })
    .toBuffer();
}

export async function composeSideBySide(
  leftBuffer: Buffer,
  rightBuffer: Buffer,
): Promise<Buffer> {
  const halfWidth = Math.floor(THUMB_WIDTH / 2);
  const left = await sharp(leftBuffer)
    .resize(halfWidth, THUMB_HEIGHT, { fit: "cover", position: "center" })
    .toBuffer();
  const right = await sharp(rightBuffer)
    .resize(THUMB_WIDTH - halfWidth, THUMB_HEIGHT, {
      fit: "cover",
      position: "center",
    })
    .toBuffer();
  return sharp({
    create: {
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: halfWidth, top: 0 },
    ])
    .png()
    .toBuffer();
}

export type TextOverlayOptions = {
  text: string;
  position:
    | "top"
    | "bottom"
    | "center"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
  fontFamily: string;
  color: string;
  strokeColor: string | null;
  strokeWidth: number;
  sizeRatio: number;
  allCaps: boolean;
  shading: "none" | "gradient" | "solid" | "blur";
  shadingIntensity: number;
};

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<"
      ? "&lt;"
      : c === ">"
        ? "&gt;"
        : c === "&"
          ? "&amp;"
          : c === '"'
            ? "&quot;"
            : "&apos;",
  );
}

export async function applyTextOverlay(
  imageBuffer: Buffer,
  opts: TextOverlayOptions,
): Promise<Buffer> {
  const text = opts.allCaps ? opts.text.toUpperCase() : opts.text;
  const fontSize = Math.round(THUMB_HEIGHT * opts.sizeRatio);
  const padding = 40;

  const textAnchor =
    opts.position.includes("left")
      ? "start"
      : opts.position.includes("right")
        ? "end"
        : "middle";

  const x =
    textAnchor === "start"
      ? padding
      : textAnchor === "end"
        ? THUMB_WIDTH - padding
        : THUMB_WIDTH / 2;
  const y =
    opts.position.includes("top")
      ? fontSize + padding
      : opts.position.includes("bottom")
        ? THUMB_HEIGHT - padding
        : THUMB_HEIGHT / 2 + fontSize / 3;

  const strokeAttrs =
    opts.strokeColor && opts.strokeWidth > 0
      ? `stroke="${escapeXml(opts.strokeColor)}" stroke-width="${opts.strokeWidth}" paint-order="stroke fill"`
      : "";

  const shadingDef =
    opts.shading === "gradient"
      ? `<defs>
          <linearGradient id="g" x1="0" x2="0" y1="${opts.position.includes("top") ? 0 : 1}" y2="${opts.position.includes("top") ? 1 : 0}">
            <stop offset="0%" stop-color="rgba(0,0,0,${opts.shadingIntensity})"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
          </linearGradient>
        </defs>`
      : "";
  const shadingRect =
    opts.shading === "gradient"
      ? `<rect x="0" y="${opts.position.includes("top") ? 0 : THUMB_HEIGHT / 2}" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT / 2}" fill="url(#g)"/>`
      : opts.shading === "solid"
        ? `<rect x="0" y="${y - fontSize - 16}" width="${THUMB_WIDTH}" height="${fontSize + 32}" fill="rgba(0,0,0,${opts.shadingIntensity})"/>`
        : "";

  const svg = `<svg width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
${shadingDef}
${shadingRect}
<text x="${x}" y="${y}" text-anchor="${textAnchor}"
  font-family="${escapeXml(opts.fontFamily)}"
  font-weight="900"
  font-size="${fontSize}"
  fill="${escapeXml(opts.color)}"
  ${strokeAttrs}>${escapeXml(text)}</text>
</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export async function adjustSaturation(
  imageBuffer: Buffer,
  saturationDelta: number,
): Promise<Buffer> {
  const multiplier = Math.max(0.1, 1 + saturationDelta);
  return sharp(imageBuffer)
    .modulate({ saturation: multiplier })
    .png()
    .toBuffer();
}
