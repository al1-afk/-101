-- ════════════════════════════════════════════════════════════════════
--  FIX PROD : ajouter les colonnes manquantes sur team_member_tasks
--
--  Cause : erreur "Erreur serveur (42703)" à la création d'une tâche.
--  42703 = colonne inconnue. Les migrations 052/055/058/062/064 ne
--  sont pas appliquées sur la DB de prod.
--
--  100% idempotent : ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS.
--  Aucune perte de données. Safe à re-runner.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 051 : catégorie, timer, demande client + statut 'validation'
ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS category        TEXT,
  ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_request      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS request_price   NUMERIC(12,2);

ALTER TABLE public.team_member_tasks
  DROP CONSTRAINT IF EXISTS team_member_tasks_status_check;
ALTER TABLE public.team_member_tasks
  ADD CONSTRAINT team_member_tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'validation', 'done', 'cancelled'));

-- 052 : team_member_id devient nullable (tâches non assignées)
ALTER TABLE public.team_member_tasks
  ALTER COLUMN team_member_id DROP NOT NULL;

-- 055 : tâche assignée à un admin (users.id)
ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_tasks_assigned_user
  ON public.team_member_tasks(assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

-- 058 : attachments (images collées Cmd+V, data URLs base64)
ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 062 : tâche assignée à un stagiaire
ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS assigned_stagiaire_id UUID
    REFERENCES public.stagiaires(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_tasks_assigned_stagiaire
  ON public.team_member_tasks(assigned_stagiaire_id)
  WHERE assigned_stagiaire_id IS NOT NULL;

-- 064 : récurrence (daily/weekly/monthly/every_n_days)
ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS recurrence JSONB;

CREATE INDEX IF NOT EXISTS idx_team_tasks_recurrence
  ON public.team_member_tasks((recurrence IS NOT NULL))
  WHERE recurrence IS NOT NULL;

-- Vérification : afficher les colonnes finales
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'team_member_tasks'
 ORDER BY ordinal_position;

COMMIT;
