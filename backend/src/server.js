// ==============================================
// 🌱 Chargement des variables d'environnement
// ==============================================
import dotenv from 'dotenv';
dotenv.config();

// ==============================================
// 🚀 Lancement de l'application Budget API
// ==============================================
import { runMigrations } from './db/migrations.js';
import { createApp } from './app.js';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

async function start() {
  console.log('==========================================');
  console.log('🌍 Budget API Environment:');
  console.log('ENABLE_UPLOAD =', process.env.ENABLE_UPLOAD);
  console.log('ENABLE_XLSX   =', process.env.ENABLE_XLSX);
  console.log('DISABLE_DB    =', process.env.DISABLE_DB);
  console.log('==========================================');

  await runMigrations();

  const app = createApp();
  app.listen(port, () => {
    console.log(`✅ Budget API listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error('❌ Failed to start Budget API');
  console.error(error);
  process.exit(1);
});
