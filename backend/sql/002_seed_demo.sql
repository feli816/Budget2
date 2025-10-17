BEGIN;

TRUNCATE TABLE transaction RESTART IDENTITY CASCADE;
TRUNCATE TABLE category RESTART IDENTITY CASCADE;
TRUNCATE TABLE account RESTART IDENTITY CASCADE;

INSERT INTO account (id, name, iban, opening_balance, currency_code)
VALUES
    ('acc-checking', 'Compte courant', 'CH9300762011623852957', 0, 'CHF'),
    ('acc-savings', 'Épargne salaire', 'CH5604835012345678009', 0, 'CHF'),
    ('acc-travel', 'Compte voyages EUR', 'DE89370400440532013000', 0, 'EUR');

INSERT INTO category (id, name, kind, description)
VALUES
    (1, 'Salaire', 'income', 'Revenus salariaux mensuels'),
    (2, 'Autres revenus', 'income', 'Remboursements et intérêts'),
    (3, 'Loyer', 'expense', 'Logement principal'),
    (4, 'Courses', 'expense', 'Supermarchés et produits du quotidien'),
    (5, 'Restaurant', 'expense', 'Repas à l''extérieur'),
    (6, 'Transport', 'expense', 'Transports publics et mobilité'),
    (7, 'Loisirs', 'expense', 'Activités culturelles et sportives'),
    (8, 'Santé', 'expense', 'Soins médicaux et pharmacie'),
    (9, 'Virements internes', 'transfer', 'Mouvements entre comptes'),
    (10, 'Voyages', 'expense', 'Dépenses liées aux déplacements');

SELECT setval('category_id_seq', COALESCE((SELECT MAX(id) FROM category), 1), true);

INSERT INTO transaction (
    account_id,
    import_batch_id,
    rule_id,
    project_id,
    category_id,
    external_id,
    occurred_on,
    value_date,
    amount,
    currency_code,
    description,
    raw_description,
    balance_after,
    status
)
VALUES
    ('acc-checking', NULL, NULL, NULL, 1, NULL, '2025-03-25', '2025-03-25', 5200.00, 'CHF', 'Salaire - mars 2025', 'SALAIRE ACME SA', 12850.75, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-03-23', '2025-03-23', -154.25, 'CHF', 'Courses Migros', 'CB MIGROS 23.03', 12700.50, 'real'),
    ('acc-checking', NULL, NULL, NULL, 5, NULL, '2025-03-22', '2025-03-22', -68.50, 'CHF', 'Dîner entre amis', 'RESTAURANT LAUSANNE', 12632.00, 'real'),
    ('acc-checking', NULL, NULL, NULL, 6, NULL, '2025-03-21', '2025-03-21', -45.00, 'CHF', 'Abo TL', 'TL MENSUEL', 12587.00, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-03-20', '2025-03-20', -132.80, 'CHF', 'Courses Coop', 'COOP CITY', 12454.20, 'real'),
    ('acc-checking', NULL, NULL, NULL, 8, NULL, '2025-03-18', '2025-03-18', -89.90, 'CHF', 'Pharmacie', 'SUN STORE', 12364.30, 'real'),
    ('acc-checking', NULL, NULL, NULL, 7, NULL, '2025-03-17', '2025-03-17', -45.00, 'CHF', 'Cinéma du week-end', 'CINESTAR', 12319.30, 'real'),
    ('acc-checking', NULL, NULL, NULL, 3, NULL, '2025-03-15', '2025-03-15', -2200.00, 'CHF', 'Loyer mars', 'VIR LOYER', 10119.30, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-03-12', '2025-03-12', -97.45, 'CHF', 'Courses marché', 'MARCHE BIO', 10021.85, 'real'),
    ('acc-checking', NULL, NULL, NULL, 5, NULL, '2025-03-10', '2025-03-10', -52.40, 'CHF', 'Déjeuner équipe', 'CAFE CENTRAL', 9969.45, 'real'),
    ('acc-checking', NULL, NULL, NULL, 6, NULL, '2025-03-09', '2025-03-09', -30.00, 'CHF', 'Recharge carte SwissPass', 'CFF RECHARGE', 9939.45, 'real'),
    ('acc-checking', NULL, NULL, NULL, 9, NULL, '2025-03-08', '2025-03-08', -500.00, 'CHF', 'Virement vers épargne', 'EBANKING VERS EPARGNE', 9439.45, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-03-05', '2025-03-05', -121.90, 'CHF', 'Courses Denner', 'DENNER 1234', 9317.55, 'real'),
    ('acc-checking', NULL, NULL, NULL, 7, NULL, '2025-03-03', '2025-03-03', -75.50, 'CHF', 'Salle de sport', 'FITNESS MONTHLY', 9242.05, 'real'),
    ('acc-checking', NULL, NULL, NULL, 8, NULL, '2025-03-01', '2025-03-01', -35.00, 'CHF', 'Consultation dentaire', 'DENTISTE LAC', 9207.05, 'real'),
    ('acc-checking', NULL, NULL, NULL, 1, NULL, '2025-02-25', '2025-02-25', 5200.00, 'CHF', 'Salaire - février 2025', 'SALAIRE ACME SA', 14207.05, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-02-23', '2025-02-23', -142.60, 'CHF', 'Courses Migros', 'CB MIGROS 23.02', 14064.45, 'real'),
    ('acc-checking', NULL, NULL, NULL, 5, NULL, '2025-02-22', '2025-02-22', -64.80, 'CHF', 'Restaurant italien', 'RISTORANTE ROMA', 13999.65, 'real'),
    ('acc-checking', NULL, NULL, NULL, 3, NULL, '2025-02-20', '2025-02-20', -2200.00, 'CHF', 'Loyer février', 'VIR LOYER', 11799.65, 'real'),
    ('acc-checking', NULL, NULL, NULL, 6, NULL, '2025-02-18', '2025-02-18', -28.00, 'CHF', 'Location Mobility', 'MOBILITY', 11771.65, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-02-17', '2025-02-17', -118.25, 'CHF', 'Courses Coop', 'COOP CITY', 11653.40, 'real'),
    ('acc-checking', NULL, NULL, NULL, 7, NULL, '2025-02-15', '2025-02-15', -49.90, 'CHF', 'Concert M4Music', 'M4MUSIC', 11603.50, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-02-12', '2025-02-12', -103.40, 'CHF', 'Courses marché', 'MARCHE BIO', 11500.10, 'real'),
    ('acc-checking', NULL, NULL, NULL, 5, NULL, '2025-02-10', '2025-02-10', -58.20, 'CHF', 'Déjeuner client', 'CAFE CENTRAL', 11441.90, 'real'),
    ('acc-checking', NULL, NULL, NULL, 9, NULL, '2025-02-08', '2025-02-08', -500.00, 'CHF', 'Virement vers épargne', 'EBANKING VERS EPARGNE', 10841.90, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-02-05', '2025-02-05', -129.10, 'CHF', 'Courses Denner', 'DENNER 5678', 10712.80, 'real'),
    ('acc-checking', NULL, NULL, NULL, 8, NULL, '2025-02-03', '2025-02-03', -74.50, 'CHF', 'Physiothérapie', 'PHYSIO LEMAN', 10638.30, 'real'),
    ('acc-checking', NULL, NULL, NULL, 6, NULL, '2025-02-01', '2025-02-01', -27.50, 'CHF', 'Ticket train Genève', 'CFF ONLINE', 10610.80, 'real'),
    ('acc-checking', NULL, NULL, NULL, 1, NULL, '2025-01-25', '2025-01-25', 5200.00, 'CHF', 'Salaire - janvier 2025', 'SALAIRE ACME SA', 15810.80, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-01-23', '2025-01-23', -148.35, 'CHF', 'Courses Migros', 'CB MIGROS 23.01', 15662.45, 'real'),
    ('acc-checking', NULL, NULL, NULL, 5, NULL, '2025-01-22', '2025-01-22', -70.60, 'CHF', 'Soirée tapas', 'TAPAS BAR', 15591.85, 'real'),
    ('acc-checking', NULL, NULL, NULL, 3, NULL, '2025-01-20', '2025-01-20', -2200.00, 'CHF', 'Loyer janvier', 'VIR LOYER', 13391.85, 'real'),
    ('acc-checking', NULL, NULL, NULL, 6, NULL, '2025-01-18', '2025-01-18', -29.90, 'CHF', 'Location vélo', 'PUBLIBIKE', 13361.95, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-01-17', '2025-01-17', -125.75, 'CHF', 'Courses Coop', 'COOP CITY', 13236.20, 'real'),
    ('acc-checking', NULL, NULL, NULL, 7, NULL, '2025-01-15', '2025-01-15', -59.20, 'CHF', 'Abonnement Netflix + cinéma', 'NETFLIX/CINE', 13177.00, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-01-12', '2025-01-12', -110.40, 'CHF', 'Courses marché', 'MARCHE BIO', 13066.60, 'real'),
    ('acc-checking', NULL, NULL, NULL, 5, NULL, '2025-01-10', '2025-01-10', -62.50, 'CHF', 'Déjeuner client', 'CAFE CENTRAL', 13004.10, 'real'),
    ('acc-checking', NULL, NULL, NULL, 9, NULL, '2025-01-08', '2025-01-08', -500.00, 'CHF', 'Virement vers épargne', 'EBANKING VERS EPARGNE', 12504.10, 'real'),
    ('acc-checking', NULL, NULL, NULL, 4, NULL, '2025-01-05', '2025-01-05', -134.20, 'CHF', 'Courses Denner', 'DENNER 9012', 12369.90, 'real'),
    ('acc-checking', NULL, NULL, NULL, 8, NULL, '2025-01-03', '2025-01-03', -82.90, 'CHF', 'Contrôle ophtalmo', 'OPTIQUE RIVE', 12287.00, 'real'),
    ('acc-savings', NULL, NULL, NULL, 9, NULL, '2025-03-08', '2025-03-08', 500.00, 'CHF', 'Virement reçu du compte courant', 'TRANSFERT CHECKING', 18500.00, 'real'),
    ('acc-savings', NULL, NULL, NULL, 9, NULL, '2025-02-08', '2025-02-08', 500.00, 'CHF', 'Virement reçu du compte courant', 'TRANSFERT CHECKING', 18000.00, 'real'),
    ('acc-savings', NULL, NULL, NULL, 9, NULL, '2025-01-08', '2025-01-08', 500.00, 'CHF', 'Virement reçu du compte courant', 'TRANSFERT CHECKING', 17500.00, 'real'),
    ('acc-savings', NULL, NULL, NULL, 2, NULL, '2025-03-31', '2025-03-31', 8.75, 'CHF', 'Intérêts épargne mars', 'INTERETS MARS', 18508.75, 'real'),
    ('acc-savings', NULL, NULL, NULL, 2, NULL, '2025-02-28', '2025-02-28', 8.20, 'CHF', 'Intérêts épargne février', 'INTERETS FEV', 18008.20, 'real'),
    ('acc-travel', NULL, NULL, NULL, 10, NULL, '2025-03-18', '2025-03-18', -320.50, 'EUR', 'Billets avion Lisbonne', 'SWISS AIRLINES', 2850.40, 'real'),
    ('acc-travel', NULL, NULL, NULL, 10, NULL, '2025-03-10', '2025-03-10', -185.40, 'EUR', 'Hôtel Lisbonne', 'HOTEL BAIXA', 3035.80, 'real'),
    ('acc-travel', NULL, NULL, NULL, 5, NULL, '2025-03-05', '2025-03-05', -64.20, 'EUR', 'Dîner Lisbonne', 'RESTAURANT FADO', 3201.20, 'real'),
    ('acc-travel', NULL, NULL, NULL, 4, NULL, '2025-02-22', '2025-02-22', -42.30, 'EUR', 'Courses voyage', 'PINGO DOCE', 3265.40, 'real'),
    ('acc-travel', NULL, NULL, NULL, 9, NULL, '2025-02-15', '2025-02-15', 600.00, 'EUR', 'Virement pour vacances', 'TRANSFERT CHECKING', 3307.70, 'real');

SELECT setval('transaction_id_seq', COALESCE((SELECT MAX(id) FROM transaction), 1), true);

COMMIT;
