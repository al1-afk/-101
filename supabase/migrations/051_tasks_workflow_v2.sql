-- ====================================================================
--  Migration 051: enrichir team_member_tasks pour le workflow agence
--  - category (Analyse, Design, Développement, SEO, etc.)
--  - elapsed_seconds (timer cumul)
--  - is_request + request_price (demande client = sous-task payante)
--  - statut 'validation' (entre in_progress et done)
-- ====================================================================

ALTER TABLE team_member_tasks
  ADD COLUMN IF NOT EXISTS category        TEXT,
  ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_request      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS request_price   NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_team_member_tasks_category
  ON team_member_tasks (project_id, category);
CREATE INDEX IF NOT EXISTS idx_team_member_tasks_is_request
  ON team_member_tasks (project_id, is_request);

-- Extend status check to allow 'validation'
ALTER TABLE team_member_tasks DROP CONSTRAINT IF EXISTS team_member_tasks_status_check;
ALTER TABLE team_member_tasks ADD CONSTRAINT team_member_tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'validation', 'done', 'cancelled'));
