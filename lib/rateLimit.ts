/**
 * In-memory token bucket per key. Good enough for a single-process nudge
 * server. If you ever run multiple replicas behind a load balancer this
 * needs to move to Redis or the DB.
 */

type Bucket = { remaining: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimit = { limit: number; windowMs: number };

export function checkLimit(key: string, cfg: RateLimit): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { remaining: cfg.limit - 1, resetAt: now + cfg.windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (b.remaining <= 0) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.remaining--;
  return { allowed: true, retryAfterSec: 0 };
}

// Occasional cleanup so map doesn't grow unbounded on long-lived servers.
let sweeper: ReturnType<typeof setInterval> | null = null;
if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "nodejs") {
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt < now - 60_000) buckets.delete(k);
  }, 60_000);
  sweeper.unref?.();
}
