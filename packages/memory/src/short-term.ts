import { db } from "@sandra/utils";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Loads the last `limit` messages for a session, ordered chronologically (oldest first).
 */
export async function loadHistory(
  sessionId: string,
  limit = 20
): Promise<Message[]> {
  const result = await db.query<{ role: "user" | "assistant"; content: string }>(
    `SELECT role, content
     FROM conversation_messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );

  // Reverse so oldest message is first (chronological order)
  return result.rows.reverse();
}

/**
 * Appends a message to the conversation history for a session.
 */
export async function appendMessage(
  sessionId: string,
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await db.execute(
    `INSERT INTO conversation_messages (session_id, user_id, role, content)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, userId, role, content]
  );
}
