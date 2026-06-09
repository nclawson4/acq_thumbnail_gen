import { getRedis } from "./rate-limit";
import { getDb, schema } from "./db";

export const COST_KEY = (dateUtc: string) => `spend:demo:${dateUtc}`;

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

const PRICING = {
  "anthropic/claude-sonnet": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "anthropic/claude-haiku": { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  "google/gemini-flash-image": { input: 0, output: 0, perImage: 0.04 },
  "openai/whisper-fal": { input: 0, output: 0, perMinute: 0.005 },
} as const;

export type PricingKey = keyof typeof PRICING;

export function estimateUsd(
  key: PricingKey,
  meters: {
    inputTokens?: number;
    outputTokens?: number;
    imageCount?: number;
    audioMinutes?: number;
  },
): number {
  const p = PRICING[key];
  let total = 0;
  if ("input" in p && meters.inputTokens)
    total += meters.inputTokens * p.input;
  if ("output" in p && meters.outputTokens)
    total += meters.outputTokens * p.output;
  if ("perImage" in p && meters.imageCount)
    total += meters.imageCount * (p.perImage ?? 0);
  if ("perMinute" in p && meters.audioMinutes)
    total += meters.audioMinutes * (p.perMinute ?? 0);
  return Math.round(total * 1_000_000) / 1_000_000;
}

export async function getTodayDemoSpend(): Promise<number> {
  const key = COST_KEY(utcDateString());
  const raw = await getRedis().get<number | string>(key);
  return typeof raw === "string" ? Number(raw) || 0 : raw ?? 0;
}

export async function bumpDemoSpend(amountUsd: number): Promise<number> {
  const key = COST_KEY(utcDateString());
  const cents = Math.max(0, Math.round(amountUsd * 1_000_000));
  const v = await getRedis().incrby(key, cents);
  await getRedis().expire(key, 60 * 60 * 36);
  return v / 1_000_000;
}

export async function assertDemoBudget(): Promise<void> {
  const spent = await getTodayDemoSpend();
  const cap = Number(process.env.DEMO_DAILY_SPEND_CAP_USD ?? "5");
  if (spent >= cap) {
    throw new Error(
      `Demo daily spend cap reached (${spent.toFixed(2)} / ${cap} USD). Try BYOK mode or come back tomorrow.`,
    );
  }
}

export async function recordCost(args: {
  runId?: string;
  step: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedUsd: number;
  accessMode: "demo" | "byok";
}): Promise<void> {
  await getDb().insert(schema.costLog).values({
    id: crypto.randomUUID(),
    runId: args.runId ?? null,
    step: args.step,
    provider: args.provider,
    model: args.model,
    inputTokens: args.inputTokens ?? 0,
    outputTokens: args.outputTokens ?? 0,
    estimatedUsd: args.estimatedUsd,
    accessMode: args.accessMode,
  });
  if (args.accessMode === "demo") {
    await bumpDemoSpend(args.estimatedUsd);
  }
}
