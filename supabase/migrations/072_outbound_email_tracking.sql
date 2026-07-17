-- ================================================================
--  Migration 072 : EMAIL TRACKING (opens, clicks, bounces)
--
--  1. Ajoute des colonnes agrégées sur outbound_prospects
--     (rapide à filtrer/afficher — on évite les JOIN à chaque query)
--  2. Table outbound_email_events pour l'historique fin
--     (utile pour "à quelle heure a-t-il ouvert ?", timeline, etc.)
-- ================================================================
BEGIN;

-- Colonnes agrégées (rapides à lire) ─────────────────────────────
ALTER TABLE outbound_prospects
  ADD COLUMN IF NOT EXISTS email_opened_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_opened_count    INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_clicked_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_clicked_count   INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_bounced         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_bounced_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_bounced_reason  TEXT,
  ADD COLUMN IF NOT EXISTS email_replied_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outbound_prospects_opened  ON outbound_prospects (email_opened_at)  WHERE email_opened_at  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_clicked ON outbound_prospects (email_clicked_at) WHERE email_clicked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_bounced ON outbound_prospects (email_bounced)    WHERE email_bounced = TRUE;

-- Historique fin des événements ──────────────────────────────────
CREATE TABLE IF NOT EXISTS outbound_email_events (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id       UUID        NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  autopilot_run_id  UUID        REFERENCES outbound_autopilot_runs(id) ON DELETE SET NULL,
  event_type        TEXT        NOT NULL CHECK (event_type IN ('sent','opened','clicked','bounced','replied')),
  /* Détails contextuels — laissé large pour de futurs canaux (SMS, WhatsApp). */
  subject           TEXT,
  target_url        TEXT,       /* pour 'clicked' */
  user_agent        TEXT,
  ip_hash           TEXT,       /* SHA-256 tronqué — respect vie privée (pas d'IP brute) */
  bounce_reason     TEXT,
  metadata          JSONB       DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_events_tenant   ON outbound_email_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_prospect ON outbound_email_events (prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type     ON outbound_email_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_run      ON outbound_email_events (autopilot_run_id) WHERE autopilot_run_id IS NOT NULL;

-- RLS ───────────────────────────────────────────────────────────
ALTER TABLE outbound_email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_email_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_outbound_email_events ON outbound_email_events;
DROP POLICY IF EXISTS rls_insert_outbound_email_events ON outbound_email_events;
DROP POLICY IF EXISTS rls_update_outbound_email_events ON outbound_email_events;
DROP POLICY IF EXISTS rls_delete_outbound_email_events ON outbound_email_events;

CREATE POLICY rls_select_outbound_email_events ON outbound_email_events FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_outbound_email_events ON outbound_email_events FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_outbound_email_events ON outbound_email_events FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_outbound_email_events ON outbound_email_events FOR DELETE
  USING (tenant_id = current_tenant_id());

-- Ajoute aussi un compteur global sur les runs (pratique pour l'UI) ─
ALTER TABLE outbound_autopilot_runs
  ADD COLUMN IF NOT EXISTS emails_opened  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_clicked INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_bounced INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_replied INT NOT NULL DEFAULT 0;

COMMIT;
