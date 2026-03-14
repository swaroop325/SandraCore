import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- hoisted mock fns ----
const mockPinChatMessage = vi.hoisted(() => vi.fn());
const mockUnpinChatMessage = vi.hoisted(() => vi.fn());
const mockEditMessageText = vi.hoisted(() => vi.fn());
const mockDeleteMessage = vi.hoisted(() => vi.fn());
const mockGetChatMemberCount = vi.hoisted(() => vi.fn());
const mockBanChatMember = vi.hoisted(() => vi.fn());

vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(() => ({
    api: {
      pinChatMessage: mockPinChatMessage,
      unpinChatMessage: mockUnpinChatMessage,
      editMessageText: mockEditMessageText,
      deleteMessage: mockDeleteMessage,
      getChatMemberCount: mockGetChatMemberCount,
      banChatMember: mockBanChatMember,
    },
  })),
}));

import { Bot } from "grammy";
import {
  pinMessage,
  unpinMessage,
  editMessage,
  deleteMessage,
  getChatMemberCount,
  banUser,
} from "./actions.js";

function makeMockBot(): Bot {
  return new Bot("fake-token");
}

beforeEach(() => {
  mockPinChatMessage.mockReset();
  mockUnpinChatMessage.mockReset();
  mockEditMessageText.mockReset();
  mockDeleteMessage.mockReset();
  mockGetChatMemberCount.mockReset();
  mockBanChatMember.mockReset();
});

describe("pinMessage", () => {
  it("calls pinChatMessage and returns true on success", async () => {
    mockPinChatMessage.mockResolvedValueOnce(true);
    const result = await pinMessage(makeMockBot(), 100, 42);
    expect(mockPinChatMessage).toHaveBeenCalledWith(100, 42);
    expect(result).toBe(true);
  });

  it("returns false when api throws", async () => {
    mockPinChatMessage.mockRejectedValueOnce(new Error("no permission"));
    const result = await pinMessage(makeMockBot(), 100, 42);
    expect(result).toBe(false);
  });
});

describe("unpinMessage", () => {
  it("calls unpinChatMessage with messageId when provided", async () => {
    mockUnpinChatMessage.mockResolvedValueOnce(true);
    const result = await unpinMessage(makeMockBot(), 100, 42);
    expect(mockUnpinChatMessage).toHaveBeenCalledWith(100, 42);
    expect(result).toBe(true);
  });

  it("calls unpinChatMessage without extra args when messageId omitted", async () => {
    mockUnpinChatMessage.mockResolvedValueOnce(true);
    const result = await unpinMessage(makeMockBot(), 100);
    expect(mockUnpinChatMessage).toHaveBeenCalledWith(100, undefined);
    expect(result).toBe(true);
  });

  it("returns false on error", async () => {
    mockUnpinChatMessage.mockRejectedValueOnce(new Error("fail"));
    const result = await unpinMessage(makeMockBot(), 100, 1);
    expect(result).toBe(false);
  });
});

describe("editMessage", () => {
  it("calls editMessageText with correct args and returns true", async () => {
    mockEditMessageText.mockResolvedValueOnce({});
    const result = await editMessage(makeMockBot(), 200, 5, "new content");
    expect(mockEditMessageText).toHaveBeenCalledWith(200, 5, "new content");
    expect(result).toBe(true);
  });

  it("returns false on error", async () => {
    mockEditMessageText.mockRejectedValueOnce(new Error("message not modified"));
    const result = await editMessage(makeMockBot(), 200, 5, "same content");
    expect(result).toBe(false);
  });
});

describe("deleteMessage", () => {
  it("calls deleteMessage api and returns true", async () => {
    mockDeleteMessage.mockResolvedValueOnce(true);
    const result = await deleteMessage(makeMockBot(), 300, 99);
    expect(mockDeleteMessage).toHaveBeenCalledWith(300, 99);
    expect(result).toBe(true);
  });

  it("returns false on error", async () => {
    mockDeleteMessage.mockRejectedValueOnce(new Error("message not found"));
    const result = await deleteMessage(makeMockBot(), 300, 99);
    expect(result).toBe(false);
  });
});

describe("getChatMemberCount", () => {
  it("returns member count on success", async () => {
    mockGetChatMemberCount.mockResolvedValueOnce(42);
    const result = await getChatMemberCount(makeMockBot(), "chat-id");
    expect(mockGetChatMemberCount).toHaveBeenCalledWith("chat-id");
    expect(result).toBe(42);
  });

  it("returns null on error", async () => {
    mockGetChatMemberCount.mockRejectedValueOnce(new Error("not found"));
    const result = await getChatMemberCount(makeMockBot(), "bad-id");
    expect(result).toBeNull();
  });
});

describe("banUser", () => {
  it("calls banChatMember with until_date when provided", async () => {
    mockBanChatMember.mockResolvedValueOnce(true);
    const result = await banUser(makeMockBot(), 400, 777, 9999999);
    const [chatId, userId, extra] = mockBanChatMember.mock.calls[0] as [
      unknown, number, Record<string, unknown>
    ];
    expect(chatId).toBe(400);
    expect(userId).toBe(777);
    expect(extra["until_date"]).toBe(9999999);
    expect(result).toBe(true);
  });

  it("calls banChatMember without until_date when omitted", async () => {
    mockBanChatMember.mockResolvedValueOnce(true);
    await banUser(makeMockBot(), 400, 888);
    const [, , extra] = mockBanChatMember.mock.calls[0] as [
      unknown, number, Record<string, unknown>
    ];
    expect("until_date" in extra).toBe(false);
  });

  it("returns false on error", async () => {
    mockBanChatMember.mockRejectedValueOnce(new Error("no rights"));
    const result = await banUser(makeMockBot(), 400, 999);
    expect(result).toBe(false);
  });
});
