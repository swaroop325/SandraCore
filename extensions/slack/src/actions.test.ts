import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { pinSlackMessage, deleteSlackMessage, addSlackReaction } from "./actions.js";

function makeJsonResponse(body: object, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pinSlackMessage", () => {
  it("calls pins.add with correct params and returns ok:true", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ ok: true }));

    const result = await pinSlackMessage("xoxb-token", "C123", "1234567890.123456");

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/pins.add");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer xoxb-token");
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body["channel"]).toBe("C123");
    expect(body["timestamp"]).toBe("1234567890.123456");

    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false with error message when Slack returns error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ ok: false, error: "not_pinned" }));

    const result = await pinSlackMessage("xoxb-token", "C123", "111.222");
    expect(result).toEqual({ ok: false, error: "not_pinned" });
  });

  it("returns ok:false on network error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network failure"));

    const result = await pinSlackMessage("xoxb-token", "C123", "111.222");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("network failure");
  });
});

describe("deleteSlackMessage", () => {
  it("calls chat.delete with ts param and returns ok:true", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ ok: true }));

    const result = await deleteSlackMessage("xoxb-token", "C456", "9999999999.000001");

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.delete");
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body["ts"]).toBe("9999999999.000001");
    expect(body["channel"]).toBe("C456");

    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false with error when Slack returns error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ ok: false, error: "cant_delete_message" }));

    const result = await deleteSlackMessage("xoxb-token", "C456", "111.000");
    expect(result).toEqual({ ok: false, error: "cant_delete_message" });
  });
});

describe("addSlackReaction", () => {
  it("calls reactions.add with correct params", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ ok: true }));

    const result = await addSlackReaction("xoxb-token", "C789", "1111111111.000001", "thumbsup");

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/reactions.add");
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body["name"]).toBe("thumbsup");
    expect(body["channel"]).toBe("C789");
    expect(body["timestamp"]).toBe("1111111111.000001");

    expect(result).toEqual({ ok: true });
  });

  it("returns ok:false when already reacted", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeJsonResponse({ ok: false, error: "already_reacted" }));

    const result = await addSlackReaction("xoxb-token", "C789", "111.000", "wave");
    expect(result).toEqual({ ok: false, error: "already_reacted" });
  });
});
