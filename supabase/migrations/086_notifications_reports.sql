-- ====================================================================
--  Migration 086 : NOTIFICATIONS & RAPPORTS AUTOMATIQUES
--
--  Objectif : que l'ERP prévienne tout seul, chaque jour, sans qu'on ait
--  à ouvrir un écran ni à cliquer sur « générer ».
--
--    1. Alerte « tâches en retard / non terminées »   → quotidienne
--    2. Alerte « clients & prospects à contacter »    → quotidienne
--    3. Rapport quotidien (fait / en attente / à contacter / priorités)
--    4. Rapport hebdomadaire (bilan + résultats + prochaines actions)
--
--  ── Tables créées ──────────────────────────────────────────────────
--   notification_settings  configuration PAR ESPACE (heures, seuils,
--                          destinataires, canaux). Une ligne = un tenant.
--   notifications          notifications persistées côté serveur, une
--                          ligne PAR destinataire (cloche in-app).
--   notification_runs      journal d'exécution — sert AUSSI de verrou
--                          d'idempotence : (tenant, type, jour) unique
--                          pour les envois automatiques. Un redémarrage
--                          du serveur ne peut donc pas ré-envoyer un
--                          rapport déjà parti.
--
--  ── Colonnes ajoutées ──────────────────────────────────────────────
--   clients.date_dernier_contact  — dernier contact enregistré avec le
--                          client. Backfill depuis l'historique existant
--                          (devis, factures, paiements, projets) pour que
--                          la toute première alerte ne liste pas les 100
--                          clients de l'espace.
--
--  ── Trigger ────────────────────────────────────────────────────────
--   team_member_tasks.completed_at est aujourd'hui posé par
--   /api/my-space/tasks/:id mais PAS par le CRUD générique : une tâche
--   passée à « done » depuis l'écran admin n'a donc pas de date de fin,
--   et n'apparaîtrait jamais dans « tâches réalisées aujourd'hui ». Le
--   trigger la pose quel que soit le chemin d'écriture.
--
--  Isolation tenant : RLS via app.current_tenant (réglage canonique posé
--  par server/db/pool.ts → tenantQuery).
--
--  Idempotent : IF NOT EXISTS + DROP POLICY IF EXISTS partout.
-- ====================================================================
BEGIN;

-- ────────────────────────────────────────────────────────────────────
--  1. CONFIGURATION PAR ESPACE
--
--  Les heures sont exprimées dans le fuseau du tenant (`timezone`), pas
--  en UTC : « rapport à 18 h » doit vouloir dire 18 h à Oujda, quel que
--  soit le fuseau du serveur (UTC en production).
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_settings (
  tenant_id   UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Interrupteur général : FALSE = plus aucun envoi automatique.
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  timezone    TEXT    NOT NULL DEFAULT 'Africa/Casablanca',

  -- Destinataires. Tableau vide = tous les admins de l'espace (défaut).
  recipients  TEXT[]  NOT NULL DEFAULT '{}',

  -- Canaux
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  inapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- 1. Alerte tâches en retard / non terminées
  tasks_alert_enabled BOOLEAN  NOT NULL DEFAULT TRUE,
  tasks_alert_hour    SMALLINT NOT NULL DEFAULT 9
                        CHECK (tasks_alert_hour BETWEEN 0 AND 23),
  -- Une tâche sans échéance, jamais touchée depuis N jours, est « dormante ».
  -- Sans ce seuil, l'alerte listerait les 1 200 tâches de backlog.
  tasks_stale_days    SMALLINT NOT NULL DEFAULT 7
                        CHECK (tasks_stale_days BETWEEN 1 AND 365),

  -- 2. Alerte clients / prospects à contacter
  contacts_alert_enabled BOOLEAN  NOT NULL DEFAULT TRUE,
  contacts_alert_hour    SMALLINT NOT NULL DEFAULT 10
                           CHECK (contacts_alert_hour BETWEEN 0 AND 23),
  -- Un client dont le dernier contact remonte à plus de N jours est à relancer.
  contact_delay_days     SMALLINT NOT NULL DEFAULT 14
                           CHECK (contact_delay_days BETWEEN 1 AND 365),
  -- Un prospect créé il y a moins de N jours n'est pas encore « en retard
  -- de premier contact » — laisse le temps de traiter l'arrivée du jour.
  new_lead_grace_days    SMALLINT NOT NULL DEFAULT 2
                           CHECK (new_lead_grace_days BETWEEN 0 AND 90),

  -- 3. Rapport quotidien — le soir : ce qui a été fait dans la journée.
  daily_report_enabled BOOLEAN  NOT NULL DEFAULT TRUE,
  daily_report_hour    SMALLINT NOT NULL DEFAULT 18
                         CHECK (daily_report_hour BETWEEN 0 AND 23),

  -- 4. Rapport hebdomadaire — lundi matin : bilan 7 jours + plan de la semaine.
  weekly_report_enabled BOOLEAN  NOT NULL DEFAULT TRUE,
  weekly_report_hour    SMALLINT NOT NULL DEFAULT 8
                          CHECK (weekly_report_hour BETWEEN 0 AND 23),
  -- Jour ISO : 1 = lundi … 7 = dimanche
  weekly_report_weekday SMALLINT NOT NULL DEFAULT 1
                          CHECK (weekly_report_weekday BETWEEN 1 AND 7),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notification_settings IS
  'Configuration des notifications et rapports automatiques, par espace. Heures exprimées dans le fuseau `timezone`.';

-- ────────────────────────────────────────────────────────────────────
--  2. NOTIFICATIONS PERSISTÉES (cloche in-app)
--
--  Une ligne PAR destinataire : l'état « lu » est individuel. Le store
--  localStorage existant (src/lib/notificationStore.ts) reste en place
--  pour les événements temps réel du navigateur ; cette table porte ce
--  qui est produit côté serveur, donc survit à la déconnexion, au
--  changement de poste et au vidage du cache.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,

  kind       TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'info'
               CHECK (severity IN ('info','success','warning','critical')),
  title      TEXT NOT NULL,
  message    TEXT,
  link       TEXT,
  icon       TEXT,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Clé d'anti-doublon : « tasks_overdue:2026-08-16 ». Deux exécutions du
  -- même jour ne créent qu'une notification.
  dedupe_key TEXT,

  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.notifications (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications (tenant_id, user_id) WHERE is_read = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_dedupe
  ON public.notifications (tenant_id, user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
--  3. JOURNAL D'EXÉCUTION + VERROU D'IDEMPOTENCE
--
--  L'index unique partiel est le cœur du mécanisme : l'exécution
--  automatique commence par tenter l'INSERT de sa ligne (tenant, type,
--  jour). Si la ligne existe déjà, l'envoi n'a pas lieu. Deux instances
--  du serveur, ou un redémarrage à 18 h 02, ne peuvent donc pas envoyer
--  deux fois le rapport du jour.
--
--  Les exécutions manuelles (bouton « Envoyer maintenant ») sont hors
--  index : on peut re-déclencher un rapport autant de fois qu'on veut.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  kind           TEXT NOT NULL
                   CHECK (kind IN ('tasks_overdue','clients_to_contact','daily_report','weekly_report')),
  -- Jour LOCAL du tenant (pas UTC) : c'est lui qui définit « aujourd'hui ».
  run_date       DATE NOT NULL,
  scheduled_hour SMALLINT,
  trigger        TEXT NOT NULL DEFAULT 'auto' CHECK (trigger IN ('auto','manual')),

  status         TEXT NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running','ok','empty','error')),
  attempt        SMALLINT NOT NULL DEFAULT 1,

  recipients     INTEGER NOT NULL DEFAULT 0,
  emails_sent    INTEGER NOT NULL DEFAULT 0,
  emails_failed  INTEGER NOT NULL DEFAULT 0,
  -- Compteurs du rapport (nb tâches en retard, nb clients à contacter…) :
  -- permet d'afficher l'historique sans recalculer.
  summary        JSONB   NOT NULL DEFAULT '{}'::jsonb,
  error          TEXT,

  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_runs_auto
  ON public.notification_runs (tenant_id, kind, run_date)
  WHERE trigger = 'auto';
CREATE INDEX IF NOT EXISTS idx_notification_runs_tenant
  ON public.notification_runs (tenant_id, started_at DESC);

COMMENT ON INDEX public.uniq_notification_runs_auto IS
  'Verrou d''idempotence : un seul envoi automatique par espace, par type et par jour local.';

-- ────────────────────────────────────────────────────────────────────
--  4. clients.date_dernier_contact
--
--  La table clients ne gardait aucune trace de la dernière prise de
--  contact — impossible de répondre à « quels clients n'ai-je pas encore
--  contactés ». La colonne est posée ici, puis renseignée à partir de
--  l'historique déjà en base pour que la première alerte soit juste.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS date_dernier_contact TIMESTAMPTZ;

COMMENT ON COLUMN public.clients.date_dernier_contact IS
  'Dernier contact enregistré (appel, email, RDV). NULL = jamais contacté. Alimenté par le bouton « Marquer comme contacté » et par le backfill de la migration 086.';

CREATE INDEX IF NOT EXISTS idx_clients_dernier_contact
  ON public.clients (tenant_id, date_dernier_contact NULLS FIRST);

-- Backfill : dernière trace d'activité connue pour chaque client.
-- On ne touche QUE les lignes encore à NULL — re-runnable sans écraser
-- une saisie manuelle faite entre-temps.
-- Colonnes utilisées volontairement communes aux deux générations de
-- schéma (date_emission / created_at), jamais les colonnes qui ont
-- divergé entre les migrations et la base vivante.
UPDATE public.clients c
   SET date_dernier_contact = s.last_touch
  FROM (
    SELECT x.client_id, MAX(x.ts) AS last_touch
      FROM (
        SELECT d.client_id, d.date_emission::timestamptz AS ts
          FROM public.devis d     WHERE d.client_id IS NOT NULL
        UNION ALL
        SELECT f.client_id, f.date_emission::timestamptz
          FROM public.factures f  WHERE f.client_id IS NOT NULL
        UNION ALL
        SELECT p.client_id, p.created_at
          FROM public.paiements p WHERE p.client_id IS NOT NULL
        UNION ALL
        SELECT pr.client_id, pr.created_at
          FROM public.projets pr  WHERE pr.client_id IS NOT NULL
      ) x
     GROUP BY x.client_id
  ) s
 WHERE s.client_id = c.id
   AND c.date_dernier_contact IS NULL;

-- ────────────────────────────────────────────────────────────────────
--  5. completed_at fiable sur les tâches
--
--  Sans ça, « tâches réalisées aujourd'hui » repose sur updated_at, qui
--  bouge à chaque édition (même un an après la clôture).
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_task_stamp_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND COALESCE(OLD.status, '') <> 'done' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());
  ELSIF NEW.status <> 'done' AND COALESCE(OLD.status, '') = 'done' THEN
    -- Tâche ré-ouverte : elle ne doit plus compter comme réalisée.
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_team_tasks_completed_at ON public.team_member_tasks;
CREATE TRIGGER trg_team_tasks_completed_at
  BEFORE UPDATE OF status ON public.team_member_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_task_stamp_completed_at();

-- Rattrapage : les tâches déjà « done » sans date de fin prennent leur
-- updated_at, meilleure approximation disponible.
UPDATE public.team_member_tasks
   SET completed_at = updated_at
 WHERE status = 'done' AND completed_at IS NULL;

-- ────────────────────────────────────────────────────────────────────
--  6. updated_at automatique sur la configuration
-- ────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────
--  7. RLS — isolation par espace
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['notification_settings','notifications','notification_runs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_delete_' || t, t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (tenant_id = current_tenant_id())',
      'rls_select_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (tenant_id = current_tenant_id())',
      'rls_insert_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      'rls_update_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (tenant_id = current_tenant_id())',
      'rls_delete_' || t, t);
  END LOOP;
END $$;

-- Interdit le déplacement d'une ligne vers un autre espace (même garde-fou
-- que les autres tables tenant, cf. migration 046).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_tenant_id_change') THEN
    DROP TRIGGER IF EXISTS trg_notifications_lock_tenant ON public.notifications;
    CREATE TRIGGER trg_notifications_lock_tenant
      BEFORE UPDATE OF tenant_id ON public.notifications
      FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

    DROP TRIGGER IF EXISTS trg_notification_runs_lock_tenant ON public.notification_runs;
    CREATE TRIGGER trg_notification_runs_lock_tenant
      BEFORE UPDATE OF tenant_id ON public.notification_runs
      FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();
  END IF;
END $$;

-- Droits pour le rôle d'exécution soumis à la RLS (migration 082).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.notification_settings, public.notifications, public.notification_runs
      TO gestiq_rls;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
--  8. Activation par défaut sur les espaces RÉELLEMENT utilisés
--
--  Le système doit tourner sans qu'on ait à l'allumer (c'est la demande).
--  Mais la base contient des dizaines d'espaces de test (@example.test,
--  slugs tst-*) : leur envoyer un rapport quotidien serait du bruit et
--  du quota email brûlé. On n'active donc que les espaces qui ont un
--  admin joignable ET un volume de données réel.
--
--  Les autres restent activables en un clic depuis Paramètres →
--  Notifications (l'API crée la ligne à la première ouverture).
-- ────────────────────────────────────────────────────────────────────
INSERT INTO public.notification_settings (tenant_id)
SELECT t.id
  FROM public.tenants t
 WHERE t.is_active
   AND EXISTS (
     SELECT 1 FROM public.tenant_users tu
       JOIN public.users u ON u.id = tu.user_id
      WHERE tu.tenant_id = t.id
        AND tu.role = 'admin'
        AND u.email IS NOT NULL
        AND u.email NOT LIKE '%@example.test'
        AND u.is_active IS NOT FALSE
   )
   AND (
     (SELECT count(*) FROM public.clients           c WHERE c.tenant_id = t.id) +
     (SELECT count(*) FROM public.prospects         p WHERE p.tenant_id = t.id) +
     (SELECT count(*) FROM public.team_member_tasks k WHERE k.tenant_id = t.id)
   ) >= 10
ON CONFLICT (tenant_id) DO NOTHING;

COMMIT;
