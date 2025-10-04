# Budget API — Lot 2

Cette API REST (Node.js/Express + PostgreSQL) couvre les besoins du MVP Budget décrits dans la Spec v1. Elle consomme la base de données créée dans le lot 1.

## Pré-requis
- PostgreSQL initialisé (voir `README.md`).
- Fichier `backend/.env` renseigné avec `DATABASE_URL`.
- Dépendances installées : `npm install` dans `backend/`.

## Démarrage local
```bash
npm run dev
```
Par défaut l'API écoute sur `http://localhost:3000` (variable `PORT` modifiable).

## Authentification
Aucune authentification n'est encore mise en place pour le MVP.

---

## Personnes (`/persons`)
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/persons` | Liste des personnes |
| POST | `/persons` | Création |
| GET | `/persons/:id` | Détail |
| PUT | `/persons/:id` | Mise à jour complète/partielle |
| DELETE | `/persons/:id` | Suppression |

### Exemple `curl`
```bash
curl -X POST http://localhost:3000/persons \
  -H "Content-Type: application/json" \
  -d '{"name":"Nouvelle personne","email":"person@example.org"}'
```

---

## Comptes (`/accounts`)
Champs : `name`, `iban?`, `opening_balance`, `currency_code`, `owner_person_id?`.

```bash
curl http://localhost:3000/accounts
```

---

## Catégories (`/categories`)
- Paramètre `kind` optionnel pour filtrer (`income`, `expense`, `transfer`).

```bash
curl http://localhost:3000/categories?kind=expense
```

---

## Règles (`/rules`)
Champs : `target_kind`, `category_id`, `keywords[]`, `priority`, `enabled`.

Réordonnancement :
```bash
curl -X POST http://localhost:3000/rules/reorder \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":"r1","priority":200},{"id":"r2","priority":150}]}'
```

---

## Transactions (`/transactions`)
Champs requis : `account_id`, `occurred_on`, `amount`, `description`.
Paramètres de liste : `account_id`, `category_id`, `limit`, `offset`.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "a1",
    "occurred_on": "2025-01-05",
    "amount": -85.4,
    "description": "Courses Migros",
    "category_id": 2
  }'
```

---

## Provisions (`/provisions`)
Champs : `name`, `description?`, `target_amount?`, `category_id?`.
Sous-ressource `/provisions/:id/ledger`.

Actions disponibles :
- `POST /provisions/:id/fund`
- `POST /provisions/:id/consume`
- `POST /provisions/:id/transfer`
- `POST /provisions/:id/cancel`

```bash
curl -X POST http://localhost:3000/provisions/prov-1/fund \
  -H "Content-Type: application/json" \
  -d '{"amount":200,"occurred_on":"2025-02-01"}'
```

---

## Projets (`/projects`)
Champs : `name`, `description?`, `target_amount?`, `budget_amount?`, `start_date?`, `end_date?`.

```bash
curl http://localhost:3000/projects
```

---

## Budgets (`/budgets`)
Deux sous-ressources :
- `/budgets/monthly`
- `/budgets/annual`

Créer un budget mensuel :
```bash
curl -X POST http://localhost:3000/budgets/monthly \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "household",
    "category_id": 1,
    "period": "2025-10",
    "ceiling_amount": 600
  }'
```

Créer un budget annuel :
```bash
curl -X POST http://localhost:3000/budgets/annual \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "household",
    "category_id": 2,
    "year": 2025,
    "ceiling_amount": 1200
  }'
```

---

## Collection Postman
Un export JSON prêt à l'emploi est disponible dans `docs/postman/Budget-API.postman_collection.json`. Importez-le dans Postman et mettez à jour la variable `baseUrl` si nécessaire.

---

## Gestion des erreurs
- 400 : validation invalide (type, champ manquant, contrainte de base de données).
- 404 : ressource introuvable.
- 409 : duplication (contrainte d'unicité).
- 500 : erreur interne.

Chaque réponse d'erreur renvoie `{ "error": "message" }` et parfois `details` pour plus de précision.

## Santé
`GET /health` renvoie `{ "status": "ok" }`.
