export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;   // failures before opening. default 5
  successThreshold: number;   // successes in HALF_OPEN before closing. default 2
  resetTimeoutMs: number;     // how long to stay OPEN before trying HALF_OPEN. default 60_000
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitOpenError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Circuit is OPEN. Retry after ${retryAfterMs}ms`);
    this.name = "CircuitOpenError";
  }
}

const DEFAULTS: Required<Omit<CircuitBreakerConfig, "onStateChange">> = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 60_000,
};

export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>) {
  const cfg = { ...DEFAULTS, ...config };
  let state: CircuitState = "CLOSED";
  let failureCount = 0;
  let successCount = 0;
  let openedAt = 0;

  function transition(to: CircuitState): void {
    if (state !== to) {
      cfg.onStateChange?.(state, to);
      state = to;
    }
  }

  function getState(): CircuitState { return state; }
  function getFailureCount(): number { return failureCount; }

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    if (state === "OPEN") {
      const elapsed = Date.now() - openedAt;
      if (elapsed < cfg.resetTimeoutMs) {
        throw new CircuitOpenError(cfg.resetTimeoutMs - elapsed);
      }
      transition("HALF_OPEN");
      successCount = 0;
    }

    try {
      const result = await fn();
      if (state === "HALF_OPEN") {
        successCount++;
        if (successCount >= cfg.successThreshold) {
          failureCount = 0;
          transition("CLOSED");
        }
      } else {
        failureCount = 0;
      }
      return result;
    } catch (err) {
      failureCount++;
      if (state === "HALF_OPEN" || failureCount >= cfg.failureThreshold) {
        openedAt = Date.now();
        failureCount = cfg.failureThreshold; // keep at threshold
        transition("OPEN");
      }
      throw err;
    }
  }

  function reset(): void {
    state = "CLOSED";
    failureCount = 0;
    successCount = 0;
    openedAt = 0;
  }

  return { call, getState, getFailureCount, reset };
}

export type CircuitBreaker = ReturnType<typeof createCircuitBreaker>;
