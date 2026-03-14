import { Pool } from "pg";
import type { QueryResult, QueryResultRow } from "pg";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL is not set");
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}

export const db = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    return getPool().query<T>(text, values);
  },

  execute(text: string, values?: unknown[]): Promise<QueryResult> {
    return getPool().query(text, values);
  },
};

export async function checkDB(): Promise<boolean> {
  try {
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Close pool — for testing/graceful shutdown */
export async function closeDB(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
