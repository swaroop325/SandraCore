import type { FtsStore } from "./fts.js";
import type { ScoredMemory } from "./mmr.js";
import { mmrSelect } from "./mmr.js";

export interface HybridSearchOptions {
  vectorWeight?: number; // default 0.7
  textWeight?: number;   // default 0.3
  limit?: number;        // default 5
}

export interface HybridResult {
  text: string;
  userId: string;
  score: number;          // fused score
  vectorScore?: number;
  textScore?: number;
  createdAt: Date;
}

/** Normalize an array of scores to [0, 1]. Returns a new array. */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  if (range === 0) return scores.map(() => 1);
  return scores.map((s) => (s - min) / range);
}

/**
 * Hybrid search: combine vector search results + FTS results using weighted score fusion.
 * Falls back to vector-only if FTS store is not available.
 */
export async function hybridSearch(
  userId: string,
  query: string,
  vectorResults: Array<{ text: string; score: number; createdAt: Date }>,
  ftsStore: FtsStore | null,
  options?: HybridSearchOptions
): Promise<HybridResult[]> {
  const vectorWeight = options?.vectorWeight ?? 0.7;
  const textWeight = options?.textWeight ?? 0.3;
  const limit = options?.limit ?? 5;

  // Map: text → accumulated result
  const merged = new Map<string, HybridResult>();

  // --- Vector results ---
  const vNormalized = normalizeScores(vectorResults.map((r) => r.score));
  for (let i = 0; i < vectorResults.length; i++) {
    const r = vectorResults[i]!;
    const vScore = vNormalized[i] ?? 0;
    merged.set(r.text, {
      text: r.text,
      userId,
      score: 0, // computed after merge
      vectorScore: vScore,
      createdAt: r.createdAt,
    });
  }

  // --- FTS results ---
  if (ftsStore !== null) {
    const ftsResults = ftsStore.search(userId, query, limit * 3);
    const fNormalized = normalizeScores(ftsResults.map((r) => r.score));

    for (let i = 0; i < ftsResults.length; i++) {
      const r = ftsResults[i]!;
      const fScore = fNormalized[i] ?? 0;
      const existing = merged.get(r.text);
      if (existing !== undefined) {
        // Merge: keep existing vectorScore, add textScore
        existing.textScore = fScore;
      } else {
        merged.set(r.text, {
          text: r.text,
          userId,
          score: 0,
          textScore: fScore,
          createdAt: r.createdAt,
        });
      }
    }
  }

  // --- Compute fused scores ---
  for (const result of merged.values()) {
    const v = result.vectorScore ?? 0;
    const t = result.textScore ?? 0;
    result.score = vectorWeight * v + textWeight * t;
  }

  // --- Apply MMR on fused results ---
  const candidates: ScoredMemory[] = Array.from(merged.values()).map((r) => ({
    text: r.text,
    score: r.score,
    createdAt: r.createdAt.toISOString(),
  }));

  const selected = mmrSelect(candidates, limit * 2);

  // Rebuild HybridResult list in MMR order, then sort by hybridScore and take limit
  const results: HybridResult[] = selected.map((s) => {
    const full = merged.get(s.text)!;
    return { ...full, score: s.score };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
