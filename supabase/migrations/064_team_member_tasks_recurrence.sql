-- ====================================================================
--  Migration 064 : tâches récurrentes
--  Ajoute un champ `recurrence` (jsonb) sur team_member_tasks pour
--  décrire un motif de répétition. Lorsqu'une tâche récurrente est
--  marquée « done », le front crée automatiquement l'occurrence suivante.
--
--  Format du champ (nullable) :
--    { "type": "daily" }
--    { "type": "weekly", "weekdays": [1,3,5] }         -- lun/mer/ven
--    { "type": "monthly" }                              -- même jour du mois
--    { "type": "every_n_days", "interval": 3 }
--
--  Champ optionnel commun :
--    "endDate": "YYYY-MM-DD"  -- arrête la récurrence à cette date
-- ====================================================================

ALTER TABLE team_member_tasks
  ADD COLUMN IF NOT EXISTS recurrence JSONB;

CREATE INDEX IF NOT EXISTS idx_team_tasks_recurrence
  ON team_member_tasks((recurrence IS NOT NULL))
  WHERE recurrence IS NOT NULL;
