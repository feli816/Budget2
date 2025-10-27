BEGIN;
CREATE TABLE IF NOT EXISTS rule (
  id SERIAL PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('income','expense','transfer')),
  category_id INTEGER NOT NULL REFERENCES category(id),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
