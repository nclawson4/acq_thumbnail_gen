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
  get UPSTASH_REDIS_REST_URL() {
    return required("UPSTASH_REDIS_REST_URL");
  },
  get UPSTASH_REDIS_REST_TOKEN() {
    return required("UPSTASH_REDIS_REST_TOKEN");
  },
  get INGEST_SANDBOX_SNAPSHOT_ID() {
    return optional("INGEST_SANDBOX_SNAPSHOT_ID");
  },
  get VERCEL_OIDC_TOKEN() {
    return optional("VERCEL_OIDC_TOKEN");
  },
} as const;
