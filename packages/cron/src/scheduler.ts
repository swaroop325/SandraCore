import { parseCron, nextOccurrence } from "./parser.js";
import { createSubsystemLogger } from "@sandra/utils";

const log = createSubsystemLogger("cron");

export interface CronJob {
  id: string;
  userId: string;
  expression: string;
  task: string;          // natural language task description
  channel: string;       // which channel to reply on
  sessionId: string;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
}

export interface CronJobStore {
  list(): Promise<CronJob[]>;
  upsert(job: CronJob): Promise<void>;
  updateLastRun(id: string, runAt: Date, nextRunAt: Date): Promise<void>;
  delete(id: string): Promise<void>;
}

export type JobExecutor = (job: CronJob) => Promise<string>;

export interface SchedulerOptions {
  store: CronJobStore;
  executor: JobExecutor;
  /** Poll interval in ms. Default: 30_000 (30s) */
  pollIntervalMs?: number;
}

/**
 * Cron scheduler — polls every N seconds and executes due jobs.
 * Prevents duplicate runs using a Set of in-flight job IDs.
 */
export function createScheduler(options: SchedulerOptions) {
  const { store, executor, pollIntervalMs = 30_000 } = options;
  const inFlight = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (!running) return;
    const now = new Date();
    let jobs: CronJob[];
    try {
      jobs = await store.list();
    } catch (err) {
      log.error("Failed to list cron jobs", { error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const due = jobs.filter(
      (j) => j.enabled && j.nextRunAt <= now && !inFlight.has(j.id)
    );

    for (const job of due) {
      inFlight.add(job.id);
      void runJob(job, now);
    }
  }

  async function runJob(job: CronJob, runAt: Date): Promise<void> {
    log.info("Running cron job", { id: job.id, task: job.task.slice(0, 80) });
    try {
      await executor(job);
      const fields = parseCron(job.expression);
      const nextRun = nextOccurrence(fields, new Date(runAt.getTime() + 60_000));
      await store.updateLastRun(job.id, runAt, nextRun);
      log.info("Cron job complete", { id: job.id, nextRunAt: nextRun.toISOString() });
    } catch (err) {
      log.error("Cron job failed", {
        id: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inFlight.delete(job.id);
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    timer = setInterval(() => { void tick(); }, pollIntervalMs);
    log.info("Cron scheduler started", { pollIntervalMs });
  }

  function stop(): void {
    running = false;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    log.info("Cron scheduler stopped");
  }

  async function schedule(job: Omit<CronJob, "nextRunAt" | "createdAt">): Promise<CronJob> {
    const fields = parseCron(job.expression);
    const nextRunAt = nextOccurrence(fields, new Date());
    const full: CronJob = {
      ...job,
      nextRunAt,
      createdAt: new Date(),
    };
    await store.upsert(full);
    log.info("Scheduled cron job", { id: full.id, nextRunAt: nextRunAt.toISOString() });
    return full;
  }

  return { start, stop, schedule, tick };
}

export type Scheduler = ReturnType<typeof createScheduler>;
