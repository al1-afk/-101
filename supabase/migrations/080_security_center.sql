-- ================================================================
--  Migration 080 : CENTRE DE SÉCURITÉ (Security Center)
--
--  Couche de MONITORING uniquement. Elle ne remplace ni ne modifie
--  aucun contrôle existant (RBAC, RLS tenant, rate limiting,
--  validation, JWT). Elle observe et journalise.
--
--  Tables créées :
--    1. security_events   — journal des événements de sécurité
--    2. user_presence     — présence réelle (heartbeat), PAS "JWT valide"
--    3. security_alerts   — alertes dédupliquées avec cooldown
--    4. user_permissions  — permissions nommées (SECURITY_MONITORING_READ)
--
--  Réutilisation de l'existant (aucune duplication) :
--    - login_attempts  → tentatives de connexion (succès/échec) 003
--    - login_history   → historique détaillé 2FA/appareil        074
--    - refresh_tokens  → sessions/rotation                       003
--    - trusted_devices → appareils validés                       074
--    - activity_logs / security_audit_log → audit métier existant
--
--  RLS : volontairement PAS activée sur ces 4 tables, comme pour
--  login_attempts / login_history / refresh_tokens. Raisons :
--    - un événement pré-authentification (login échoué sur un email
--      inconnu, rate-limit sur IP anonyme) n'a PAS de tenant_id ;
--    - l'écriture se fait hors contexte tenant (pas de SET LOCAL
--      app.current_tenant), FORCE RLS bloquerait ces inserts.
--  Le cloisonnement est donc appliqué explicitement dans CHAQUE
--  requête de lecture de server/routes/security.ts (WHERE tenant_id
--  = JWT.tenantId), et l'accès aux routes est réservé aux admins /
--  porteurs de SECURITY_MONITORING_READ.
--
--  Idempotent : IF NOT EXISTS partout. Safe à re-runner.
-- ================================================================
BEGIN;

-- ─────────────────────────────────────────────────────────────────
--  1. SECURITY_EVENTS — journal des événements de sécurité
--
--  Ne contient JAMAIS : mot de passe, token, JWT, secret, header
--  Authorization. `metadata` est filtré côté applicatif
--  (server/lib/securityCore.ts → sanitizeMetadata).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL possible : événement pré-auth (email inconnu, IP anonyme)
  tenant_id    UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES users(id)   ON DELETE SET NULL,
  -- email tenté (tronqué applicativement) — utile quand user_id est NULL
  email        TEXT,
  event_type   TEXT        NOT NULL,
  severity     TEXT        NOT NULL DEFAULT 'info'
                 CHECK (severity IN ('info','low','medium','high','critical')),
  -- confirmed : réservé aux preuves techniques déterministes
  -- (ex. réutilisation d'un refresh token révoqué). Jamais déduit
  -- d'une simple erreur applicative.
  status       TEXT        NOT NULL DEFAULT 'normal'
                 CHECK (status IN ('normal','suspicious','blocked','confirmed')),
  ip_address   INET,
  user_agent   TEXT,
  http_method  TEXT,
  -- chemin normalisé, SANS query string (?token=… ne doit jamais fuiter)
  endpoint     TEXT,
  http_status  INTEGER,
  -- raison normalisée en snake_case (ex. 'invalid_credentials')
  reason       TEXT,
  request_id   TEXT,
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lecture dashboard : toujours scopée tenant + fenêtre temporelle
CREATE INDEX IF NOT EXISTS idx_sec_events_tenant_time
  ON security_events (tenant_id, created_at DESC);
-- Détail d'une IP
CREATE INDEX IF NOT EXISTS idx_sec_events_ip_time
  ON security_events (ip_address, created_at DESC);
-- Filtre par type / sévérité
CREATE INDEX IF NOT EXISTS idx_sec_events_type_time
  ON security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_user_time
  ON security_events (user_id, created_at DESC);
-- Index partiel : les cartes "HIGH/CRITICAL" et "suspects" scannent peu de lignes
CREATE INDEX IF NOT EXISTS idx_sec_events_severe
  ON security_events (tenant_id, created_at DESC)
  WHERE severity IN ('high','critical');
CREATE INDEX IF NOT EXISTS idx_sec_events_suspicious
  ON security_events (tenant_id, created_at DESC)
  WHERE status IN ('suspicious','blocked','confirmed');

-- ─────────────────────────────────────────────────────────────────
--  2. USER_PRESENCE — présence réelle par heartbeat
--
--  Un JWT valide ne prouve PAS qu'un utilisateur est en ligne (durée
--  1h, onglet fermé, poste verrouillé). On stocke un last_seen_at
--  rafraîchi par un heartbeat client, et l'état est calculé :
--     online  : last_seen_at > NOW() - 2 min
--     idle    : last_seen_at > NOW() - 15 min
--     offline : au-delà (ligne ignorée puis purgée)
--
--  session_key : identifiant d'onglet aléatoire (32 hex) fourni par
--  le client. Il n'octroie AUCUN privilège — la ligne est toujours
--  rattachée au user_id/tenant_id du JWT vérifié côté serveur. Le
--  nombre de sessions par utilisateur est plafonné applicativement.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_presence (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_key   TEXT        NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  login_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_presence_session
  ON user_presence (user_id, session_key);
CREATE INDEX IF NOT EXISTS idx_user_presence_tenant_seen
  ON user_presence (tenant_id, last_seen_at DESC);

-- ─────────────────────────────────────────────────────────────────
--  3. SECURITY_ALERTS — alertes dédupliquées
--
--  alert_key = empreinte stable du motif (type + cible). Tant qu'une
--  alerte OUVERTE existe pour cette clé, on incrémente occurrences
--  au lieu d'en créer une nouvelle → pas de flood.
--  cooldown_until : aucune re-notification avant cette date.
--  channel_state prépare l'envoi email / notification interne sans
--  l'implémenter ici (pending → sent/skipped par un worker futur).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  alert_key       TEXT        NOT NULL,
  alert_type      TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  severity        TEXT        NOT NULL DEFAULT 'medium'
                    CHECK (severity IN ('info','low','medium','high','critical')),
  status          TEXT        NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','acknowledged','resolved')),
  ip_address      INET,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  occurrences     INTEGER     NOT NULL DEFAULT 1,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cooldown_until  TIMESTAMPTZ,
  notified_at     TIMESTAMPTZ,
  channel_state   TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (channel_state IN ('pending','sent','skipped')),
  acknowledged_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Déduplication : une seule alerte OUVERTE par motif
CREATE UNIQUE INDEX IF NOT EXISTS uniq_security_alerts_open_key
  ON security_alerts (alert_key)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_security_alerts_tenant
  ON security_alerts (tenant_id, last_seen_at DESC);

-- ─────────────────────────────────────────────────────────────────
--  4. USER_PERMISSIONS — permissions nommées, en plus des rôles
--
--  Le Centre de sécurité est réservé à 'admin'. Cette table permet
--  d'accorder EXPLICITEMENT l'accès en lecture à un non-admin
--  (SECURITY_MONITORING_READ) sans lui donner le rôle admin.
--  Aucun rôle ne l'obtient par défaut.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_permissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  permission  TEXT        NOT NULL
                CHECK (permission IN ('SECURITY_MONITORING_READ')),
  granted_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_permission
  ON user_permissions (tenant_id, user_id, permission)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_permissions_lookup
  ON user_permissions (user_id, tenant_id, permission);

-- ─────────────────────────────────────────────────────────────────
--  5. RÉTENTION — le monitoring ne doit pas faire grossir la base
--     indéfiniment (§7 + §9 : durée de conservation des IP limitée).
--
--  Politique par sévérité : le bruit part vite, le grave reste.
--     info / low        →  30 jours
--     medium            →  90 jours
--     high / critical   → 180 jours
--     login_attempts    →  90 jours (table technique anti-brute-force)
--     login_history     → 180 jours
--     user_presence     →   7 jours après la dernière activité
--     alertes résolues  →  90 jours
--
--  Appelée quotidiennement par le scheduler Node
--  (server/lib/securityEvents.ts → startSecurityRetentionScheduler).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_security_center()
RETURNS TABLE (events_deleted INT, presence_deleted INT, alerts_deleted INT,
               attempts_deleted INT, history_deleted INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_events   INT := 0;
  v_presence INT := 0;
  v_alerts   INT := 0;
  v_attempts INT := 0;
  v_history  INT := 0;
BEGIN
  WITH d AS (
    DELETE FROM security_events
     WHERE (severity IN ('info','low')     AND created_at < NOW() - INTERVAL '30 days')
        OR (severity =  'medium'           AND created_at < NOW() - INTERVAL '90 days')
        OR (severity IN ('high','critical') AND created_at < NOW() - INTERVAL '180 days')
    RETURNING 1
  ) SELECT COUNT(*)::INT INTO v_events FROM d;

  WITH d AS (
    DELETE FROM user_presence
     WHERE last_seen_at < NOW() - INTERVAL '7 days'
    RETURNING 1
  ) SELECT COUNT(*)::INT INTO v_presence FROM d;

  WITH d AS (
    DELETE FROM security_alerts
     WHERE status IN ('resolved','acknowledged')
       AND last_seen_at < NOW() - INTERVAL '90 days'
    RETURNING 1
  ) SELECT COUNT(*)::INT INTO v_alerts FROM d;

  WITH d AS (
    DELETE FROM login_attempts
     WHERE attempted_at < NOW() - INTERVAL '90 days'
    RETURNING 1
  ) SELECT COUNT(*)::INT INTO v_attempts FROM d;

  WITH d AS (
    DELETE FROM login_history
     WHERE created_at < NOW() - INTERVAL '180 days'
    RETURNING 1
  ) SELECT COUNT(*)::INT INTO v_history FROM d;

  RETURN QUERY SELECT v_events, v_presence, v_alerts, v_attempts, v_history;
END;
$$;

-- login_attempts : index IP manquant (la détection brute-force filtre
-- sur ip_address OR email — seul l'index email existait, migration 003).
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON login_attempts (ip_address, attempted_at DESC);
-- Cartes "échecs 24h" : index partiel sur les seuls échecs
CREATE INDEX IF NOT EXISTS idx_login_attempts_failed
  ON login_attempts (attempted_at DESC)
  WHERE success = false;

COMMIT;
