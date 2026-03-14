import { connect, type Table } from "@lancedb/lancedb";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { REGION, MODELS, EMBEDDING_DIM, MEMORY_TABLE } from "@sandra/core";

interface MemoryRow extends Record<string, unknown> {
  id: string;
  userId: string;
  text: string;
  vector: number[];
  createdAt: string;
}

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

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
  const res = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: MODELS.TITAN_EMBED,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text }),
    })
  );
  const parsed = JSON.parse(Buffer.from(res.body).toString()) as {
    embedding: number[];
  };
  return parsed.embedding;
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
 */
export async function writeMemory(userId: string, text: string): Promise<void> {
  const table = await getTable();
  const vector = await embed(text);

  const row: MemoryRow = {
    id: crypto.randomUUID(),
    userId,
    text,
    vector,
    createdAt: new Date().toISOString(),
  };

  await table.add([row]);
}

/**
 * Searches LanceDB for the top-k memories most semantically similar to the
 * query, filtered to the given userId.
 */
export async function recallMemory(
  userId: string,
  query: string,
  k = 5
): Promise<string[]> {
  const table = await getTable();
  const vector = await embed(query);

  const results = await table
    .search(vector)
    .where(`userId = '${userId.replace(/'/g, "''")}'`)
    .limit(k)
    .toArray();

  return results
    .filter((row) => row["userId"] !== "__init__")
    .map((row) => row["text"] as string);
}
