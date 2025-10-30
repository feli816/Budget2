BEGIN;

-- 1️⃣ Create person table
CREATE TABLE IF NOT EXISTS person (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2️⃣ Convert account.owner_person_id to integer and link
ALTER TABLE account
  ALTER COLUMN owner_person_id TYPE INTEGER USING NULLIF(owner_person_id, '')::INTEGER,
  ADD CONSTRAINT account_owner_person_fk
  FOREIGN KEY (owner_person_id) REFERENCES person(id)
  ON DELETE SET NULL;

COMMIT;
