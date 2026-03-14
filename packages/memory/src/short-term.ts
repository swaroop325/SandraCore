import { db } from "@sandra/utils";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * Loads the last `limit` messages for a session, ordered chronologically (oldest first).
 * The userId guard ensures a session can only be accessed by its owner.
 */
export async function loadHistory(
  sessionId: string,
  userId: string,
  limit = 20
): Promise<Message[]> {
  const result = await db.query<{ role: "user" | "assistant"; content: string }>(
    `SELECT role, content
     FROM conversation_messages
     WHERE session_id = $1
       AND user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [sessionId, userId, limit]
  );

  // Reverse so oldest message is first (chronological order)
  return result.rows.reverse();
}

/**
 * Delete all conversation history for a session.
 * The userId guard ensures only the session owner can clear it.
 */
export async function clearHistory(sessionId: string, userId: string): Promise<void> {
  await db.execute(
    `DELETE FROM conversation_messages WHERE session_id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
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
