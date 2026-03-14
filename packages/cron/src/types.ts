export type CronSchedule =
  | { kind: "cron";  expr: string; tz?: string; staggerMs?: number }
  | { kind: "at";    at: string }          // ISO datetime, one-shot
  | { kind: "every"; everyMs: number; anchorMs?: number };

export type CronDeliveryMode = "none" | "announce" | "webhook";

export type CronDelivery = {
  mode: CronDeliveryMode;
  channel?: string;
  to?: string;
  webhookUrl?: string;
  failureDestination?: { channel?: string; to?: string; webhookUrl?: string };
};
