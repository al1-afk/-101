-- ====================================================================
--  Migration 066 : Security hardening — token storage
--
--  ACTIONS URGENTES :
--   1. Invalider TOUS les tokens actuellement actifs (potentiellement
--      compromis car exposés en clair dans les réponses API + logs).
--   2. Ne plus stocker les tokens d'invitation/reset en clair — ne
--      conserver que leur hash SHA-256 (le raw token n'est envoyé qu'une
--      seule fois par email).
--   3. Renforcer les colonnes de traçabilité (created_by, used_at, ip).
--   4. Réduire la fenêtre de validité par défaut du reset password à
--      30 minutes (contre 24h dans l'ancien code).
--
--  Le raw token ne sera plus jamais visible côté serveur après émission :
--   - stocké côté DB : sha256(token) en hex (64 chars)
--   - envoyé par email : token brut (une seule fois)
--   - jamais retourné dans la réponse API
--   - jamais loggé (masqué en 4 premiers … 4 derniers si nécessaire)
-- ====================================================================

BEGIN;

/* ── 1. team_members : invitation_token → hash ─────────────────────
   L'ancien index unique (uidx) va être remplacé par un index sur le
   hash. On invalide TOUT ce qui est en flight : tous les tokens
   actuellement actifs sont considérés comme compromis. */

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS invitation_token_hash text,
  ADD COLUMN IF NOT EXISTS invitation_purpose    text
    CHECK (invitation_purpose IN ('invite', 'reset') OR invitation_purpose IS NULL),
  ADD COLUMN IF NOT EXISTS invitation_created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_created_ip inet,
  ADD COLUMN IF NOT EXISTS invitation_used_at    timestamptz;

/* Révocation en bloc : tous les tokens en flight sont invalidés.
   Les invitations passent en 'invited' avec token NULL (l'admin doit
   déclencher un nouveau /resend explicitement). */
UPDATE public.team_members
   SET invitation_token         = NULL,
       invitation_expires_at    = NULL
 WHERE invitation_token IS NOT NULL;

/* Nouvel index unique sur le hash */
DROP INDEX IF EXISTS idx_team_members_invitation_token;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_invitation_token_hash
  ON public.team_members (invitation_token_hash)
  WHERE invitation_token_hash IS NOT NULL;

/* Ancien index (SELECT public par token) : la policy 060 filtre sur
   `invitation_token IS NOT NULL`. On la met à jour pour cibler le hash. */
DROP POLICY IF EXISTS rls_select_team_members_by_token ON public.team_members;
CREATE POLICY rls_select_team_members_by_token ON public.team_members
  FOR SELECT
  USING (
    invitation_token_hash IS NOT NULL
    AND (
      current_setting('app.current_tenant', true) IS NULL
      OR current_setting('app.current_tenant', true) = ''
    )
  );

/* La colonne invitation_token (clair) est conservée pendant une
   période de transition pour éviter de casser un déploiement en cours,
   mais elle DOIT rester NULL — plus jamais écrite. Un check contraint
   forcerait un déploiement synchronisé du code, donc on se contente
   d'un commentaire explicite. */
COMMENT ON COLUMN public.team_members.invitation_token IS
  'DEPRECATED — do not write. Use invitation_token_hash. Kept NULL for compatibility, will be dropped in a future migration.';

/* ── 2. refresh_tokens : révoquer TOUTES les sessions actives ────────
   Un attaquant qui a intercepté un token exposé pourrait avoir posé
   une session persistante. On force la ré-authentification globale. */

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='refresh_tokens') THEN
    UPDATE public.refresh_tokens SET revoked = true WHERE revoked = false;
  END IF;
END $$;

/* ── 3. Codes de vérification / reset : invalider tous les codes en vol */

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='password_reset_codes') THEN
    UPDATE public.password_reset_codes SET used = true WHERE used = false;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='login_verification_codes') THEN
    UPDATE public.login_verification_codes SET used = true WHERE used = false;
  END IF;
END $$;

/* ── 4. Journal d'audit des actions liées aux tokens ────────────────
   Table dédiée pour tracer chaque émission / consommation de token
   (invitation + reset). Immuable côté application. */

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  actor_user_id uuid       REFERENCES public.users(id) ON DELETE SET NULL,
  target_type  text        NOT NULL,   -- 'team_member' | 'user' | 'secret'
  target_id    uuid,
  action       text        NOT NULL,   -- 'invite_issued' | 'invite_used' | 'reset_issued' | 'reset_used' | 'token_masked_view' ...
  token_prefix text,                   -- 8 premiers chars du token (jamais le token complet)
  ip_address   inet,
  user_agent   text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_tenant  ON public.security_audit_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_action  ON public.security_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON public.security_audit_log (created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_security_audit_tenant ON public.security_audit_log;
CREATE POLICY rls_security_audit_tenant ON public.security_audit_log
  FOR ALL
  USING (
    current_setting('app.current_tenant', true) IS NOT NULL
    AND current_setting('app.current_tenant', true) <> ''
    AND tenant_id::text = current_setting('app.current_tenant', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.current_tenant', true)
  );

COMMIT;
