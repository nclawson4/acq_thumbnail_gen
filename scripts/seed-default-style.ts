import { getDb, schema } from "@/lib/db";
import { TWO_HOST_DEFAULT_STYLE } from "@/lib/style";

const DEFAULT_REFERENCE_URLS = [
  "https://www.youtube.com/watch?v=0EqJD2o-Mnk",
  "https://www.youtube.com/watch?v=BYpTRiRqS1Y",
  "https://www.youtube.com/watch?v=jqo0lVveh98",
  "https://www.youtube.com/watch?v=8C_6qojTA78",
];

const PRESET_ID = "two-host-interview-default";

async function main() {
  console.log("Seeding default style preset...");
  await getDb()
    .insert(schema.stylePresets)
    .values({
      id: PRESET_ID,
      name: "Two-host Interview (default)",
      description:
        "Bold all-caps text, gradient shading along the bottom, vivid saturation. Tuned for podcast/interview content with one host on the right.",
      styleGuide: TWO_HOST_DEFAULT_STYLE,
      referenceUrls: DEFAULT_REFERENCE_URLS,
      isBuiltin: 1,
    })
    .onConflictDoUpdate({
      target: schema.stylePresets.id,
      set: {
        name: "Two-host Interview (default)",
        styleGuide: TWO_HOST_DEFAULT_STYLE,
        referenceUrls: DEFAULT_REFERENCE_URLS,
      },
    });
  console.log("✅ Seeded preset:", PRESET_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
