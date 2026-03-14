import { WebSocketServer, type WebSocket, type RawData } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { handleMessage } from "@sandra/agent";
import { createSubsystemLogger, generateRequestId } from "@sandra/utils";

const log = createSubsystemLogger("web");

export interface WebChatMessage {
  type: "message" | "error" | "connected" | "typing";
  text?: string;
  sessionId?: string;
  messageId?: string;
  timestamp?: number;
}

function parseToken(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("token");
}

function isTokenValid(token: string | null): boolean {
  const allowed = process.env["WEB_AUTH_TOKENS"];
  if (!allowed) return true; // open in dev
  if (!token) return false;
  const tokens = allowed.split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.includes(token);
}

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Handles authenticated web chat connections.
 */
export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const token = parseToken(req);
    if (!isTokenValid(token)) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const sessionId = `web:${token ?? generateRequestId()}`;
    const userId = process.env["WEB_DEFAULT_USER_ID"] ?? "web-user";

    log.info("Web client connected", { sessionId });

    const welcome: WebChatMessage = {
      type: "connected",
      sessionId,
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(welcome));

    ws.on("message", (data: RawData) => {
      void handleWebMessage(ws, data, sessionId, userId);
    });

    ws.on("close", () => {
      log.info("Web client disconnected", { sessionId });
    });

    ws.on("error", (err) => {
      log.error("WebSocket error", { error: err.message, sessionId });
    });
  });

  log.info("WebSocket server attached at /ws");
  return wss;
}

async function handleWebMessage(
  ws: WebSocket,
  data: RawData,
  sessionId: string,
  userId: string
): Promise<void> {
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

  // Send typing indicator
  ws.send(JSON.stringify({ type: "typing" } satisfies WebChatMessage));

  try {
    const response = await handleMessage({
      id: messageId ?? generateRequestId(),
      text: text.trim(),
      userId,
      sessionId,
      channel: "web",
      locale: "en",
      timestamp: Date.now(),
    });

    const reply: WebChatMessage = {
      type: "message",
      text: response.reply,
      messageId: generateRequestId(),
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(reply));
  } catch (err) {
    const errMsg: WebChatMessage = {
      type: "error",
      text: err instanceof Error ? err.message : "Internal error",
    };
    ws.send(JSON.stringify(errMsg));
  }
}
