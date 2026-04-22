-- Dummy test migration to verify the migration runner skips already-applied files.
-- This table is intentionally lightweight and can be dropped after verification.

CREATE TABLE IF NOT EXISTS _migration_test (
  id INTEGER PRIMARY KEY,
  note TEXT NOT NULL
);

INSERT OR IGNORE INTO _migration_test (id, note) VALUES (1, '002_test ran successfully');
