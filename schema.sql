-- AttUne's relational data: people, their sessions, and time-series signals.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS focus_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  source TEXT NOT NULL DEFAULT 'demo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  average_focus SMALLINT CHECK (average_focus BETWEEN 0 AND 100)
);

-- Intended for EEG / eye-artifact samples; scores remain a non-clinical proxy.
CREATE TABLE IF NOT EXISTS attention_readings (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  focus_proxy REAL NOT NULL CHECK (focus_proxy BETWEEN 0 AND 100),
  blink_rate REAL,
  eeg_quality REAL,
  source TEXT NOT NULL DEFAULT 'demo'
);

CREATE INDEX IF NOT EXISTS focus_scores_user_time ON focus_scores (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS readings_session_time ON attention_readings (session_id, recorded_at DESC);
