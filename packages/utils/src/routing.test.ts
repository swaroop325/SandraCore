import { describe, it, expect } from "vitest";
import { routeMessage, getChannelMessageLimit } from "./routing.js";

describe("routeMessage", () => {
  it("always processes DMs", () => {
    const r = routeMessage({ text: "hello", channel: "telegram", isGroup: false });
    expect(r.shouldProcess).toBe(true);
    expect(r.reason).toBe("dm");
  });

  it("blocks group messages without mention", () => {
    const r = routeMessage({ text: "hello everyone", channel: "telegram", isGroup: true });
    expect(r.shouldProcess).toBe(false);
    expect(r.reason).toBe("no_mention");
  });

  it("processes group messages with @Sandra mention", () => {
    const r = routeMessage({ text: "@Sandra what is the weather?", channel: "telegram", isGroup: true });
    expect(r.shouldProcess).toBe(true);
  });

  it("strips mention from cleanText", () => {
    const r = routeMessage({ text: "@Sandra help me", channel: "discord", isGroup: true });
    expect(r.cleanText).not.toContain("@Sandra");
    expect(r.cleanText).toContain("help me");
  });

  it("processes when botId is in text", () => {
    const r = routeMessage({ text: "<@U1234> remind me", channel: "slack", isGroup: true, botIds: ["U1234"] });
    expect(r.shouldProcess).toBe(true);
  });

  it("uses custom botName", () => {
    const r = routeMessage({ text: "@MyBot hello", channel: "telegram", isGroup: true, botName: "MyBot" });
    expect(r.shouldProcess).toBe(true);
  });
});

describe("getChannelMessageLimit", () => {
  it("returns discord limit of 2000", () => {
    expect(getChannelMessageLimit("discord")).toBe(2000);
  });
  it("returns default 4096 for unknown channel", () => {
    expect(getChannelMessageLimit("unknown")).toBe(4096);
  });
});
