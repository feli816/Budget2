BEGIN;
INSERT INTO rule (target_kind, category_id, keywords, priority, enabled)
VALUES
  ('income', 1,  ARRAY['salaire'],                        100, TRUE),
  ('expense', 4, ARRAY['migros','coop','denner'],          90, TRUE),
  ('expense', 5, ARRAY['restaurant','café','bar'],         80, TRUE),
  ('expense', 6, ARRAY['tl','cff','mobility','publibike'], 70, TRUE);
COMMIT;
