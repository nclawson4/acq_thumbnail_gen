import { headers } from "next/headers";
import { z } from "zod";

export const AccessModeSchema = z.enum(["demo", "byok"]);
export type AccessMode = z.infer<typeof AccessModeSchema>;

export const ByokKeysSchema = z.object({
  geminiApiKey: z.string().min(10),
  anthropicApiKey: z.string().min(10),
});
export type ByokKeys = z.infer<typeof ByokKeysSchema>;

export type AccessGrant =
  | { mode: "demo"; ip: string }
  | { mode: "byok"; ip: string; keys: ByokKeys };

export class AccessDeniedError extends Error {
  constructor(
    public reason: "missing_credentials" | "invalid_passcode" | "invalid_byok",
  ) {
    super(`access_denied:${reason}`);
  }
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

export async function authorizeRequest(
  body: unknown,
): Promise<AccessGrant> {
  const ip = await getClientIp();
  const expected = process.env.DEMO_PASSCODE;

  const parsed = z
    .object({
      mode: AccessModeSchema,
      passcode: z.string().optional(),
      keys: ByokKeysSchema.optional(),
    })
    .safeParse(body);

  if (!parsed.success) {
    throw new AccessDeniedError("missing_credentials");
  }

  const { mode, passcode, keys } = parsed.data;

  if (mode === "demo") {
    if (!expected || passcode !== expected) {
      throw new AccessDeniedError("invalid_passcode");
    }
    return { mode: "demo", ip };
  }

  if (!keys) {
    throw new AccessDeniedError("invalid_byok");
  }
  return { mode: "byok", ip, keys };
}

export function resolveAiKeys(grant: AccessGrant): {
  geminiApiKey: string;
  anthropicApiKey: string;
} {
  if (grant.mode === "byok") {
    return {
      geminiApiKey: grant.keys.geminiApiKey,
      anthropicApiKey: grant.keys.anthropicApiKey,
    };
  }
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiApiKey || !anthropicApiKey) {
    throw new Error(
      "Demo mode requires GEMINI_API_KEY and ANTHROPIC_API_KEY in server env.",
    );
  }
  return { geminiApiKey, anthropicApiKey };
}
