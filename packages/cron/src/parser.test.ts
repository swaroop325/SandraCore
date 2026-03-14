import { describe, it, expect } from "vitest";
import { parseCron, nextOccurrence, validateCron } from "./parser.js";

describe("parseCron", () => {
  it("parses standard expression", () => {
    const f = parseCron("0 9 * * 1-5");
    expect(f.minute).toEqual([0]);
    expect(f.hour).toEqual([9]);
    expect(f.dayOfWeek).toEqual([1,2,3,4,5]);
  });

  it("parses */15 step", () => {
    const f = parseCron("*/15 * * * *");
    expect(f.minute).toEqual([0,15,30,45]);
  });

  it("parses comma-separated values", () => {
    const f = parseCron("0 9,17 * * *");
    expect(f.hour).toEqual([9,17]);
  });

  it("throws on wrong field count", () => {
    expect(() => parseCron("* * *")).toThrow("5 cron fields");
  });

  it("throws on invalid value", () => {
    expect(() => parseCron("99 * * * *")).toThrow(); // 99 > max minute 59
  });

  it("parses range with step", () => {
    const f = parseCron("0 8-18/2 * * *");
    expect(f.hour).toEqual([8,10,12,14,16,18]);
  });
});

describe("nextOccurrence", () => {
  it("returns a future date", () => {
    const f = parseCron("* * * * *");
    const next = nextOccurrence(f, new Date());
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns correct minute match", () => {
    const f = parseCron("30 10 * * *");
    // From just before 10:30
    const from = new Date("2025-06-01T10:29:00Z");
    const next = nextOccurrence(f, from);
    expect(next.getUTCHours()).toBe(10);
    expect(next.getUTCMinutes()).toBe(30);
  });
});

describe("validateCron", () => {
  it("returns null for valid expression", () => {
    expect(validateCron("0 9 * * 1-5")).toBeNull();
  });

  it("returns error string for invalid expression", () => {
    const err = validateCron("99 * * * *");
    expect(err).toBeTruthy();
  });
});
