-- Users
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id  BIGINT UNIQUE,
  phone        TEXT UNIQUE,
  name         TEXT,
  locale       TEXT DEFAULT 'en',
  status       TEXT DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT now()
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  timezone      TEXT DEFAULT 'UTC',
  soul_override TEXT,
  updated_at    TIMESTAMP DEFAULT now()
);

-- Channel sessions
CREATE TABLE IF NOT EXISTS channel_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  session_id  TEXT UNIQUE NOT NULL,
  channel     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT now(),
  last_seen   TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_sessions_user ON channel_sessions(user_id);

-- Conversation messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_session ON conversation_messages(session_id, created_at);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  goal       TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'pending',
  due_date    TIMESTAMP,
  priority    INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  task_id      UUID REFERENCES tasks(id),
  trigger_time TIMESTAMP NOT NULL,
  sent         BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(trigger_time, sent)
  WHERE sent = false;

-- Commitments
CREATE TABLE IF NOT EXISTS commitments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  project_id     UUID REFERENCES projects(id),
  task_id        UUID REFERENCES tasks(id),
  confidence     FLOAT,
  source_message TEXT,
  created_at     TIMESTAMP DEFAULT now()
);
