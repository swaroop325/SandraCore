import { WebSocketServer, type WebSocket, type RawData } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { handleMessage, streamReason } from "@sandra/agent";
import { loadHistory, recallMemory, appendMessage, writeMemory } from "@sandra/memory";
import { MODELS } from "@sandra/core";
import { createSubsystemLogger, generateRequestId, db, auditLog } from "@sandra/utils";

const log = createSubsystemLogger("web");

export interface WebChatMessage {
  type: "message" | "error" | "connected" | "typing" | "chunk" | "message_done";
  text?: string;
  sessionId?: string;
  messageId?: string;
  timestamp?: number;
}

interface ChatSession {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  locale: string;
}

const activeSessions = new Map<string, ChatSession>();

function parseToken(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("token");
}

/**
 * Validate a user token against the database.
 * For MVP: token is the userId directly. Only approved users may connect.
 * Falls back to env-var token list when database is unavailable.
 */
async function validateUser(token: string): Promise<{ id: string } | null> {
  // First try DB validation
  try {
    const res = await db.query<{ id: string; status: string }>(
      "SELECT id, status FROM users WHERE id = $1 LIMIT 1",
      [token]
    );
    const user = res.rows[0];
    if (!user || user.status !== "approved") return null;
    return { id: user.id };
  } catch {
    // DB unavailable — fall back to env-var allow-list (dev/test convenience)
    const allowed = process.env["WEB_AUTH_TOKENS"];
    if (!allowed) return { id: token }; // open in dev with no env set
    const tokens = allowed.split(",").map((t) => t.trim()).filter(Boolean);
    if (!tokens.includes(token)) return null;
    return { id: token };
  }
}

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Accepts connections at /chat/ws?token=<userId>
 */
export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/chat/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const token = parseToken(req);

    if (!token) {
      ws.close(1008, "Missing token");
      return;
    }

    void validateUser(token).then((user) => {
      if (!user) {
        ws.close(1008, "Unauthorized");
        return;
      }

      const connId = crypto.randomUUID();
      const sessionId = `web:${user.id}`;

      activeSessions.set(connId, {
        ws,
        userId: user.id,
        sessionId,
        locale: "en",
      });

      log.info("Web chat connected", { userId: user.id, connId, sessionId });

      const welcome: WebChatMessage = {
        type: "connected",
        sessionId,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(welcome));

      ws.on("message", (data: RawData) => {
        void handleWebMessage(connId, data);
      });

      ws.on("close", () => {
        activeSessions.delete(connId);
        log.info("Web chat disconnected", { userId: user.id, connId });
      });

      ws.on("error", (err) => {
        log.error("WebSocket error", { error: err.message, connId });
        activeSessions.delete(connId);
      });
    });
  });

  log.info("WebSocket server attached at /chat/ws");
  return wss;
}

async function handleWebMessage(connId: string, data: RawData): Promise<void> {
  const session = activeSessions.get(connId);
  if (!session) return;

  const { ws, userId, sessionId, locale } = session;

  let parsed: { text?: string; messageId?: string };
  try {
    parsed = JSON.parse(data.toString()) as { text?: string; messageId?: string };
  } catch {
    ws.send(JSON.stringify({ type: "error", text: "Invalid JSON" } satisfies WebChatMessage));
    return;
  }

  const { text, messageId } = parsed;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    ws.send(JSON.stringify({ type: "error", text: "text is required" } satisfies WebChatMessage));
    return;
  }

  void auditLog({ action: "message.received", userId, sessionId, channel: "web" });

  if (process.env["WEB_STREAMING"] === "1") {
    // Streaming path: send chunks live
    try {
      const [history, memories] = await Promise.all([
        loadHistory(sessionId),
        recallMemory(userId, text.trim()),
      ]);

      const modelId = MODELS.SONNET;
      const gen = streamReason(history, text.trim(), memories, modelId);

      let fullText = "";
      for await (const chunk of gen) {
        fullText += chunk;
        ws.send(JSON.stringify({ type: "chunk", text: chunk } satisfies WebChatMessage));
      }

      ws.send(JSON.stringify({ type: "message_done" } satisfies WebChatMessage));

      await Promise.all([
        appendMessage(sessionId, userId, "assistant", fullText),
        writeMemory(userId, text.trim()),
      ]);
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          text: err instanceof Error ? err.message : "Internal error",
        } satisfies WebChatMessage)
      );
    }
  } else {
    // Non-streaming path: typing indicator then full reply
    ws.send(JSON.stringify({ type: "typing" } satisfies WebChatMessage));

    try {
      const response = await handleMessage({
        id: messageId ?? generateRequestId(),
        text: text.trim(),
        userId,
        sessionId,
        channel: "web",
        locale,
        timestamp: Date.now(),
      });

      ws.send(
        JSON.stringify({
          type: "message",
          text: response.reply,
          messageId: generateRequestId(),
          timestamp: Date.now(),
        } satisfies WebChatMessage)
      );
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          text: err instanceof Error ? err.message : "Internal error",
        } satisfies WebChatMessage)
      );
    }
  }
}

export { activeSessions };
