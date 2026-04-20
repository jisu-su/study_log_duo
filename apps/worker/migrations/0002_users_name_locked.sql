-- Nickname is set once by the user, then locked.
ALTER TABLE users ADD COLUMN name_locked INTEGER DEFAULT 0;

