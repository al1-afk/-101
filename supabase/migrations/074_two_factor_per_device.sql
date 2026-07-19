-- ================================================================
--  Migration 074 : 2FA À CHAQUE NOUVEL APPAREIL + 3 MODES + AUDIT
--
--  Objectif : renforcer l'authentification.
--    1. Après login (email+password), l'utilisateur DOIT valider un
--       second facteur SI l'appareil n'est pas déjà "trusted".
--    2. 3 modes de vérification (choisis par l'admin, par user) :
--       - email          : code 6 chiffres envoyé automatiquement
--       - admin_manual   : admin génère un code et le communique
--       - admin_approval : admin approuve la demande sans code
--    3. Trusted devices : cookie httpOnly longue durée (90 jours)
--       liant un fingerprint SHA-256 à un user_id — évite de
--       redemander le 2FA à chaque connexion sur le même browser.
--    4. Audit login_history — jamais de code en clair.
--
--  L'existant conservé :
--    - table login_verification_codes → réutilisée pour tous les
--      modes (code_hash reste bcrypt, expires_at, attempts…)
--    - login_attempts / refresh_tokens intacts
-- ================================================================
BEGIN;

-- ── 1. Choix du mode 2FA par utilisateur ─────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS twofa_mode TEXT NOT NULL DEFAULT 'email'
    CHECK (twofa_mode IN ('email','admin_manual','admin_approval'));

-- ── 2. Extension de login_verification_codes pour couvrir les
--    3 modes (email / admin_manual / admin_approval) et un
--    workflow "en attente → approuvé/rejeté". code_hash reste
--    obligatoire pour email + admin_manual ; NULLable pour
--    admin_approval (pas de code, juste un OK de l'admin).
ALTER TABLE login_verification_codes
  ALTER COLUMN code_hash DROP NOT NULL;

ALTER TABLE login_verification_codes
  ADD COLUMN IF NOT EXISTS method       TEXT NOT NULL DEFAULT 'email'
    CHECK (method IN ('email','admin_manual','admin_approval')),
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','consumed','expired')),
  ADD COLUMN IF NOT EXISTS approved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_hash  TEXT;

CREATE INDEX IF NOT EXISTS idx_login_verif_status_tenant
  ON login_verification_codes (tenant_id, status, expires_at DESC)
  WHERE status = 'pending';

-- ── 3. Trusted devices (skip 2FA sur appareil déjà validé) ──────
--    device_hash = SHA-256 d'un secret 32 octets stocké en cookie
--    httpOnly. On ne stocke QUE le hash → même en cas de fuite DB,
--    aucun cookie ne peut être forgé.
CREATE TABLE IF NOT EXISTS trusted_devices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_hash  TEXT        NOT NULL,
  label        TEXT,       -- ex: "Chrome sur Mac de Said"
  user_agent   TEXT,
  ip_address   INET,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days',
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trusted_devices_user_hash
  ON trusted_devices (user_id, device_hash)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trusted_devices_lookup
  ON trusted_devices (device_hash, revoked_at, expires_at);

-- ── 4. Login history (jamais de code en clair) ───────────────────
CREATE TABLE IF NOT EXISTS login_history (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        REFERENCES users(id) ON DELETE SET NULL,
  tenant_id         UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  email             TEXT        NOT NULL,
  ip_address        INET,
  user_agent        TEXT,
  device_hash       TEXT,
  method            TEXT        NOT NULL
    CHECK (method IN ('password','email','admin_manual','admin_approval','trusted_device')),
  event             TEXT        NOT NULL
    CHECK (event IN ('password_ok','challenge_sent','verify_success','verify_failed','approved','rejected','trusted_skip')),
  success           BOOLEAN     NOT NULL DEFAULT FALSE,
  challenge_id      UUID        REFERENCES login_verification_codes(id) ON DELETE SET NULL,
  metadata          JSONB       DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_history_user     ON login_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_tenant   ON login_history (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_email    ON login_history (email, created_at DESC);

-- ── 5. Nettoyage : purge auto des challenges expirés (job manuel
--    à lancer périodiquement, aucune contrainte à respecter ici).
CREATE OR REPLACE FUNCTION purge_expired_login_verification_codes()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE deleted_count INT;
BEGIN
  WITH d AS (
    UPDATE login_verification_codes
       SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*)::INT INTO deleted_count FROM d;

  DELETE FROM login_verification_codes
   WHERE (status IN ('consumed','expired','rejected'))
     AND created_at < NOW() - INTERVAL '30 days';

  DELETE FROM trusted_devices
   WHERE (revoked_at IS NOT NULL OR expires_at < NOW())
     AND created_at < NOW() - INTERVAL '30 days';

  RETURN deleted_count;
END;
$$;

COMMIT;
