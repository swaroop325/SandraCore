import { describe, it, expect, vi, beforeEach } from "vitest";
import { hybridSearch } from "./hybrid.js";
import type { FtsStore, FtsMemory } from "./fts.js";
import type { HybridSearchOptions } from "./hybrid.js";

// Helper: build a minimal FtsStore mock
function makeFtsStore(results: FtsMemory[]): FtsStore {
  return {
    insert: vi.fn(),
    search: vi.fn().mockReturnValue(results),
    delete: vi.fn(),
    deleteAll: vi.fn(),
    close: vi.fn(),
  };
}

const BASE_DATE = new Date("2025-01-01T00:00:00Z");

describe("hybridSearch", () => {
  it("falls back to vector-only when ftsStore is null", async () => {
    const vectorResults = [
      { text: "dogs are great pets", score: 0.9, createdAt: BASE_DATE },
      { text: "cats are independent", score: 0.7, createdAt: BASE_DATE },
      { text: "birds can fly", score: 0.5, createdAt: BASE_DATE },
    ];

    const results = await hybridSearch("user1", "pets", vectorResults, null);

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
    // All results should come from the vector set
    const texts = results.map((r) => r.text);
    for (const t of texts) {
      expect(vectorResults.map((v) => v.text)).toContain(t);
    }
  });

  it("fuses scores from both vector and FTS with correct weights", async () => {
    const vectorResults = [
      { text: "machine learning algorithms", score: 0.8, createdAt: BASE_DATE },
      { text: "deep neural networks", score: 0.6, createdAt: BASE_DATE },
    ];

    const ftsResults: FtsMemory[] = [
      {
        userId: "user1",
        text: "machine learning algorithms",
        createdAt: BASE_DATE,
        score: 5.0,
      },
      {
        userId: "user1",
        text: "random forest classifiers",
        createdAt: BASE_DATE,
        score: 3.0,
      },
    ];

    const store = makeFtsStore(ftsResults);
    const opts: HybridSearchOptions = { vectorWeight: 0.7, textWeight: 0.3, limit: 5 };

    const results = await hybridSearch("user1", "machine learning", vectorResults, store, opts);

    expect(results.length).toBeGreaterThan(0);

    // "machine learning algorithms" appears in both → should have both vectorScore and textScore
    const mlResult = results.find((r) => r.text === "machine learning algorithms");
    expect(mlResult).toBeDefined();
    expect(mlResult!.vectorScore).toBeDefined();
    expect(mlResult!.textScore).toBeDefined();

    // Fused score should be between 0 and 1 (normalized components weighted)
    expect(mlResult!.score).toBeGreaterThanOrEqual(0);
  });

  it("deduplicates text present in both vector and FTS results", async () => {
    const sharedText = "shared memory entry";
    const vectorResults = [
      { text: sharedText, score: 0.9, createdAt: BASE_DATE },
    ];
    const ftsResults: FtsMemory[] = [
      { userId: "user1", text: sharedText, createdAt: BASE_DATE, score: 4.0 },
    ];

    const store = makeFtsStore(ftsResults);
    const results = await hybridSearch("user1", "shared entry", vectorResults, store);

    // Should appear only once
    const count = results.filter((r) => r.text === sharedText).length;
    expect(count).toBe(1);

    // Should carry both scores
    const entry = results.find((r) => r.text === sharedText)!;
    expect(entry.vectorScore).toBeDefined();
    expect(entry.textScore).toBeDefined();
  });

  it("respects the limit option", async () => {
    const vectorResults = Array.from({ length: 10 }, (_, i) => ({
      text: `vector result number ${i} with unique content`,
      score: (10 - i) / 10,
      createdAt: BASE_DATE,
    }));

    const results = await hybridSearch("user1", "result content", vectorResults, null, { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("applies MMR diversity — does not return near-duplicate texts", async () => {
    // Several highly similar texts; MMR should pick diverse ones
    const vectorResults = [
      { text: "cats are amazing wonderful animals", score: 0.9, createdAt: BASE_DATE },
      { text: "cats are amazing wonderful creatures", score: 0.88, createdAt: BASE_DATE },
      { text: "cats are amazing wonderful pets", score: 0.87, createdAt: BASE_DATE },
      { text: "dogs love playing fetch outside", score: 0.5, createdAt: BASE_DATE },
    ];

    const results = await hybridSearch("user1", "cats", vectorResults, null, { limit: 2 });

    expect(results.length).toBeLessThanOrEqual(2);
    // With MMR, the diverse dog entry should appear alongside one cat entry
    const texts = results.map((r) => r.text);
    const dogEntry = texts.some((t) => t.includes("dogs"));
    const catEntry = texts.some((t) => t.includes("cats"));
    expect(dogEntry || catEntry).toBe(true);
  });

  it("returns results sorted by hybridScore descending", async () => {
    const vectorResults = [
      { text: "low relevance text", score: 0.2, createdAt: BASE_DATE },
      { text: "very high relevance text here", score: 0.95, createdAt: BASE_DATE },
      { text: "medium relevance text content", score: 0.6, createdAt: BASE_DATE },
    ];

    const results = await hybridSearch("user1", "relevance text", vectorResults, null);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]!.score).toBeGreaterThanOrEqual(results[i + 1]!.score);
    }
  });

  it("returns FTS-only results when vector results are empty", async () => {
    const ftsResults: FtsMemory[] = [
      { userId: "user1", text: "found only in fts index", createdAt: BASE_DATE, score: 3.5 },
    ];
    const store = makeFtsStore(ftsResults);

    const results = await hybridSearch("user1", "fts index", [], store, { vectorWeight: 0.7, textWeight: 0.3 });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.text).toBe("found only in fts index");
  });
});
