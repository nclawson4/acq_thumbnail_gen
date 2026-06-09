import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import path from "node:path";

const FONT_FAMILY = "Poppins";

function fontFilePath(): string {
  return path.join(process.cwd(), "assets", "fonts", "Poppins-Bold.ttf");
}

export type TextOverlaySpec = {
  width: number;
  height: number;
  quote: string;
  emphasisWords: string[];
  whiteColor: string;
  yellowColor: string;
};

// Poppins-Bold rough metrics — avg char width as fraction of font size.
// Used only for fitting; resvg does the actual layout.
const CHAR_W = 0.55;
const SPACE_W = 0.28;
const QUOTE_W = 0.45;

function estimateLineWidthPx(
  words: string[],
  fontSize: number,
  addLeadingQuote: boolean,
  addTrailingQuote: boolean,
): number {
  let w = 0;
  if (addLeadingQuote) w += QUOTE_W * fontSize;
  for (let i = 0; i < words.length; i++) {
    if (i > 0) w += SPACE_W * fontSize;
    w += words[i].length * CHAR_W * fontSize;
  }
  if (addTrailingQuote) w += QUOTE_W * fontSize;
  return w;
}

function splitWordsToFit(
  words: string[],
  fontSize: number,
  maxLineWidth: number,
): string[][] {
  const lines: string[][] = [[]];
  for (let idx = 0; idx < words.length; idx++) {
    const word = words[idx];
    const cur = lines[lines.length - 1];
    const isFirstWordOverall = lines.length === 1 && cur.length === 0;
    const isLastWordOverall = idx === words.length - 1;
    const testLine = [...cur, word];
    const testLeadingQuote = isFirstWordOverall || lines.length === 1;
    const testTrailingQuote = isLastWordOverall;
    if (
      cur.length > 0 &&
      estimateLineWidthPx(
        testLine,
        fontSize,
        lines.length === 1 && cur.length === 0,
        testTrailingQuote,
      ) > maxLineWidth
    ) {
      lines.push([word]);
    } else {
      cur.push(word);
    }
  }
  return lines;
}

function fitTextToBox(
  words: string[],
  targetFontSize: number,
  maxLineWidth: number,
  maxLines = 3,
): { fontSize: number; lines: string[][] } {
  let fontSize = targetFontSize;
  for (let attempt = 0; attempt < 8; attempt++) {
    const lines = splitWordsToFit(words, fontSize, maxLineWidth);
    const tooManyLines = lines.length > maxLines;
    const overflow = lines.some((line, i) =>
      estimateLineWidthPx(
        line,
        fontSize,
        i === 0,
        i === lines.length - 1,
      ) > maxLineWidth,
    );
    if (!tooManyLines && !overflow) return { fontSize, lines };
    fontSize = Math.round(fontSize * 0.92);
  }
  return {
    fontSize,
    lines: splitWordsToFit(words, fontSize, maxLineWidth),
  };
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
  const fontFile = fontFilePath();
  const cleanQuote = spec.quote.trim().replace(/^["“”']+|["“”']+$/g, "");
  const allWords = cleanQuote.split(/\s+/).filter(Boolean);
  const emphasisLower = new Set(
    spec.emphasisWords.map((w) =>
      w.toLowerCase().replace(/[^a-z0-9']/g, ""),
    ),
  );

  // 5% padding on each side; auto-shrink font if text would overflow
  const padPx = Math.round(spec.width * 0.05);
  const maxLineWidth = spec.width - 2 * padPx;
  const targetFontSize = Math.round(spec.height * 0.12);
  const { fontSize, lines } = fitTextToBox(
    allWords,
    targetFontSize,
    maxLineWidth,
    3,
  );
  const lineHeight = Math.round(fontSize * 1.1);

  // Text block bottom at 92% of height (8% bottom padding), left-aligned with 5% left pad
  const totalTextHeight = lines.length * lineHeight;
  const blockBottomY = Math.round(spec.height * 0.92);
  const blockTopY = blockBottomY - totalTextHeight;

  const lineTexts = (fillOverride?: string) =>
    lines
      .map((wordsOnLine, lineIdx) => {
        const y = blockTopY + (lineIdx + 1) * lineHeight - Math.round(fontSize * 0.18);
        const tspans = wordsOnLine
          .map((word, i) => {
            const cleaned = word.toLowerCase().replace(/[^a-z0-9']/g, "");
            const isEmph = emphasisLower.has(cleaned);
            const wordFill =
              fillOverride ?? (isEmph ? spec.yellowColor : spec.whiteColor);
            const quoteFill = fillOverride ?? spec.whiteColor;
            const prefix = i === 0 ? "" : " ";
            const isFirst = lineIdx === 0 && i === 0;
            const isLast =
              lineIdx === lines.length - 1 && i === wordsOnLine.length - 1;
            const wordSpan = `<tspan fill="${wordFill}">${prefix}${escapeXml(word)}</tspan>`;
            const open = isFirst
              ? `<tspan fill="${quoteFill}">\u201C</tspan>`
              : "";
            const close = isLast
              ? `<tspan fill="${quoteFill}">\u201D</tspan>`
              : "";
            return `${open}${wordSpan}${close}`;
          })
          .join("");
        return `<text x="${padPx}" y="${y}" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="700">${tspans}</text>`;
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
          defaultFontFamily: FONT_FAMILY,
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
