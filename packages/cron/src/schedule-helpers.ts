import { parseCron, nextOccurrence } from "./parser.js";
import type { CronJob } from "./scheduler.js";
import type { CronSchedule } from "./types.js";

/**
 * Returns true if a cron expression matches the top-of-hour pattern:
 * minute=0, hour="*" or "*\/N", dom/month/dow all "*"
 */
export function isTopOfHourExpr(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];
  if (minute !== "0") return false;
  if (dom !== "*" || month !== "*" || dow !== "*") return false;
  // hour must be "*" or "*/N"
  return hour === "*" || /^\*\/\d+$/.test(hour);
}

/**
 * Derive a CronSchedule from a CronJob.
 * If the job already has a `schedule` property, return it as-is.
 * Otherwise build a fallback { kind: "cron", expr: job.expression }.
 */
export function normalizeSchedule(job: CronJob): CronSchedule {
  // jobs may carry a `schedule` field added by db-store
  const extended = job as CronJob & { schedule?: CronSchedule };
  if (extended.schedule !== undefined) {
    return extended.schedule;
  }
  return { kind: "cron", expr: job.expression };
}

/**
 * Compute the next occurrence after `after` for the given CronSchedule.
 *
 * - "at"    → returns the parsed Date if it is strictly in the future, else null
 * - "every" → returns after + everyMs, adjusted to anchor offset if provided
 * - "cron"  → calls nextOccurrence() with TZ-adjusted reference time + optional stagger
 */
export function nextOccurrenceForSchedule(
  schedule: CronSchedule,
  after: Date,
): Date | null {
  switch (schedule.kind) {
    case "at": {
      const target = new Date(schedule.at);
      if (isNaN(target.getTime())) return null;
      return target > after ? target : null;
    }

    case "every": {
      const { everyMs, anchorMs } = schedule;
      if (anchorMs !== undefined) {
        // Pin to anchor: find next multiple of everyMs from anchorMs that is > after
        const afterMs = after.getTime();
        const offset = anchorMs % everyMs;
        const elapsed = afterMs - offset;
        const periods = Math.floor(elapsed / everyMs) + 1;
        return new Date(offset + periods * everyMs);
      }
      return new Date(after.getTime() + everyMs);
    }

    case "cron": {
      const { expr, tz, staggerMs } = schedule;
      const fields = parseCron(expr);

      let referenceDate = after;
      if (tz !== undefined) {
        // Convert `after` to the target timezone using Intl.DateTimeFormat,
        // build a UTC Date that carries the same wall-clock parts so that
        // nextOccurrence (which uses UTC getters) matches local time.
        const fmt = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        const parts = fmt.formatToParts(after);
        const get = (type: string): number => {
          const p = parts.find((x) => x.type === type);
          return p !== undefined ? parseInt(p.value, 10) : 0;
        };
        const year   = get("year");
        const month  = get("month") - 1;
        const day    = get("day");
        const hour   = get("hour") === 24 ? 0 : get("hour");
        const minute = get("minute");
        const second = get("second");
        // Create a UTC date whose UTC fields equal the local wall-clock fields
        referenceDate = new Date(Date.UTC(year, month, day, hour, minute, second));
      }

      const next = nextOccurrence(fields, referenceDate);

      // Auto-stagger for top-of-hour expressions when staggerMs is not set
      const effectiveStagger =
        staggerMs !== undefined
          ? staggerMs
          : isTopOfHourExpr(expr)
          ? 5 * 60 * 1000 // 5-minute default stagger
          : 0;

      if (effectiveStagger > 0) {
        const jitter = Math.floor(Math.random() * effectiveStagger);
        return new Date(next.getTime() + jitter);
      }

      return next;
    }
  }
}
