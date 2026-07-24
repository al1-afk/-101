-- ════════════════════════════════════════════════════════════════════
--  FIX PROD : ajouter les colonnes manquantes sur paiements / depenses
--
--  Cause : erreur "Erreur serveur (42703)" à la création d'un paiement
--  (champ « Reçu sur le compte »). 42703 = colonne inconnue. La migration
--  073_bank_accounts n'est pas appliquée sur la DB de prod : la colonne
--  paiements.bank_account_id n'existe pas, alors que le formulaire l'envoie.
--
--  Ce script rejoue la partie « liaison aux comptes » de la migration 073,
--  plus un filet de sécurité sur paiements.contrat_id (autre champ du form).
--
--  100% idempotent : ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE VIEW.
--  Aucune perte de données. Safe à re-runner.
--
--  Usage (sur le VPS, conteneur postgres Dokploy) :
--    docker cp scripts/fix-prod-paiements.sql <container>:/tmp/
--    docker exec -it <container> psql -U said -d gestiq_prod -f /tmp/fix-prod-paiements.sql
--  ou en local pointé sur la prod :
--    node scripts/run-sql.mjs scripts/fix-prod-paiements.sql
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 073.1 : colonnes manquantes sur bank_accounts (nécessaires à la vue) ──
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS icon          TEXT          DEFAULT '🏦',
  ADD COLUMN IF NOT EXISTS couleur       TEXT          DEFAULT '#3b82f6',
  ADD COLUMN IF NOT EXISTS devise        TEXT          NOT NULL DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS solde_initial NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iban          TEXT,
  ADD COLUMN IF NOT EXISTS actif         BOOLEAN       NOT NULL DEFAULT TRUE;

-- 073.2 : backfill — reporter le `solde` historique (saisi à la main) sur
--         solde_initial, sinon le solde live repartirait de 0.
UPDATE public.bank_accounts
   SET solde_initial = solde
 WHERE solde_initial = 0
   AND solde IS NOT NULL
   AND solde <> 0;

-- 073.3 : lier chaque dépense à un compte (même 42703 sur la page Dépenses)
ALTER TABLE public.depenses
  ADD COLUMN IF NOT EXISTS bank_account_id UUID
    REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_depenses_bank_account
  ON public.depenses (bank_account_id) WHERE bank_account_id IS NOT NULL;

-- 073.4 : lier chaque paiement encaissé à un compte ← CAUSE DIRECTE du 42703
ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS bank_account_id UUID
    REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_paiements_bank_account
  ON public.paiements (bank_account_id) WHERE bank_account_id IS NOT NULL;

-- Filet de sécurité : contrat_id (autre champ optionnel du formulaire) ───
ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS contrat_id UUID
    REFERENCES public.contrats(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_paiements_contrat
  ON public.paiements (contrat_id) WHERE contrat_id IS NOT NULL;

-- 073.5 : vue « solde live » (recréée, dépend de bank_account_id ci-dessus)
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

-- Vérification : afficher les colonnes finales de paiements
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'paiements'
 ORDER BY ordinal_position;

COMMIT;
