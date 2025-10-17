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
