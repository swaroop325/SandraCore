import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "path";

vi.mock("fs", () => ({
  readFileSync: vi.fn().mockReturnValue("You are Sandra, a sharp AI assistant."),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  const { _resetSoul } = await import("./soul.js");
  _resetSoul();
});

describe("getSoul", () => {
  it("returns SOUL.md content", async () => {
    const { getSoul } = await import("./soul.js");
    expect(getSoul()).toContain("Sandra");
  });

  it("caches after first read", async () => {
    const { readFileSync } = await import("fs");
    const { getSoul } = await import("./soul.js");
    getSoul();
    getSoul();
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });
});
