CREATE TABLE IF NOT EXISTS plan_cheers (
  id             TEXT PRIMARY KEY,
  plan_user_id   TEXT NOT NULL REFERENCES users(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  logical_date   TEXT NOT NULL,
  content        TEXT NOT NULL,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(plan_user_id, user_id, logical_date)
);
