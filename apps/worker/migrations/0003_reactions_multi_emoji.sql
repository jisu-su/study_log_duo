-- Allow one user to leave multiple different emoji reactions on the same reflection.
CREATE TABLE reactions_new (
  id            TEXT PRIMARY KEY,
  reflection_id TEXT NOT NULL REFERENCES reflections(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  emoji         TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(reflection_id, user_id, emoji)
);

INSERT OR IGNORE INTO reactions_new (id, reflection_id, user_id, emoji, created_at)
SELECT id, reflection_id, user_id, emoji, created_at
FROM reactions;

DROP TABLE reactions;

ALTER TABLE reactions_new RENAME TO reactions;
