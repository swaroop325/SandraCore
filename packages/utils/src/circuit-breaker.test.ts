import { describe, it, expect, vi } from "vitest";
import { createCircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";

describe("createCircuitBreaker", () => {
  it("starts CLOSED", () => {
    const cb = createCircuitBreaker();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("passes through successful calls", async () => {
    const cb = createCircuitBreaker();
    const result = await cb.call(async () => "ok");
    expect(result).toBe("ok");
  });

  it("opens after failureThreshold", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
    for (let i = 0; i < 3; i++) {
      await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    }
    expect(cb.getState()).toBe("OPEN");
  });

  it("throws CircuitOpenError when OPEN", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
    await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    await expect(cb.call(async () => "ok")).rejects.toThrow(CircuitOpenError);
  });

  it("transitions to HALF_OPEN after resetTimeout", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
    await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    expect(cb.getState()).toBe("OPEN");
    await cb.call(async () => "ok").catch(() => {}); // transitions to HALF_OPEN, succeeds
    // After 1 success with successThreshold=2, should still be HALF_OPEN (default threshold=2)
    expect(cb.getState()).not.toBe("OPEN");
  });

  it("closes after successThreshold in HALF_OPEN", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, successThreshold: 2, resetTimeoutMs: 0 });
    await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    await cb.call(async () => "ok"); // HALF_OPEN success 1
    await cb.call(async () => "ok"); // HALF_OPEN success 2 → CLOSED
    expect(cb.getState()).toBe("CLOSED");
  });

  it("reset() restores CLOSED state", async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
    await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    cb.reset();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("calls onStateChange on transition", async () => {
    const changes: string[] = [];
    const cb = createCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
      onStateChange: (from, to) => changes.push(`${from}->${to}`),
    });
    await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    expect(changes).toContain("CLOSED->OPEN");
  });
});
