import { describe, it, expect, vi } from "vitest";
import { retry, RetryExhaustedError, isTransientError } from "./retry.js";

describe("retry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn, { maxAttempts: 3, initialDelayMs: 0, jitter: false });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "done";
    });
    const result = await retry(fn, { maxAttempts: 3, initialDelayMs: 0, jitter: false });
    expect(result).toBe("done");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws RetryExhaustedError after max attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(retry(fn, { maxAttempts: 3, initialDelayMs: 0, jitter: false })).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops immediately when retryIf returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fatal"));
    await expect(
      retry(fn, { maxAttempts: 3, initialDelayMs: 0, jitter: false, retryIf: () => false })
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects maxAttempts: 1 (no retries)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(retry(fn, { maxAttempts: 1, initialDelayMs: 0, jitter: false })).rejects.toThrow(RetryExhaustedError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isTransientError", () => {
  it("detects ECONNRESET", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
  });
  it("detects 503", () => {
    expect(isTransientError({ status: 503 })).toBe(true);
  });
  it("does not flag 400", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
  });
  it("does not flag non-transient Error", () => {
    expect(isTransientError(new Error("bad input"))).toBe(false);
  });
});
