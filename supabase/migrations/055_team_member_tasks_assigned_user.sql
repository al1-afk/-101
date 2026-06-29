-- ====================================================================
--  Migration 055 : assigned_user_id sur team_member_tasks
--  Permet à l'admin de s'assigner une tâche à lui-même (et pas seulement
--  à un team_member). Une tâche peut donc être :
--    - assignée à un team_member (team_member_id NOT NULL)
--    - assignée à un admin (assigned_user_id NOT NULL)
--    - non assignée (les deux NULL)
-- ====================================================================

ALTER TABLE team_member_tasks
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_tasks_assigned_user
  ON team_member_tasks(assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;
