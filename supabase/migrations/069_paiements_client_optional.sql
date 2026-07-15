-- ====================================================================
--  Migration 069 : paiements.client_id devient optionnel
--
--  Motif : supprimer un client ne doit plus effacer son historique
--  de paiements. L'import CSV/JSON de paiements ne doit plus non
--  plus toucher aux données clients.
--
--  Changements :
--    • paiements.client_id → NULLABLE
--    • FK paiements_client_id_fkey → ON DELETE SET NULL
--      (avant : ON DELETE CASCADE)
-- ====================================================================

ALTER TABLE paiements ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE paiements DROP CONSTRAINT paiements_client_id_fkey;

ALTER TABLE paiements ADD CONSTRAINT paiements_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
