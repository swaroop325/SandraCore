import { describe, it, expect } from "vitest";
import { formatForChannel, splitIntoChunks } from "./formatter.js";

describe("formatForChannel", () => {
  it("passes through api channel unchanged", () => {
    const md = "**bold** and _italic_";
    expect(formatForChannel(md, { channel: "api" })).toBe(md);
  });

  it("converts WhatsApp links to text-only", () => {
    const out = formatForChannel("[Google](https://google.com)", { channel: "whatsapp" });
    expect(out).not.toContain("](");
    expect(out).toContain("Google");
  });

  it("converts headings to bold in Discord", () => {
    const out = formatForChannel("## Hello World", { channel: "discord" });
    expect(out).toContain("**Hello World**");
  });

  it("converts headings for Telegram", () => {
    const out = formatForChannel("## Hello", { channel: "telegram" });
    expect(out).toContain("*");
  });

  it("keeps code blocks in WhatsApp", () => {
    const out = formatForChannel("```\ncode here\n```", { channel: "whatsapp" });
    expect(out).toContain("```");
  });
});

describe("splitIntoChunks", () => {
  it("returns single chunk when under limit", () => {
    expect(splitIntoChunks("hello", 100)).toEqual(["hello"]);
  });

  it("splits long text into chunks", () => {
    const text = "a".repeat(200);
    const chunks = splitIntoChunks(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
  });

  it("prefers paragraph breaks", () => {
    const text = "first paragraph.\n\nsecond paragraph that makes it long enough to split.";
    const chunks = splitIntoChunks(text, 25);
    expect(chunks[0]).toContain("first paragraph");
  });

  it("handles maxLength 0 as no-split", () => {
    const text = "a".repeat(500);
    expect(splitIntoChunks(text, 0)).toHaveLength(1);
  });
});
