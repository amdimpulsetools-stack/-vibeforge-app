/**
 * In-memory sliding window rate limiter.
 * Works per-process — suitable for single-instance deploys (Vercel, single container).
 * For multi-instance, swap to Redis-based (e.g. @upstash/ratelimit).
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

interface RateLimitConfig {
  /** Max requests allowed in the window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export function rateLimit(config: RateLimitConfig) {
  const { max, windowMs } = config;

  return function check(key: string): RateLimitResult {
    const now = Date.now();
    cleanup(windowMs);

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= max) {
      const oldestInWindow = entry.timestamps[0];
      return {
        success: false,
        limit: max,
        remaining: 0,
        reset: oldestInWindow + windowMs,
      };
    }

    entry.timestamps.push(now);
    return {
      success: true,
      limit: max,
      remaining: max - entry.timestamps.length,
      reset: now + windowMs,
    };
  };
}

// ── Pre-configured limiters for different route types ─────────────────────────

/** AI assistant: 10 requests per minute per user (expensive API calls) */
export const aiLimiter = rateLimit({ max: 10, windowMs: 60 * 1000 });

/** Payment/checkout: 5 requests per minute per user */
export const paymentLimiter = rateLimit({ max: 5, windowMs: 60 * 1000 });

/** Email sending: 3 requests per minute per user */
export const emailLimiter = rateLimit({ max: 3, windowMs: 60 * 1000 });

/** General API: 30 requests per minute per user */
export const generalLimiter = rateLimit({ max: 30, windowMs: 60 * 1000 });

/** Webhooks: 60 requests per minute per IP (MP can burst) */
export const webhookLimiter = rateLimit({ max: 60, windowMs: 60 * 1000 });
