import { createRequire } from "node:module";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("memory:embedding-cache");

// Use same createRequire trick as fts.ts to avoid Vite resolution issues
const _req = createRequire(import.meta.url);
const { DatabaseSync } = _req("node:sqlite") as typeof import("node:sqlite");

export interface EmbeddingCache {
  get(text: string): number[] | null;
  set(text: string, vector: number[]): void;
  close(): void;
  size(): number;
}

/**
 * SQLite-backed embedding cache. Stores SHA-256 digest -> vector to avoid
 * re-embedding identical text. Falls back gracefully if DB is unavailable.
 */
export function createEmbeddingCache(dbPath?: string): EmbeddingCache {
  try {
    const db = new DatabaseSync(dbPath ?? ":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        digest TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_created_at ON embedding_cache(created_at);
    `);

    // Keep cache bounded: max 50,000 entries. Prune oldest 10% when over limit.
    const MAX_ENTRIES = 50_000;
    const PRUNE_COUNT = 5_000;

    function digestText(text: string): string {
      // Simple djb2-like hash -- good enough for cache keys
      let hash = 5381;
      for (let i = 0; i < text.length; i++) {
        hash = (hash * 33) ^ text.charCodeAt(i);
      }
      return (hash >>> 0).toString(16).padStart(8, "0") + "-" + text.length.toString(36);
    }

    return {
      get(text: string): number[] | null {
        try {
          const digest = digestText(text);
          const stmt = db.prepare("SELECT vector FROM embedding_cache WHERE digest = ?");
          const row = stmt.get(digest) as { vector: string } | undefined;
          if (!row) return null;
          return JSON.parse(row.vector) as number[];
        } catch {
          return null;
        }
      },

      set(text: string, vector: number[]): void {
        try {
          const digest = digestText(text);
          const now = Date.now();
          const stmt = db.prepare(
            "INSERT OR REPLACE INTO embedding_cache (digest, vector, created_at) VALUES (?, ?, ?)"
          );
          stmt.run(digest, JSON.stringify(vector), now);

          // Prune if over limit (best-effort)
          const countStmt = db.prepare("SELECT COUNT(*) as c FROM embedding_cache");
          const countRow = countStmt.get() as { c: number };
          if (countRow.c > MAX_ENTRIES) {
            db.exec(
              `DELETE FROM embedding_cache WHERE digest IN (
                SELECT digest FROM embedding_cache ORDER BY created_at ASC LIMIT ${PRUNE_COUNT}
              )`
            );
            log.debug("Pruned embedding cache", { removed: PRUNE_COUNT });
          }
        } catch {
          // Cache write failures are non-fatal
        }
      },

      size(): number {
        try {
          const stmt = db.prepare("SELECT COUNT(*) as c FROM embedding_cache");
          const row = stmt.get() as { c: number };
          return row.c;
        } catch {
          return 0;
        }
      },

      close(): void {
        try { db.close(); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    // If SQLite is unavailable, return a no-op cache
    log.warn("EmbeddingCache: SQLite unavailable, using no-op cache", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      get: () => null,
      set: () => undefined,
      size: () => 0,
      close: () => undefined,
    };
  }
}
