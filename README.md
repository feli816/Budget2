# Budget â€” MVP scaffold

## Structure
- backend/ : API, parsing Excel, rÃ¨gles, provisions, projets, budgets
- frontend/ : UI (dashboard, import, saisie, paramÃ¨tres)
- samples/imports/ : fichiers Excel bancaires dâ€™exemple (Ã  dÃ©poser ici)
- samples/rules/ : exemples de rÃ¨gles (CSV/JSON)
- docs/ : spÃ©cifications, UAT

## HypothÃ¨ses
- Devise unique (CHF par dÃ©faut).
- Attribution Personne = mapping Compte â†’ Personne.
- DÃ©penses liÃ©es Ã  un projet **exclues** des totaux par catÃ©gories globales.
- CatÃ©gories par dÃ©faut + fallback **Divers**.
- Import Excel (feuille Â« Liste des opÃ©rations Â», en-tÃªtes ligne 9).

## DÃ©marrage rapide
1) Placer un fichier bancaire Excel dâ€™exemple ici: samples/imports/
2) VÃ©rifier et Ã©diter ackend/seed.json
3) Initialiser Git, puis pousser sur GitLab (voir plus bas).

## Ã€ implÃ©menter (extrait DoD)
- SchÃ©ma DB + migrations
- API CRUD: persons, accounts, categories, rules, transactions, provisions, projects, budgets
- Import Excel: idempotence (hash), rÃ¨gles (prioritÃ©), rapport dâ€™import
- RÃ©currence mensuelle (planned)
- Dashboard: KPI + barres (annuel) + courbe (mensuelle)
- UAT: import fichier exemple = ok ; re-import = doublons

## Lot 8 — DB locale (lecture)

Depuis le dossier `backend/` :

```
npm run db:up
npm run db:schema
npm run db:seed
npm run dev
```

Puis, dans `frontend/` :

```
npm run dev
```

## Lot 9 — Règles de catégorisation (CRUD + import)

- Appliquer le schéma et le jeu d'essai avec `npm run db:rules` dans `backend/`.
- L'API Express expose `/rules` (GET/POST/PUT/DELETE) avec tri `priority DESC, created_at ASC` et validations côté serveur.
- L'import réel charge les règles actives depuis PostgreSQL, normalise les descriptions (minuscules, sans accents) et associe la catégorie lorsque le mot-clé est trouvé.
- Le frontend dispose d'un onglet **Règles** pour gérer le CRUD (création, édition, suppression, activation) et affiche « DB désactivée » quand `DISABLE_DB=1`.


⚙️ Démarrage rapide après redémarrage du PC

Chaque fois que tu redémarres ta machine, Docker, le backend et le frontend doivent être relancés manuellement.
Voici les étapes exactes à suivre 👇

🧱 Étape 1 — Lancer Docker Desktop

Ouvre Docker Desktop depuis le menu Démarrer.

Attends que l’icône devienne verte ou que le statut indique “Running”.

🗄️ Étape 2 — Démarrer la base de données Postgres

Dans un terminal (CMD) :

cd /d C:\Projet_prog\Budget2
docker compose -f docker-compose.dev.yml up -d db


✅ Vérifie ensuite :

docker ps


Tu dois voir une ligne comme :

postgres:16   ...   Up   0.0.0.0:5432->5432/tcp   budget2-db-1

⚙️ Étape 3 — Démarrer le backend (API Node/Express)

Toujours dans le dossier du projet :

set DISABLE_DB=0
npm run dev --prefix backend


✅ Attendu :

Budget API listening on port 3000


➡️ Laisse cette fenêtre ouverte (c’est ton serveur API).

🖥️ Étape 4 — Démarrer le frontend (React/Vite)

Ouvre un nouveau terminal :

cd /d C:\Projet_prog\Budget2\frontend
set VITE_UPLOAD_ENABLED=1
npm run dev


✅ Attendu :

VITE v5.x.x  ready in ...ms
Local:   http://localhost:5173/


➡️ Ouvre http://localhost:5173
 dans ton navigateur.

🧩 Étape 5 — Vérifier que tout est branché

http://localhost:3000/rules
 → doit renvoyer un JSON avec 4 règles.

http://localhost:5173
 → ton interface utilisateur Budget2.

🚀 Raccourci (résumé en 3 commandes)
docker compose -f docker-compose.dev.yml up -d db
set DISABLE_DB=0 && npm run dev --prefix backend
cd frontend && set VITE_UPLOAD_ENABLED=1 && npm run dev