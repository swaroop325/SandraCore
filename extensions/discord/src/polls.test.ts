import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- hoisted mock fns ----
const mockChannelsFetch = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());
const mockReact = vi.hoisted(() => vi.fn());

vi.mock("discord.js", () => ({
  Client: vi.fn().mockImplementation(() => ({
    channels: {
      fetch: mockChannelsFetch,
    },
  })),
  GatewayIntentBits: { DirectMessages: 1, MessageContent: 2, Guilds: 4, GuildMessages: 8 },
  Events: { ClientReady: "ready", MessageCreate: "messageCreate" },
  Partials: { Channel: 0, Message: 1 },
}));

import { Client } from "discord.js";
import { sendDiscordPoll } from "./polls.js";

function makeMockClient(): Client {
  return new Client({ intents: [] });
}

function makeSendableChannel(supportsNativePoll = true) {
  return {
    isSendable: () => true,
    send: supportsNativePoll
      ? mockSend
      : vi.fn().mockImplementationOnce(() => { throw new Error("poll not supported"); }).mockResolvedValue({ id: "msg-fallback", react: mockReact }),
    messages: {},
  };
}

beforeEach(() => {
  mockChannelsFetch.mockReset();
  mockSend.mockReset();
  mockReact.mockReset();
});

describe("sendDiscordPoll", () => {
  it("returns error when channel not found", async () => {
    mockChannelsFetch.mockResolvedValueOnce(null);
    const client = makeMockClient();
    const result = await sendDiscordPoll(client, "ch-1", {
      question: "Q?",
      answers: ["A", "B"],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Channel not found");
  });

  it("returns error when channel is not sendable", async () => {
    mockChannelsFetch.mockResolvedValueOnce({ isSendable: () => false });
    const client = makeMockClient();
    const result = await sendDiscordPoll(client, "ch-1", {
      question: "Q?",
      answers: ["A", "B"],
    });
    expect(result.success).toBe(false);
  });

  it("sends native poll and returns messageId on success", async () => {
    const channel = makeSendableChannel(true);
    mockChannelsFetch.mockResolvedValueOnce(channel);
    mockSend.mockResolvedValueOnce({ id: "msg-native-poll" });

    const client = makeMockClient();
    const result = await sendDiscordPoll(client, "ch-2", {
      question: "Favourite?",
      answers: ["Option A", "Option B"],
      duration: 12,
      allowMultiselect: true,
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const [payload] = mockSend.mock.calls[0] as [{ poll: unknown }];
    expect(payload).toHaveProperty("poll");
    expect(result).toEqual({ success: true, messageId: "msg-native-poll" });
  });

  it("falls back to reaction poll when native poll fails", async () => {
    const fallbackMsg = { id: "msg-fallback", react: mockReact };
    const channel = {
      isSendable: () => true,
      send: vi.fn()
        .mockRejectedValueOnce(new Error("poll not supported"))
        .mockResolvedValueOnce(fallbackMsg),
    };
    mockChannelsFetch.mockResolvedValueOnce(channel);
    mockReact.mockResolvedValue(undefined);

    const client = makeMockClient();
    const result = await sendDiscordPoll(client, "ch-3", {
      question: "Vote:",
      answers: ["Yes", "No"],
    });

    // Second send call is the fallback text message
    expect(channel.send).toHaveBeenCalledTimes(2);
    const fallbackText = (channel.send.mock.calls[1] as [string])[0];
    expect(fallbackText).toContain("Vote:");
    expect(fallbackText).toContain("1️⃣");
    // Reactions added for each answer
    expect(mockReact).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true, messageId: "msg-fallback" });
  });

  it("defaults allowMultiselect to false when not provided", async () => {
    const channel = makeSendableChannel(true);
    mockChannelsFetch.mockResolvedValueOnce(channel);
    mockSend.mockResolvedValueOnce({ id: "msg-1" });

    const client = makeMockClient();
    await sendDiscordPoll(client, "ch-4", {
      question: "Q?",
      answers: ["A", "B"],
    });

    const [payload] = mockSend.mock.calls[0] as [{ poll: Record<string, unknown> }];
    expect(payload.poll["allowMultiselect"]).toBe(false);
  });
});
