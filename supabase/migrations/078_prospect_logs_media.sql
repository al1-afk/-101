-- ================================================================
--  Migration 078 : prospect_logs.media
--
--  Permet de joindre des images (captures d'écran collées avec CMD/Ctrl+V,
--  ou glissées) à une activité du prospect. Les images sont compressées
--  côté client (JPEG ≤ 1600 px, cf. src/lib/pasteImage.ts) et stockées
--  en ligne sous forme de data URL dans un tableau JSONB — pas de stockage
--  fichier dédié, même pattern que les médias SOP / projets.
--
--  Idempotent : ADD COLUMN IF NOT EXISTS. Safe à re-runner.
-- ================================================================
BEGIN;

ALTER TABLE prospect_logs
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
