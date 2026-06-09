import { generateText, Output } from "ai";
import { z } from "zod";
import {
  CLAUDE_FAST_MODEL,
  CLAUDE_VISION_MODEL,
  makeAnthropic,
  type ProviderKeys,
} from "./providers";
import { StyleGuideSchema } from "../style";

const BboxSchema = z.object({
  headTopPct: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Y-coordinate (% of image height) of the very TOP of this person's head — top of the hair/skull. Be precise.",
    ),
  midStomachPct: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Y-coordinate (% of image height) of this person's MID-STOMACH — roughly the belly-button level, ~3.5 head-heights below the top of their head. If the person's body is cut off in the image, return the y-coordinate where you'd estimate their mid-stomach would be (can exceed 100).",
    ),
  bodyCenterPct: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "X-coordinate (% of image width) of this person's body center — roughly the centerline of their torso. Used to horizontally center the crop on this subject.",
    ),
  facePct: z
    .object({
      cxPct: z.number().min(0).max(100),
      cyPct: z.number().min(0).max(100),
    })
    .describe(
      "Center of the visible face (eyes/nose area) as % of image. If face is in profile or partly obscured, this is still the visible-face center.",
    ),
});
export type Bbox = z.infer<typeof BboxSchema>;

export const CropPointsSchema = z.object({
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  splitX: z
    .number()
    .int()
    .positive()
    .describe(
      "Pixel column where the frame should be split between left and right person. Left crop = [0, splitX], right crop = [splitX, imageWidth].",
    ),
  hostSide: z.enum(["left", "right"]),
  leftPersonDescription: z.string(),
  rightPersonDescription: z.string(),
  leftBbox: BboxSchema.describe(
    "Bounding box of the LEFT person — must encompass head + torso + visible body, tight enough that the box doesn't include the other person or large empty background. Face center should be near the horizontal center of the box.",
  ),
  rightBbox: BboxSchema.describe("Same for the RIGHT person."),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});
export type CropPoints = z.infer<typeof CropPointsSchema>;

export const QualityRatingSchema = z.object({
  side: z.enum(["left", "right"]),
  rating: z
    .number()
    .min(0)
    .max(10)
    .describe("0 = unusable, 10 = magazine-quality. Below 6 should trigger frame scrub."),
  problems: z.array(z.string()),
  needsFrameScrub: z.boolean(),
});
export type QualityRating = z.infer<typeof QualityRatingSchema>;

export const QuoteCandidatesSchema = z.object({
  quotes: z
    .array(
      z.object({
        text: z.string().describe("3-8 words, suitable for thumbnail text overlay"),
        emphasisWords: z
          .array(z.string())
          .describe(
            "1-3 words from `text` that should be visually emphasized (rendered in yellow). Pick the punchiest, most action-oriented words.",
          ),
        wordCount: z.number().int().min(2).max(10),
        timestampSec: z.number().nonnegative().nullable(),
        rationale: z.string(),
        score: z.number().min(0).max(10),
      }),
    )
    .min(3)
    .max(8),
});
export type QuoteCandidates = z.infer<typeof QuoteCandidatesSchema>;

export const StyleExtractionResultSchema = z.object({
  styleGuide: StyleGuideSchema,
  rationale: z.string(),
});
export type StyleExtractionResult = z.infer<typeof StyleExtractionResultSchema>;

export async function detectCropPoints(
  keys: ProviderKeys,
  imageBuffer: Buffer,
  hostSide: "left" | "right",
): Promise<CropPoints> {
  const anthropic = makeAnthropic(keys);
  const { output } = await generateText({
    model: anthropic(CLAUDE_VISION_MODEL),
    output: Output.object({ schema: CropPointsSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `This is a YouTube thumbnail for a two-host interview-style video.

The host is on the **${hostSide}** side; the guest is on the opposite side.

Return:
1. \`imageWidth\` and \`imageHeight\` in pixels.
2. \`splitX\`: pixel column to split (left crop = [0, splitX], right crop = [splitX, width]).
3. \`hostSide\` and a confidence score.
4. Both person descriptions (clothing, hairstyle, expression).
5. \`leftBbox\` and \`rightBbox\`: framing landmarks for each person. For each one return:
   - \`headTopPct\`: Y-coord (% of image height) of the very top of their head (top of hair/skull).
   - \`midStomachPct\`: Y-coord of their MID-STOMACH (belly-button level, ~3.5 head-heights below the top of the head). If the body is cut off, estimate where the mid-stomach WOULD be — value can exceed 100.
   - \`bodyCenterPct\`: X-coord (% of image width) of the centerline of their torso.
   - \`facePct\`: center of the visible face (eyes/nose region) in {cxPct, cyPct}.

   These two Y-coords (headTop → midStomach) define the vertical extent of the final crop for that person, so be precise. Both subjects' crops should produce comparable proportions: head + chest + ribs + mid-stomach at the frame bottom.

If the two people overlap, pick the cleanest split. If only one person is visible, set confidence below 0.4 and put a note explaining.`,
          },
          {
            type: "image",
            image: imageBuffer,
            mediaType: "image/jpeg",
          },
        ],
      },
    ],
  });
  return output;
}

export async function rateCropQuality(
  keys: ProviderKeys,
  side: "left" | "right",
  imageBuffer: Buffer,
): Promise<QualityRating> {
  const anthropic = makeAnthropic(keys);
  const { output } = await generateText({
    model: anthropic(CLAUDE_FAST_MODEL),
    output: Output.object({ schema: QualityRatingSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Rate this cropped half of a YouTube thumbnail (${side} side).

Criteria:
- Person clearly visible, head + shoulders in frame
- Sharp and well-lit
- No watermarks, captions, or other text covering the subject
- No part of the OTHER person visible

Set needsFrameScrub=true if rating < 6 — we'll scrub video frames for a better reference image.`,
          },
          { type: "image", image: imageBuffer, mediaType: "image/jpeg" },
        ],
      },
    ],
  });
  return output;
}

export async function pickBestFrame(
  keys: ProviderKeys,
  side: "left" | "right",
  personDescription: string,
  frames: { idx: number; buffer: Buffer }[],
): Promise<{ chosenIdx: number; rationale: string }> {
  const anthropic = makeAnthropic(keys);
  const { output } = await generateText({
    model: anthropic(CLAUDE_FAST_MODEL),
    output: Output.object({
      schema: z.object({
        chosenIdx: z.number().int().nonnegative(),
        rationale: z.string(),
      }),
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Pick the best reference frame for the ${side}-side person from this video.

Person description: "${personDescription}".

Best = sharp, eyes open, clear expression, head + shoulders in frame, no motion blur, no obstruction.

Return the index (0-based) of the chosen frame.`,
          },
          ...frames.flatMap((f) => [
            { type: "text" as const, text: `Frame ${f.idx}:` },
            {
              type: "image" as const,
              image: f.buffer,
              mediaType: "image/jpeg" as const,
            },
          ]),
        ],
      },
    ],
  });
  return output;
}

export async function pickQuotes(
  keys: ProviderKeys,
  transcript: string,
  videoTitle: string | null,
): Promise<QuoteCandidates> {
  const anthropic = makeAnthropic(keys);
  const { output } = await generateText({
    model: anthropic(CLAUDE_VISION_MODEL),
    output: Output.object({ schema: QuoteCandidatesSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `From this video transcript, pick 5 candidate thumbnail text overlays.

${videoTitle ? `Video title: ${videoTitle}\n\n` : ""}Constraints:
- Each candidate is 3-8 words (will render as bold display text in mixed-case).
- Use regular mixed case (NOT all caps) — capital letters at sentence starts only.
- Should make a viewer curious or feel a strong emotion.
- Prefer direct quotes from the speaker. If no good direct quote exists, you may invent a punchy paraphrase that's faithful to the content.
- Avoid generic ("you won't believe this") — favor specific, surprising, or contrarian phrases.
- For each quote, also pick \`emphasisWords\`: 1-3 words from the quote that should be highlighted in yellow (the punchy action/object words, NOT articles like "the/a/of").
- Include the approximate timestamp in seconds if you took the line directly from the transcript; otherwise null.
- Score each candidate 0–10 on thumbnail-worthiness.

Return at least 3, up to 8.

Transcript:
"""
${transcript.slice(0, 18000)}
"""`,
          },
        ],
      },
    ],
  });
  return output;
}

export async function extractStyleGuide(
  keys: ProviderKeys,
  referenceImages: { url: string; buffer: Buffer }[],
): Promise<StyleExtractionResult> {
  const anthropic = makeAnthropic(keys);
  const { output } = await generateText({
    model: anthropic(CLAUDE_VISION_MODEL),
    output: Output.object({ schema: StyleExtractionResultSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `These are reference YouTube thumbnails for two-host interview/podcast-style content.

Extract a reusable style guide that captures their shared visual style:
- Layout (which side is the host, left/right split ratio)
- Text overlay (font feel, color, stroke, position, max words, size, all-caps)
- Shading behind text (gradient/solid/blur/none + intensity)
- Accent colors (primary, secondary, saturation boost)
- Any other notes a designer would need to reproduce this look

Be specific about colors (use hex codes inferred from the images) and proportions.`,
          },
          ...referenceImages.flatMap((img) => [
            {
              type: "text" as const,
              text: `Reference (${img.url}):`,
            },
            {
              type: "image" as const,
              image: img.buffer,
              mediaType: "image/jpeg" as const,
            },
          ]),
        ],
      },
    ],
  });
  return output;
}

export async function describeImage(
  keys: ProviderKeys,
  imageBuffer: Buffer,
  prompt: string,
): Promise<string> {
  const anthropic = makeAnthropic(keys);
  const result = await generateText({
    model: anthropic(CLAUDE_FAST_MODEL),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image", image: imageBuffer, mediaType: "image/jpeg" },
        ],
      },
    ],
  });
  return result.text;
}
