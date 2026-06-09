import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import path from "node:path";

function antonFontPath(): string {
  return path.join(process.cwd(), "assets", "fonts", "Anton-Regular.ttf");
}

export type TextOverlaySpec = {
  width: number;
  height: number;
  quote: string;
  emphasisWords: string[];
  whiteColor: string;
  yellowColor: string;
};

function splitWordsIntoLines(
  words: string[],
  maxCharsPerLine: number,
): string[][] {
  const lines: string[][] = [[]];
  let charCount = 0;
  for (const w of words) {
    const cur = lines[lines.length - 1];
    const addLen = (cur.length === 0 ? 0 : 1) + w.length;
    if (cur.length > 0 && charCount + addLen > maxCharsPerLine) {
      lines.push([w]);
      charCount = w.length;
    } else {
      cur.push(w);
      charCount += addLen;
    }
  }
  return lines;
}

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

export async function renderTextOverlay(spec: TextOverlaySpec): Promise<Buffer> {
  const fontFile = antonFontPath();
  const cleanQuote = spec.quote.trim().replace(/^["“”']+|["“”']+$/g, "");
  const allWords = cleanQuote.split(/\s+/).filter(Boolean);
  const emphasisLower = new Set(
    spec.emphasisWords.map((w) =>
      w.toLowerCase().replace(/[^a-z0-9']/g, ""),
    ),
  );

  // Allow lines up to ~75% of the frame width
  const maxChars = Math.max(14, Math.round(spec.width / 48));
  const lines = splitWordsIntoLines(allWords, maxChars);

  const fontSize = Math.round(spec.height * 0.14);
  const lineHeight = Math.round(fontSize * 1.05);

  // Text block bottom at 92% of height (8% bottom padding), centered horizontally
  const totalTextHeight = lines.length * lineHeight;
  const blockBottomY = Math.round(spec.height * 0.92);
  const blockTopY = blockBottomY - totalTextHeight;

  const centerX = Math.round(spec.width / 2);

  const lineTexts = (fillOverride?: string) =>
    lines
      .map((wordsOnLine, lineIdx) => {
        const y = blockTopY + (lineIdx + 1) * lineHeight - Math.round(fontSize * 0.15);
        const tspans = wordsOnLine
          .map((word, i) => {
            const cleaned = word.toLowerCase().replace(/[^a-z0-9']/g, "");
            const isEmph = emphasisLower.has(cleaned);
            const fill =
              fillOverride ?? (isEmph ? spec.yellowColor : spec.whiteColor);
            const prefix = i === 0 ? "" : " ";
            const displayWord =
              lineIdx === 0 && i === 0
                ? `\u201C${word}`
                : lineIdx === lines.length - 1 && i === wordsOnLine.length - 1
                  ? `${word}\u201D`
                  : word;
            return `<tspan fill="${fill}">${prefix}${escapeXml(displayWord)}</tspan>`;
          })
          .join("");
        return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="Anton" font-size="${fontSize}" font-weight="700">${tspans}</text>`;
      })
      .join("\n");

  // Scrim: linear gradient overlay, black at bottom → transparent at ~50% height
  const scrimSvg = `<svg width="${spec.width}" height="${spec.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0" x2="0" y1="1" y2="0">
        <stop offset="0%" stop-color="black" stop-opacity="0.78"/>
        <stop offset="40%" stop-color="black" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="black" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${Math.round(spec.height * 0.42)}" width="${spec.width}" height="${Math.round(spec.height * 0.58)}" fill="url(#scrim)"/>
  </svg>`;

  const wrap = (inner: string) =>
    `<svg width="${spec.width}" height="${spec.height}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

  const renderSvg = (svgStr: string) =>
    Buffer.from(
      new Resvg(svgStr, {
        fitTo: { mode: "width", value: spec.width },
        font: {
          fontFiles: [fontFile],
          defaultFontFamily: "Anton",
          loadSystemFonts: false,
        },
      })
        .render()
        .asPng(),
    );

  // 1. Scrim gradient (black-to-transparent at bottom for contrast behind text)
  const scrimPng = renderSvg(scrimSvg);
  // 2. Sharp colored text
  const textPng = renderSvg(wrap(lineTexts()));
  // 3. Black silhouette → blur for soft drop shadow
  const blackPng = renderSvg(wrap(lineTexts("#000000")));
  const shadowPng = await sharp(blackPng).blur(6).png().toBuffer();

  // Composite: scrim, then shadow, then text on top
  return sharp({
    create: {
      width: spec.width,
      height: spec.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: scrimPng, top: 0, left: 0 },
      { input: shadowPng, top: 3, left: 0 },
      { input: textPng, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}
