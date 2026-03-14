import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({
  db: { execute: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("./logger.js", () => ({
  createSubsystemLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { auditLog } from "./audit.js";
import { db } from "./db.js";

const mockExecute = vi.mocked(db.execute);

beforeEach(() => vi.clearAllMocks());

describe("auditLog", () => {
  it("inserts an audit entry to the DB", async () => {
    await auditLog({ action: "auth.success", ip: "1.2.3.4", channel: "telegram" });
    expect(mockExecute).toHaveBeenCalledOnce();
    const [sql] = mockExecute.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO audit_log");
  });

  it("does not throw when DB fails", async () => {
    mockExecute.mockRejectedValueOnce(new Error("DB down"));
    await expect(auditLog({ action: "auth.failure", ip: "1.2.3.4" })).resolves.toBeUndefined();
  });

  it("includes userId and sessionId when provided", async () => {
    await auditLog({ action: "message.received", userId: "uid-1", sessionId: "sess-1" });
    const [, params] = mockExecute.mock.calls[0]!;
    expect(params).toContain("uid-1");
    expect(params).toContain("sess-1");
  });
});
