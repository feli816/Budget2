// ==============================================
// 🌱 Chargement des variables d'environnement
// ==============================================
import dotenv from 'dotenv';
dotenv.config();

// ==============================================
// 🚀 Lancement de l'application Budget API
// ==============================================
import { createApp } from './app.js';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const app = createApp();

// 🔍 Affiche les variables importantes au démarrage
console.log('==========================================');
console.log('🌍 Budget API Environment:');
console.log('ENABLE_UPLOAD =', process.env.ENABLE_UPLOAD);
console.log('ENABLE_XLSX   =', process.env.ENABLE_XLSX);
console.log('DISABLE_DB    =', process.env.DISABLE_DB);
console.log('==========================================');

app.listen(port, () => {
  console.log(`✅ Budget API listening on port ${port}`);
});
