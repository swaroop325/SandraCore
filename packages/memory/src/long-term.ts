import { connect, type Table } from "@lancedb/lancedb";
import { EMBEDDING_DIM, MEMORY_TABLE } from "@sandra/core";
import { applyTemporalDecay, mmrSelect } from "./mmr.js";
import type { ScoredMemory } from "./mmr.js";
import { getEmbeddingProvider, autoConfigureEmbeddingProvider } from "./embedding-provider.js";
import { createFtsStore } from "./fts.js";
import type { FtsStore } from "./fts.js";
import { hybridSearch } from "./hybrid.js";

// Auto-configure embedding provider at module load if not already set
autoConfigureEmbeddingProvider();

// Module-level FTS store, lazily initialized when LANCEDB_FTS_PATH is set
let _ftsStore: FtsStore | null = null;

export function _getFtsStore(): FtsStore | null {
  return _ftsStore;
}

function getFtsStore(): FtsStore | null {
  const ftsPath = process.env["LANCEDB_FTS_PATH"];
  if (!ftsPath) return null;
  if (_ftsStore === null) {
    _ftsStore = createFtsStore(ftsPath);
  }
  return _ftsStore;
}

interface MemoryRow extends Record<string, unknown> {
  id: string;
  userId: string;
  text: string;
  vector: number[];
  createdAt: string;
}

let _db: Awaited<ReturnType<typeof connect>> | null = null;

async function getDb() {
  if (!_db) {
    const lancedbPath = process.env["LANCEDB_PATH"];
    if (!lancedbPath) throw new Error("LANCEDB_PATH is not set");
    _db = await connect(lancedbPath);
  }
  return _db;
}

async function embed(text: string): Promise<number[]> {
  return getEmbeddingProvider().embed(text);
}

async function getTable(): Promise<Table> {
  const db = await getDb();

  const tableNames = await db.tableNames();

  if (!tableNames.includes(MEMORY_TABLE)) {
    // Create table with a dummy row so the schema is established
    const dummyRow: MemoryRow = {
      id: crypto.randomUUID(),
      userId: "__init__",
      text: "__init__",
      vector: new Array(EMBEDDING_DIM).fill(0) as number[],
      createdAt: new Date().toISOString(),
    };
    return db.createTable(MEMORY_TABLE, [dummyRow]);
  }

  return db.openTable(MEMORY_TABLE);
}

/**
 * Embeds the given text and stores it in LanceDB under the specified userId.
 * Also inserts into the FTS store if available.
 */
export async function writeMemory(userId: string, text: string): Promise<void> {
  const table = await getTable();
  const vector = await embed(text);
  const now = new Date();

  const row: MemoryRow = {
    id: crypto.randomUUID(),
    userId,
    text,
    vector,
    createdAt: now.toISOString(),
  };

  await table.add([row]);

  const fts = getFtsStore();
  if (fts !== null) {
    fts.insert(userId, text, now);
  }
}

/**
 * Searches LanceDB for the top-k memories most semantically similar to the
 * query, filtered to the given userId.
 * If LANCEDB_FTS_PATH is set, also runs FTS search and fuses results via hybridSearch.
 */
export async function recallMemory(
  userId: string,
  query: string,
  k = 5
): Promise<string[]> {
  const table = await getTable();
  const fts = getFtsStore();

  // Run vector search and FTS search in parallel
  const vectorSearchPromise = (async () => {
    const vector = await embed(query);
    const results = await table
      .search(vector)
      .where(`userId = '${userId.replace(/'/g, "''")}'`)
      .limit(k * 3)
      .toArray();

    return results
      .filter((row) => row["userId"] !== "__init__")
      .map((row) => ({
        text: row["text"] as string,
        score: 1 - ((row["_distance"] as number) ?? 0),
        createdAt: new Date(row["createdAt"] as string),
      }));
  })();

  const [vectorResults] = await Promise.all([vectorSearchPromise]);

  if (fts !== null) {
    // Hybrid path: fuse vector + FTS results
    const hybrid = await hybridSearch(userId, query, vectorResults, fts, {
      limit: k,
    });
    return hybrid.map((h) => h.text);
  }

  // Vector-only path (original behaviour)
  const candidates: ScoredMemory[] = vectorResults.map((r) => ({
    text: r.text,
    score: r.score,
    createdAt: r.createdAt.toISOString(),
  }));

  const decayed = applyTemporalDecay(candidates);
  const selected = mmrSelect(decayed, k);

  return selected.map((m) => m.text);
}
