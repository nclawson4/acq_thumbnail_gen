import { z } from "zod";

export const StyleGuideSchema = z.object({
  layout: z.object({
    hostSide: z.enum(["left", "right"]),
    splitRatio: z.number().min(0.3).max(0.7).default(0.5),
  }),
  text: z.object({
    fontFamily: z.string(),
    fontWeight: z
      .union([z.literal("normal"), z.literal("bold"), z.literal("black")])
      .default("black"),
    color: z.string().describe("hex like #FFFFFF"),
    strokeColor: z.string().nullable(),
    strokeWidth: z.number().min(0).max(24).default(8),
    position: z.enum([
      "top",
      "bottom",
      "center",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ]),
    maxWords: z.number().min(2).max(8).default(6),
    sizeRatio: z
      .number()
      .min(0.05)
      .max(0.25)
      .describe("Fraction of 720 height"),
    allCaps: z.boolean().default(true),
  }),
  shading: z.object({
    behindText: z.enum(["none", "gradient", "solid", "blur"]),
    intensity: z.number().min(0).max(1).default(0.4),
  }),
  accent: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string().nullable(),
    saturationBoost: z.number().min(-0.3).max(0.5).default(0.1),
  }),
  notes: z.string().optional(),
});

export type StyleGuide = z.infer<typeof StyleGuideSchema>;

export const TWO_HOST_DEFAULT_STYLE: StyleGuide = {
  layout: { hostSide: "right", splitRatio: 0.5 },
  text: {
    fontFamily: "Impact, 'Anton', 'Bebas Neue', sans-serif",
    fontWeight: "black",
    color: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 10,
    position: "bottom",
    maxWords: 5,
    sizeRatio: 0.13,
    allCaps: true,
  },
  shading: { behindText: "gradient", intensity: 0.55 },
  accent: {
    primaryColor: "#fdfc33",
    secondaryColor: "#FF3B30",
    saturationBoost: 0.1,
  },
  notes:
    "High-contrast, bold sans-serif text overlay anchored at the bottom. Subjects fill the frame with shoulders/heads visible. Vivid saturation. No clutter, no logos.",
};
