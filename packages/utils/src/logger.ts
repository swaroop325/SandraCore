import { createLogger as winstonCreateLogger, format, transports, type Logger as WinstonLogger } from "winston";

// ── Secret redaction ──────────────────────────────────────────────────────
const _redactedSecrets = new Set<string>();

/** Register a secret value for redaction in all log output. */
export function registerSecretForRedaction(secret: string): void {
  if (secret && secret.length >= 4) _redactedSecrets.add(secret);
}

/** Unregister a secret (e.g. on rotation). */
export function unregisterSecretFromRedaction(secret: string): void {
  _redactedSecrets.delete(secret);
}

function redactMessage(message: string): string {
  let result = message;
  for (const secret of _redactedSecrets) {
    result = result.replaceAll(secret, "[REDACTED]");
  }
  return result;
}

// ── Subsystem colours ─────────────────────────────────────────────────────
const SUBSYSTEM_COLORS: Record<string, string> = {
  core:     "\x1b[36m", // cyan
  utils:    "\x1b[32m", // green
  agent:    "\x1b[35m", // magenta
  memory:   "\x1b[34m", // blue
  tasks:    "\x1b[33m", // yellow
  research: "\x1b[96m", // bright cyan
  telegram: "\x1b[94m", // bright blue
  api:      "\x1b[92m", // bright green
  worker:   "\x1b[93m", // bright yellow
  otel:     "\x1b[90m", // grey
  i18n:     "\x1b[37m", // white
};

const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";

function colorForSubsystem(subsystem: string): string {
  return SUBSYSTEM_COLORS[subsystem] ?? "\x1b[37m";
}

// ── Base winston logger ───────────────────────────────────────────────────
const _baseLogger = winstonCreateLogger({
  level: process.env["LOG_LEVEL"] ?? "info",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, subsystem, timestamp, ...meta }) => {
          const sub = typeof subsystem === "string" ? subsystem : "app";
          const color = colorForSubsystem(sub);
          const redacted = typeof message === "string" ? redactMessage(message) : message;
          const metaStr = Object.keys(meta).length
            ? ` ${JSON.stringify(meta)}`
            : "";
          return `${timestamp} ${BOLD}${color}[${sub}]${RESET} ${level}: ${redacted}${metaStr}`;
        })
      ),
    }),
  ],
});

// ── Subsystem logger interface ────────────────────────────────────────────
export interface SubsystemLogger {
  trace(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string | Error, meta?: Record<string, unknown>): void;
  fatal(message: string | Error, meta?: Record<string, unknown>): void;
  child(name: string): SubsystemLogger;
  isEnabled(level: string): boolean;
}

function makeSubsystemLogger(subsystem: string): SubsystemLogger {
  const child = _baseLogger.child({ subsystem });

  function logMsg(
    level: string,
    messageOrErr: string | Error,
    meta?: Record<string, unknown>
  ): void {
    const message =
      messageOrErr instanceof Error ? messageOrErr.message : messageOrErr;
    const stack =
      messageOrErr instanceof Error ? messageOrErr.stack : undefined;
    const redacted = redactMessage(message);
    child.log(level, redacted, { ...(meta ?? {}), ...(stack ? { stack } : {}) });
  }

  return {
    trace: (msg, meta) => logMsg("silly", msg, meta),
    debug: (msg, meta) => logMsg("debug", msg, meta),
    info:  (msg, meta) => logMsg("info",  msg, meta),
    warn:  (msg, meta) => logMsg("warn",  msg, meta),
    error: (msg, meta) => logMsg("error", msg, meta),
    fatal: (msg, meta) => logMsg("crit",  msg, meta),
    child: (name) => makeSubsystemLogger(`${subsystem}:${name}`),
    isEnabled: (level) => child.isLevelEnabled(level),
  };
}

// ── Cache subsystem loggers ───────────────────────────────────────────────
const _loggerCache = new Map<string, SubsystemLogger>();

/**
 * Create (or retrieve cached) a logger for a specific subsystem.
 * Use one logger per package/module.
 *
 * @example
 * const log = createSubsystemLogger("agent");
 * log.info("Processing message", { userId, sessionId });
 */
export function createSubsystemLogger(subsystem: string): SubsystemLogger {
  const cached = _loggerCache.get(subsystem);
  if (cached) return cached;
  const instance = makeSubsystemLogger(subsystem);
  _loggerCache.set(subsystem, instance);
  return instance;
}

/** Default application-level logger (subsystem: "app"). */
export const logger = createSubsystemLogger("app");

/** Flush the logger cache — for testing only. */
export function _clearLoggerCache(): void {
  _loggerCache.clear();
}
