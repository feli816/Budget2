# Backend — Lot 1

Ce dossier contient le socle de données pour le MVP Budget.

## Prérequis
- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) (installé avec Node.js)
- [Docker](https://www.docker.com/) (ou toute instance PostgreSQL 14+ disponible)

## Installation
1. Installer les dépendances JavaScript :
   ```bash
   cd backend
   npm install
   ```
2. Copier le fichier d’exemple d’environnement :
   ```bash
   cp .env.example .env
   ```
3. Adapter `DATABASE_URL` dans `.env` si nécessaire.

## Lancer PostgreSQL en local (Docker)
La commande suivante démarre une base PostgreSQL prête à l’emploi :
```bash
docker run --name budget-db \
  -e POSTGRES_USER=budget \
  -e POSTGRES_PASSWORD=budget \
  -e POSTGRES_DB=budget \
  -p 5432:5432 \
  -d postgres:16
```
> Astuce : utiliser `docker stop budget-db` pour arrêter et `docker rm budget-db` pour supprimer le conteneur.

## Migrations
Appliquer les migrations :
```bash
npm run migrate
```
Ré-initialiser complètement le schéma (⚠️ supprime toutes les données) :
```bash
npm run migrate -- --reset
```

## Seed de données
Le script lit `backend/seed.json` et injecte les personnes, comptes, catégories, règles et budgets.
```bash
npm run seed
```

Pour partir d’une base vide et ré-appliquer le seed :
```bash
npm run db:reset
```

## Structure des données
- `migrations/` : scripts SQL versionnés.
- `scripts/run-migrations.js` : exécuteur de migrations avec suivi (`schema_migrations`).
- `scripts/seed.js` : import JSON initial.
- `seed.json` : source de vérité pour les données de paramétrage.

## Nettoyage
Arrêter et supprimer le conteneur Docker PostgreSQL :
```bash
docker stop budget-db && docker rm budget-db
```

## API HTTP (Lot 2)

Lancer l'API REST (Express) en local :

```bash
npm run dev
```

La documentation des endpoints, avec des exemples `curl` et Postman, est disponible dans [`API.md`](./API.md).
