import { describe, it, expect, vi } from "vitest";

const mockExecute = vi.fn().mockResolvedValue({});
vi.mock("./db.js", () => ({ db: { execute: mockExecute, query: vi.fn() } }));

describe("getOrCreateSession", () => {
  it("returns channel:rawId format", async () => {
    const { getOrCreateSession } = await import("./sessions.js");
    const sessionId = await getOrCreateSession("user-1", "telegram", "123456");
    expect(sessionId).toBe("telegram:123456");
  });

  it("calls db.execute with correct SQL", async () => {
    const { getOrCreateSession } = await import("./sessions.js");
    await getOrCreateSession("user-1", "telegram", "999");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO channel_sessions"),
      ["user-1", "telegram:999", "telegram"]
    );
  });
});
