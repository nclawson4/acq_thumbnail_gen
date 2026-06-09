function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  get GEMINI_API_KEY() {
    return required("GEMINI_API_KEY");
  },
  get ANTHROPIC_API_KEY() {
    return required("ANTHROPIC_API_KEY");
  },
  get FAL_KEY() {
    return optional("FAL_KEY");
  },
  get DEMO_PASSCODE() {
    return required("DEMO_PASSCODE");
  },
  get DEMO_DAILY_SPEND_CAP_USD() {
    return Number(process.env.DEMO_DAILY_SPEND_CAP_USD ?? "5");
  },
  get BLOB_READ_WRITE_TOKEN() {
    return optional("BLOB_READ_WRITE_TOKEN");
  },
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get REDIS_REST_URL() {
    const v =
      process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    if (!v) throw new Error("Missing UPSTASH_REDIS_REST_URL or KV_REST_API_URL");
    return v;
  },
  get REDIS_REST_TOKEN() {
    const v =
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    if (!v) throw new Error("Missing UPSTASH_REDIS_REST_TOKEN or KV_REST_API_TOKEN");
    return v;
  },
  get INGEST_SANDBOX_SNAPSHOT_ID() {
    return optional("INGEST_SANDBOX_SNAPSHOT_ID");
  },
  get VERCEL_OIDC_TOKEN() {
    return optional("VERCEL_OIDC_TOKEN");
  },
} as const;
