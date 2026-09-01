-- ════════════════════════════════════════════════════════════════════
--  GestiQ — Migration 094 : Traçabilité auteur des SOPs
--  Date : 2026-09-01
--
--  Objectif : savoir QUI a ajouté et QUI a modifié une SOP en dernier,
--  pour l'afficher dans /sop (admin) et /my-space/sops (membre).
--
--  Choix : on stocke le NOM affichable, pas une clé étrangère.
--    - c'est un instantané historique : si le membre est renommé ou
--      supprimé, « ajouté par Aya BENMANSOUR » reste vrai ;
--    - l'audit complet (qui, quand, depuis quelle IP) vit déjà dans
--      public.team_member_activity, qui référence team_member_id.
--
--  Ces colonnes ne sont JAMAIS écrites par le client : le serveur les
--  pose (server/routes/mySpace.ts pour les membres, server/routes/crud.ts
--  pour les admins). Elles sont dans READONLY_COLUMNS côté API.
--
--  Conformité ARCHITECTURE_TENANT.md :
--    - pas de nouvelle table, donc pas de RLS ni de policy à ajouter
--    - public.sops porte déjà tenant_id + RLS forcé (migration 025)
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.sops
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS updated_by_name text;

COMMENT ON COLUMN public.sops.created_by_name IS
  'Nom affichable de la personne qui a créé la SOP (instantané, posé par le serveur). NULL pour les SOPs seedées.';
COMMENT ON COLUMN public.sops.updated_by_name IS
  'Nom affichable de la dernière personne ayant modifié la SOP (instantané, posé par le serveur).';

COMMIT;

-- Vérification :
--   \d public.sops
--   SELECT title, created_by_name, updated_by_name FROM sops WHERE created_by_name IS NOT NULL;
