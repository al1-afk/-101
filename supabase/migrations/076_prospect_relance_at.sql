-- ================================================================
--  Migration 076 : prospects.relance_at (date + heure de relance)
--
--  date_relance est de type DATE (jour seulement). Pour planifier un
--  rappel à une heure précise, on ajoute relance_at (TIMESTAMPTZ).
--  On garde date_relance synchronisée (partie jour) : la liste, le
--  filtre « à contacter aujourd'hui » et le surlignage continuent de
--  s'appuyer dessus sans changement.
--
--  Backfill : relance_at = date_relance à 09:00 (heure locale) pour les
--  relances déjà saisies, afin qu'elles aient une heure par défaut.
--
--  Idempotent : ADD COLUMN IF NOT EXISTS. Safe à re-runner.
-- ================================================================
BEGIN;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS relance_at TIMESTAMPTZ;

UPDATE prospects
   SET relance_at = (date_relance::timestamp + TIME '09:00')
 WHERE date_relance IS NOT NULL
   AND relance_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_relance_at
  ON prospects (relance_at) WHERE relance_at IS NOT NULL;

COMMIT;
