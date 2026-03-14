export interface RateLimitConfig {
  /** Number of failed attempts before lockout. Default: 10 */
  maxAttempts: number;
  /** Window in ms during which attempts are counted. Default: 60_000 (1 min) */
  windowMs: number;
  /** How long to lock out after maxAttempts exceeded. Default: 300_000 (5 min) */
  lockoutMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface ScopeEntry {
  attempts: { ts: number }[];
  lockedUntil: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 60_000,
  lockoutMs: 300_000,
};

export function createAuthRateLimiter(config?: Partial<RateLimitConfig>) {
  const cfg: RateLimitConfig = { ...DEFAULT_CONFIG, ...config };
  const store = new Map<string, ScopeEntry>();

  function key(ip: string, scope: string): string {
    return `${ip}::${scope}`;
  }

  function prune(): void {
    const now = Date.now();
    const cutoff = now - Math.max(cfg.windowMs, cfg.lockoutMs);
    for (const [k, entry] of store.entries()) {
      if (entry.lockedUntil < now && entry.attempts.every((a) => a.ts < cutoff)) {
        store.delete(k);
      }
    }
  }

  function check(ip: string, scope: string): RateLimitResult {
    const k = key(ip, scope);
    const now = Date.now();
    const entry = store.get(k) ?? { attempts: [], lockedUntil: 0 };

    if (entry.lockedUntil > now) {
      return { allowed: false, remaining: 0, retryAfterMs: entry.lockedUntil - now };
    }

    // Slide window
    const windowStart = now - cfg.windowMs;
    entry.attempts = entry.attempts.filter((a) => a.ts > windowStart);

    const remaining = cfg.maxAttempts - entry.attempts.length;
    return { allowed: remaining > 0, remaining: Math.max(0, remaining), retryAfterMs: 0 };
  }

  function recordFailure(ip: string, scope: string): void {
    const k = key(ip, scope);
    const now = Date.now();
    const entry = store.get(k) ?? { attempts: [], lockedUntil: 0 };

    entry.attempts.push({ ts: now });

    const windowStart = now - cfg.windowMs;
    entry.attempts = entry.attempts.filter((a) => a.ts > windowStart);

    if (entry.attempts.length >= cfg.maxAttempts) {
      entry.lockedUntil = now + cfg.lockoutMs;
    }

    store.set(k, entry);
  }

  function reset(ip: string, scope: string): void {
    store.delete(key(ip, scope));
  }

  // Prune stale entries every 5 minutes
  const pruneInterval = setInterval(prune, 5 * 60_000);
  if (pruneInterval.unref) pruneInterval.unref();

  return { check, recordFailure, reset, prune };
}

export type AuthRateLimiter = ReturnType<typeof createAuthRateLimiter>;
