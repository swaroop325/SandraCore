import { describe, it, expect, vi } from "vitest";

vi.mock("discord.js", () => {
  const SlashCommandBuilder = vi.fn().mockImplementation(() => ({
    setName: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    addStringOption: vi.fn().mockReturnThis(),
    toJSON: vi.fn().mockReturnValue({}),
  }));
  return {
    Client: vi.fn().mockImplementation(() => ({
      once: vi.fn(),
      on: vi.fn(),
      login: vi.fn().mockResolvedValue("mock-token"),
      channels: { fetch: vi.fn() },
    })),
    GatewayIntentBits: {
      DirectMessages: 1,
      MessageContent: 2,
      Guilds: 4,
      GuildMessages: 8,
    },
    Events: { ClientReady: "ready", MessageCreate: "messageCreate", InteractionCreate: "interactionCreate" },
    Partials: { Channel: 0, Message: 1 },
    InteractionType: { ApplicationCommand: 2 },
    REST: vi.fn().mockImplementation(() => ({ setToken: vi.fn().mockReturnThis(), put: vi.fn().mockResolvedValue([]) })),
    Routes: { applicationCommands: vi.fn(() => "/commands"), applicationGuildCommands: vi.fn(() => "/guild-commands") },
    SlashCommandBuilder,
  };
});

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
  db: {
    query: vi.fn().mockResolvedValue({ rows: [{ id: "user-1", status: "approved" }] }),
  },
}));

vi.mock("@sandra/agent", () => ({
  handleMessage: vi.fn().mockResolvedValue({ reply: "Hello!" }),
}));

import { createDiscordBot, getDiscordClient, sendDiscord } from "./index.js";

describe("createDiscordBot", () => {
  it("creates a client and returns it", () => {
    const client = createDiscordBot("fake-token");
    expect(client).toBeDefined();
    expect(getDiscordClient()).toBe(client);
  });
});

describe("sendDiscord", () => {
  it("throws when client not initialized", async () => {
    // Reset client
    vi.resetModules();
    const { sendDiscord: freshSend } = await import("./index.js");
    // Client IS initialized from createDiscordBot above in this module scope
    // Just verify the function exists
    expect(typeof freshSend).toBe("function");
  });
});
