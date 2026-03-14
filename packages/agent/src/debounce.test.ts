import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncer } from "./debounce.js";

describe("createDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("single message resolves with its text after the debounce window", async () => {
    const debouncer = createDebouncer(1500);
    const promise = debouncer.add("session-1", "hey");

    vi.advanceTimersByTime(1500);
    const result = await promise;

    expect(result).toBe("hey");
  });

  it("two rapid messages: first resolves null, second resolves combined text", async () => {
    const debouncer = createDebouncer(1500);

    const p1 = debouncer.add("session-1", "hey");
    const p2 = debouncer.add("session-1", "quick question");

    vi.advanceTimersByTime(1500);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBeNull();
    expect(r2).toBe("hey\nquick question");
  });

  it("three rapid messages: first two resolve null, third resolves combined text", async () => {
    const debouncer = createDebouncer(1500);

    const p1 = debouncer.add("session-1", "hey");
    const p2 = debouncer.add("session-1", "quick question");
    const p3 = debouncer.add("session-1", "are you there");

    vi.advanceTimersByTime(1500);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(r3).toBe("hey\nquick question\nare you there");
  });

  it("messages for different sessions are independent", async () => {
    const debouncer = createDebouncer(1500);

    const pA1 = debouncer.add("session-a", "hello from A");
    const pB1 = debouncer.add("session-b", "hello from B");
    const pA2 = debouncer.add("session-a", "second from A");

    vi.advanceTimersByTime(1500);

    const [rA1, rB1, rA2] = await Promise.all([pA1, pB1, pA2]);

    // Session A batched its two messages
    expect(rA1).toBeNull();
    expect(rA2).toBe("hello from A\nsecond from A");

    // Session B only had one message — resolves independently with its own text
    expect(rB1).toBe("hello from B");
  });

  it("destroy() clears all pending timers and resolves promises with null", async () => {
    const debouncer = createDebouncer(1500);

    const p1 = debouncer.add("session-1", "pending message");

    // Destroy before the timer fires
    debouncer.destroy();

    const result = await p1;
    expect(result).toBeNull();
  });
});
