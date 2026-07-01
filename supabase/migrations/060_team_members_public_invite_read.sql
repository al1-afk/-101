-- ====================================================================
--  Migration 060 : Autoriser la lecture publique d'un team_member par
--                  invitation_token, indépendamment du tenant courant.
--
--  PROBLÈME : GET /api/team/invite/:token est un endpoint public
--  (l'utilisateur invité n'a pas encore de session). Il utilise queryOne()
--  qui ne définit pas app.current_tenant → la policy RLS existante
--  (tenant_id = current_tenant_id()) bloque toutes les lectures et
--  l'API renvoie "Lien invalide ou déjà utilisé" pour tout token,
--  même valide.
--
--  SOLUTION : ajouter une policy SELECT supplémentaire qui autorise la
--  lecture UNIQUEMENT quand invitation_token IS NOT NULL et que le
--  paramètre app.current_tenant n'est pas défini (endpoint public).
--  Les autres accès continuent à passer par la policy tenant-scopée.
--
--  Sécurité : le invitation_token est un secret de 64 caractères
--  cryptographiquement aléatoire (crypto.randomBytes(32).toString('hex')),
--  fonctionne comme un identifiant + secret combinés. Connaître le token
--  est équivalent à posséder l'invitation.
-- ====================================================================

DROP POLICY IF EXISTS rls_select_team_members_by_token ON public.team_members;

CREATE POLICY rls_select_team_members_by_token ON public.team_members
  FOR SELECT
  USING (
    invitation_token IS NOT NULL
    AND (
      /* Lorsque aucun tenant n'est défini (endpoint public),
         autoriser la lecture par token uniquement. */
      current_setting('app.current_tenant', true) IS NULL
      OR current_setting('app.current_tenant', true) = ''
    )
  );
