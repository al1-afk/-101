-- ====================================================================
--  Migration 063 : assignation des stagiaires aux projets
--  Permet d'ajouter un stagiaire à l'équipe d'un projet (à côté des
--  team_members). Une ligne projet_assignees référence désormais
--  soit un team_member_id, soit un stagiaire_id (exclusifs).
-- ====================================================================

ALTER TABLE projet_assignees
  ADD COLUMN IF NOT EXISTS stagiaire_id UUID REFERENCES stagiaires(id) ON DELETE CASCADE;

-- team_member_id devient nullable pour permettre les lignes stagiaire seules
ALTER TABLE projet_assignees
  ALTER COLUMN team_member_id DROP NOT NULL;

-- Un seul des deux ids doit être renseigné par ligne
ALTER TABLE projet_assignees
  DROP CONSTRAINT IF EXISTS projet_assignees_target_ck;
ALTER TABLE projet_assignees
  ADD CONSTRAINT projet_assignees_target_ck
  CHECK (
    (team_member_id IS NOT NULL AND stagiaire_id IS NULL)
    OR
    (team_member_id IS NULL AND stagiaire_id IS NOT NULL)
  );

-- Unicité par projet pour les stagiaires aussi
CREATE UNIQUE INDEX IF NOT EXISTS uq_projet_assignees_stagiaire
  ON projet_assignees (projet_id, stagiaire_id)
  WHERE stagiaire_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projet_assignees_stagiaire
  ON projet_assignees (stagiaire_id)
  WHERE stagiaire_id IS NOT NULL;
