-- ================================================================
--  Migration 073 : COMPTES FINANCIERS (bank_accounts)
--
--  Objectif : suivi live du solde par compte (CIH Perso, CIH
--  Entreprise, Payoneer, PayPal, Barid Bank, Cash…) — chaque
--  dépense/paiement est rattaché à un compte source/cible.
--
--  État de l'existant : la table bank_accounts existe déjà (colonnes
--  id, nom, solde, type, notes, last_updated, tenant_id) mais aucune
--  UI ne permettait de la peupler et rien ne la reliait aux flux.
--
--  Ce que fait cette migration :
--    1. Ajoute icon/couleur/devise/solde_initial/iban/actif sur
--       bank_accounts (colonnes manquantes pour l'UI complète).
--    2. Copie la valeur historique de `solde` vers `solde_initial`
--       (les 68 dépenses existantes n'étant pas liées à un compte,
--       on considère `solde` comme point de départ).
--    3. Ajoute bank_account_id sur depenses + paiements.
--    4. Crée la vue bank_accounts_with_solde qui recalcule le solde
--       live = solde_initial + Σ paiements entrants − Σ dépenses.
-- ================================================================
BEGIN;

-- 1. Colonnes manquantes ─────────────────────────────────────────
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS icon          TEXT          DEFAULT '🏦',
  ADD COLUMN IF NOT EXISTS couleur       TEXT          DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS devise        TEXT          NOT NULL DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS solde_initial NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iban          TEXT,
  ADD COLUMN IF NOT EXISTS actif         BOOLEAN       NOT NULL DEFAULT TRUE;

-- 2. Backfill : la colonne `solde` historique était saisie à la main.
--    On la reporte sur solde_initial pour préserver le point de départ.
UPDATE bank_accounts
   SET solde_initial = solde
 WHERE solde_initial = 0
   AND solde IS NOT NULL
   AND solde <> 0;

-- 3. Lier chaque dépense à un compte ─────────────────────────────
ALTER TABLE depenses
  ADD COLUMN IF NOT EXISTS bank_account_id UUID
    REFERENCES bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_depenses_bank_account
  ON depenses (bank_account_id) WHERE bank_account_id IS NOT NULL;

-- 4. Lier chaque paiement encaissé à un compte ───────────────────
ALTER TABLE paiements
  ADD COLUMN IF NOT EXISTS bank_account_id UUID
    REFERENCES bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_paiements_bank_account
  ON paiements (bank_account_id) WHERE bank_account_id IS NOT NULL;

-- 5. Vue "solde live" ────────────────────────────────────────────
--   solde = solde_initial + Σ(paiements entrants) − Σ(dépenses)
--   Toujours à jour, pas de trigger à maintenir.
CREATE OR REPLACE VIEW bank_accounts_with_solde AS
SELECT
  a.*,
  a.solde_initial
    + COALESCE(
        (SELECT SUM(p.montant) FROM paiements p WHERE p.bank_account_id = a.id),
        0
      )
    - COALESCE(
        (SELECT SUM(d.montant) FROM depenses d WHERE d.bank_account_id = a.id),
        0
      )
    AS solde_live
FROM bank_accounts a;

COMMIT;
