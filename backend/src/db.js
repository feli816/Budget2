import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });
config();

const DISABLE_DB = process.env.DISABLE_DB === '1';

function ensureDatabaseConfig() {
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
}

function createPool() {
  ensureDatabaseConfig();

  const ssl = process.env.PGSSL === '1' ? { rejectUnauthorized: false } : false;

  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl,
  });

  pool.on('error', (error) => {
    console.error('Unexpected database error', error);
  });

  return pool;
}

function createDisabledPool() {
  const error = new Error('Database access is disabled (DISABLE_DB=1).');
  return {
    query() {
      return Promise.reject(error);
    },
    async connect() {
      throw error;
    },
  };
}

export const pool = DISABLE_DB ? createDisabledPool() : createPool();

export async function withTransaction(callback) {
  if (DISABLE_DB) {
    throw new Error('Database access is disabled (DISABLE_DB=1).');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
