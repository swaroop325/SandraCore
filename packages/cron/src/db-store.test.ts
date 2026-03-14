import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sandra/utils before importing db-store
const mockQuery = vi.fn();
const mockExecute = vi.fn();

vi.mock("@sandra/utils", () => ({
  db: {
    query: mockQuery,
    execute: mockExecute,
  },
}));

// Import after mock is set up
const { createDbCronStore } = await import("./db-store.js");

const BASE_DATE = new Date("2026-01-01T08:00:00.000Z");
const NEXT_DATE = new Date("2026-01-02T08:00:00.000Z");
const CREATED_DATE = new Date("2025-12-01T00:00:00.000Z");

const sampleRow = {
  id: "job-uuid-1",
  userId: "user-uuid-1",
  sessionId: "tg:12345",
  expression: "0 8 * * *",
  prompt: "Send me the daily briefing",
  channel: "telegram",
  enabled: true,
  lastRunAt: BASE_DATE,
  nextRunAt: NEXT_DATE,
  createdAt: CREATED_DATE,
};

describe("createDbCronStore", () => {
  let store: ReturnType<typeof createDbCronStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createDbCronStore();
  });

  describe("list()", () => {
    it("maps DB rows to CronJob with correct date conversions", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow] });

      const jobs = await store.list();

      expect(jobs).toHaveLength(1);
      const job = jobs[0]!;

      expect(job.id).toBe("job-uuid-1");
      expect(job.userId).toBe("user-uuid-1");
      expect(job.sessionId).toBe("tg:12345");
      expect(job.expression).toBe("0 8 * * *");
      expect(job.task).toBe("Send me the daily briefing");
      expect(job.channel).toBe("telegram");
      expect(job.enabled).toBe(true);
      expect(job.lastRunAt).toBeInstanceOf(Date);
      expect(job.lastRunAt?.getTime()).toBe(BASE_DATE.getTime());
      expect(job.nextRunAt).toBeInstanceOf(Date);
      expect(job.nextRunAt.getTime()).toBe(NEXT_DATE.getTime());
      expect(job.createdAt).toBeInstanceOf(Date);
      expect(job.createdAt.getTime()).toBe(CREATED_DATE.getTime());
    });

    it("sets lastRunAt to undefined when DB value is null", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleRow, lastRunAt: null }],
      });

      const jobs = await store.list();
      const job = jobs[0]!;

      expect(job.lastRunAt).toBeUndefined();
      expect("lastRunAt" in job).toBe(false);
    });

    it("returns empty array when no rows", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const jobs = await store.list();

      expect(jobs).toHaveLength(0);
    });

    it("calls db.query with the correct SQL", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await store.list();

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql] = mockQuery.mock.calls[0]!;
      expect(sql).toContain("WHERE enabled = true AND next_run_at <= NOW()");
    });
  });

  describe("upsert()", () => {
    it("calls db.execute with correct parameters", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });

      const job = {
        id: "job-uuid-1",
        userId: "user-uuid-1",
        sessionId: "tg:12345",
        expression: "0 8 * * *",
        task: "Daily briefing",
        channel: "telegram",
        enabled: true,
        lastRunAt: BASE_DATE,
        nextRunAt: NEXT_DATE,
        createdAt: CREATED_DATE,
      };

      await store.upsert(job);

      expect(mockExecute).toHaveBeenCalledOnce();
      const [sql, params] = mockExecute.mock.calls[0]!;
      expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
      expect(params).toEqual([
        "job-uuid-1",
        "user-uuid-1",
        "tg:12345",
        "0 8 * * *",
        "Daily briefing",
        "telegram",
        true,
        BASE_DATE,
        NEXT_DATE,
        CREATED_DATE,
      ]);
    });

    it("passes null for lastRunAt when undefined", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });

      const job = {
        id: "job-uuid-2",
        userId: "user-uuid-1",
        sessionId: "tg:12345",
        expression: "0 8 * * *",
        task: "Daily briefing",
        channel: "telegram",
        enabled: true,
        nextRunAt: NEXT_DATE,
        createdAt: CREATED_DATE,
      };

      await store.upsert(job);

      const [, params] = mockExecute.mock.calls[0]!;
      // lastRunAt is index 7
      expect(params[7]).toBeNull();
    });
  });

  describe("updateLastRun()", () => {
    it("calls db.execute with correct parameters", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });

      await store.updateLastRun("job-uuid-1", BASE_DATE, NEXT_DATE);

      expect(mockExecute).toHaveBeenCalledOnce();
      const [sql, params] = mockExecute.mock.calls[0]!;
      expect(sql).toContain("UPDATE cron_jobs SET last_run_at");
      expect(params).toEqual(["job-uuid-1", BASE_DATE, NEXT_DATE]);
    });
  });

  describe("delete()", () => {
    it("calls db.execute with the correct id", async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });

      await store.delete("job-uuid-1");

      expect(mockExecute).toHaveBeenCalledOnce();
      const [sql, params] = mockExecute.mock.calls[0]!;
      expect(sql).toContain("DELETE FROM cron_jobs WHERE id = $1");
      expect(params).toEqual(["job-uuid-1"]);
    });
  });
});
