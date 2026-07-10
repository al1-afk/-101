-- ====================================================================
--  Migration 062 : assigned_stagiaire_id sur team_member_tasks
--  Permet d'assigner une tâche à un stagiaire (au même titre qu'un
--  team_member ou un admin). Une tâche peut donc être :
--    - assignée à un team_member  (team_member_id       NOT NULL)
--    - assignée à un admin        (assigned_user_id     NOT NULL)
--    - assignée à un stagiaire    (assigned_stagiaire_id NOT NULL)
--    - non assignée               (les trois NULL)
-- ====================================================================

ALTER TABLE team_member_tasks
  ADD COLUMN IF NOT EXISTS assigned_stagiaire_id UUID REFERENCES stagiaires(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_tasks_assigned_stagiaire
  ON team_member_tasks(assigned_stagiaire_id)
  WHERE assigned_stagiaire_id IS NOT NULL;
