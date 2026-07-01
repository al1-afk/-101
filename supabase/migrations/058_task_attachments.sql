-- ====================================================================
--  Migration 058 : attachments sur team_member_tasks
--  Permet de coller des images (Cmd+V) dans le formulaire "Nouvelle tâche"
--  Stocke les data URLs (base64) redimensionnés côté client (max 1600px, JPEG 0.85)
--  pour éviter de saturer la DB. Format : ["data:image/jpeg;base64,...", ...]
-- ====================================================================

ALTER TABLE team_member_tasks
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
