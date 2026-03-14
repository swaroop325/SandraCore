import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sandra/utils", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Mock the parser to return predictable values
vi.mock("./parser.js", () => ({
  parseCron: vi.fn().mockReturnValue({ minute: [0], hour: [9], dom: ["*"], month: ["*"], dow: ["*"] }),
  nextOccurrence: vi.fn().mockReturnValue(new Date("2030-01-01T09:00:00Z")),
}));

import { createScheduler } from "./scheduler.js";
import type { CronJob, CronJobStore, JobExecutor } from "./scheduler.js";

function makeJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: "job-1",
    userId: "user-1",
    expression: "0 9 * * *",
    task: "Send daily summary",
    channel: "telegram",
    sessionId: "tg:123",
    enabled: true,
    nextRunAt: new Date("2020-01-01T09:00:00Z"), // past — due now
    createdAt: new Date("2020-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeStore(jobs: CronJob[] = []): CronJobStore {
  return {
    list: vi.fn().mockResolvedValue(jobs),
    upsert: vi.fn().mockResolvedValue(undefined),
    updateLastRun: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createScheduler", () => {
  it("executes a due job on tick", async () => {
    const job = makeJob();
    const store = makeStore([job]);
    const executor: JobExecutor = vi.fn().mockResolvedValue("done");
    const scheduler = createScheduler({ store, executor, pollIntervalMs: 99999 });
    scheduler.start();
    await scheduler.tick();
    await new Promise((r) => setTimeout(r, 50)); // let async job complete
    expect(executor).toHaveBeenCalledWith(job);
    scheduler.stop();
  });

  it("skips disabled jobs", async () => {
    const job = makeJob({ enabled: false });
    const store = makeStore([job]);
    const executor: JobExecutor = vi.fn().mockResolvedValue("done");
    const scheduler = createScheduler({ store, executor });
    await scheduler.tick();
    expect(executor).not.toHaveBeenCalled();
  });

  it("skips future jobs", async () => {
    const job = makeJob({ nextRunAt: new Date("2099-01-01") });
    const store = makeStore([job]);
    const executor: JobExecutor = vi.fn().mockResolvedValue("done");
    const scheduler = createScheduler({ store, executor });
    await scheduler.tick();
    expect(executor).not.toHaveBeenCalled();
  });

  it("schedule() upserts job and returns it", async () => {
    const store = makeStore();
    const scheduler = createScheduler({ store, executor: vi.fn().mockResolvedValue("") });
    const job = await scheduler.schedule({
      id: "j1", userId: "u1", expression: "0 9 * * *",
      task: "Test", channel: "telegram", sessionId: "tg:1", enabled: true,
    });
    expect(store.upsert).toHaveBeenCalledWith(job);
    expect(job.nextRunAt).toBeDefined();
  });

  it("stop() clears the interval", () => {
    const store = makeStore();
    const scheduler = createScheduler({ store, executor: vi.fn() });
    scheduler.start();
    scheduler.stop();
    // No assertion needed — just verify no throw
  });
});
