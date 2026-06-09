import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { renderTextOverlay } from "@/lib/image/text-overlay";

async function main() {
  const fontFile = path.join(process.cwd(), "assets", "fonts", "Anton-Regular.ttf");
  console.log("Font exists:", fs.existsSync(fontFile));
  const simpleSvg = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><text x="100" y="400" font-family="Anton" font-size="120" fill="#ff0000">HELLO WORLD</text></svg>`;
  const simple = new Resvg(simpleSvg, {
    font: { fontFiles: [fontFile], defaultFontFamily: "Anton", loadSystemFonts: false },
  });
  const simpleOut = Buffer.from(simple.render().asPng());
  fs.writeFileSync("C:/Users/nclaw/AppData/Local/Temp/simple.png", simpleOut);
  console.log("Simple PNG bytes:", simpleOut.length);
  const quote = process.argv[2] || "Growing his business for 5%";
  const emph = (process.argv[3] || "Growing,5%").split(",");
  const overlay = await renderTextOverlay({
    width: 1280,
    height: 720,
    quote,
    emphasisWords: emph,
    whiteColor: "#FFFFFF",
    yellowColor: "#fdfc33",
  });
  // Composite over a mid-gray so we can see white text
  const bg = await sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 4,
      background: { r: 64, g: 64, b: 80, alpha: 1 },
    },
  }).png().toBuffer();
  const combined = await sharp(bg)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
  const out = "C:/Users/nclaw/AppData/Local/Temp/test-overlay.png";
  fs.writeFileSync(out, combined);
  console.log(`Wrote ${out} (${combined.length} bytes, overlay was ${overlay.length})`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
