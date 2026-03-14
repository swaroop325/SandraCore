import { describe, it, expect } from "vitest";
import { chunkText, formatStatus, statusEmoji, validateManifest, acquireLock, releaseLock } from "./index.js";

describe("chunkText", () => {
  it("returns single chunk if under limit", () => {
    expect(chunkText("hello", 100)).toEqual(["hello"]);
  });
  it("splits long text at word boundary", () => {
    const result = chunkText("one two three four", 8);
    expect(result.length).toBeGreaterThan(1);
    for (const c of result) expect(c.length).toBeLessThanOrEqual(8);
  });
  it("returns empty for empty input", () => {
    expect(chunkText("", 10)).toEqual([]);
  });
});

describe("statusEmoji / formatStatus", () => {
  it("maps levels to emojis", () => {
    expect(statusEmoji("success")).toBe("✅");
    expect(statusEmoji("error")).toBe("❌");
  });
  it("formatStatus includes emoji and message", () => {
    const s = formatStatus("warning", "disk low");
    expect(s).toContain("⚠️");
    expect(s).toContain("disk low");
  });
});

describe("validateManifest", () => {
  it("validates correct manifest", () => {
    expect(validateManifest({ name: "test", version: "1.0.0", description: "Test plugin" })).toBe(true);
  });
  it("rejects missing fields", () => {
    expect(validateManifest({ name: "test" })).toBe(false);
  });
  it("rejects non-object", () => {
    expect(validateManifest("string")).toBe(false);
  });
});

describe("acquireLock / releaseLock", () => {
  it("acquires and releases", () => {
    expect(acquireLock("test-lock")).toBe(true);
    expect(acquireLock("test-lock")).toBe(false); // already held
    releaseLock("test-lock");
    expect(acquireLock("test-lock")).toBe(true); // free again
    releaseLock("test-lock");
  });
});
