CREATE TABLE IF NOT EXISTS llm_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  session_id        TEXT NOT NULL,
  model_id          TEXT NOT NULL,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(12, 8) NOT NULL DEFAULT 0,
  recorded_at       TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_user ON llm_usage(user_id, recorded_at DESC);
