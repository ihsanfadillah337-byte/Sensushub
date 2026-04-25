import { Mutex } from 'async-mutex';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitCache = new Map<string, RateLimitRecord>();
const cleanupMutex = new Mutex();

// Konfigurasi limit: Max 5 percobaan per 15 menit
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; remainingMs: number }> {
  return await cleanupMutex.runExclusive(() => {
    const now = Date.now();
    const record = rateLimitCache.get(identifier);

    // Clean up expired records randomly (10% chance) to prevent memory leaks
    if (Math.random() < 0.1) {
      for (const [key, val] of rateLimitCache.entries()) {
        if (now > val.resetAt) {
          rateLimitCache.delete(key);
        }
      }
    }

    if (!record) {
      rateLimitCache.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
      return { allowed: true, remainingMs: 0 };
    }

    if (now > record.resetAt) {
      rateLimitCache.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
      return { allowed: true, remainingMs: 0 };
    }

    if (record.count >= MAX_ATTEMPTS) {
      return { allowed: false, remainingMs: record.resetAt - now };
    }

    record.count += 1;
    return { allowed: true, remainingMs: 0 };
  });
}

export function resetRateLimit(identifier: string) {
  rateLimitCache.delete(identifier);
}
