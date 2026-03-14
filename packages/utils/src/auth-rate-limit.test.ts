import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthRateLimiter } from "./auth-rate-limit.js";

describe("createAuthRateLimiter", () => {
  let limiter: ReturnType<typeof createAuthRateLimiter>;

  beforeEach(() => {
    limiter = createAuthRateLimiter({ maxAttempts: 3, windowMs: 60_000, lockoutMs: 30_000 });
  });

  it("allows requests within limit", () => {
    const result = limiter.check("1.2.3.4", "api");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });

  it("locks out after maxAttempts failures", () => {
    limiter.recordFailure("1.2.3.4", "api");
    limiter.recordFailure("1.2.3.4", "api");
    limiter.recordFailure("1.2.3.4", "api");
    const result = limiter.check("1.2.3.4", "api");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after explicit reset()", () => {
    limiter.recordFailure("1.2.3.4", "api");
    limiter.recordFailure("1.2.3.4", "api");
    limiter.recordFailure("1.2.3.4", "api");
    limiter.reset("1.2.3.4", "api");
    const result = limiter.check("1.2.3.4", "api");
    expect(result.allowed).toBe(true);
  });

  it("isolates by scope", () => {
    limiter.recordFailure("1.2.3.4", "api");
    limiter.recordFailure("1.2.3.4", "api");
    limiter.recordFailure("1.2.3.4", "api");
    // Different scope should not be locked
    const result = limiter.check("1.2.3.4", "webhook");
    expect(result.allowed).toBe(true);
  });

  it("isolates by IP", () => {
    limiter.recordFailure("1.2.3.4", "api");
    limiter.recordFailure("1.2.3.4", "api");
    limiter.recordFailure("1.2.3.4", "api");
    // Different IP should not be locked
    const result = limiter.check("5.6.7.8", "api");
    expect(result.allowed).toBe(true);
  });

  it("rate-limits loopback addresses (no exemption)", () => {
    limiter.recordFailure("127.0.0.1", "api");
    limiter.recordFailure("127.0.0.1", "api");
    limiter.recordFailure("127.0.0.1", "api");
    const result = limiter.check("127.0.0.1", "api");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("rate-limits IPv6 loopback (no exemption)", () => {
    limiter.recordFailure("::1", "api");
    limiter.recordFailure("::1", "api");
    limiter.recordFailure("::1", "api");
    const result = limiter.check("::1", "api");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("decrements remaining correctly", () => {
    limiter.recordFailure("1.2.3.4", "api");
    const result = limiter.check("1.2.3.4", "api");
    expect(result.remaining).toBe(2);
  });

  it("prune removes stale entries", () => {
    limiter.recordFailure("9.9.9.9", "api");
    limiter.prune();
    // Should not throw
    const result = limiter.check("9.9.9.9", "api");
    expect(result.allowed).toBe(true);
  });
});
