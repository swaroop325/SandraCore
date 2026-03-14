import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDedupeCache } from "./dedupe.js";

describe("createDedupeCache", () => {
  let cache: ReturnType<typeof createDedupeCache>;

  beforeEach(() => {
    cache = createDedupeCache({ ttlMs: 1000, maxSize: 5 });
  });

  it("returns false for new message IDs", () => {
    expect(cache.isDuplicate("msg-1")).toBe(false);
  });

  it("returns true for already-seen IDs", () => {
    cache.isDuplicate("msg-2");
    expect(cache.isDuplicate("msg-2")).toBe(true);
  });

  it("returns false after TTL expires", async () => {
    const c = createDedupeCache({ ttlMs: 10, maxSize: 100 });
    c.isDuplicate("msg-ttl");
    await new Promise((r) => setTimeout(r, 20));
    expect(c.isDuplicate("msg-ttl")).toBe(false);
  });

  it("evicts oldest entries when maxSize exceeded", () => {
    for (let i = 0; i < 5; i++) cache.isDuplicate(`msg-${i}`);
    expect(cache.size()).toBe(5);
    cache.isDuplicate("msg-overflow");
    expect(cache.size()).toBeLessThanOrEqual(5);
  });

  it("different IDs are independent", () => {
    cache.isDuplicate("msg-a");
    expect(cache.isDuplicate("msg-b")).toBe(false);
  });

  it("clear() empties the cache", () => {
    cache.isDuplicate("msg-x");
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.isDuplicate("msg-x")).toBe(false); // no longer seen
  });
});
