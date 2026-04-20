CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  avatar_url        TEXT,
  push_subscription TEXT,
  day_start_hour    INTEGER DEFAULT 6,
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  logical_date TEXT NOT NULL,
  condition    INTEGER,
  weather      TEXT,
  goal         TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, logical_date)
);

CREATE TABLE IF NOT EXISTS plan_items (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  logical_date TEXT NOT NULL,
  hour         INTEGER NOT NULL,
  content      TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, logical_date, hour)
);

CREATE TABLE IF NOT EXISTS time_logs (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  logged_at    TEXT NOT NULL,
  logical_date TEXT NOT NULL,
  hour         INTEGER NOT NULL,
  content      TEXT NOT NULL,
  tag          TEXT,
  focus_level  INTEGER,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, logical_date, hour)
);

CREATE TABLE IF NOT EXISTS day_offs (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  logical_date TEXT NOT NULL,
  note         TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, logical_date)
);

CREATE TABLE IF NOT EXISTS schedules (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  logical_date TEXT NOT NULL,
  start_hour   INTEGER NOT NULL,
  end_hour     INTEGER NOT NULL,
  title        TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reflections (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  logical_date TEXT NOT NULL,
  emotion_tags TEXT,
  went_well    TEXT,
  went_wrong   TEXT,
  memo         TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, logical_date)
);

CREATE TABLE IF NOT EXISTS reactions (
  id            TEXT PRIMARY KEY,
  reflection_id TEXT NOT NULL REFERENCES reflections(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  emoji         TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(reflection_id, user_id)
);

CREATE TABLE IF NOT EXISTS resources (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  url        TEXT,
  memo       TEXT,
  tags       TEXT,
  is_pinned  INTEGER DEFAULT 0,
  og_image   TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

