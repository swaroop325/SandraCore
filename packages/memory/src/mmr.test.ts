import { describe, it, expect } from "vitest";
import {
  applyTemporalDecay,
  mmrSelect,
  jaccardSimilarity,
  type ScoredMemory,
} from "./mmr.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// jaccardSimilarity
// ---------------------------------------------------------------------------

describe("jaccardSimilarity", () => {
  it("identical texts return 1.0", () => {
    expect(jaccardSimilarity("hello world", "hello world")).toBe(1.0);
  });

  it("completely disjoint texts return 0.0", () => {
    expect(jaccardSimilarity("cat dog", "fish bird")).toBe(0.0);
  });

  it("partial overlap returns a value between 0 and 1", () => {
    const sim = jaccardSimilarity("cat dog fish", "dog fish bird");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("empty strings both empty return 1.0", () => {
    expect(jaccardSimilarity("", "")).toBe(1.0);
  });

  it("one empty string returns 0.0", () => {
    expect(jaccardSimilarity("hello", "")).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// applyTemporalDecay
// ---------------------------------------------------------------------------

describe("applyTemporalDecay", () => {
  it("recent memory (1 day old) has higher score than old one (365 days)", () => {
    const memories: ScoredMemory[] = [
      { text: "old fact", score: 0.9, createdAt: daysAgo(365) },
      { text: "recent fact", score: 0.9, createdAt: daysAgo(1) },
    ];

    const result = applyTemporalDecay(memories);

    const recent = result.find((m) => m.text === "recent fact")!;
    const old = result.find((m) => m.text === "old fact")!;

    expect(recent.score).toBeGreaterThan(old.score);
  });

  it("returns array sorted by decayed score descending", () => {
    const memories: ScoredMemory[] = [
      { text: "very old", score: 0.95, createdAt: daysAgo(500) },
      { text: "medium age", score: 0.8, createdAt: daysAgo(50) },
      { text: "brand new", score: 0.7, createdAt: daysAgo(0) },
    ];

    const result = applyTemporalDecay(memories);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });

  it("zero-day-old memory is not decayed at all", () => {
    const now = new Date();
    const memories: ScoredMemory[] = [
      { text: "just created", score: 0.8, createdAt: now.toISOString() },
    ];

    const result = applyTemporalDecay(memories, 0.01, now);
    // exp(-0.01 * 0) = 1, so score should be unchanged
    expect(result[0]!.score).toBeCloseTo(0.8, 10);
  });

  it("applies the lambda parameter correctly", () => {
    const now = new Date();
    const hundredDaysAgo = new Date(now.getTime() - 100 * 86_400_000);
    const memories: ScoredMemory[] = [
      { text: "hundred days old", score: 1.0, createdAt: hundredDaysAgo.toISOString() },
    ];

    const result = applyTemporalDecay(memories, 0.01, now);
    // exp(-0.01 * 100) = exp(-1) ≈ 0.3679
    expect(result[0]!.score).toBeCloseTo(Math.exp(-1), 5);
  });
});

// ---------------------------------------------------------------------------
// mmrSelect
// ---------------------------------------------------------------------------

describe("mmrSelect", () => {
  it("selects k items from the candidates", () => {
    const memories: ScoredMemory[] = [
      { text: "apple pie recipe", score: 0.9, createdAt: new Date().toISOString() },
      { text: "banana smoothie", score: 0.8, createdAt: new Date().toISOString() },
      { text: "cherry tart", score: 0.7, createdAt: new Date().toISOString() },
      { text: "date pudding", score: 0.6, createdAt: new Date().toISOString() },
    ];

    const result = mmrSelect(memories, 2);
    expect(result).toHaveLength(2);
  });

  it("returns at most the available number of memories when k > length", () => {
    const memories: ScoredMemory[] = [
      { text: "only memory", score: 0.9, createdAt: new Date().toISOString() },
    ];

    const result = mmrSelect(memories, 5);
    expect(result).toHaveLength(1);
  });

  it("avoids selecting two nearly-identical texts", () => {
    const nearDuplicate = "The user loves hiking in the mountains";
    const memories: ScoredMemory[] = [
      { text: nearDuplicate, score: 0.95, createdAt: new Date().toISOString() },
      { text: "The user loves hiking in the mountains", score: 0.94, createdAt: new Date().toISOString() },
      { text: "The user enjoys jazz music and concerts", score: 0.85, createdAt: new Date().toISOString() },
    ];

    const result = mmrSelect(memories, 2, 0.7);

    // The two selected items should not both be the hiking duplicates
    const texts = result.map((m) => m.text);
    const hikingCount = texts.filter((t) => t.includes("hiking")).length;
    expect(hikingCount).toBeLessThanOrEqual(1);

    // The diverse memory about jazz should be preferred over the duplicate
    expect(texts).toContain("The user enjoys jazz music and concerts");
  });

  it("returns empty array for empty input", () => {
    expect(mmrSelect([], 3)).toEqual([]);
  });

  it("returns empty array when k is 0", () => {
    const memories: ScoredMemory[] = [
      { text: "some memory", score: 0.8, createdAt: new Date().toISOString() },
    ];
    expect(mmrSelect(memories, 0)).toEqual([]);
  });
});
