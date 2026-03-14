import { WebSocket } from "ws";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("browser");

export interface CDPClient {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  on(event: string, handler: (params: unknown) => void): void;
  close(): void;
}

export interface CDPSession {
  client: CDPClient;
  sessionId: string;
}

/** Connect to Chrome DevTools at the given WebSocket URL */
export function createCDPClient(wsUrl: string): Promise<CDPClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    const listeners = new Map<string, Array<(p: unknown) => void>>();
    let msgId = 1;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("CDP connection timeout"));
    }, 10_000);

    ws.on("open", () => {
      clearTimeout(timeout);
      log.debug("CDP connected", { url: wsUrl });
      resolve({
        send<T>(method: string, params?: Record<string, unknown>): Promise<T> {
          return new Promise((res, rej) => {
            const id = msgId++;
            pending.set(id, { resolve: res as (v: unknown) => void, reject: rej });
            ws.send(JSON.stringify({ id, method, params: params ?? {} }));
          });
        },
        on(event: string, handler: (p: unknown) => void) {
          const handlers = listeners.get(event) ?? [];
          handlers.push(handler);
          listeners.set(event, handlers);
        },
        close() { ws.close(); },
      });
    });

    ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as {
        id?: number; result?: unknown; error?: { message: string }; method?: string; params?: unknown;
      };
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        }
      } else if (msg.method) {
        const handlers = listeners.get(msg.method) ?? [];
        for (const h of handlers) h(msg.params);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/** Get the list of open pages from a Chrome instance */
export async function getPages(host = "localhost", port = 9222): Promise<Array<{ id: string; title: string; url: string; webSocketDebuggerUrl: string }>> {
  const response = await fetch(`http://${host}:${port}/json`);
  if (!response.ok) throw new Error(`Chrome not reachable at ${host}:${port}`);
  return response.json() as Promise<Array<{ id: string; title: string; url: string; webSocketDebuggerUrl: string }>>;
}
