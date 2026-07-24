-- ================================================================
--  Migration 075 : prospect_logs (timeline d'activité CRM)
--
--  La table n'avait jamais été créée : les hooks (useProspectLogs /
--  useAddProspectLog) et l'UI existaient, mais toute opération partait
--  en 403 (table absente de RBAC) puis aurait échoué (table inexistante).
--  Cette migration crée la table + RLS + la colonne duration_minutes
--  (durée d'un appel, pour le suivi du temps passé au téléphone).
--
--  Idempotent : IF NOT EXISTS + DROP POLICY IF EXISTS. Safe à re-runner.
-- ================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS prospect_logs (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  prospect_id      UUID        NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL DEFAULT 'note'
                     CHECK (type IN ('creation','statut','note','edit','appel','email')),
  message          TEXT        NOT NULL,
  auteur           TEXT,
  duration_minutes INTEGER,    -- durée d'appel en minutes (type='appel') — suivi du temps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_logs_prospect
  ON prospect_logs (prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_logs_tenant
  ON prospect_logs (tenant_id);

-- Colonne ajoutée aussi en ALTER au cas où la table préexisterait sans elle
ALTER TABLE prospect_logs ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- ── RLS (isolation par tenant, même pattern que le module outbound) ──
ALTER TABLE prospect_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_logs FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_prospect_logs ON prospect_logs;
DROP POLICY IF EXISTS rls_insert_prospect_logs ON prospect_logs;
DROP POLICY IF EXISTS rls_update_prospect_logs ON prospect_logs;
DROP POLICY IF EXISTS rls_delete_prospect_logs ON prospect_logs;

CREATE POLICY rls_select_prospect_logs ON prospect_logs
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_prospect_logs ON prospect_logs
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_prospect_logs ON prospect_logs
  FOR UPDATE USING (tenant_id = current_tenant_id())
             WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_prospect_logs ON prospect_logs
  FOR DELETE USING (tenant_id = current_tenant_id());

COMMIT;
