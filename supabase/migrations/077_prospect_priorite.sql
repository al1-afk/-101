-- ================================================================
--  Migration 077 : prospects.priorite (niveau de qualité du prospect)
--
--  3 niveaux pour trier les prospects par « feeling » commercial :
--    premium (top) · moyen · bas
--  Les premium remontent en tête de liste.
--
--  Idempotent : ADD COLUMN IF NOT EXISTS. Safe à re-runner.
-- ================================================================
BEGIN;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS priorite TEXT
    CHECK (priorite IN ('premium', 'moyen', 'bas'));

CREATE INDEX IF NOT EXISTS idx_prospects_priorite
  ON prospects (priorite) WHERE priorite IS NOT NULL;

COMMIT;
