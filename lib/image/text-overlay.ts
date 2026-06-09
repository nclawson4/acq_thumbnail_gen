import { Resvg } from "@resvg/resvg-js";
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

  // Aim for ~3-4 words per line for thumbnail impact
  const maxChars = Math.max(10, Math.round(spec.width / 95));
  const lines = splitWordsIntoLines(allWords, maxChars);

  // Bigger: 16% of height per line
  const fontSize = Math.round(spec.height * 0.16);
  const lineHeight = Math.round(fontSize * 1.02);

  // Position: text block bottom is at 90% of height (10% bottom padding)
  const totalTextHeight = lines.length * lineHeight;
  const blockBottomY = Math.round(spec.height * 0.94);
  const blockTopY = blockBottomY - totalTextHeight;

  const padLeft = Math.round(spec.width * 0.04);

  // Each text element rendered with a thick black stroke acting as a halo/shadow
  // for natural blending against varied backgrounds.
  const strokeWidth = Math.round(fontSize * 0.08);

  const lineSvgs = lines
    .map((wordsOnLine, lineIdx) => {
      const y = blockTopY + (lineIdx + 1) * lineHeight - Math.round(fontSize * 0.15);
      const tspans = wordsOnLine
        .map((word, i) => {
          const cleaned = word.toLowerCase().replace(/[^a-z0-9']/g, "");
          const isEmph = emphasisLower.has(cleaned);
          const fill = isEmph ? spec.yellowColor : spec.whiteColor;
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
      // Render twice: once with thick black stroke (the halo), once with fill on top
      return `
        <text x="${padLeft}" y="${y}" font-family="Anton" font-size="${fontSize}" font-weight="700" stroke="black" stroke-width="${strokeWidth}" stroke-linejoin="round" fill="black" opacity="0.65">${tspans.replace(/fill="[^"]*"/g, 'fill="black"')}</text>
        <text x="${padLeft}" y="${y}" font-family="Anton" font-size="${fontSize}" font-weight="700">${tspans}</text>
      `;
    })
    .join("\n");

  const svg = `<svg width="${spec.width}" height="${spec.height}" xmlns="http://www.w3.org/2000/svg">
  ${lineSvgs}
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: spec.width },
    font: {
      fontFiles: [fontFile],
      defaultFontFamily: "Anton",
      loadSystemFonts: false,
    },
  });
  return Buffer.from(resvg.render().asPng());
}
