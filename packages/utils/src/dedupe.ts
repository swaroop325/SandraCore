interface DedupEntry {
  ts: number;
}

export interface DedupeConfig {
  ttlMs: number;       // how long to remember a message ID. default 300_000 (5 min)
  maxSize: number;     // max entries before LRU eviction. default 10_000
}

const DEFAULTS: DedupeConfig = { ttlMs: 300_000, maxSize: 10_000 };

export function createDedupeCache(config?: Partial<DedupeConfig>) {
  const cfg = { ...DEFAULTS, ...config };
  // Map preserves insertion order — oldest entries are first
  const cache = new Map<string, DedupEntry>();

  function prune(): void {
    const cutoff = Date.now() - cfg.ttlMs;
    for (const [key, entry] of cache) {
      if (entry.ts < cutoff) cache.delete(key);
      else break; // Map is insertion-ordered; once we hit a fresh entry, done
    }
    // LRU eviction if still over size
    while (cache.size > cfg.maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
      else break;
    }
  }

  /**
   * Returns true if this id was already seen (duplicate).
   * Returns false and records it if new.
   */
  function isDuplicate(id: string): boolean {
    prune();
    const existing = cache.get(id);
    if (existing && Date.now() - existing.ts < cfg.ttlMs) return true;
    // Move to end (most recent) by deleting and re-inserting
    cache.delete(id);
    cache.set(id, { ts: Date.now() });
    // Evict oldest if we exceeded maxSize after insertion
    while (cache.size > cfg.maxSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
      else break;
    }
    return false;
  }

  function size(): number { return cache.size; }
  function clear(): void { cache.clear(); }

  return { isDuplicate, size, clear, prune };
}

export type DedupeCache = ReturnType<typeof createDedupeCache>;
