-- ================================================================
--  GestiQ — Migration 065 : Lien optionnel stagiaires → team_members
--  Date : 2026-07-12
--
--  Ajoute une colonne `member_id` à la table stagiaires pour éviter
--  la duplication des identités quand une personne est déjà présente
--  dans l'onglet Membres.
--
--  - Nullable : les stagiaires historiques sans membre restent valides.
--  - ON DELETE SET NULL : la suppression d'un membre ne casse pas
--    l'historique du stagiaire.
--  - Un membre ne peut avoir qu'UN stage actif (statut = en_cours),
--    contrainte partielle via index unique conditionnel.
--
--  Idempotent : safe à re-runner.
-- ================================================================

BEGIN;

ALTER TABLE public.stagiaires
  ADD COLUMN IF NOT EXISTS member_id uuid
    REFERENCES public.team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stagiaires_member
  ON public.stagiaires (member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_stagiaires_active_per_member
  ON public.stagiaires (tenant_id, member_id)
  WHERE member_id IS NOT NULL AND statut = 'en_cours';

COMMIT;
