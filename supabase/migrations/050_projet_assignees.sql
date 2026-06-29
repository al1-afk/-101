-- ====================================================================
--  Migration 050: projet_assignees
--  Multi-member project assignment with roles (lead / member).
--  Required for "manage projects with the team" feature.
-- ====================================================================

CREATE TABLE IF NOT EXISTS projet_assignees (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  projet_id       UUID NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  team_member_id  UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member'
                   CHECK (role IN ('lead', 'member')),
  notes           TEXT,
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (projet_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_projet_assignees_tenant  ON projet_assignees (tenant_id);
CREATE INDEX IF NOT EXISTS idx_projet_assignees_projet  ON projet_assignees (projet_id);
CREATE INDEX IF NOT EXISTS idx_projet_assignees_member  ON projet_assignees (team_member_id);

-- Auto-update updated_at on row mutation (matches pattern from other tables)
CREATE OR REPLACE FUNCTION trg_projet_assignees_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projet_assignees_updated_at ON projet_assignees;
CREATE TRIGGER projet_assignees_updated_at
  BEFORE UPDATE ON projet_assignees
  FOR EACH ROW EXECUTE FUNCTION trg_projet_assignees_set_updated_at();

-- Row-Level Security: tenant isolation
ALTER TABLE projet_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projet_assignees_tenant_isolation ON projet_assignees;
CREATE POLICY projet_assignees_tenant_isolation ON projet_assignees
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
