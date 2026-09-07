-- ════════════════════════════════════════════════════════════════════
--  GestiQ / NEXT GITAL — Migration 103 : RENDRE LE TRAVAIL COMMERCIAL
--                          ATTRIBUABLE ET MESURABLE
--  Date : 2026-09-07
--
--  ── Ce que cette migration NE fait PAS ──────────────────────────────
--  Elle ne crée AUCUNE table de permissions. Le module « Les commerciaux »
--  réutilise intégralement crm_user_capabilities et crm_record_grants
--  (migration 102) : les droits y sont un text[] dont le vocabulaire est
--  déclaré dans server/lib/crmScope.ts. Ajouter une permission n'a jamais
--  demandé de migration, et n'en demande toujours pas.
--
--  ── Ce qu'elle fait, et pourquoi c'est indispensable ────────────────
--  L'analyse de l'existant a montré que trois des chiffres réclamés par
--  le module sont AUJOURD'HUI INCALCULABLES — non par manque de code,
--  mais par absence de donnée. Les inventer aurait produit des tableaux
--  de bord crédibles et faux, ce qui est pire que pas de tableau du tout.
--
--   1. QUI a fait cette activité ?  prospect_logs.auteur est du TEXTE,
--      écrit en dur à 'Said' par une dizaine de points d'appel du front.
--      « Activités par commercial » et « dernière activité » ne pouvaient
--      donc désigner personne.
--   2. Ce prospect a-t-il été CONVERTI ?  La conversion n'existait nulle
--      part : ni colonne, ni table, ni journal. `clients` n'avait aucun
--      lien vers le prospect d'origine, et le droit « convertir »
--      (crm_record_grants.can_convert) n'était exécuté par aucun code.
--      Le taux de conversion était donc une division par une inconnue.
--   3. Qui encadre ce commercial ?  Aucune hiérarchie n'existait dans
--      team_members. Le périmètre « les prospects de mon équipe » ne
--      pouvait s'appuyer que sur `departement`, un champ de texte libre
--      valant « Tec » ou « TAC » — un périmètre de sécurité qu'on
--      contourne en se renommant n'est pas un périmètre.
--
--  ── Contraintes ─────────────────────────────────────────────────────
--  Strictement ADDITIVE et idempotente. Aucune colonne supprimée, aucune
--  donnée réécrite, aucun backfill : 145 prospects, 111 clients et 11
--  activités vivent en production et doivent être identiques à la
--  seconde d'après. Toutes les colonnes sont NULLABLE — NOT NULL
--  exigerait de deviner un passé qu'on ne connaît pas.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────
--  1. L'AUTEUR RÉEL D'UNE ACTIVITÉ
--
--  On AJOUTE auteur_id à côté de `auteur`, sans toucher à ce dernier :
--  les 11 lignes existantes gardent leur étiquette lisible, et le front
--  actuel continue d'écrire comme avant sans rien casser. Les nouvelles
--  activités porteront les deux — le nom pour l'affichage, l'identifiant
--  pour le comptage.
--
--  ON DELETE SET NULL : le départ d'un commercial ne doit pas effacer
--  l'historique de ses appels. L'activité reste, elle perd son auteur.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.prospect_logs
  ADD COLUMN IF NOT EXISTS auteur_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prospect_logs_auteur
  ON public.prospect_logs (tenant_id, auteur_id, created_at DESC)
  WHERE auteur_id IS NOT NULL;

COMMENT ON COLUMN public.prospect_logs.auteur_id IS
  'Auteur réel de l''activité. NULL sur les lignes antérieures à la migration 103 : leur auteur n''était qu''une chaîne. Sert au comptage par commercial ; `auteur` reste la chaîne affichée.';

-- ────────────────────────────────────────────────────────────────────
--  2. LA CONVERSION PROSPECT → CLIENT
--
--  Deux traces, dans les deux sens, et c'est volontaire :
--   • prospects.converted_at / converted_client_id : « ce prospect a été
--     converti, tel jour, vers ce client ». C'est ce qui rend le TAUX de
--     conversion calculable sans deviner à partir du statut, lequel peut
--     être remis à « perdu » plus tard sans que la conversion cesse
--     d'avoir eu lieu.
--   • clients.prospect_id : « ce client vient de ce prospect ». C'est ce
--     qui permet de rattacher le chiffre d'affaires d'un client au
--     commercial qui l'avait décroché.
--
--  Un seul sens aurait suffi à une requête, jamais aux deux : partir du
--  prospect pour compter les conversions, partir du client pour remonter
--  au commercial. Deux colonnes valent mieux qu'une jointure impossible.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS converted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS converted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_by        uuid REFERENCES public.users(id)   ON DELETE SET NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES public.prospects(id) ON DELETE SET NULL;

/* Le taux de conversion d'une période se lit sur cet index seul. */
CREATE INDEX IF NOT EXISTS idx_prospects_converted
  ON public.prospects (tenant_id, converted_at DESC)
  WHERE converted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_converted_by
  ON public.prospects (tenant_id, converted_by)
  WHERE converted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_prospect
  ON public.clients (tenant_id, prospect_id)
  WHERE prospect_id IS NOT NULL;

COMMENT ON COLUMN public.prospects.converted_at IS
  'Instant de la conversion en client. NULL = jamais converti. Indépendant du statut, qui peut changer après coup.';
COMMENT ON COLUMN public.clients.prospect_id IS
  'Prospect d''origine, quand le client vient d''une conversion. Permet de rattacher son chiffre d''affaires au commercial qui l''a décroché.';

-- ────────────────────────────────────────────────────────────────────
--  3. LA HIÉRARCHIE COMMERCIALE
--
--  Une seule colonne, auto-référente, pour le périmètre « les prospects
--  de mon équipe ». Elle ne remplace ni `departement` (libellé RH,
--  texte libre) ni le rôle : elle dit UNIQUEMENT « cette personne rend
--  compte à celle-là », et c'est la seule information sur laquelle un
--  périmètre d'accès peut s'appuyer sans être contournable.
--
--  ON DELETE SET NULL : supprimer un responsable ne doit pas emporter
--  son équipe — les membres remontent simplement d'un cran, sans
--  responsable, donc sans élargissement de périmètre. Un défaut qui
--  RESTREINT est le bon défaut pour une règle d'accès.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_manager
  ON public.team_members (tenant_id, manager_id)
  WHERE manager_id IS NOT NULL;

/* Un cycle (A encadre B qui encadre A) ferait boucler indéfiniment la
   requête de périmètre. On interdit au moins le cas trivial ; les
   cycles plus longs sont bornés par la profondeur de la récursion
   côté serveur. */
ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_manager_not_self;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_manager_not_self CHECK (manager_id IS NULL OR manager_id <> id);

COMMENT ON COLUMN public.team_members.manager_id IS
  'Responsable hiérarchique. Seul support du périmètre « les prospects de mon équipe » — `departement` est du texte libre et ne peut pas porter une règle d''accès.';

-- ── Droits ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_logs, public.prospects,
      public.clients, public.team_members TO gestiq_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_logs, public.prospects,
      public.clients, public.team_members TO gestiq_rls;
  END IF;
END $$;

COMMIT;

-- Vérification :
--   SELECT count(*) FROM prospects;                      -- inchangé (145)
--   SELECT count(*) FROM prospect_logs WHERE auteur_id IS NOT NULL;  -- 0 au départ, normal
--   \d public.team_members
