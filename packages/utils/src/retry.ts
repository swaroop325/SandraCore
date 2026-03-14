export interface RetryConfig {
  maxAttempts: number;       // default 3
  initialDelayMs: number;    // default 500
  maxDelayMs: number;        // default 30_000
  backoffFactor: number;     // default 2
  jitter: boolean;           // default true — adds ±20% random spread
  retryIf?: (err: unknown) => boolean; // default: always retry
}

export class RetryExhaustedError extends Error {
  constructor(public readonly attempts: number, public readonly lastError: unknown) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    super(`Retry exhausted after ${attempts} attempts: ${msg}`);
    this.name = "RetryExhaustedError";
  }
}

const DEFAULT: Required<Omit<RetryConfig, "retryIf">> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  backoffFactor: 2,
  jitter: true,
};

function calcDelay(attempt: number, cfg: Required<Omit<RetryConfig, "retryIf">>): number {
  const base = Math.min(cfg.initialDelayMs * Math.pow(cfg.backoffFactor, attempt), cfg.maxDelayMs);
  if (!cfg.jitter) return base;
  // ±20% jitter
  return Math.floor(base * (0.8 + Math.random() * 0.4));
}

export async function retry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const cfg = { ...DEFAULT, ...config };
  let lastErr: unknown;
  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (cfg.retryIf && !cfg.retryIf(err)) throw err;
      if (attempt < cfg.maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, calcDelay(attempt, cfg)));
      }
    }
  }
  throw new RetryExhaustedError(cfg.maxAttempts, lastErr);
}

/** Retry only on network/transient errors (5xx, ECONNRESET, ETIMEDOUT, etc.) */
export function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("enotfound") || msg.includes("network")) return true;
  }
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: number }).status;
    return status >= 500 && status < 600;
  }
  return false;
}
