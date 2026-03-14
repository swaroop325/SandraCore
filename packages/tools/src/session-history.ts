import { db } from "@sandra/utils";

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  sessionId: string;
}

export interface SessionHistoryOptions {
  limit?: number;
  sessionId?: string; // filter to specific session
  search?: string;    // substring search in content
}

/**
 * Fetch recent conversation history for a user.
 * Returns entries sorted oldest-first.
 */
export async function getSessionHistory(
  userId: string,
  options: SessionHistoryOptions = {}
): Promise<HistoryEntry[]> {
  const { limit = 50, sessionId, search } = options;

  let query = `
    SELECT role, content, created_at AS "createdAt", session_id AS "sessionId"
    FROM conversation_messages
    WHERE user_id = $1
  `;
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (sessionId) {
    query += ` AND session_id = $${paramIdx++}`;
    params.push(sessionId);
  }

  if (search) {
    query += ` AND content ILIKE $${paramIdx++}`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
  params.push(limit);

  const res = await db.query<HistoryEntry>(query, params);
  return res.rows.reverse();
}

/**
 * Format history as a readable text block for LLM context injection.
 */
export function formatHistoryForContext(entries: HistoryEntry[]): string {
  if (entries.length === 0) return "No conversation history found.";
  return entries
    .map((e) => `[${e.createdAt.toISOString()}] ${e.role.toUpperCase()}: ${e.content}`)
    .join("\n");
}
