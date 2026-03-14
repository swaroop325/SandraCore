import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockQuery, mockAuditLog, mockHandleMessage } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockHandleMessage: vi.fn(),
}));

vi.mock("@sandra/utils", () => ({
  db: { query: mockQuery, execute: vi.fn() },
  auditLog: mockAuditLog,
}));

vi.mock("@sandra/agent", () => ({
  handleMessage: mockHandleMessage,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeReq(overrides: {
  hookId?: string;
  body?: unknown;
  rawBody?: string;
  signature?: string | null;
}): { params: { hookId: string }; body: unknown; rawBody?: string; headers: Record<string, string | undefined> } {
  const body = overrides.body ?? { event: "test" };
  const rawBody = overrides.rawBody ?? JSON.stringify(body);
  const headers: Record<string, string | undefined> = {};
  if (overrides.signature !== null) {
    headers["x-hook-signature"] = overrides.signature ?? "placeholder";
  }
  return {
    params: { hookId: overrides.hookId ?? "hook-abc" },
    body,
    rawBody,
    headers,
  };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: undefined as unknown,
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
  };
  return res;
}

function makeHmac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleWebhookInbound", () => {
  it("returns 404 when hook is not found in DB", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({});
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    expect(res._status).toBe(404);
    expect((res._body as any).error).toMatch(/not found/i);
  });

  it("returns 404 when hook is disabled", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "hook-uuid",
        user_id: "user-uuid",
        name: "My Hook",
        hook_id: "hook-abc",
        secret: "my-secret",
        enabled: false,
      }],
    });
    const { handleWebhookInbound } = await import("./webhooks.js");

    const rawBody = JSON.stringify({ event: "test" });
    const sig = makeHmac("my-secret", rawBody);
    const req = makeReq({ signature: sig, rawBody });
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    expect(res._status).toBe(404);
  });

  it("returns 401 when signature is missing", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "hook-uuid",
        user_id: "user-uuid",
        name: "My Hook",
        hook_id: "hook-abc",
        secret: "my-secret",
        enabled: true,
      }],
    });
    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({ signature: null });
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    expect(res._status).toBe(401);
    expect((res._body as any).error).toMatch(/signature/i);
  });

  it("returns 401 when signature does not match", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "hook-uuid",
        user_id: "user-uuid",
        name: "My Hook",
        hook_id: "hook-abc",
        secret: "my-secret",
        enabled: true,
      }],
    });
    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({ signature: "bad-signature" });
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    expect(res._status).toBe(401);
  });

  it("returns 200 with reply when signature is valid", async () => {
    const secret = "super-secret";
    const body = { event: "user.created", id: "123" };
    const rawBody = JSON.stringify(body);
    const sig = makeHmac(secret, rawBody);

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "hook-uuid",
        user_id: "user-uuid",
        name: "My Hook",
        hook_id: "hook-abc",
        secret,
        enabled: true,
      }],
    });
    mockHandleMessage.mockResolvedValueOnce({ reply: "Got your webhook!" });

    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({ signature: sig, rawBody, body });
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    expect(res._status).toBe(200);
    expect((res._body as any).ok).toBe(true);
    expect((res._body as any).reply).toBe("Got your webhook!");
  });

  it("calls handleMessage with correct parameters", async () => {
    const secret = "test-secret";
    const body = { foo: "bar" };
    const rawBody = JSON.stringify(body);
    const sig = makeHmac(secret, rawBody);

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "hook-uuid",
        user_id: "user-uuid-123",
        name: "Test Hook",
        hook_id: "hook-xyz",
        secret,
        enabled: true,
      }],
    });
    mockHandleMessage.mockResolvedValueOnce({ reply: "ok" });

    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({ hookId: "hook-xyz", signature: sig, rawBody, body });
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    expect(mockHandleMessage).toHaveBeenCalledTimes(1);
    const callArg = mockHandleMessage.mock.calls[0]![0];
    expect(callArg.text).toBe("Webhook trigger: " + rawBody);
    expect(callArg.userId).toBe("user-uuid-123");
    expect(callArg.sessionId).toBe("webhook:hook-xyz");
    expect(callArg.channel).toBe("internal");
    expect(callArg.locale).toBe("en");
    expect(typeof callArg.id).toBe("string");
    expect(typeof callArg.timestamp).toBe("number");
  });

  it("logs an audit entry on success", async () => {
    const secret = "audit-secret";
    const body = { event: "ping" };
    const rawBody = JSON.stringify(body);
    const sig = makeHmac(secret, rawBody);

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "hook-uuid",
        user_id: "user-audit",
        name: "Audit Hook",
        hook_id: "hook-audit",
        secret,
        enabled: true,
      }],
    });
    mockHandleMessage.mockResolvedValueOnce({ reply: "logged" });

    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({ hookId: "hook-audit", signature: sig, rawBody, body });
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    // Give void promise a tick to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "message.received",
        userId: "user-audit",
        sessionId: "webhook:hook-audit",
        channel: "webhook",
      }),
    );
  });

  it("returns 500 when DB throws", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB connection lost"));

    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({});
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    expect(res._status).toBe(500);
  });

  it("returns 500 when handleMessage throws", async () => {
    const secret = "err-secret";
    const body = { event: "boom" };
    const rawBody = JSON.stringify(body);
    const sig = makeHmac(secret, rawBody);

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "hook-uuid",
        user_id: "user-uuid",
        name: "Error Hook",
        hook_id: "hook-err",
        secret,
        enabled: true,
      }],
    });
    mockHandleMessage.mockRejectedValueOnce(new Error("Agent blew up"));

    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({ signature: sig, rawBody, body });
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    expect(res._status).toBe(500);
    expect((res._body as any).error).toBe("Internal server error");
  });

  it("logs security violation audit entry on invalid signature", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "hook-uuid",
        user_id: "user-uuid",
        name: "My Hook",
        hook_id: "hook-abc",
        secret: "real-secret",
        enabled: true,
      }],
    });

    const { handleWebhookInbound } = await import("./webhooks.js");

    const req = makeReq({ signature: "wrong-sig" });
    const res = makeRes();
    await handleWebhookInbound(req as any, res as any);

    await new Promise((r) => setTimeout(r, 0));

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "security.violation",
        channel: "webhook",
      }),
    );
  });
});
