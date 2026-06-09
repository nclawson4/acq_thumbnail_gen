import { generateText } from "ai";
import {
  GEMINI_IMAGE_PRO_MODEL,
  makeGoogle,
  type ProviderKeys,
} from "./providers";

const UPSCALE_PROMPT = `Use this person as a reference but upscale the image to 4K quality. Change NOTHING about the person's clothes, facial features, or body features. Do not change the background, but upscale it. Preserve framing, pose, and crop. Output should be the same composition, just higher resolution and sharpness.`;

function extractImageBuffer(
  files: Array<{ mediaType?: string; uint8Array?: Uint8Array; base64?: string }>,
): Buffer | null {
  const image = files.find((f) => f.mediaType?.startsWith("image/"));
  if (!image) return null;
  if (image.uint8Array) return Buffer.from(image.uint8Array);
  if (image.base64) return Buffer.from(image.base64, "base64");
  return null;
}

export async function upscaleReference(
  keys: ProviderKeys,
  referenceBuffer: Buffer,
): Promise<Buffer> {
  const google = makeGoogle(keys);
  const result = await generateText({
    model: google.interactions(GEMINI_IMAGE_PRO_MODEL),
    providerOptions: {
      google: {
        responseFormat: [
          {
            type: "image",
            aspectRatio: "1:1",
            imageSize: "4K",
          },
        ],
      },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: UPSCALE_PROMPT },
          {
            type: "image",
            image: referenceBuffer,
            mediaType: "image/jpeg",
          },
        ],
      },
    ],
  });
  const buf = extractImageBuffer(result.files);
  if (!buf) throw new Error("Gemini upscale returned no image");
  return buf;
}

export async function generateComposite(
  keys: ProviderKeys,
  args: {
    leftUpscaled: Buffer;
    rightUpscaled: Buffer;
    quote: string;
    styleNotes: string;
    seedDescription: string;
  },
): Promise<Buffer> {
  const google = makeGoogle(keys);
  const prompt = `Create a 16:9 YouTube thumbnail (1280x720 final) for a two-host interview.

Layout:
- Use the FIRST reference image as the LEFT half (50% of frame width).
- Use the SECOND reference image as the RIGHT half (50% of frame width).
- Do NOT change either person's face, hair, clothes, or body.
- The split between them should be clean — no overlapping subjects, no extra cropping.

Text overlay:
- Add the text "${args.quote}" in bold all-caps as a thumbnail headline.
- ${args.styleNotes}

Other:
- High contrast, vivid saturation.
- No logos, no watermarks, no extra captions.
- ${args.seedDescription}`;

  const result = await generateText({
    model: google.interactions(GEMINI_IMAGE_PRO_MODEL),
    providerOptions: {
      google: {
        responseFormat: [
          {
            type: "image",
            aspectRatio: "16:9",
            imageSize: "2K",
          },
        ],
      },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            image: args.leftUpscaled,
            mediaType: "image/png",
          },
          {
            type: "image",
            image: args.rightUpscaled,
            mediaType: "image/png",
          },
        ],
      },
    ],
  });
  const buf = extractImageBuffer(result.files);
  if (!buf) throw new Error("Gemini composite returned no image");
  return buf;
}
