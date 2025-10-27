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
