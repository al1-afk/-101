-- ====================================================================
--  Migration 085 : task_access sur projet_assignees
--
--  Deuxième axe d'accès par personne assignée, à côté de share_infos
--  (migration 054, qui gouverne les Infos & Accès : contact client,
--  notes, identifiants, liens) :
--
--    'assigned' — la personne ne voit QUE les tâches qui lui sont
--                 attribuées sur ce projet. Les autres tâches du projet
--                 ne lui sont jamais renvoyées par l'API.
--    'all'      — la personne consulte TOUTES les tâches du projet et
--                 suit leur avancement. Elle ne peut toujours modifier
--                 que les siennes : PATCH /api/my-space/tasks/:id filtre
--                 déjà sur team_member_id / stagiaire lié.
--
--  Défaut 'assigned' — et non 'all' — pour rétrocompatibilité stricte :
--  avant cette migration l'espace membre ne renvoyait que les tâches de
--  la personne (server/routes/mySpace.ts, GET /projets/:id). Défauter à
--  'all' élargirait silencieusement l'accès de toutes les assignations
--  déjà en base. Le partage est donc un geste explicite de l'admin.
--
--  Idempotent : ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS.
--  Pas de policy à créer : projet_assignees a déjà son RLS d'isolation
--  tenant (050 puis 081) et une colonne de plus n'y change rien.
-- ====================================================================
BEGIN;

ALTER TABLE public.projet_assignees
  ADD COLUMN IF NOT EXISTS task_access TEXT NOT NULL DEFAULT 'assigned';

-- Recréée à chaque run : la 050 crée ses CHECK inline (nom auto-généré),
-- on nomme celle-ci pour pouvoir la reprendre proprement plus tard.
ALTER TABLE public.projet_assignees
  DROP CONSTRAINT IF EXISTS projet_assignees_task_access_ck;
ALTER TABLE public.projet_assignees
  ADD CONSTRAINT projet_assignees_task_access_ck
  CHECK (task_access IN ('all', 'assigned'));

-- Une ligne pré-existante pouvait être NULL si la colonne avait été
-- ajoutée sans NOT NULL par un run partiel antérieur.
UPDATE public.projet_assignees
   SET task_access = 'assigned'
 WHERE task_access IS NULL;

COMMENT ON COLUMN public.projet_assignees.task_access IS
  'all = voit toutes les tâches du projet (lecture seule sur celles des autres) ; assigned = ne voit que les siennes';

COMMIT;
