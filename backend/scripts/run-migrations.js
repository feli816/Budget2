import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from '../src/db/migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '..', '.env') });
config();

const reset = process.argv.includes('--reset');

runMigrations({ reset })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
