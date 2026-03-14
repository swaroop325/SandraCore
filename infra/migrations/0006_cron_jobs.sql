CREATE TABLE IF NOT EXISTS cron_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL,
  expression   TEXT NOT NULL,          -- e.g. "0 8 * * *"
  prompt       TEXT NOT NULL,          -- message to send on trigger
  channel      TEXT NOT NULL DEFAULT 'telegram',
  enabled      BOOLEAN NOT NULL DEFAULT true,
  last_run_at  TIMESTAMPTZ,
  next_run_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run
  ON cron_jobs (next_run_at, enabled)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_cron_jobs_user
  ON cron_jobs (user_id);
