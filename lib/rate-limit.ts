import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let _limiter: Ratelimit | null = null;

export function getRedis(): Redis {
  if (!_redis) _redis = Redis.fromEnv();
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
