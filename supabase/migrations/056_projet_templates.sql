-- ====================================================================
--  Migration 056 : table projet_templates
--  Permet à chaque tenant de créer ses propres templates de projet
--  (en plus des 6 templates intégrés en dur dans le code).
--  La structure groups est stockée en JSONB pour rester flexible :
--    [{ "category": "Design", "tasks": [{ "title": "...", "priority": "high" }] }]
-- ====================================================================

CREATE TABLE IF NOT EXISTS projet_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  emoji       TEXT DEFAULT '📋',
  description TEXT,
  groups      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projet_templates_tenant
  ON projet_templates(tenant_id);

ALTER TABLE projet_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projet_templates_tenant_isolation ON projet_templates;
CREATE POLICY projet_templates_tenant_isolation ON projet_templates
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE OR REPLACE FUNCTION trg_projet_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projet_templates_updated_at ON projet_templates;
CREATE TRIGGER projet_templates_updated_at
  BEFORE UPDATE ON projet_templates
  FOR EACH ROW EXECUTE FUNCTION trg_projet_templates_set_updated_at();
