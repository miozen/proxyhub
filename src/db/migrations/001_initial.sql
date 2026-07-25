CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled', 'rejected')),
  generation_enabled INTEGER NOT NULL DEFAULT 1 CHECK (generation_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE client_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX client_tokens_user_id_idx ON client_tokens(user_id);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url_encrypted TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  allowed_regions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX subscriptions_user_id_idx ON subscriptions(user_id);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE template_versions (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('remote', 'local')),
  source_url TEXT,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX template_versions_one_active_idx
  ON template_versions(active)
  WHERE active = 1;

CREATE TABLE generation_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'warning', 'error')),
  summary_json TEXT,
  error_text TEXT,
  config_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX generation_runs_user_id_idx ON generation_runs(user_id, started_at DESC);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'schedule', 'system')),
  result_json TEXT,
  error_text TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX jobs_type_started_at_idx ON jobs(type, started_at DESC);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at DESC);

INSERT INTO app_settings (key, value_json, updated_at)
VALUES
  ('registration_enabled', 'true', CURRENT_TIMESTAMP),
  ('auto_sync_enabled', 'false', CURRENT_TIMESTAMP),
  ('auto_sync_interval_hours', '12', CURRENT_TIMESTAMP);





