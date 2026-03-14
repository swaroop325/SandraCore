import { db } from "@sandra/utils";
import type { CronJobStore, CronJob } from "./scheduler.js";
import type { CronSchedule, CronDelivery } from "./types.js";

/**
 * Creates a CronJobStore backed by Postgres.
 */
export function createDbCronStore(): CronJobStore {
  return {
    async list(): Promise<CronJob[]> {
      const result = await db.query<{
        id: string;
        userId: string;
        sessionId: string;
        expression: string;
        prompt: string;
        channel: string;
        enabled: boolean;
        lastRunAt: Date | null;
        nextRunAt: Date;
        createdAt: Date;
        schedule: CronSchedule | null;
        delivery: CronDelivery | null;
      }>(
        `SELECT
          id,
          user_id      AS "userId",
          session_id   AS "sessionId",
          expression,
          prompt,
          channel,
          enabled,
          last_run_at  AS "lastRunAt",
          next_run_at  AS "nextRunAt",
          created_at   AS "createdAt",
          schedule,
          delivery
         FROM cron_jobs
         WHERE enabled = true AND next_run_at <= NOW()`
      );

      return result.rows.map((row) => {
        // Resolve schedule: use the JSONB column if present, else build from expression
        const schedule: CronSchedule =
          row.schedule !== null
            ? row.schedule
            : { kind: "cron", expr: row.expression };

        const job: CronJob = {
          id: row.id,
          userId: row.userId,
          sessionId: row.sessionId,
          expression: row.expression,
          task: row.prompt,
          channel: row.channel,
          enabled: row.enabled,
          nextRunAt: new Date(row.nextRunAt),
          createdAt: new Date(row.createdAt),
          schedule,
          ...(row.delivery !== null ? { delivery: row.delivery } : {}),
        };
        if (row.lastRunAt !== null) {
          job.lastRunAt = new Date(row.lastRunAt);
        }
        return job;
      });
    },

    async upsert(job: CronJob): Promise<void> {
      const hasSchedule = job.schedule !== undefined;
      const hasDelivery = job.delivery !== undefined;

      if (hasSchedule || hasDelivery) {
        // Extended upsert — include schedule / delivery JSONB columns
        const scheduleJson = hasSchedule ? JSON.stringify(job.schedule) : null;
        const deliveryJson = hasDelivery ? JSON.stringify(job.delivery) : null;

        await db.execute(
          `INSERT INTO cron_jobs
             (id, user_id, session_id, expression, prompt, channel, enabled, last_run_at, next_run_at, created_at, schedule, delivery)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             expression   = EXCLUDED.expression,
             prompt       = EXCLUDED.prompt,
             channel      = EXCLUDED.channel,
             enabled      = EXCLUDED.enabled,
             next_run_at  = EXCLUDED.next_run_at,
             schedule     = EXCLUDED.schedule,
             delivery     = EXCLUDED.delivery`,
          [
            job.id,
            job.userId,
            job.sessionId,
            job.expression,
            job.task,
            job.channel,
            job.enabled,
            job.lastRunAt ?? null,
            job.nextRunAt,
            job.createdAt,
            scheduleJson,
            deliveryJson,
          ]
        );
      } else {
        // Baseline upsert — backward-compatible, no schedule/delivery columns
        await db.execute(
          `INSERT INTO cron_jobs
             (id, user_id, session_id, expression, prompt, channel, enabled, last_run_at, next_run_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             expression   = EXCLUDED.expression,
             prompt       = EXCLUDED.prompt,
             channel      = EXCLUDED.channel,
             enabled      = EXCLUDED.enabled,
             next_run_at  = EXCLUDED.next_run_at`,
          [
            job.id,
            job.userId,
            job.sessionId,
            job.expression,
            job.task,
            job.channel,
            job.enabled,
            job.lastRunAt ?? null,
            job.nextRunAt,
            job.createdAt,
          ]
        );
      }
    },

    async updateLastRun(id: string, runAt: Date, nextRunAt: Date): Promise<void> {
      await db.execute(
        `UPDATE cron_jobs SET last_run_at = $2, next_run_at = $3 WHERE id = $1`,
        [id, runAt, nextRunAt]
      );
    },

    async disable(id: string): Promise<void> {
      await db.execute(
        `UPDATE cron_jobs SET enabled = false WHERE id = $1`,
        [id]
      );
    },

    async delete(id: string): Promise<void> {
      await db.execute(`DELETE FROM cron_jobs WHERE id = $1`, [id]);
    },
  };
}
