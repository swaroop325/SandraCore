import { createRequire } from "node:module";
import { expandQueryToKeywords } from "./query-expansion.js";

// node:sqlite is not in Node's builtinModules list, so vite-node can't resolve
// the ESM static import. Using createRequire bypasses the Vite transform pipeline
// while still loading the native built-in correctly at runtime.
const _req = createRequire(import.meta.url);
const { DatabaseSync } = _req("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;

export interface FtsMemory {
  userId: string;
  text: string;
  createdAt: Date;
  score: number;
}

export interface FtsStore {
  insert(userId: string, text: string, createdAt: Date): void;
  search(userId: string, query: string, limit?: number): FtsMemory[];
  delete(userId: string, text: string): void;
  close(): void;
}

function initDb(db: DatabaseSync): void {
  // FTS5 virtual table — text is indexed; userId and createdAt are metadata only
  db.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts " +
    "USING fts5(" +
    "  text," +
    "  userId UNINDEXED," +
    "  createdAt UNINDEXED," +
    "  tokenize=\"unicode61 remove_diacritics 2\"" +
    ");"
  );
}

/**
 * Create an FTS5 store backed by a SQLite database at the given path.
 * Falls back to in-memory DB if path is not provided.
 */
export function createFtsStore(dbPath?: string): FtsStore {
  const db = new DatabaseSync(dbPath ?? ":memory:");
  initDb(db);

  return {
    insert(userId: string, text: string, createdAt: Date): void {
      const stmt = db.prepare(
        "INSERT INTO memory_fts(text, userId, createdAt) VALUES (?, ?, ?)"
      );
      stmt.run(text, userId, createdAt.toISOString());
    },

    search(userId: string, query: string, limit = 20): FtsMemory[] {
      const keywords = expandQueryToKeywords(query);
      if (keywords.length === 0) return [];

      const ftsQuery = keywords.join(" OR ");

      // bm25() returns a negative number — more negative = better match.
      // We negate it so higher positive score = more relevant.
      const stmt = db.prepare(
        "SELECT userId, text, createdAt, -bm25(memory_fts) AS score " +
        "FROM memory_fts " +
        "WHERE memory_fts MATCH ? " +
        "  AND userId = ? " +
        "ORDER BY score DESC " +
        "LIMIT ?"
      );

      const rows = stmt.all(ftsQuery, userId, limit) as Array<{
        userId: string;
        text: string;
        createdAt: string;
        score: number;
      }>;

      return rows.map((r) => ({
        userId: r.userId,
        text: r.text,
        createdAt: new Date(r.createdAt),
        score: r.score,
      }));
    },

    delete(userId: string, text: string): void {
      const stmt = db.prepare(
        "DELETE FROM memory_fts WHERE userId = ? AND text = ?"
      );
      stmt.run(userId, text);
    },

    close(): void {
      db.close();
    },
  };
}
