BEGIN;

ALTER TABLE account DROP CONSTRAINT IF EXISTS account_owner_person_id_fkey;

UPDATE account
SET owner_person_id = NULLIF(TRIM(owner_person_id), '')
WHERE owner_person_id IS NOT NULL;

UPDATE account
SET owner_person_id = NULL
WHERE owner_person_id IS NOT NULL AND owner_person_id !~ '^[0-9]+$';

DROP TABLE IF EXISTS person;

CREATE TABLE person (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE account
  ALTER COLUMN owner_person_id TYPE INTEGER USING NULLIF(owner_person_id, '')::INTEGER,
  ADD CONSTRAINT account_owner_person_fk FOREIGN KEY (owner_person_id) REFERENCES person(id) ON DELETE SET NULL;

COMMIT;
