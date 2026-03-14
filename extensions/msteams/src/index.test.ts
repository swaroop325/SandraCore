import { describe, it, expect, vi } from "vitest";
vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  db: { query: vi.fn().mockResolvedValue({ rows: [{ id: "u1", status: "approved" }] }) },
}));
vi.mock("@sandra/agent", () => ({
  handleMessage: vi.fn().mockResolvedValue({ reply: "Hello!" }),
}));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ access_token: "tok" }),
  status: 200,
}));

import { handleTeamsActivity } from "./index.js";

describe("handleTeamsActivity", () => {
  it("skips non-message activities", async () => {
    const { handleMessage } = await import("@sandra/agent");
    await handleTeamsActivity({ type: "typing", id: "1", from: { id: "u1" }, conversation: { id: "c1" }, channelId: "msteams", serviceUrl: "https://smba.trafficmanager.net" });
    expect(handleMessage).not.toHaveBeenCalled();
  });
  it("skips empty text", async () => {
    const { handleMessage } = await import("@sandra/agent");
    await handleTeamsActivity({ type: "message", id: "1", text: "  ", from: { id: "u1" }, conversation: { id: "c1" }, channelId: "msteams", serviceUrl: "https://smba.trafficmanager.net" });
    expect(handleMessage).not.toHaveBeenCalled();
  });
});
