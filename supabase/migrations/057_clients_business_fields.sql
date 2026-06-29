-- ====================================================================
--  Migration 057 : colonnes métier sur clients
--  Permet de tagger chaque client avec son type de prestation principal,
--  une sous-catégorie, le contrat (date début + montant TTC annuel) et
--  le prix de renouvellement. Affichées dans la table /clients.
-- ====================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS type_service         TEXT,
  ADD COLUMN IF NOT EXISTS sous_categorie       TEXT,
  ADD COLUMN IF NOT EXISTS date_debut_contrat   DATE,
  ADD COLUMN IF NOT EXISTS montant_ttc_annuel   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS prix_renouvellement  NUMERIC(12,2);
