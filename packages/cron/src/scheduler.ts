import { parseCron, nextOccurrence } from "./parser.js";
import { createSubsystemLogger } from "@sandra/utils";
import { normalizeSchedule, nextOccurrenceForSchedule, isTopOfHourExpr } from "./schedule-helpers.js";
import type { CronSchedule, CronDelivery } from "./types.js";

const log = createSubsystemLogger("cron");

export interface CronJob {
  id: string;
  userId: string;
  /** Standard 5-field cron expression. For new jobs prefer the `schedule` field. */
  expression: string;
  task: string;          // natural language task description
  channel: string;       // which channel to reply on
  sessionId: string;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
  createdAt: Date;
  /** Extended schedule definition — supersedes `expression` when present */
  schedule?: CronSchedule;
  /** Delivery configuration for job output and failure notifications */
  delivery?: CronDelivery;
}

export interface CronJobStore {
  list(): Promise<CronJob[]>;
  upsert(job: CronJob): Promise<void>;
  updateLastRun(id: string, runAt: Date, nextRunAt: Date): Promise<void>;
  disable?(id: string): Promise<void>;
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
 * Notify a failure destination via webhook POST or log.
 */
export async function notifyFailure(
  job: CronJob,
  err: unknown,
  delivery: CronDelivery,
): Promise<void> {
  const dest = delivery.failureDestination;
  if (dest === undefined) return;

  const errorMessage = err instanceof Error ? err.message : String(err);
  const payload = { jobId: job.id, error: errorMessage, ts: new Date().toISOString() };

  if (dest.webhookUrl !== undefined) {
    try {
      await fetch(dest.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr) {
      log.error("Failed to POST to failureDestination webhook", {
        jobId: job.id,
        webhookUrl: dest.webhookUrl,
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      });
    }
  } else {
    log.error("Job failure notification (no webhook)", payload);
  }
}

/**
 * Compute the next run time after a job fires, taking into account the job's
 * schedule kind. Returns null for one-shot "at" jobs (they should be disabled).
 */
function computeNextRun(job: CronJob, after: Date): Date | null {
  const schedule = normalizeSchedule(job);
  if (schedule.kind === "at") {
    // one-shot — no next run
    return null;
  }
  return nextOccurrenceForSchedule(schedule, after);
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

      const nextRun = computeNextRun(job, new Date(runAt.getTime() + 60_000));
      if (nextRun === null) {
        // one-shot "at" job — disable after firing
        const disabled: CronJob = { ...job, enabled: false };
        await store.upsert(disabled);
        log.info("One-shot cron job fired and disabled", { id: job.id });
      } else {
        await store.updateLastRun(job.id, runAt, nextRun);
        log.info("Cron job complete", { id: job.id, nextRunAt: nextRun.toISOString() });
      }
    } catch (err) {
      log.error("Cron job failed", {
        id: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
      if (job.delivery !== undefined) {
        await notifyFailure(job, err, job.delivery);
      }
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
    // Determine first nextRunAt from the schedule or fall back to expression
    const scheduleField = job.schedule;
    let nextRunAt: Date;
    if (scheduleField !== undefined) {
      const computed = nextOccurrenceForSchedule(scheduleField, new Date());
      if (computed === null) {
        throw new Error(`Schedule for job ${job.id} produced no future occurrence`);
      }
      nextRunAt = computed;
    } else {
      const fields = parseCron(job.expression);
      nextRunAt = nextOccurrence(fields, new Date());
    }

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

// Re-export for convenience
export { isTopOfHourExpr } from "./schedule-helpers.js";
