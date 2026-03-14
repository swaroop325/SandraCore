/** Event fired when a new conversation session starts or resets. */
export interface SessionResetEvent {
  type: "session:reset";
  userId: string;
  sessionId: string;
  /** The last N messages before the reset, for summarisation. */
  recentMessages: Array<{ role: string; content: string }>;
}

/** Event fired when the gateway/worker boots. */
export interface BootEvent {
  type: "boot";
  service: string;        // e.g. "api-server", "worker"
  version: string;        // e.g. "0.1.0"
  nodeEnv: string;
}

/** Event fired when a special slash-command is received. */
export interface CommandEvent {
  type: "command";
  userId: string;
  sessionId: string;
  channel: string;
  command: string;        // e.g. "/new", "/reset", "/help"
  args: string;           // remainder after command
  timestamp: Date;
}

export type HookEvent = SessionResetEvent | BootEvent | CommandEvent;

export type HookHandler<E extends HookEvent = HookEvent> = (event: E) => Promise<void> | void;

export interface HookRegistry {
  on<E extends HookEvent>(type: E["type"], handler: HookHandler<E>): void;
  emit<E extends HookEvent>(event: E): Promise<void>;
}
