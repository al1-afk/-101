-- ====================================================================
--  Migration 106 : DEUX RAPPELS D'ARGENT
--
--  Demande du 13/09/2026 : « je veux recevoir les notifications sur mon
--  téléphone comme pour les autres applications — par exemple quand un
--  employé fait une mise à jour, une notification de paiement ou de
--  retard de paiement, et un rappel quotidien de saisir les dépenses. »
--
--  Le paiement ENCAISSÉ est notifié à la seconde où il est saisi
--  (server/routes/crud.ts), et la mise à jour d'un employé au moment où
--  elle arrive (server/routes/mySpace.ts) : ni l'un ni l'autre n'a
--  besoin de réglage, ce sont des événements.
--
--  Les deux autres n'ont pas d'instant : un retard s'INSTALLE, une
--  dépense non saisie est une ABSENCE d'événement. Ils se vérifient donc
--  à heure fixe, et rejoignent le planificateur des rapports
--  automatiques (migration 086) plutôt que d'en ouvrir un deuxième :
--  celui-ci sait déjà lire l'heure locale de chaque espace, garantir un
--  seul envoi par jour (index unique sur notification_runs), choisir les
--  destinataires et écrire la cloche.
--
--  ── Valeurs par défaut ──────────────────────────────────────────────
--  Retards : 9 h, quand on commence sa journée et qu'on peut encore
--  appeler un client. Dépenses : 19 h, quand la journée est faite — un
--  rappel à 9 h pour saisir les dépenses du jour arriverait avant les
--  dépenses elles-mêmes.
--
--  Les deux sont ACTIVÉS par défaut, contrairement aux quatre rapports
--  historiques : ce sont exactement les deux alertes demandées, et un
--  réglage qu'il faut aller chercher pour obtenir ce qu'on a demandé
--  n'est pas un service rendu. Ils restent coupables en un clic dans
--  Paramètres → Notifications automatiques.
--
--  Idempotente : ADD COLUMN IF NOT EXISTS partout.
-- ====================================================================
BEGIN;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS retards_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS retards_alert_hour    SMALLINT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS depenses_rappel_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS depenses_rappel_hour    SMALLINT NOT NULL DEFAULT 19;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notification_settings'::regclass
       AND conname  = 'notification_settings_retards_hour_check'
  ) THEN
    ALTER TABLE public.notification_settings
      ADD CONSTRAINT notification_settings_retards_hour_check
      CHECK (retards_alert_hour BETWEEN 0 AND 23);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.notification_settings'::regclass
       AND conname  = 'notification_settings_depenses_hour_check'
  ) THEN
    ALTER TABLE public.notification_settings
      ADD CONSTRAINT notification_settings_depenses_hour_check
      CHECK (depenses_rappel_hour BETWEEN 0 AND 23);
  END IF;
END $$;

/* ── Le vocabulaire des envois ───────────────────────────────────────
   `notification_runs.kind` porte une contrainte fermée, posée par la
   migration 086 avec les quatre types de l'époque. Sans cette reprise,
   le planificateur échoue en 23514 au moment de RÉSERVER le créneau :
   l'alerte n'est jamais calculée, et l'erreur ne parle que d'une
   contrainte — pas du type manquant. */
ALTER TABLE public.notification_runs DROP CONSTRAINT IF EXISTS notification_runs_kind_check;
ALTER TABLE public.notification_runs
  ADD CONSTRAINT notification_runs_kind_check
  CHECK (kind IN ('tasks_overdue', 'clients_to_contact', 'daily_report', 'weekly_report',
                  'paiements_retard', 'depenses_rappel'));

COMMENT ON COLUMN public.notification_settings.retards_alert_enabled IS
  'Alerte quotidienne : factures échues et non soldées.';
COMMENT ON COLUMN public.notification_settings.depenses_rappel_enabled IS
  'Rappel quotidien de saisie des dépenses — ne part que si RIEN n''a été saisi ce jour-là.';

/* L'alerte de retard lit les factures par échéance : sans cet index,
   chaque passage parcourt toute la table pour n'en retenir qu'une
   poignée. Partiel, car les factures soldées ou annulées n'y entrent
   jamais. */
CREATE INDEX IF NOT EXISTS idx_factures_echeance_impayees
  ON public.factures (tenant_id, date_echeance)
  WHERE date_echeance IS NOT NULL
    AND COALESCE(statut, '') NOT IN ('payee', 'annulee', 'refusee', 'brouillon');

/* Le rappel de dépenses compte les saisies du jour, par espace. */
CREATE INDEX IF NOT EXISTS idx_depenses_date
  ON public.depenses (tenant_id, date_depense);

COMMIT;
