# Lot 6 – Frontend Transactions (liste + filtres)

## Variables d'environnement
- `VITE_API_URL` (par défaut `http://localhost:3000`)
- `VITE_UPLOAD_ENABLED` (0 = stub / 1 = UI fichier)

## Lancer en mode stub (CI/dev)
Backend :


set DISABLE_DB=1 && npm run dev

Frontend :


set VITE_UPLOAD_ENABLED=0 && npm run dev


## Lancer en mode upload réel (local)
Backend :


set ENABLE_UPLOAD=1 && set ENABLE_XLSX=1 && npm run dev

Frontend :


set VITE_UPLOAD_ENABLED=1 && npm run dev


## Flux Import Excel
1. Créer un import (POST /imports/excel) :
   - avec fichier .xlsx si UI upload active,
   - sinon fallback stub.
2. Récupérer le rapport (GET /imports/:id) et afficher les cartes + JSON.

## Lot 7 — Import Excel réel
- Nécessite ENABLE_UPLOAD=1 & ENABLE_XLSX=1 côté backend.
- Activer VITE_UPLOAD_ENABLED=1 côté frontend.
- Permet de tester un fichier Excel réel (.xlsx) contenant l'onglet "Liste des opérations".

## Transactions (Lot 6)
- Liste des dernières transactions (GET /transactions) avec tri desc.
- Filtres dynamiques par compte, catégorie et limite.
- Affiche le nombre de lignes, la somme visible et la catégorisation.
- Requêtes fetch natives, aucun ajout de dépendance.

## Notes
- Aucune dépendance supplémentaire (fetch natif, Tailwind).
- Les erreurs réseau et validations sont affichées sous le bloc Import.
