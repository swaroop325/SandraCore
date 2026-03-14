export interface ScoredMemory {
  text: string;
  score: number;    // cosine similarity (0-1, higher = more relevant)
  createdAt: string; // ISO date string
}

/**
 * Apply temporal decay to memory scores.
 * score_decayed = score × exp(-lambda × days_since_created)
 * Default lambda = 0.01 (memories lose ~10% relevance per 100 days)
 *
 * Returns a new array sorted by decayed score descending.
 */
export function applyTemporalDecay(
  memories: ScoredMemory[],
  lambda = 0.01,
  now = new Date()
): ScoredMemory[] {
  const nowMs = now.getTime();

  const decayed = memories.map((m) => {
    const createdMs = new Date(m.createdAt).getTime();
    const days = (nowMs - createdMs) / 86_400_000;
    const newScore = m.score * Math.exp(-lambda * days);
    return { ...m, score: newScore };
  });

  return decayed.sort((a, b) => b.score - a.score);
}

/**
 * Simple text similarity: Jaccard on word sets (fast, no vectors needed).
 * Returns 1.0 for identical texts, 0.0 for completely disjoint word sets.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const word of setA) {
    if (setB.has(word)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Maximal Marginal Relevance selection.
 * Greedily selects up to k items that maximise relevance while minimising
 * redundancy with already-selected items.
 *
 * alpha = 0.7: weight relevance vs diversity (0 = pure diversity, 1 = pure relevance)
 */
export function mmrSelect(
  memories: ScoredMemory[],
  k: number,
  alpha = 0.7
): ScoredMemory[] {
  if (memories.length === 0 || k <= 0) return [];

  const candidates = [...memories];
  const selected: ScoredMemory[] = [];

  while (selected.length < k && candidates.length > 0) {
    let bestIdx = -1;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;

      const maxSimilarityToSelected =
        selected.length === 0
          ? 0
          : Math.max(...selected.map((s) => jaccardSimilarity(s.text, candidate.text)));

      const mmrScore = alpha * candidate.score - (1 - alpha) * maxSimilarityToSelected;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    selected.push(candidates[bestIdx]!);
    candidates.splice(bestIdx, 1);
  }

  return selected;
}
