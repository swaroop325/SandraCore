import { Pool } from "pg";
import type { QueryResult, QueryResultRow, PoolClient } from "pg";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL is not set");

    const isProd = process.env["NODE_ENV"] === "production" || process.env["DB_SSL"] === "1";
    const rejectUnauthorized = process.env["DB_SSL_REJECT_UNAUTHORIZED"] !== "false";
    const ssl = isProd ? { rejectUnauthorized } : undefined;

    _pool = new Pool({ connectionString: url, ...(ssl ? { ssl } : {}) });
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

/**
 * Run a callback inside a serializable transaction.
 * The callback receives a PoolClient; if it throws the transaction is rolled back.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

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
