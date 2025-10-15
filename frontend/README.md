# Lot 4 – Frontend (Budget2)

## Objectif
Interface minimale pour tester l’API backend :
- `GET /health` (section Santé)
- `POST /imports/excel` puis `GET /imports/:id` (section Imports)

## Démarrage
```bash
npm install
cp .env.example .env  # si nécessaire
npm run dev
```

Ouvrir l’URL affichée (ex: http://localhost:5173).
Configurer `VITE_API_URL` si le backend n’est pas sur http://localhost:3000.

## Notes
- Compatible mode stub hors-DB (backend avec `DISABLE_DB=1`).
- Pas d’upload de fichier pour l’instant (sera ajouté plus tard).
