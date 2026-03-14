import { describe, it, expect } from "vitest";
import { expandQueryToKeywords, STOP_WORDS_EN } from "./query-expansion.js";

describe("expandQueryToKeywords", () => {
  it("strips English stop words", () => {
    const tokens = expandQueryToKeywords("that book I mentioned last week");
    expect(tokens).not.toContain("that");
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("last");
    expect(tokens).not.toContain("week");
    expect(tokens).toContain("book");
    expect(tokens).toContain("mentioned");
  });

  it("filters short tokens with length < 3", () => {
    const tokens = expandQueryToKeywords("go to a big party");
    expect(tokens).not.toContain("go");
    expect(tokens).not.toContain("to");
    expect(tokens).not.toContain("a");
    expect(tokens).toContain("big");
    expect(tokens).toContain("party");
  });

  it("strips punctuation", () => {
    const tokens = expandQueryToKeywords("hello, world! how's it going?");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).not.toContain("hello,");
    expect(tokens).not.toContain("world!");
  });

  it("lowercases all tokens", () => {
    const tokens = expandQueryToKeywords("Python JavaScript TypeScript");
    expect(tokens).toContain("python");
    expect(tokens).toContain("javascript");
    expect(tokens).toContain("typescript");
    expect(tokens).not.toContain("Python");
  });

  it("returns unique tokens — no duplicates", () => {
    const tokens = expandQueryToKeywords("book book book shelf");
    const bookCount = tokens.filter((t) => t === "book").length;
    expect(bookCount).toBe(1);
    expect(tokens).toContain("shelf");
  });

  it("returns empty array for empty string", () => {
    expect(expandQueryToKeywords("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(expandQueryToKeywords("   ")).toEqual([]);
  });

  it("returns empty array when all tokens are stop words or too short", () => {
    const tokens = expandQueryToKeywords("a an the is are");
    expect(tokens).toEqual([]);
  });

  it("preserves CJK characters as individual tokens", () => {
    const tokens = expandQueryToKeywords("日本語");
    expect(tokens).toContain("日");
    expect(tokens).toContain("本");
    expect(tokens).toContain("語");
    expect(tokens).toHaveLength(3);
  });

  it("handles mixed CJK and Latin text", () => {
    const tokens = expandQueryToKeywords("favorite 食べ物 restaurant");
    expect(tokens).toContain("favorite");
    expect(tokens).toContain("食");
    expect(tokens).toContain("べ");
    expect(tokens).toContain("物");
    expect(tokens).toContain("restaurant");
  });

  it("STOP_WORDS_EN is exported and contains expected words", () => {
    expect(STOP_WORDS_EN).toBeInstanceOf(Set);
    expect(STOP_WORDS_EN.has("the")).toBe(true);
    expect(STOP_WORDS_EN.has("i")).toBe(true);
    expect(STOP_WORDS_EN.has("my")).toBe(true);
    expect(STOP_WORDS_EN.has("book")).toBe(false);
  });

  it("handles apostrophes in words gracefully", () => {
    const tokens = expandQueryToKeywords("don't worry about it");
    // "don" and "worry" should survive (both >= 3 chars and not stop words)
    expect(tokens).toContain("don");
    expect(tokens).toContain("worry");
  });
});
