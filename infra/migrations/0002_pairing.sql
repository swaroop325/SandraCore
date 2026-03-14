-- Pairing requests: tracks pending pairing codes
CREATE TABLE IF NOT EXISTS pairing_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  telegram_id BIGINT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'telegram',
  created_at  TIMESTAMP DEFAULT now(),
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pairing_code ON pairing_requests(code) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pairing_telegram ON pairing_requests(telegram_id);

-- User allowlist: persists approved senders even after status changes
CREATE TABLE IF NOT EXISTS user_allowlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  channel     TEXT NOT NULL,
  added_at    TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, channel)
);
