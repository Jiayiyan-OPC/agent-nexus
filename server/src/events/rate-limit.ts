/**
 * Simple token-bucket rate limiter.
 * Each source agent gets `capacity` tokens, refilled at `refillRate` tokens/sec.
 */

const DEFAULT_CAPACITY = 10;
const DEFAULT_REFILL_RATE = 10; // tokens per second

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

// Stale bucket cleanup interval (5 minutes)
const STALE_MS = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startRateLimitCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, bucket] of buckets) {
      if (now - bucket.lastRefill > STALE_MS) {
        buckets.delete(id);
      }
    }
  }, STALE_MS);
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export function clearBucket(agentId: string): void {
  buckets.delete(agentId);
}

export function isRateLimited(
  agentId: string,
  capacity = DEFAULT_CAPACITY,
  refillRate = DEFAULT_REFILL_RATE,
): boolean {
  const now = Date.now();
  let bucket = buckets.get(agentId);

  if (!bucket) {
    bucket = { tokens: capacity - 1, lastRefill: now };
    buckets.set(agentId, bucket);
    return false;
  }

  // Refill tokens based on elapsed time
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return false;
  }

  return true;
}
