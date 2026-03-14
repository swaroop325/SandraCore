import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createFtsStore } from "./fts.js";
import type { FtsStore } from "./fts.js";

describe("FtsStore (in-memory)", () => {
  let store: FtsStore;

  beforeEach(() => {
    store = createFtsStore(); // in-memory, no path
  });

  afterEach(() => {
    store.close();
  });

  it("insert and search returns matching results", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    store.insert("user1", "I love reading books about history", now);
    store.insert("user1", "My favourite programming language is TypeScript", now);

    const results = store.search("user1", "reading books");
    expect(results.length).toBeGreaterThan(0);
    const texts = results.map((r) => r.text);
    expect(texts).toContain("I love reading books about history");
  });

  it("search respects userId isolation", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    store.insert("user1", "user one loves cats", now);
    store.insert("user2", "user two loves dogs", now);

    const resultsForUser1 = store.search("user1", "loves cats");
    const textsForUser1 = resultsForUser1.map((r) => r.text);
    expect(textsForUser1).toContain("user one loves cats");
    expect(textsForUser1).not.toContain("user two loves dogs");

    const resultsForUser2 = store.search("user2", "loves dogs");
    const textsForUser2 = resultsForUser2.map((r) => r.text);
    expect(textsForUser2).toContain("user two loves dogs");
    expect(textsForUser2).not.toContain("user one loves cats");
  });

  it("BM25 score varies with relevance — more specific match scores higher", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    store.insert("user1", "machine learning neural network deep learning", now);
    store.insert("user1", "I went to the shop yesterday", now);

    const results = store.search("user1", "machine learning deep learning");
    expect(results.length).toBeGreaterThanOrEqual(1);
    // The ML document should appear first (higher score)
    expect(results[0]!.text).toContain("machine learning");
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it("delete removes entry from index", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const text = "unique phrase about dragons";
    store.insert("user1", text, now);

    // Verify it's there first
    const before = store.search("user1", "dragons");
    expect(before.map((r) => r.text)).toContain(text);

    store.delete("user1", text);

    const after = store.search("user1", "dragons");
    expect(after.map((r) => r.text)).not.toContain(text);
  });

  it("in-memory mode works without a file path", () => {
    const memStore = createFtsStore(); // no path = in-memory
    const now = new Date();
    memStore.insert("u1", "testing in memory mode", now);
    const results = memStore.search("u1", "testing memory");
    expect(results.length).toBeGreaterThan(0);
    memStore.close();
  });

  it("returns empty array when query produces no keywords", () => {
    const now = new Date();
    store.insert("user1", "some text here", now);
    // All stop words — expandQueryToKeywords returns []
    const results = store.search("user1", "a an the");
    expect(results).toEqual([]);
  });

  it("uses expandQueryToKeywords for query building — stop words are stripped", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    store.insert("user1", "interesting book about science", now);

    // "that" and "the" are stop words; "book" and "science" should be used
    const results = store.search("user1", "that the book about science");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.text).toContain("book");
  });

  it("returns FtsMemory objects with correct shape", () => {
    const now = new Date("2025-06-15T12:00:00Z");
    store.insert("user1", "hello world programming", now);
    const results = store.search("user1", "programming");
    expect(results.length).toBe(1);
    const result = results[0]!;
    expect(result.userId).toBe("user1");
    expect(result.text).toBe("hello world programming");
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.score).toBeTypeOf("number");
    expect(result.score).toBeGreaterThan(0);
  });

  it("respects limit parameter", () => {
    const now = new Date();
    for (let i = 0; i < 10; i++) {
      store.insert("user1", `document number ${i} about testing search`, now);
    }
    const results = store.search("user1", "document testing search", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
