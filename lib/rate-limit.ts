import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let _limiter: Ratelimit | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    const url =
      process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error(
        "Missing Upstash credentials. Expected UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN.",
      );
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

export function getRateLimiter(): Ratelimit {
  if (!_limiter) {
    _limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      analytics: true,
      prefix: "rl:thumbgen",
    });
  }
  return _limiter;
}

export async function checkRateLimit(
  identifier: string,
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const r = await getRateLimiter().limit(identifier);
  return { success: r.success, remaining: r.remaining, reset: r.reset };
}
