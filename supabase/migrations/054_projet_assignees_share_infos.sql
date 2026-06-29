-- ====================================================================
--  Migration 054: share_infos sur projet_assignees
--  Permet de choisir, par membre, s'il a accès aux Infos & Accès du
--  projet (contact client, notes, identifiants, liens utiles).
--  Si FALSE : le membre voit le projet, ses tâches, le chat et l'équipe,
--             mais PAS les sections sensibles (identifiants, contact, …).
--  Default TRUE pour rétrocompatibilité.
-- ====================================================================

ALTER TABLE projet_assignees
  ADD COLUMN IF NOT EXISTS share_infos BOOLEAN DEFAULT TRUE;
