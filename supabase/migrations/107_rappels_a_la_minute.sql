-- ====================================================================
--  Migration 107 : DES RAPPELS À LA MINUTE, ET UN TROISIÈME RAPPEL
--
--  Demande du 13/09/2026 :
--    « À 22 h : ajoute les dépenses du jour.
--      Le matin à 9 h 30 : ajoute tes tâches.
--      À 15 h : appelle les clients pour le paiement. »
--
--  ── Pourquoi une colonne de MINUTES ─────────────────────────────────
--  Le planificateur ne savait viser que l'heure pleine : `local_hour >=
--  <heure>`. « 9 h 30 » y devenait 9 h — le rappel serait parti une
--  demi-heure trop tôt, tous les jours. Chaque type d'envoi reçoit donc
--  sa minute, par défaut 0, ce qui laisse les six réglages existants
--  exactement où ils étaient.
--
--  Le tick tourne toutes les 10 minutes (REPORTS_TICK_MS) : un rappel
--  réglé à 9 h 30 part donc entre 9 h 30 et 9 h 40. C'est la précision
--  de tout le module depuis l'origine, et elle suffit à un rappel
--  quotidien — la resserrer coûterait six fois plus de passages pour
--  gagner des minutes que personne ne réclame.
--
--  ── Le troisième rappel ─────────────────────────────────────────────
--  « Ajoute tes tâches » n'existait pas. Les deux autres, eux, existent
--  déjà et ne changent que d'horaire (données, pas code) :
--    • dépenses  19 h → 22 h
--    • retards    9 h → 15 h, avec un texte tourné vers l'appel.
--
--  Comme les deux autres rappels d'argent, celui-ci ne part QUE s'il y a
--  lieu : aucune tâche créée dans la journée. Un rappel qui arrive après
--  le travail fait n'est plus un rappel, c'est du bruit.
--
--  Idempotente : ADD COLUMN IF NOT EXISTS partout.
-- ====================================================================
BEGIN;

/* ── Minutes, pour chacun des types existants ─────────────────────── */
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS tasks_alert_minute     SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contacts_alert_minute  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_report_minute    SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_report_minute   SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retards_alert_minute   SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depenses_rappel_minute SMALLINT NOT NULL DEFAULT 0;

/* ── Le troisième rappel : « ajoute tes tâches » ──────────────────── */
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS taches_rappel_enabled BOOLEAN  NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS taches_rappel_hour    SMALLINT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS taches_rappel_minute  SMALLINT NOT NULL DEFAULT 30;

/* Une seule contrainte par colonne, posée si elle manque : les CHECK
   ne sont pas idempotents comme les colonnes. */
DO $$
DECLARE
  c text;
  colonnes text[] := ARRAY[
    'tasks_alert_minute', 'contacts_alert_minute', 'daily_report_minute',
    'weekly_report_minute', 'retards_alert_minute', 'depenses_rappel_minute',
    'taches_rappel_minute'
  ];
BEGIN
  FOREACH c IN ARRAY colonnes LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.notification_settings'::regclass
         AND conname  = 'ns_' || c || '_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.notification_settings ADD CONSTRAINT %I CHECK (%I BETWEEN 0 AND 59)',
        'ns_' || c || '_check', c);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notification_settings'::regclass
       AND conname  = 'ns_taches_rappel_hour_check'
  ) THEN
    ALTER TABLE public.notification_settings
      ADD CONSTRAINT ns_taches_rappel_hour_check CHECK (taches_rappel_hour BETWEEN 0 AND 23);
  END IF;
END $$;

/* ── Le vocabulaire des envois s'élargit ──────────────────────────── */
ALTER TABLE public.notification_runs DROP CONSTRAINT IF EXISTS notification_runs_kind_check;
ALTER TABLE public.notification_runs
  ADD CONSTRAINT notification_runs_kind_check
  CHECK (kind IN ('tasks_overdue', 'clients_to_contact', 'daily_report', 'weekly_report',
                  'paiements_retard', 'depenses_rappel', 'taches_rappel'));

COMMENT ON COLUMN public.notification_settings.taches_rappel_enabled IS
  'Rappel quotidien « ajoute tes tâches » — ne part que si AUCUNE tâche n''a été créée ce jour-là.';
COMMENT ON COLUMN public.notification_settings.taches_rappel_minute IS
  'Minute de l''envoi. Le planificateur passe toutes les 10 min : l''envoi part entre M et M+10.';

/* Le rappel compte les tâches créées dans la journée, par espace. */
CREATE INDEX IF NOT EXISTS idx_team_member_tasks_created
  ON public.team_member_tasks (tenant_id, created_at);

COMMIT;
