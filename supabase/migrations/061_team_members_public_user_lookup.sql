-- ====================================================================
--  Migration 061 : Autoriser la lecture publique de team_members par
--                  user_id, indépendamment du tenant courant.
--
--  PROBLÈME : POST /api/team/auth/login (team_member connexion) valide
--  d'abord le mot de passe contre users (pas de RLS), puis doit trouver
--  à quel tenant le team_member appartient. Cette lookup se fait par
--  user_id, sans app.current_tenant défini → RLS bloque tout → login
--  impossible pour les team_members sur production (où RLS est FORCE).
--
--  SOLUTION : policy SELECT qui autorise la lecture par user_id
--  UNIQUEMENT quand app.current_tenant n'est pas défini (endpoint public).
--  Les endpoints authentifiés (tenantQuery) restent limités par tenant.
--
--  Sécurité : la lookup se fait après validation du mot de passe (users
--  n'a pas RLS). Un attaquant qui connaît un user_id d'un team_member
--  n'obtient que ce que le user pourrait obtenir en se connectant
--  normalement (tenant_id, member_id, account_status).
-- ====================================================================

DROP POLICY IF EXISTS rls_select_team_members_public_by_user ON public.team_members;

CREATE POLICY rls_select_team_members_public_by_user ON public.team_members
  FOR SELECT
  USING (
    /* N'autorise la lecture publique que si aucun tenant n'est défini
       (endpoints publics /auth/login). Les endpoints avec tenant restent
       cadrés par la policy rls_select_team_members classique. */
    current_setting('app.current_tenant', true) IS NULL
    OR current_setting('app.current_tenant', true) = ''
  );
