# UAT â€” Budget MVP

## 1. Import Excel
- Importer le fichier dâ€™exemple â‡’ crÃ©ations OK, catÃ©gories appliquÃ©es, lignes non matchÃ©es â‡’ Divers.
- Re-importer le mÃªme fichier â‡’ 0 crÃ©ation, 100% doublons dÃ©tectÃ©s.

## 2. RÃ¨gles
- CrÃ©er une rÃ¨gle "coop -> Alimentation", re-importer une ligne COOP â‡’ classÃ©e Alimentation.

## 3. Provisions
- Provision ImpÃ´ts 2026: fund +200, consume 50 â‡’ solde 150.

## 4. Projets
- Projet Vacances: cible 3000, budget dÃ©penses 2500. Provision +1000 â‡’ 33%. DÃ©pense projet 400 â‡’ exclue des agrÃ©gats catÃ©gories.

## 5. Budgets
- Mensuel Alimentation 600 (mÃ©nage) â‡’ dÃ©penses 450 â‡’ 75%.

## 6. Dashboard
- KPIs cohÃ©rents, barres annuelles (revenus/dÃ©penses/provisions), courbe solde mensuel ok.

## 7. Transactions (Lot 6)
- Lancer le frontend Lot 6 : la carte Transactions s'affiche avant l'import.
- Les listes Comptes et CatÃ©gories sont alimentÃ©es par l'API (tous + libellÃ©s).
- GET /transactions (limite 50) â‡’ tableau triÃ© par date desc., total affichÃ©.
- Filtrer par compte â‡’ uniquement les opÃ©rations du compte + total mis Ã  jour.
- Filtrer par catÃ©gorie â‡’ restreint la liste (0 â‡’ message Aucune transaction).
- RÃ©initialiser â‡’ retour aux filtres par dÃ©faut et reload auto.
