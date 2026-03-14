import express, { type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleWebhookInbound } from "./routes/webhooks.js";
import { handleGmailWebhook } from "./routes/gmail.js";
import { adminRouter } from "./routes/admin.js";
import onboardingRouter from "./routes/onboarding.js";
import { registerGracefulShutdown } from "./graceful-shutdown.js";
import rateLimit from "express-rate-limit";
import { initOtel } from "@sandra/otel";
import { loadSecrets, checkDB, checkSQS, createAuthRateLimiter, generateRequestId, withRequestId, auditLog } from "@sandra/utils";
import { handleMessage } from "@sandra/agent";
import { createBot, getWebhookHandler } from "@sandra/extensions-telegram";
import { attachWebSocketServer } from "@sandra/extensions-web";

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatHtml = readFileSync(
  join(__dirname, "../../../extensions/web/src/chat-ui.html"),
  "utf-8"
);

initOtel("sandra-api");
await loadSecrets();

if (!process.env["TELEGRAM_BOT_TOKEN"]) {
  throw new Error("TELEGRAM_BOT_TOKEN is required but not set");
}
const bot = createBot(process.env["TELEGRAM_BOT_TOKEN"]!);

// Register Telegram webhook
const domain = process.env["DOMAIN"];
if (domain) {
  await bot.api.setWebhook(`https://${domain}/webhooks/telegram`, {
    secret_token: process.env["TELEGRAM_WEBHOOK_SECRET"]!,
  });
}

const app = express();

// ── Security headers ──────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  // /chat and /onboarding serve inline-script HTML pages — allow it; all other routes stay strict.
  if (req.path === "/chat" || req.path.startsWith("/onboarding")) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none';"
    );
  } else {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none';"
    );
  }
  res.removeHeader("X-Powered-By");
  next();
});

app.use(express.json({
  limit: "256kb",
  verify: (req: Request, _res: Response, buf: Buffer) => {
    (req as Request & { rawBody: string }).rawBody = buf.toString();
  },
}));

// ── CORS — only allow configured origins ─────────────────────────────────
const ALLOWED_ORIGINS = new Set(
  (process.env["ALLOWED_ORIGINS"] ?? "").split(",").map(s => s.trim()).filter(Boolean)
);

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (!origin) { next(); return; } // same-origin, no Origin header
  if (ALLOWED_ORIGINS.size === 0) {
    if (process.env["NODE_ENV"] === "production") {
      res.status(403).json({ error: "CORS not configured" });
      return;
    }
    // dev: allow through
    next();
    return;
  }
  if (!ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Request-ID");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.sendStatus(204);
    return;
  }
  next();
});

// ── Request ID — correlation across logs ─────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const clientReqId = req.headers["x-request-id"] as string | undefined;
  const reqId = (clientReqId && /^[a-zA-Z0-9\-]{1,64}$/.test(clientReqId))
    ? clientReqId
    : generateRequestId();
  res.setHeader("X-Request-ID", reqId);
  withRequestId(reqId, next);
});

// ── Global rate limit (IP-based) ─────────────────────────────────────────
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

// ── Auth rate limiter for /assistant/message ─────────────────────────────
const apiRateLimiter = createAuthRateLimiter({
  maxAttempts: 20,
  windowMs: 60_000,
  lockoutMs: 120_000,
});

function getClientIp(req: Request): string {
  const trustProxy = process.env["TRUST_PROXY"] === "1" || process.env["TRUST_PROXY"] === "true";
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const ip = forwarded.split(",")[0]?.trim();
      if (ip) return ip;
    }
  }
  return req.socket?.remoteAddress ?? "unknown";
}

const webhookHandler = getWebhookHandler(bot);

// ── Telegram webhook ──────────────────────────────────────────────────────
app.post("/webhooks/telegram", (req: Request, res: Response) => {
  const secret = req.headers["x-telegram-bot-api-secret-token"];
  if (secret !== process.env["TELEGRAM_WEBHOOK_SECRET"]) {
    res.sendStatus(403);
    return;
  }
  webhookHandler(req, res);
});

// ── Inbound webhook triggers ──────────────────────────────────────────────
app.post("/webhooks/inbound/:hookId", (req: Request, res: Response) => {
  void handleWebhookInbound(req, res);
});

// ── Gmail Pub/Sub push notifications ─────────────────────────────────────
app.post("/webhooks/gmail", (req: Request, res: Response) => {
  void handleGmailWebhook(req, res);
});

// ── Direct REST API ───────────────────────────────────────────────────────
app.post("/assistant/message", async (req: Request, res: Response) => {
  const ip = getClientIp(req);

  // ── API key authentication ─────────────────────────────────────────────
  const configuredApiKey = process.env["API_KEY"];
  if (configuredApiKey) {
    const authHeader = req.headers["authorization"];
    const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;
    if (!token || token.length !== configuredApiKey.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(configuredApiKey))) {
      void auditLog({ action: "auth.failure", ip, channel: "api", details: { reason: "invalid_api_key" } });
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else {
    console.warn("[api] WARNING: API_KEY is not set — /assistant/message is unauthenticated");
  }

  const rateResult = apiRateLimiter.check(ip, "assistant");

  if (!rateResult.allowed) {
    void auditLog({ action: "rate_limit.exceeded", ip, channel: "api" });
    res.setHeader("Retry-After", String(Math.ceil(rateResult.retryAfterMs / 1000)));
    res.status(429).json({ error: "Too many requests. Try again later." });
    return;
  }

  try {
    const { text, inputType, userId, sessionId } = req.body as {
      text?: string;
      inputType?: string;
      userId?: string;
      sessionId?: string;
    };

    if (!text || typeof text !== "string" || !userId || !sessionId) {
      apiRateLimiter.recordFailure(ip, "assistant");
      void auditLog({ action: "auth.failure", ip, channel: "api", details: { reason: "invalid_input" } });
      res.status(400).json({ error: "text, userId, and sessionId are required" });
      return;
    }

    if (text.length > 4096) {
      res.status(400).json({ error: "text exceeds maximum length of 4096 characters" });
      return;
    }

    void auditLog({ action: "message.received", userId, sessionId, ip, channel: "api" });
    const response = await handleMessage({
      id: crypto.randomUUID(),
      text,
      userId,
      sessionId,
      channel: (inputType as any) ?? "web",
      locale: "en",
      timestamp: Date.now(),
    });
    res.json(response);
  } catch (err: unknown) {
    console.error("[api] /assistant/message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Health check ──────────────────────────────────────────────────────────
app.get("/health", async (req: Request, res: Response) => {
  const apiKey = process.env["HEALTH_API_KEY"];
  let authenticated = false;
  if (apiKey) {
    const provided = req.headers["x-api-key"] ?? req.query["key"];
    if (provided !== apiKey) {
      void auditLog({ action: "admin.access", ip: req.socket?.remoteAddress ?? "unknown", channel: "api", details: { denied: true } });
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    authenticated = true;
  }
  const [dbOk, sqsOk] = await Promise.all([checkDB(), checkSQS()]);
  res.json({
    db: dbOk,
    sqs: sqsOk,
    status: "ok",
    ...(authenticated ? { channel: process.env["CHANNEL"] ?? "unknown" } : {}),
  });
});

// ── Web chat UI ───────────────────────────────────────────────────────────
app.get("/chat", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(chatHtml);
});

// ── Reject unexpected WebSocket upgrade attempts (exempt /chat/ws) ────────
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers.upgrade?.toLowerCase() === "websocket" && req.path !== "/chat/ws") {
    res.status(426).json({ error: "WebSocket not supported on this endpoint" });
    return;
  }
  next();
});

// ── Onboarding wizard ────────────────────────────────────────────────────
app.use("/onboarding", onboardingRouter);

// ── Admin API ─────────────────────────────────────────────────────────────
app.use("/admin", adminRouter);

// ── 404 handler ───────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

const PORT = Number(process.env["PORT"] ?? 3000);
const server = app.listen(PORT, () => {
  console.log(`Sandra API listening on port ${PORT}`);
});
attachWebSocketServer(server);
registerGracefulShutdown(server);
