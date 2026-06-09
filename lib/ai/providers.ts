import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const CLAUDE_VISION_MODEL = "claude-sonnet-4-5";
export const CLAUDE_TEXT_MODEL = "claude-sonnet-4-5";
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5";

export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
export const GEMINI_IMAGE_PRO_MODEL = "gemini-3-pro-image-preview";

export type ProviderKeys = {
  geminiApiKey: string;
  anthropicApiKey: string;
};

export function makeAnthropic(keys: ProviderKeys) {
  return createAnthropic({ apiKey: keys.anthropicApiKey });
}

export function makeGoogle(keys: ProviderKeys) {
  return createGoogleGenerativeAI({ apiKey: keys.geminiApiKey });
}
