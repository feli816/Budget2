ALTER TABLE transaction
  ADD COLUMN IF NOT EXISTS hash_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS transaction_hash_key_unique_idx
  ON transaction (hash_key)
  WHERE hash_key IS NOT NULL;
