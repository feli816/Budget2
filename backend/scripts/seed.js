import { config } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });
config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not defined. Please configure backend/.env (see backend/.env.example).');
  process.exit(1);
}

const seedPath = path.join(__dirname, '..', 'seed.json');

async function loadSeed() {
  const raw = await fs.readFile(seedPath, 'utf8');
  return JSON.parse(raw);
}

async function upsertPersons(client, persons = []) {
  for (const person of persons) {
    await client.query(
      `INSERT INTO person (id, name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (id)
       DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()`,
      [person.id, person.name, person.email ?? null]
    );
  }
}

async function upsertAccounts(client, accounts = [], defaultCurrency) {
  for (const account of accounts) {
    await client.query(
      `INSERT INTO account (id, name, iban, opening_balance, currency_code, owner_person_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id)
       DO UPDATE SET
         name = EXCLUDED.name,
         iban = EXCLUDED.iban,
         opening_balance = EXCLUDED.opening_balance,
         currency_code = EXCLUDED.currency_code,
         owner_person_id = EXCLUDED.owner_person_id,
         updated_at = NOW()`,
      [
        account.id,
        account.name,
        account.iban ?? null,
        account.opening_balance ?? 0,
        account.currency_code ?? defaultCurrency,
        account.owner_person_id ?? null
      ]
    );
  }
}

async function upsertCategories(client, categories = {}) {
  const kinds = Object.entries(categories);
  for (const [kind, names] of kinds) {
    for (const name of names) {
      await client.query(
        `INSERT INTO category (name, kind)
         VALUES ($1, $2)
         ON CONFLICT (kind, name)
         DO UPDATE SET updated_at = NOW()`,
        [name, kind]
      );
    }
  }
}

async function fetchCategories(client) {
  const { rows } = await client.query('SELECT id, name, kind FROM category');
  const map = new Map();
  for (const row of rows) {
    map.set(`${row.kind}:${row.name}`, row.id);
  }
  return map;
}

async function upsertRules(client, rules = [], categoryMap) {
  for (const rule of rules) {
    const categoryId = categoryMap.get(`${rule.target_kind}:${rule.category}`);
    if (!categoryId) {
      throw new Error(`Category ${rule.category} (${rule.target_kind}) not found for rule ${rule.id}`);
    }

    await client.query(
      `INSERT INTO rule (id, target_kind, category_id, keywords, priority, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id)
       DO UPDATE SET
         target_kind = EXCLUDED.target_kind,
         category_id = EXCLUDED.category_id,
         keywords = EXCLUDED.keywords,
         priority = EXCLUDED.priority,
         enabled = EXCLUDED.enabled,
         updated_at = NOW()`,
      [
        rule.id,
        rule.target_kind,
        categoryId,
        rule.keywords ?? [],
        rule.priority ?? 0,
        rule.enabled ?? true
      ]
    );
  }
}

function parseMonth(period) {
  if (!/^[0-9]{4}-[0-9]{2}$/.test(period)) {
    throw new Error(`Invalid monthly budget period: ${period}`);
  }
  return `${period}-01`;
}

async function upsertMonthlyBudgets(client, budgets = [], categoryMap, defaultCurrency) {
  for (const budget of budgets) {
    const categoryId = categoryMap.get(`expense:${budget.category}`) ?? categoryMap.get(`income:${budget.category}`);
    if (!categoryId) {
      throw new Error(`Category ${budget.category} not found for monthly budget`);
    }
    await client.query(
      `INSERT INTO budget_monthly (scope, category_id, period_month, ceiling_amount, currency_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scope, category_id, period_month)
       DO UPDATE SET
         ceiling_amount = EXCLUDED.ceiling_amount,
         currency_code = EXCLUDED.currency_code,
         updated_at = NOW()`,
      [
        budget.scope,
        categoryId,
        parseMonth(budget.period),
        budget.ceiling_amount,
        budget.currency_code ?? defaultCurrency
      ]
    );
  }
}

async function upsertAnnualBudgets(client, budgets = [], categoryMap, defaultCurrency) {
  for (const budget of budgets) {
    const categoryId = categoryMap.get(`expense:${budget.category}`) ?? categoryMap.get(`income:${budget.category}`);
    if (!categoryId) {
      throw new Error(`Category ${budget.category} not found for annual budget`);
    }
    await client.query(
      `INSERT INTO budget_annual (scope, category_id, year, ceiling_amount, currency_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scope, category_id, year)
       DO UPDATE SET
         ceiling_amount = EXCLUDED.ceiling_amount,
         currency_code = EXCLUDED.currency_code,
         updated_at = NOW()`,
      [
        budget.scope,
        categoryId,
        budget.year,
        budget.ceiling_amount,
        budget.currency_code ?? defaultCurrency
      ]
    );
  }
}

async function seed() {
  const seedData = await loadSeed();
  const defaultCurrency = seedData.currency ?? 'CHF';

  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  await client.query('BEGIN');
  try {
    await upsertPersons(client, seedData.persons);
    await upsertAccounts(client, seedData.accounts, defaultCurrency);
    await upsertCategories(client, seedData.categories);

    const categoryMap = await fetchCategories(client);

    await upsertRules(client, seedData.rules, categoryMap);

    if (seedData.budgets?.monthly) {
      await upsertMonthlyBudgets(client, seedData.budgets.monthly, categoryMap, defaultCurrency);
    }

    if (seedData.budgets?.annual) {
      await upsertAnnualBudgets(client, seedData.budgets.annual, categoryMap, defaultCurrency);
    }

    await client.query('COMMIT');
    console.log('Seed data applied successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
