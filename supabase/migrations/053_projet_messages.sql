-- ====================================================================
--  Migration 053: project_messages — chat par projet (admin ↔ équipe)
--  Toute personne assignée au projet voit les messages.
-- ====================================================================

CREATE TABLE IF NOT EXISTS projet_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  projet_id       UUID NOT NULL REFERENCES projets(id) ON DELETE CASCADE,
  /* Author : on stocke prénom+nom + flag is_admin pour affichage rapide
     sans jointures complexes user/team_member. */
  author_user_id        UUID REFERENCES users(id)        ON DELETE SET NULL,
  author_team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  author_name           TEXT NOT NULL,
  is_admin              BOOLEAN DEFAULT FALSE,
  text                  TEXT NOT NULL CHECK (length(trim(text)) > 0),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projet_messages_projet
  ON projet_messages (projet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projet_messages_tenant
  ON projet_messages (tenant_id);

ALTER TABLE projet_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projet_messages_tenant_isolation ON projet_messages;
CREATE POLICY projet_messages_tenant_isolation ON projet_messages
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
