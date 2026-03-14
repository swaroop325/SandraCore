export interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

const RANGES = {
  minute:     { min: 0, max: 59 },
  hour:       { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month:      { min: 1, max: 12 },
  dayOfWeek:  { min: 0, max: 6  },
} as const;

type FieldName = keyof typeof RANGES;

function parseField(value: string, field: FieldName): number[] {
  const { min, max } = RANGES[field];
  const result = new Set<number>();

  for (const part of value.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) result.add(i);
    } else if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      if (isNaN(step) || step < 1) throw new Error(`Invalid step in ${field}: ${part}`);
      for (let i = min; i <= max; i += step) result.add(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr ?? "1", 10);
      const [startStr, endStr] = (range ?? "").split("-");
      const start = startStr === "*" ? min : parseInt(startStr ?? "", 10);
      const end   = endStr ? parseInt(endStr, 10) : max;
      if (isNaN(start) || isNaN(end) || isNaN(step)) throw new Error(`Invalid range/step in ${field}: ${part}`);
      for (let i = start; i <= end; i += step) result.add(i);
    } else if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr ?? "", 10);
      const end   = parseInt(endStr ?? "", 10);
      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid range in ${field}: ${part}`);
      for (let i = start; i <= end; i++) result.add(i);
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n)) throw new Error(`Invalid value in ${field}: ${part}`);
      result.add(n);
    }
  }

  const arr = [...result].filter((n) => n >= min && n <= max).sort((a, b) => a - b);
  if (arr.length === 0) throw new Error(`No valid values in ${field}: ${value}`);
  return arr;
}

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Expected 5 cron fields, got ${parts.length}: "${expression}"`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [string,string,string,string,string];
  return {
    minute:     parseField(minute,     "minute"),
    hour:       parseField(hour,       "hour"),
    dayOfMonth: parseField(dayOfMonth, "dayOfMonth"),
    month:      parseField(month,      "month"),
    dayOfWeek:  parseField(dayOfWeek,  "dayOfWeek"),
  };
}

/** Get next Date after `from` that matches the cron fields (all comparisons in UTC). */
export function nextOccurrence(fields: CronFields, from: Date = new Date()): Date {
  // Start 1 minute ahead, truncate seconds/ms
  let t = from.getTime() + 60_000;
  t = t - (t % 60_000); // truncate to minute boundary

  for (let i = 0; i < 366 * 24 * 60; i++) {
    const d = new Date(t);
    if (
      fields.month.includes(d.getUTCMonth() + 1) &&
      fields.dayOfMonth.includes(d.getUTCDate()) &&
      fields.dayOfWeek.includes(d.getUTCDay()) &&
      fields.hour.includes(d.getUTCHours()) &&
      fields.minute.includes(d.getUTCMinutes())
    ) {
      return d;
    }
    t += 60_000;
  }
  throw new Error("No occurrence found within 1 year");
}

/** Validate a cron expression without throwing by returning an error string or null */
export function validateCron(expression: string): string | null {
  try {
    parseCron(expression);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
