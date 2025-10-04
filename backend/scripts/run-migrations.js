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

const reset = process.argv.includes('--reset');
const migrationsDir = path.join(__dirname, '..', 'migrations');

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

async function applyMigration(client, filePath, name) {
  const sql = await fs.readFile(filePath, 'utf8');
  console.log(`→ Applying migration ${name}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`⚠️  Failed to apply migration ${name}`);
    throw error;
  }
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    if (reset) {
      console.log('Resetting public schema…');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE');
      await client.query('CREATE SCHEMA IF NOT EXISTS public');
      await client.query('GRANT USAGE ON SCHEMA public TO public');
      await client.query('GRANT CREATE ON SCHEMA public TO public');
    }

    await ensureMigrationsTable(client);

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const alreadyApplied = await appliedMigrations(client);

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        console.log(`✓ Skipping already applied migration ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      await applyMigration(client, filePath, file);
    }

    console.log('All migrations applied.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
