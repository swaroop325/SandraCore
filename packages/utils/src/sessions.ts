import { db } from "./db.js";

export async function getOrCreateSession(
  userId: string,
  channel: string,
  rawId: string
): Promise<string> {
  const sessionId = `${channel}:${rawId}`;
  await db.execute(
    `INSERT INTO channel_sessions (user_id, session_id, channel)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id) DO UPDATE SET last_seen = now()`,
    [userId, sessionId, channel]
  );
  return sessionId;
}
