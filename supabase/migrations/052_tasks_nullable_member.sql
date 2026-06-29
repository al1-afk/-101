-- ====================================================================
--  Migration 052: rendre team_member_id nullable sur team_member_tasks
--  Permet de créer des tâches non assignées (utilisé par les templates
--  de projet : on crée d'abord toutes les tâches, on les distribue ensuite).
-- ====================================================================

ALTER TABLE team_member_tasks
  ALTER COLUMN team_member_id DROP NOT NULL;
