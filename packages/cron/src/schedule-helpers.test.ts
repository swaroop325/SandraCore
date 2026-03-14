import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- hoisted mocks (referenced inside vi.mock factories) ----
const { mockNextOccurrence } = vi.hoisted(() => ({
  mockNextOccurrence: vi.fn(),
}));

vi.mock("./parser.js", () => ({
  parseCron: vi.fn().mockReturnValue({ minute: [0], hour: [9], dayOfMonth: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31], month: [1,2,3,4,5,6,7,8,9,10,11,12], dayOfWeek: [0,1,2,3,4,5,6] }),
  nextOccurrence: mockNextOccurrence,
}));

import {
  normalizeSchedule,
  nextOccurrenceForSchedule,
  isTopOfHourExpr,
} from "./schedule-helpers.js";
import type { CronJob } from "./scheduler.js";
import type { CronSchedule } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<CronJob> & { schedule?: CronSchedule } = {}): CronJob {
  return {
    id: "j1",
    userId: "u1",
    expression: "0 9 * * *",
    task: "daily task",
    channel: "telegram",
    sessionId: "tg:1",
    enabled: true,
    nextRunAt: new Date("2026-03-14T09:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeSchedule
// ---------------------------------------------------------------------------

describe("normalizeSchedule", () => {
  it("returns the schedule field when already set (kind: cron)", () => {
    const schedule: CronSchedule = { kind: "cron", expr: "*/5 * * * *" };
    const job = makeJob({ schedule });
    expect(normalizeSchedule(job)).toEqual(schedule);
  });

  it("returns the schedule field when already set (kind: at)", () => {
    const schedule: CronSchedule = { kind: "at", at: "2030-01-01T12:00:00Z" };
    const job = makeJob({ schedule });
    expect(normalizeSchedule(job)).toEqual(schedule);
  });

  it("returns the schedule field when already set (kind: every)", () => {
    const schedule: CronSchedule = { kind: "every", everyMs: 60_000 };
    const job = makeJob({ schedule });
    expect(normalizeSchedule(job)).toEqual(schedule);
  });

  it("falls back to { kind: 'cron', expr: expression } when no schedule set", () => {
    const job = makeJob({ expression: "30 8 * * 1-5" });
    expect(normalizeSchedule(job)).toEqual({ kind: "cron", expr: "30 8 * * 1-5" });
  });
});

// ---------------------------------------------------------------------------
// nextOccurrenceForSchedule — "at" kind
// ---------------------------------------------------------------------------

describe("nextOccurrenceForSchedule — at", () => {
  it("returns the Date when it is in the future", () => {
    const futureDate = "2030-06-01T10:00:00Z";
    const schedule: CronSchedule = { kind: "at", at: futureDate };
    const after = new Date("2026-01-01T00:00:00Z");
    const result = nextOccurrenceForSchedule(schedule, after);
    expect(result).not.toBeNull();
    expect(result?.toISOString()).toBe(new Date(futureDate).toISOString());
  });

  it("returns null when the date is in the past", () => {
    const schedule: CronSchedule = { kind: "at", at: "2020-01-01T00:00:00Z" };
    const after = new Date("2026-03-14T00:00:00Z");
    expect(nextOccurrenceForSchedule(schedule, after)).toBeNull();
  });

  it("returns null for an invalid ISO string", () => {
    const schedule: CronSchedule = { kind: "at", at: "not-a-date" };
    expect(nextOccurrenceForSchedule(schedule, new Date())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// nextOccurrenceForSchedule — "every" kind
// ---------------------------------------------------------------------------

describe("nextOccurrenceForSchedule — every", () => {
  it("returns after + everyMs when no anchor", () => {
    const schedule: CronSchedule = { kind: "every", everyMs: 5_000 };
    const after = new Date("2026-03-14T12:00:00Z");
    const result = nextOccurrenceForSchedule(schedule, after);
    expect(result?.getTime()).toBe(after.getTime() + 5_000);
  });

  it("respects anchorMs offset", () => {
    // everyMs = 1 hour (3_600_000), anchor at epoch + 30 min (1_800_000)
    const everyMs = 3_600_000;
    const anchorMs = 1_800_000;
    const schedule: CronSchedule = { kind: "every", everyMs, anchorMs };

    // after = epoch + 1h 31m — next should be epoch + 2h 30m
    const after = new Date(everyMs + 31 * 60_000);
    const result = nextOccurrenceForSchedule(schedule, after);
    expect(result).not.toBeNull();
    // result must be > after
    expect(result!.getTime()).toBeGreaterThan(after.getTime());
    // result modulo everyMs should equal anchorMs % everyMs
    expect(result!.getTime() % everyMs).toBe(anchorMs % everyMs);
  });

  it("fires at correct intervals — sequential calls advance by everyMs", () => {
    const everyMs = 10_000;
    const schedule: CronSchedule = { kind: "every", everyMs };
    const t0 = new Date("2026-03-14T00:00:00Z");
    const t1 = nextOccurrenceForSchedule(schedule, t0)!;
    const t2 = nextOccurrenceForSchedule(schedule, t1)!;
    expect(t1.getTime() - t0.getTime()).toBe(everyMs);
    expect(t2.getTime() - t1.getTime()).toBe(everyMs);
  });
});

// ---------------------------------------------------------------------------
// nextOccurrenceForSchedule — "cron" kind
// ---------------------------------------------------------------------------

describe("nextOccurrenceForSchedule — cron", () => {
  const FIXED_NEXT = new Date("2026-03-15T09:00:00Z");

  beforeEach(() => {
    mockNextOccurrence.mockReturnValue(FIXED_NEXT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls nextOccurrence and returns its value for a plain cron schedule", () => {
    const schedule: CronSchedule = { kind: "cron", expr: "0 9 * * *" };
    const after = new Date("2026-03-14T00:00:00Z");
    const result = nextOccurrenceForSchedule(schedule, after);
    expect(mockNextOccurrence).toHaveBeenCalled();
    expect(result?.toISOString()).toBe(FIXED_NEXT.toISOString());
  });

  it("adds jitter within staggerMs range when staggerMs is set", () => {
    const staggerMs = 300_000; // 5 minutes
    const schedule: CronSchedule = { kind: "cron", expr: "0 9 * * *", staggerMs };
    const after = new Date("2026-03-14T00:00:00Z");

    // Run many times to verify jitter is within range
    let sawNonZero = false;
    for (let i = 0; i < 50; i++) {
      const result = nextOccurrenceForSchedule(schedule, after);
      expect(result).not.toBeNull();
      const diff = result!.getTime() - FIXED_NEXT.getTime();
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThan(staggerMs);
      if (diff > 0) sawNonZero = true;
    }
    // With 50 iterations and random jitter over 300s the probability of all zeros is negligible
    expect(sawNonZero).toBe(true);
  });

  it("auto-applies 5-minute stagger for top-of-hour expressions (no staggerMs given)", () => {
    const schedule: CronSchedule = { kind: "cron", expr: "0 */2 * * *" };
    const after = new Date("2026-03-14T00:00:00Z");
    const results: number[] = [];
    for (let i = 0; i < 50; i++) {
      const result = nextOccurrenceForSchedule(schedule, after);
      results.push(result!.getTime() - FIXED_NEXT.getTime());
    }
    expect(results.some((d) => d > 0)).toBe(true);
    expect(results.every((d) => d < 5 * 60 * 1000)).toBe(true);
  });

  it("passes a TZ-adjusted reference date to nextOccurrence when tz is set", () => {
    const schedule: CronSchedule = { kind: "cron", expr: "0 9 * * *", tz: "Asia/Kolkata" };
    const after = new Date("2026-03-14T12:00:00Z"); // 17:30 IST
    nextOccurrenceForSchedule(schedule, after);
    // The reference date passed to nextOccurrence must not equal `after` unchanged
    const calledWith = mockNextOccurrence.mock.calls[0]?.[1] as Date | undefined;
    expect(calledWith).toBeDefined();
    // IST is UTC+5:30, so wall-clock hours/minutes differ from UTC
    expect(calledWith!.getTime()).not.toBe(after.getTime());
  });
});

// ---------------------------------------------------------------------------
// isTopOfHourExpr
// ---------------------------------------------------------------------------

describe("isTopOfHourExpr", () => {
  it("recognizes '0 * * * *'", () => {
    expect(isTopOfHourExpr("0 * * * *")).toBe(true);
  });

  it("recognizes '0 */1 * * *'", () => {
    expect(isTopOfHourExpr("0 */1 * * *")).toBe(true);
  });

  it("recognizes '0 */2 * * *'", () => {
    expect(isTopOfHourExpr("0 */2 * * *")).toBe(true);
  });

  it("recognizes '0 */6 * * *'", () => {
    expect(isTopOfHourExpr("0 */6 * * *")).toBe(true);
  });

  it("rejects '30 * * * *' (minute not 0)", () => {
    expect(isTopOfHourExpr("30 * * * *")).toBe(false);
  });

  it("rejects '0 9 * * *' (specific hour, not */N)", () => {
    expect(isTopOfHourExpr("0 9 * * *")).toBe(false);
  });

  it("rejects '0 */2 1 * *' (dom not wildcard)", () => {
    expect(isTopOfHourExpr("0 */2 1 * *")).toBe(false);
  });

  it("rejects '*/5 * * * *' (minute not 0)", () => {
    expect(isTopOfHourExpr("*/5 * * * *")).toBe(false);
  });

  it("rejects expressions with wrong field count", () => {
    expect(isTopOfHourExpr("0 * *")).toBe(false);
  });
});
