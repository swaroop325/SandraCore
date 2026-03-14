import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt, safeCompare, sha256Hex } from "./crypto.js";

const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

beforeEach(() => {
  process.env["DATA_ENCRYPTION_KEY"] = TEST_KEY;
});

describe("encrypt / decrypt", () => {
  it("round-trips plaintext", () => {
    const plain = "hello secret world";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plain = "same input";
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it("decrypts correctly for long strings", () => {
    const plain = "x".repeat(10_000);
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("throws on tampered ciphertext", () => {
    const enc = encrypt("secret");
    const [iv, tag, ct] = enc.split(":");
    const tampered = `${iv}:${tag}:ff${ct!.slice(2)}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when key is missing", () => {
    delete process.env["DATA_ENCRYPTION_KEY"];
    expect(() => encrypt("test")).toThrow("DATA_ENCRYPTION_KEY");
  });
});

describe("safeCompare", () => {
  it("returns true for equal strings", () => {
    expect(safeCompare("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(safeCompare("abc", "abd")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(safeCompare("abc", "abcd")).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("produces a 64-char hex string", () => {
    expect(sha256Hex("hello")).toHaveLength(64);
  });

  it("is deterministic", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
  });
});
