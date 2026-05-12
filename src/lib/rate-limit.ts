// Tiny in-memory rate limiter, keyed by client IP.
//
// NOTE: this is per-instance (per lambda) state — it resets on cold start and
// is not shared across concurrent serverless instances. That is acceptable for
// a single-user War Room: at worst an attacker who hits multiple instances can
// burst slightly above the cap. If we ever scale to multi-user we should swap
// this for Upstash or Vercel KV.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: max - 1, resetAt, retryAfterSec: 0 };
  }
  if (existing.count >= max) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: max - existing.count,
    resetAt: existing.resetAt,
    retryAfterSec: 0,
  };
}

/** Best-effort client IP. Vercel sets `x-forwarded-for`, Railway sets it too. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
