import { describe, it, expect } from "vitest";
import { checkRegexSafety, compileSafeRegex } from "./safe-regex.js";

describe("checkRegexSafety", () => {
  describe("safe patterns", () => {
    it("accepts simple character class", () => {
      expect(checkRegexSafety("[a-z]+")).toEqual({ safe: true });
    });

    it("accepts anchored pattern", () => {
      expect(checkRegexSafety("^hello world$")).toEqual({ safe: true });
    });

    it("accepts non-nested group", () => {
      expect(checkRegexSafety("(abc)+")).toEqual({ safe: true });
    });

    it("accepts email-like pattern", () => {
      expect(checkRegexSafety("[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,}")).toEqual({ safe: true });
    });

    it("accepts alternation without nesting", () => {
      expect(checkRegexSafety("(cat|dog)+")).toEqual({ safe: true });
    });
  });

  describe("unsafe patterns (ReDoS)", () => {
    it("rejects (a+)+ — classic catastrophic backtracking", () => {
      const result = checkRegexSafety("(a+)+");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("Nested repetition");
    });

    it("rejects (a*)* pattern", () => {
      const result = checkRegexSafety("(a*)*");
      expect(result.safe).toBe(false);
    });

    it("rejects nested groups with quantifiers", () => {
      const result = checkRegexSafety("((ab)+)+");
      expect(result.safe).toBe(false);
    });
  });

  describe("invalid patterns", () => {
    it("rejects syntactically invalid regex", () => {
      const result = checkRegexSafety("(unclosed");
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("syntax");
    });
  });
});

describe("compileSafeRegex", () => {
  it("returns RegExp for safe pattern", () => {
    const re = compileSafeRegex("[a-z]+", "i");
    expect(re).toBeInstanceOf(RegExp);
  });

  it("returns null for unsafe pattern", () => {
    const re = compileSafeRegex("(a+)+");
    expect(re).toBeNull();
  });

  it("returns null for invalid pattern", () => {
    const re = compileSafeRegex("[unclosed");
    expect(re).toBeNull();
  });

  it("applies flags correctly", () => {
    const re = compileSafeRegex("hello", "gi");
    expect(re?.flags).toContain("g");
    expect(re?.flags).toContain("i");
  });
});
