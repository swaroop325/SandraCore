import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn().mockResolvedValue({ rowCount: 1 });
const mockQuery = vi.fn();

vi.mock("./db.js", () => ({
  db: { execute: mockExecute, query: mockQuery },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generatePairingCode", () => {
  it("generates an 8-character code", async () => {
    const { generatePairingCode } = await import("./pairing.js");
    const code = generatePairingCode();
    expect(code).toHaveLength(8);
  });

  it("uses only allowed alphabet characters", async () => {
    const { generatePairingCode } = await import("./pairing.js");
    const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 20; i++) {
      const code = generatePairingCode();
      for (const ch of code) {
        expect(ALPHABET).toContain(ch);
      }
    }
  });

  it("generates unique codes", async () => {
    const { generatePairingCode } = await import("./pairing.js");
    const codes = new Set(Array.from({ length: 100 }, () => generatePairingCode()));
    expect(codes.size).toBe(100);
  });

  it("does not contain ambiguous characters (0, O, 1, I, l)", async () => {
    const { generatePairingCode } = await import("./pairing.js");
    for (let i = 0; i < 50; i++) {
      const code = generatePairingCode();
      expect(code).not.toMatch(/[0O1Il]/);
    }
  });
});

describe("createPairingRequest", () => {
  it("returns a code and expiry date", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] });
    const { createPairingRequest } = await import("./pairing.js");
    const result = await createPairingRequest(123456789);
    expect(result.code).toHaveLength(8);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws when too many pending requests", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "3" }] });
    const { createPairingRequest } = await import("./pairing.js");
    await expect(createPairingRequest(123456789)).rejects.toThrow(
      "Too many pending pairing requests"
    );
  });
});

describe("redeemPairingCode", () => {
  it("returns false for unknown code", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { redeemPairingCode } = await import("./pairing.js");
    const result = await redeemPairingCode("INVALID1", 123456789);
    expect(result).toBe(false);
  });

  it("returns true and approves user for valid code", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "req-uuid", telegram_id: "123456789" }],
    });
    const { redeemPairingCode } = await import("./pairing.js");
    const result = await redeemPairingCode("VALIDCOD", 123456789);
    expect(result).toBe(true);
    // approve user + allowlist
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE pairing_requests SET used_at"),
      expect.any(Array)
    );
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users SET status = 'approved'"),
      expect.any(Array)
    );
  });

  it("normalises code to uppercase before lookup", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { redeemPairingCode } = await import("./pairing.js");
    await redeemPairingCode("abcd1234", 123456789);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      ["ABCD1234"]
    );
  });
});
