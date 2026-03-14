import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- hoisted mock functions ----
const { mockFetch, mockNextOccurrence } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockNextOccurrence: vi.fn(),
}));

// Patch global fetch
vi.stubGlobal("fetch", mockFetch);

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("./parser.js", () => ({
  parseCron: vi.fn().mockReturnValue({}),
  nextOccurrence: mockNextOccurrence,
}));

vi.mock("./schedule-helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./schedule-helpers.js")>();
  return {
    ...actual,
    // keep real implementations; nextOccurrenceForSchedule will call the mocked nextOccurrence
  };
});

import { createScheduler, notifyFailure } from "./scheduler.js";
import type { CronJob, CronJobStore } from "./scheduler.js";
import type { CronDelivery } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FUTURE_NEXT = new Date("2030-01-01T09:00:00Z");

function makeJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: "job-1",
    userId: "user-1",
    expression: "0 9 * * *",
    task: "Daily summary",
    channel: "telegram",
    sessionId: "tg:123",
    enabled: true,
    nextRunAt: new Date("2020-01-01T09:00:00Z"), // in the past — due
    createdAt: new Date("2020-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeStore(jobs: CronJob[] = []): CronJobStore {
  return {
    list: vi.fn().mockResolvedValue(jobs),
    upsert: vi.fn().mockResolvedValue(undefined),
    updateLastRun: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// notifyFailure unit tests
// ---------------------------------------------------------------------------

describe("notifyFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("POSTs to failureDestination.webhookUrl when set", async () => {
    const delivery: CronDelivery = {
      mode: "webhook",
      failureDestination: { webhookUrl: "https://example.com/failure" },
    };
    const job = makeJob({ delivery });
    await notifyFailure(job, new Error("boom"), delivery);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/failure");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { jobId: string; error: string; ts: string };
    expect(body.jobId).toBe("job-1");
    expect(body.error).toBe("boom");
    expect(typeof body.ts).toBe("string");
  });

  it("does not call fetch when failureDestination is undefined", async () => {
    const delivery: CronDelivery = { mode: "none" };
    await notifyFailure(makeJob(), new Error("ignored"), delivery);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("logs without throwing when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));
    const delivery: CronDelivery = {
      mode: "webhook",
      failureDestination: { webhookUrl: "https://example.com/fail" },
    };
    // Should not throw
    await expect(notifyFailure(makeJob(), new Error("job err"), delivery)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scheduler integration: failure handling
// ---------------------------------------------------------------------------

describe("scheduler — failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
    mockNextOccurrence.mockReturnValue(FUTURE_NEXT);
  });

  it("calls notifyFailure webhook when executor throws and failureDestination is configured", async () => {
    const webhookUrl = "https://hooks.example.com/fail";
    const job = makeJob({
      delivery: { mode: "announce", failureDestination: { webhookUrl } },
    });
    const store = makeStore([job]);
    const executor = vi.fn().mockRejectedValue(new Error("executor failed"));
    const scheduler = createScheduler({ store, executor, pollIntervalMs: 99999 });

    scheduler.start();
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    expect(executor).toHaveBeenCalledWith(job);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(webhookUrl);
    scheduler.stop();
  });

  it("does NOT call fetch when executor throws but no failureDestination", async () => {
    const job = makeJob({ delivery: { mode: "none" } });
    const store = makeStore([job]);
    const executor = vi.fn().mockRejectedValue(new Error("silent fail"));
    const scheduler = createScheduler({ store, executor, pollIntervalMs: 99999 });

    scheduler.start();
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    expect(executor).toHaveBeenCalledWith(job);
    expect(mockFetch).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("does NOT call fetch when executor throws and no delivery configured", async () => {
    const job = makeJob(); // no delivery field
    const store = makeStore([job]);
    const executor = vi.fn().mockRejectedValue(new Error("no delivery"));
    const scheduler = createScheduler({ store, executor, pollIntervalMs: 99999 });

    scheduler.start();
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch).not.toHaveBeenCalled();
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Scheduler integration: "at" job disabled after firing
// ---------------------------------------------------------------------------

describe("scheduler — at job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNextOccurrence.mockReturnValue(FUTURE_NEXT);
  });

  it("upserts the job with enabled=false after firing", async () => {
    const job = makeJob({
      schedule: { kind: "at", at: new Date("2020-01-01T09:00:00Z").toISOString() },
    });
    const store = makeStore([job]);
    const executor = vi.fn().mockResolvedValue("done");
    const scheduler = createScheduler({ store, executor, pollIntervalMs: 99999 });

    scheduler.start();
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    expect(executor).toHaveBeenCalledWith(job);
    expect(store.upsert).toHaveBeenCalledOnce();
    const upserted = (store.upsert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as CronJob;
    expect(upserted.enabled).toBe(false);
    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// Scheduler integration: "every" job fires at correct intervals
// ---------------------------------------------------------------------------

describe("scheduler — every job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNextOccurrence.mockReturnValue(FUTURE_NEXT);
  });

  it("fires and schedules the next run everyMs ahead", async () => {
    const everyMs = 60_000;
    const now = new Date();
    const job = makeJob({
      schedule: { kind: "every", everyMs },
      nextRunAt: new Date(now.getTime() - 1000), // past — due
    });
    const store = makeStore([job]);
    const executor = vi.fn().mockResolvedValue("ok");
    const scheduler = createScheduler({ store, executor, pollIntervalMs: 99999 });

    scheduler.start();
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50));

    expect(executor).toHaveBeenCalledWith(job);
    expect(store.updateLastRun).toHaveBeenCalledOnce();
    const [, , nextRunAt] = (store.updateLastRun as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Date, Date];
    // nextRunAt should be approximately runAt + everyMs (within a few ms for test timing)
    expect(nextRunAt.getTime()).toBeGreaterThanOrEqual(now.getTime() + everyMs - 100);
    scheduler.stop();
  });
});
