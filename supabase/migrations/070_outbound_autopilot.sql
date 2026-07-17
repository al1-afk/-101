-- ================================================================
--  Migration 070 : OUTBOUND AUTOPILOT
--
--  Autopilot = orchestrateur quotidien qui, pour chaque tenant,
--   1. cherche des entreprises sur Google Places (secteur × villes)
--   2. déduplique + enrichit (email + WhatsApp)
--   3. génère les messages via Claude/OpenAI
--   4. envoie Email + WhatsApp en respectant rate limit + horaires
--   5. logge tout dans outbound_autopilot_runs pour monitoring
--
--  Une seule ligne de config active par tenant.
--  Un run par jour × tenant → historique navigable.
-- ================================================================

BEGIN;

-- ================================================================
--  1. outbound_autopilot_config — config d'un tenant
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_autopilot_config (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID        NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

  /* Activation globale */
  enabled               BOOLEAN     NOT NULL DEFAULT FALSE,

  /* Ciblage : un secteur du catalogue OU une requête libre */
  sector_id             UUID        REFERENCES outbound_sectors(id) ON DELETE SET NULL,
  keyword               TEXT,               /* ex: "boulangerie", "clinique dentaire" */
  /* Villes ciblées — array vide = "toutes les villes de la liste par défaut" */
  cities                JSONB       NOT NULL DEFAULT '[]',
  /* Ex: ["Oujda","Casablanca","Rabat","Fès","Marrakech","Tanger","Agadir","Meknès"] */

  /* Limites & rythme */
  daily_prospect_limit  INT         NOT NULL DEFAULT 50 CHECK (daily_prospect_limit BETWEEN 1 AND 500),
  daily_search_limit    INT         NOT NULL DEFAULT 30 CHECK (daily_search_limit BETWEEN 1 AND 200),
  send_interval_seconds INT         NOT NULL DEFAULT 180 CHECK (send_interval_seconds BETWEEN 30 AND 3600),

  /* Fenêtre d'envoi (heure locale du tenant, format HH:MM) */
  send_window_start     TEXT        NOT NULL DEFAULT '09:00',
  send_window_end       TEXT        NOT NULL DEFAULT '18:00',
  /* Heure de lancement quotidien du run (UTC) — défaut 07:00 UTC ≈ 08:00 Maroc */
  run_hour_utc          INT         NOT NULL DEFAULT 7 CHECK (run_hour_utc BETWEEN 0 AND 23),

  /* Canaux activés */
  channel_email         BOOLEAN     NOT NULL DEFAULT TRUE,
  channel_whatsapp      BOOLEAN     NOT NULL DEFAULT FALSE,

  /* Génération IA */
  language              TEXT        NOT NULL DEFAULT 'fr' CHECK (language IN ('fr','ar','en')),
  tone                  TEXT        NOT NULL DEFAULT 'professionnel' CHECK (tone IN ('professionnel','chaleureux','direct')),
  service_focus         TEXT,               /* ex: "ERP sur-mesure", "Site web", "Marketing IA" */

  /* Template WhatsApp pré-approuvé (obligatoire si channel_whatsapp) */
  whatsapp_template_id  UUID        REFERENCES outbound_templates(id) ON DELETE SET NULL,

  /* Filtres qualité — évite d'importer des prospects "vides" */
  require_email         BOOLEAN     NOT NULL DEFAULT TRUE,
  require_website       BOOLEAN     NOT NULL DEFAULT FALSE,
  require_phone         BOOLEAN     NOT NULL DEFAULT FALSE,

  /* Sécurité RGPD */
  respect_ne_plus_contacter BOOLEAN NOT NULL DEFAULT TRUE,

  /* Owner / assigné par défaut des prospects créés */
  default_owner_id      UUID,

  /* Métadonnées */
  last_run_at           TIMESTAMPTZ,
  last_run_status       TEXT,               /* ok | error | partial */
  next_run_at           TIMESTAMPTZ,
  updated_by_id         UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_autopilot_config_tenant  ON outbound_autopilot_config (tenant_id);
CREATE INDEX IF NOT EXISTS idx_autopilot_config_enabled ON outbound_autopilot_config (enabled) WHERE enabled = TRUE;

-- ================================================================
--  2. outbound_autopilot_runs — historique + monitoring temps réel
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_autopilot_runs (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  config_id         UUID        REFERENCES outbound_autopilot_config(id) ON DELETE SET NULL,

  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  status            TEXT        NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running','ok','partial','error','cancelled')),

  /* Snapshot config au moment du run (audit) */
  keyword           TEXT,
  sector_id         UUID,
  cities            JSONB       DEFAULT '[]',
  channels          JSONB       DEFAULT '[]',   /* ["email","whatsapp"] */

  /* Compteurs — mis à jour en cours de run */
  searches_done     INT         NOT NULL DEFAULT 0,
  places_found      INT         NOT NULL DEFAULT 0,
  prospects_created INT         NOT NULL DEFAULT 0,
  prospects_skipped INT         NOT NULL DEFAULT 0,   /* déjà présents */
  emails_sent       INT         NOT NULL DEFAULT 0,
  emails_failed     INT         NOT NULL DEFAULT 0,
  whatsapp_sent     INT         NOT NULL DEFAULT 0,
  whatsapp_failed   INT         NOT NULL DEFAULT 0,

  /* Détails */
  error_message     TEXT,
  logs              JSONB       DEFAULT '[]'    /* array of {ts, level, msg} */
);
CREATE INDEX IF NOT EXISTS idx_autopilot_runs_tenant     ON outbound_autopilot_runs (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_autopilot_runs_running    ON outbound_autopilot_runs (status) WHERE status = 'running';

-- ================================================================
--  3. RLS — isolation tenant
-- ================================================================
ALTER TABLE outbound_autopilot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_autopilot_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_autopilot_config FORCE ROW LEVEL SECURITY;
ALTER TABLE outbound_autopilot_runs   FORCE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['outbound_autopilot_config','outbound_autopilot_runs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_select_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS rls_insert_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS rls_update_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS rls_delete_%I ON %I', t, t);

    EXECUTE format('CREATE POLICY rls_select_%I ON %I FOR SELECT
      USING (tenant_id = current_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY rls_insert_%I ON %I FOR INSERT
      WITH CHECK (tenant_id = current_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY rls_update_%I ON %I FOR UPDATE
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id())', t, t);
    EXECUTE format('CREATE POLICY rls_delete_%I ON %I FOR DELETE
      USING (tenant_id = current_tenant_id())', t, t);
  END LOOP;
END $$;

-- ================================================================
--  4. Trigger updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION outbound_autopilot_touch() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_autopilot_config_touch ON outbound_autopilot_config;
CREATE TRIGGER trg_autopilot_config_touch
  BEFORE UPDATE ON outbound_autopilot_config
  FOR EACH ROW EXECUTE FUNCTION outbound_autopilot_touch();

COMMIT;
