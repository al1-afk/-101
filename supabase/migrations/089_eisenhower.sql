-- ====================================================================
--  Migration 089 : MATRICE D'EISENHOWER SUR LES TÂCHES
--
--  Objectif : arrêter de traiter une liste de tâches dans l'ordre où
--  elle est tombée, et décider pour chacune ce qu'on en fait —
--  la FAIRE, la PLANIFIER, la DÉLÉGUER ou la SUPPRIMER.
--
--    urgent + important          → 'do'        (faire maintenant)
--    important, pas urgent       → 'plan'      (planifier)
--    urgent, pas important       → 'delegate'  (déléguer)
--    ni l'un ni l'autre          → 'eliminate' (supprimer)
--
--  ── Pourquoi une colonne, et pourquoi elle peut rester NULL ────────
--  Le quadrant pourrait se déduire de `priority` et de l'échéance. Ce
--  serait suffisant pour AFFICHER une matrice, mais pas pour s'en
--  servir : le geste utile est justement de DÉPLACER une tâche que
--  l'automatisme a mal placée — c'est là que se fait l'arbitrage.
--
--  Trois états, comme pour `reminder_offsets` :
--    NULL         → non classée : l'écran propose un quadrant déduit de
--                   la priorité et de la proximité de l'échéance
--    'do' | …     → classement DÉCIDÉ, qui prime sur toute déduction
--
--  Un DEFAULT aurait effacé la différence entre « le système suppose »
--  et « j'ai tranché » — or c'est toute la valeur de l'exercice.
--
--  Idempotent : ADD COLUMN IF NOT EXISTS + contrainte reprise.
-- ====================================================================
BEGIN;

ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS eisenhower TEXT;

ALTER TABLE public.team_member_tasks
  DROP CONSTRAINT IF EXISTS team_member_tasks_eisenhower_ck;
ALTER TABLE public.team_member_tasks
  ADD CONSTRAINT team_member_tasks_eisenhower_ck
  CHECK (eisenhower IS NULL
         OR eisenhower IN ('do', 'plan', 'delegate', 'eliminate'));

COMMENT ON COLUMN public.team_member_tasks.eisenhower IS
  'Quadrant d''Eisenhower décidé à la main : do / plan / delegate / eliminate. NULL = quadrant déduit par l''écran';

COMMIT;
