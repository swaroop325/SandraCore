import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@whiskeysockets/baileys", () => ({
  default: vi.fn(() => ({
    ev: {
      on: vi.fn(),
    },
    sendMessage: vi.fn().mockResolvedValue(undefined),
  })),
  useMultiFileAuthState: vi.fn().mockResolvedValue({
    state: { creds: {}, keys: {} },
    saveCreds: vi.fn(),
  }),
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 0] }),
  makeCacheableSignalKeyStore: vi.fn().mockReturnValue({}),
  DisconnectReason: { loggedOut: 401 },
}));

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
  db: {
    query: vi.fn().mockResolvedValue({ rows: [{ id: "user-1", status: "approved" }] }),
    execute: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@sandra/agent", () => ({
  handleMessage: vi.fn().mockResolvedValue({ text: "Hello from Sandra" }),
}));

import { sendWhatsApp } from "./index.js";

describe("sendWhatsApp", () => {
  it("throws if socket not initialized", async () => {
    await expect(sendWhatsApp("1234567890@s.whatsapp.net", "hello")).rejects.toThrow(
      "WhatsApp socket not initialized"
    );
  });
});
