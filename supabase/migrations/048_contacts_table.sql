-- ================================================================
--  Migration 048 : table contacts
--  Carnet d'adresses : freelances, candidats, artisans, etc.
--  Distinct des clients et des fournisseurs (qui sont des relations
--  commerciales actives). Un contact peut être promu plus tard.
-- ================================================================

CREATE TABLE IF NOT EXISTS contacts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom         TEXT        NOT NULL,
  telephone   TEXT,
  email       TEXT,
  profession  TEXT,                 -- ex: "Plombier", "Designer", "Comptable"
  type        TEXT        DEFAULT 'autre',
                          -- 'freelance' | 'artisan' | 'candidat' | 'partenaire' | 'autre'
  statut      TEXT        DEFAULT 'contact',
                          -- 'actif'   = on travaille avec lui
                          -- 'contact' = juste un numéro en réserve
  ville       TEXT,
  notes       TEXT,
  tags        TEXT[],
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_statut ON contacts (tenant_id, statut);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_type   ON contacts (tenant_id, type);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_tenant_isolation ON contacts;
CREATE POLICY contacts_tenant_isolation ON contacts
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
