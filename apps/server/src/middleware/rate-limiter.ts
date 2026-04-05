import type { Request, Response, NextFunction } from "express";
import { createAppError } from "./error-handler.js";

/**
 * In-memory token bucket rate limiter.
 * 10 requests per minute per IP on POST /api/extract.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

/**
 * Clean up stale buckets every 5 minutes to prevent memory leak.
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (now - bucket.lastRefill > WINDOW_MS * 5) {
      buckets.delete(ip);
    }
  }
}, WINDOW_MS * 5);

/**
 * Rate limiter middleware — 10 requests per minute per IP.
 */
export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();

  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: MAX_REQUESTS, lastRefill: now };
    buckets.set(ip, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / WINDOW_MS) * MAX_REQUESTS;
  bucket.tokens = Math.min(MAX_REQUESTS, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfterMs = Math.ceil(((1 - bucket.tokens) / MAX_REQUESTS) * WINDOW_MS);

    const err = createAppError("Rate limit exceeded. Please try again later.", 429, "RATE_LIMITED", { retryAfterMs });

    // Set Retry-After header (in seconds)
    res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));

    next(err);
    return;
  }

  bucket.tokens -= 1;
  next();
}
