CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE person (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    iban TEXT,
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency_code CHAR(3) NOT NULL DEFAULT 'CHF',
    owner_person_id TEXT REFERENCES person(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (iban)
);

CREATE TABLE category (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income','expense','transfer')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (kind, name)
);

CREATE TABLE project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    target_amount NUMERIC(14,2),
    budget_amount NUMERIC(14,2),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE provision (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    target_amount NUMERIC(14,2),
    category_id INTEGER REFERENCES category(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE import_batch (
    id BIGSERIAL PRIMARY KEY,
    source TEXT,
    original_filename TEXT,
    hash TEXT NOT NULL UNIQUE,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rows_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    message TEXT
);

CREATE TABLE rule (
    id TEXT PRIMARY KEY,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('income','expense')),
    category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE RESTRICT,
    keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    priority INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transaction (
    id BIGSERIAL PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    import_batch_id BIGINT REFERENCES import_batch(id) ON DELETE SET NULL,
    rule_id TEXT REFERENCES rule(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES project(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES category(id) ON DELETE SET NULL,
    external_id TEXT,
    occurred_on DATE NOT NULL,
    value_date DATE,
    amount NUMERIC(14,2) NOT NULL,
    currency_code CHAR(3) NOT NULL DEFAULT 'CHF',
    description TEXT NOT NULL,
    raw_description TEXT,
    balance_after NUMERIC(14,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, external_id)
);

CREATE TABLE provision_ledger (
    id BIGSERIAL PRIMARY KEY,
    provision_id TEXT NOT NULL REFERENCES provision(id) ON DELETE CASCADE,
    transaction_id BIGINT REFERENCES transaction(id) ON DELETE SET NULL,
    entry_kind TEXT NOT NULL CHECK (entry_kind IN ('fund','consume','adjust')),
    amount NUMERIC(14,2) NOT NULL,
    occurred_on DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE budget_monthly (
    id BIGSERIAL PRIMARY KEY,
    scope TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
    period_month DATE NOT NULL,
    ceiling_amount NUMERIC(14,2) NOT NULL,
    currency_code CHAR(3) NOT NULL DEFAULT 'CHF',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scope, category_id, period_month)
);

CREATE TABLE budget_annual (
    id BIGSERIAL PRIMARY KEY,
    scope TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    ceiling_amount NUMERIC(14,2) NOT NULL,
    currency_code CHAR(3) NOT NULL DEFAULT 'CHF',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scope, category_id, year)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_person
BEFORE UPDATE ON person
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_account
BEFORE UPDATE ON account
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_category
BEFORE UPDATE ON category
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_project
BEFORE UPDATE ON project
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_provision
BEFORE UPDATE ON provision
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_rule
BEFORE UPDATE ON rule
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_transaction
BEFORE UPDATE ON transaction
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_provision_ledger
BEFORE UPDATE ON provision_ledger
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_budget_monthly
BEFORE UPDATE ON budget_monthly
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_timestamp_budget_annual
BEFORE UPDATE ON budget_annual
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

