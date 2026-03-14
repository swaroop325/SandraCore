import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

vi.mock("./cdp-client.js", () => ({
  getPages: vi.fn().mockResolvedValue([{
    id: "1", title: "Test Page", url: "https://example.com",
    webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/1",
  }]),
  createCDPClient: vi.fn().mockResolvedValue({
    send: vi.fn().mockResolvedValue({ result: { value: "test", type: "string" }, layoutViewport: { clientWidth: 1280, clientHeight: 800 } }),
    on: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("./page-controller.js", () => ({
  PageController: vi.fn().mockImplementation(() => ({
    navigate: vi.fn().mockResolvedValue(undefined),
    getInfo: vi.fn().mockResolvedValue({ url: "https://example.com", title: "Test" }),
    screenshot: vi.fn().mockResolvedValue({ data: "base64data", width: 1280, height: 800 }),
    getTextContent: vi.fn().mockResolvedValue("Page content here"),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue("eval result"),
    scroll: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { browserAction, resetBrowserController } from "./browser-tool.js";

beforeEach(() => { resetBrowserController(); vi.clearAllMocks(); });

describe("browserAction", () => {
  it("navigate returns page info", async () => {
    const r = await browserAction({ action: "navigate", url: "https://example.com" });
    expect(r.success).toBe(true);
    expect(r.data).toContain("Test");
  });

  it("navigate fails without url", async () => {
    const r = await browserAction({ action: "navigate" });
    expect(r.success).toBe(false);
  });

  it("screenshot returns base64 data", async () => {
    const r = await browserAction({ action: "screenshot" });
    expect(r.success).toBe(true);
    expect(r.data).toBe("base64data");
  });

  it("get_text returns page content", async () => {
    const r = await browserAction({ action: "get_text" });
    expect(r.success).toBe(true);
    expect(r.data).toContain("content");
  });

  it("evaluate returns expression result", async () => {
    const r = await browserAction({ action: "evaluate", expression: "1+1" });
    expect(r.success).toBe(true);
  });

  it("evaluate fails without expression", async () => {
    const r = await browserAction({ action: "evaluate" });
    expect(r.success).toBe(false);
  });
});
