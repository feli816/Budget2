import { config } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });
config();

const migrationsDirectories = [
  path.join(__dirname, '..', '..', 'migrations'),
  path.join(__dirname, 'migrations'),
];

function getClientConfig() {
  if (process.env.DATABASE_URL) {
    const ssl = process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined;
    return { connectionString: process.env.DATABASE_URL, ssl };
  }

  const requiredVars = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = requiredVars.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `Missing database configuration. Please configure backend/.env (missing: ${missing.join(', ')}).`,
    );
  }

  const port = Number(process.env.PGPORT);
  if (!Number.isFinite(port)) {
    throw new Error('Invalid database configuration. PGPORT must be a number.');
  }

  const ssl = process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined;

  return {
    host: process.env.PGHOST,
    port,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl,
  };
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedMigrations(client) {
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  return new Set(rows.map((row) => row.name));
}

async function readMigrationFiles() {
  const migrations = new Map();

  for (const directory of migrationsDirectories) {
    try {
      const files = await fs.readdir(directory);
      for (const file of files) {
        if (!file.endsWith('.sql')) {
          continue;
        }

        if (!migrations.has(file)) {
          migrations.set(file, path.join(directory, file));
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return Array.from(migrations.entries())
    .map(([name, filePath]) => ({ name, filePath }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function applyMigration(client, migration, logger) {
  const sql = await fs.readFile(migration.filePath, 'utf8');
  logger.log(`→ Applying migration ${migration.name}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`⚠️  Failed to apply migration ${migration.name}`);
    throw error;
  }
}

async function resetSchema(client, logger) {
  logger.log('Resetting public schema…');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA IF NOT EXISTS public');
  await client.query('GRANT USAGE ON SCHEMA public TO public');
  await client.query('GRANT CREATE ON SCHEMA public TO public');
}

export async function runMigrations({ reset = false, logger = console } = {}) {
  if (process.env.DISABLE_DB === '1') {
    logger.log('Skipping migrations because DISABLE_DB=1');
    return;
  }

  const client = new Client(getClientConfig());

  try {
    await client.connect();

    if (reset) {
      await resetSchema(client, logger);
    }

    await ensureMigrationsTable(client);

    const migrations = await readMigrationFiles();
    const alreadyApplied = await appliedMigrations(client);

    for (const migration of migrations) {
      if (alreadyApplied.has(migration.name)) {
        logger.log(`✓ Skipping already applied migration ${migration.name}`);
        continue;
      }

      await applyMigration(client, migration, logger);
    }

    logger.log('All migrations applied.');
  } finally {
    await client.end();
  }
}
