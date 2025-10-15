# Budget API — Lot 2

Cette API REST (Node.js/Express + PostgreSQL) couvre les besoins du MVP Budget décrits dans la Spec v1. Elle consomme la base de données créée dans le lot 1.

## Pré-requis
- PostgreSQL initialisé (voir `README.md`).
- Fichier `backend/.env` renseigné avec `DATABASE_URL`.
- Dépendances installées : `npm install` dans `backend/`.

## Démarrage local
```bash
npm run dev
Par défaut l'API écoute sur http://localhost:3000 (variable PORT modifiable).

Authentification
Aucune authentification n'est encore mise en place pour le MVP.

Personnes (/persons)
Méthode	Endpoint	Description
GET	/persons	Liste des personnes
POST	/persons	Création
GET	/persons/:id	Détail
PUT	/persons/:id	Mise à jour complète/partielle
DELETE	/persons/:id	Suppression

Exemple curl
bash
Copier le code
curl -X POST http://localhost:3000/persons \
  -H "Content-Type: application/json" \
  -d '{"name":"Nouvelle personne","email":"person@example.org"}'
Comptes (/accounts)
Champs : name, iban?, opening_balance, currency_code, owner_person_id?.

bash
Copier le code
curl http://localhost:3000/accounts
Catégories (/categories)
Paramètre kind optionnel pour filtrer (income, expense, transfer).

bash
Copier le code
curl http://localhost:3000/categories?kind=expense
Règles (/rules)
Champs : target_kind, category_id, keywords[], priority, enabled.

Réordonnancement :

bash
Copier le code
curl -X POST http://localhost:3000/rules/reorder \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":"r1","priority":200},{"id":"r2","priority":150}]}'
Transactions (/transactions)
Champs requis : account_id, occurred_on, amount, description.
Paramètres de liste : account_id, category_id, limit, offset.

bash
Copier le code
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "a1",
    "occurred_on": "2025-01-05",
    "amount": -85.4,
    "description": "Courses Migros",
    "category_id": 2
  }'
Provisions (/provisions)
Champs : name, description?, target_amount?, category_id?.
Sous-ressource /provisions/:id/ledger.

Actions disponibles :

POST /provisions/:id/fund

POST /provisions/:id/consume

POST /provisions/:id/transfer

POST /provisions/:id/cancel

bash
Copier le code
curl -X POST http://localhost:3000/provisions/prov-1/fund \
  -H "Content-Type: application/json" \
  -d '{"amount":200,"occurred_on":"2025-02-01"}'
Projets (/projects)
Champs : name, description?, target_amount?, budget_amount?, start_date?, end_date?.

bash
Copier le code
curl http://localhost:3000/projects
Budgets (/budgets)
Deux sous-ressources :

/budgets/monthly

/budgets/annual

Créer un budget mensuel :

bash
Copier le code
curl -X POST http://localhost:3000/budgets/monthly \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "household",
    "category_id": 1,
    "period": "2025-10",
    "ceiling_amount": 600
  }'
Créer un budget annuel :

bash
Copier le code
curl -X POST http://localhost:3000/budgets/annual \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "household",
    "category_id": 2,
    "year": 2025,
    "ceiling_amount": 1200
  }'
Imports (/imports)
Import Excel (POST /imports/excel)
Uploader un extrait bancaire .xlsx (onglet Liste des opérations, en-têtes ligne 9).
Le backend crée un import_batch, ignore les doublons et applique les règles actives pour catégoriser chaque opération.

ℹ️ Mode stub (CI/dev) : par défaut, le serveur lit backend/fixtures/liste_operations.sample.json — aucun fichier à envoyer.

bash
Copier le code
curl -X POST http://localhost:3000/imports/excel
Mode hors-DB (stub total)
Lancer le serveur avec DISABLE_DB=1 (et laisser ENABLE_UPLOAD=0, ENABLE_XLSX=0).
Les endpoints POST /imports/excel et GET /imports/:id renvoient un rapport simulé basé sur
backend/fixtures/liste_operations.sample.json, sans connexion à la base.

bash
Copier le code
# Windows (cmd)
set DISABLE_DB=1 && set ENABLE_UPLOAD=0 && set ENABLE_XLSX=0 && node src\server.js

# Health
curl http://localhost:3000/health

# Créer un import stub
curl -X POST http://localhost:3000/imports/excel

# Récupérer le rapport (remplacer 1 par l'ID renvoyé)
curl http://localhost:3000/imports/1
UAT (hors-DB)

GET /health → { "status": "ok" }

POST /imports/excel → 201 avec import_batch_id > 0, report.totals.parsed == report.totals.created >= 1, report.ignored.* == 0, et report.balances.expected.* recopiées depuis le fixture si présentes.

GET /imports/:id → 200 avec le batch simulé (status = "completed", rows_count == report.totals.parsed).

Tester un vrai fichier .xlsx en local
Nécessite ENABLE_UPLOAD=1 et ENABLE_XLSX=1.

bash
Copier le code
ENABLE_UPLOAD=1 ENABLE_XLSX=1 node src/server.js

curl -X POST http://localhost:3000/imports/excel \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/chemin/vers/releve.xlsx"
Réponse (201) :

json
Copier le code
{
  "import_batch_id": 4,
  "report": {
    "totals": { "parsed": 3, "created": 3, "ignored": 0 },
    "ignored": { "duplicates": 0, "missing_account": 0, "invalid": 0 },
    "categories": [
      { "id": 1, "name": "Salaire", "kind": "income", "count": 1 },
      { "id": 2, "name": "Alimentation", "kind": "expense", "count": 1 },
      { "id": 9, "name": "Divers", "kind": "expense", "count": 1 }
    ],
    "balances": {
      "expected": { "start": 1250.5, "end": 2100.1 },
      "actual": { "start": 1250.5, "end": 2100.1 }
    }
  }
}
Rapport d'import (GET /imports/:id)
bash
Copier le code
curl http://localhost:3000/imports/4
Réponse :

json
Copier le code
{
  "id": 4,
  "source": "excel",
  "original_filename": "example-statement.xlsx",
  "status": "completed",
  "rows_count": 3,
  "report": {
    "totals": { "parsed": 3, "created": 3, "ignored": 0 },
    "ignored": { "duplicates": 0, "missing_account": 0, "invalid": 0 },
    "accounts": [
      { "id": "a1", "name": "Compte A", "iban": "CH00 AAAAA AAAAA AAAAAA", "created": 3 }
    ],
    "categories": [
      { "id": 1, "name": "Salaire", "kind": "income", "count": 1 },
      { "id": 2, "name": "Alimentation", "kind": "expense", "count": 1 },
      { "id": 9, "name": "Divers", "kind": "expense", "count": 1 }
    ],
    "balances": {
      "expected": { "start": 1250.5, "end": 2100.1 },
      "actual": { "start": 1250.5, "end": 2100.1 }
    }
  }
}
Collection Postman
Un export JSON prêt à l'emploi est disponible dans docs/postman/Budget-API.postman_collection.json.
Importez-le dans Postman et mettez à jour la variable baseUrl si nécessaire.

Gestion des erreurs
400 : validation invalide (type, champ manquant, contrainte de base de données).

404 : ressource introuvable.

409 : duplication (contrainte d'unicité).

500 : erreur interne.

Chaque réponse d'erreur renvoie { "error": "message" } et parfois details pour plus de précision.

Santé
GET /health renvoie { "status": "ok" }.

yaml
Copier le code
