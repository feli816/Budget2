BEGIN;

CREATE TABLE IF NOT EXISTS person (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    iban TEXT UNIQUE,
    opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency_code CHAR(3) NOT NULL,
    owner_person_id INTEGER REFERENCES person(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    description TEXT
);

CREATE TABLE IF NOT EXISTS transaction (
    id SERIAL PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    import_batch_id INTEGER,
    rule_id TEXT,
    project_id TEXT,
    category_id INTEGER REFERENCES category(id),
    external_id TEXT,
    occurred_on DATE NOT NULL,
    value_date DATE,
    amount NUMERIC(14, 2) NOT NULL,
    currency_code CHAR(3) NOT NULL,
    description TEXT NOT NULL,
    raw_description TEXT,
    balance_after NUMERIC(14, 2),
    status TEXT NOT NULL DEFAULT 'real'
);

CREATE INDEX IF NOT EXISTS idx_transaction_account ON transaction(account_id);
CREATE INDEX IF NOT EXISTS idx_transaction_category ON transaction(category_id);
CREATE INDEX IF NOT EXISTS idx_transaction_occurred_on ON transaction(occurred_on DESC, id DESC);

COMMIT;
