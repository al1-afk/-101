-- ====================================================================
--  Migration 090 : horodater AUSSI les tâches annulées
--
--  La migration 086 pose `completed_at` quand une tâche passe à « done »
--  et l'efface à la réouverture. « cancelled » n'était pas traité : une
--  tâche annulée n'a donc jamais de date de clôture.
--
--  Tant que les tâches closes disparaissaient de l'écran, personne ne
--  s'en apercevait. Depuis que l'archive les affiche avec « Annulée le
--  … », le repli sur `updated_at` produit une date FAUSSE — et pire,
--  mouvante : elle avance à chaque édition, y compris à la simple
--  correction d'une note six mois plus tard.
--
--  « cancelled » est une clôture au même titre que « done » : les deux
--  sortent la tâche du flux de travail, et les deux méritent d'être
--  datées. Le trigger couvre désormais les deux, et remet la date à NULL
--  dès qu'on quitte l'un ou l'autre — c'est-à-dire à la réouverture.
--
--  Rattrapage : les tâches déjà annulées prennent leur `updated_at`,
--  seule approximation disponible — exactement ce qu'avait fait la 086
--  pour les tâches déjà terminées.
--
--  Idempotent : CREATE OR REPLACE + rattrapage borné aux lignes NULL.
-- ====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_task_stamp_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('done', 'cancelled')
     AND COALESCE(OLD.status, '') NOT IN ('done', 'cancelled') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());
  ELSIF NEW.status NOT IN ('done', 'cancelled')
        AND COALESCE(OLD.status, '') IN ('done', 'cancelled') THEN
    -- Tâche ré-ouverte : elle ne doit plus compter comme close.
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Le trigger existe déjà (086) et pointe sur cette fonction ; on le
-- recrée quand même pour une base où la 086 aurait été partielle.
DROP TRIGGER IF EXISTS trg_team_tasks_completed_at ON public.team_member_tasks;
CREATE TRIGGER trg_team_tasks_completed_at
  BEFORE UPDATE OF status ON public.team_member_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_task_stamp_completed_at();

UPDATE public.team_member_tasks
   SET completed_at = updated_at
 WHERE status = 'cancelled' AND completed_at IS NULL;

COMMIT;
