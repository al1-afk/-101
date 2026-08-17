-- ====================================================================
--  Migration 088 : RAPPELS DE TÂCHES (5 min / 30 min / 1 jour avant)
--                  + abonnements Web Push (navigateur, PWA Mac)
--
--  Objectif : être prévenu AVANT l'échéance, pas après. Le module 086
--  signale déjà les tâches en retard ; celui-ci intervient en amont,
--  au moment où l'on peut encore agir.
--
--  ── Pourquoi une heure d'échéance ──────────────────────────────────
--  `team_member_tasks.due_date` est une DATE. « Rappelle-moi 5 minutes
--  avant » n'a aucun sens sans heure : 5 minutes avant quoi ? On ajoute
--  donc `due_time`, facultative. Une tâche datée sans heure est traitée
--  comme due à l'heure par défaut de la personne (09:00 au départ) —
--  ce qui rend le rappel « 1 jour avant » utile même sans heure précise.
--
--  ── Pourquoi `reminder_offsets` peut valoir NULL ───────────────────
--  Trois états, et ils sont tous utiles :
--    NULL  → « utilise mes réglages par défaut » (cas général)
--    '{}'  → « aucun rappel sur CETTE tâche » (choix explicite)
--    '{5}' → rappels sur mesure pour cette tâche
--  Un simple DEFAULT '{30,1440}' aurait écrasé la distinction entre
--  « je n'ai rien choisi » et « je n'en veux pas ».
--
--  ── Tables créées ─────────────────────────────────────────────────
--   task_reminder_prefs   défauts par personne : offsets, heure
--                         supposée, canaux (email / push / cloche).
--   push_subscriptions    un abonnement Web Push = un navigateur. Une
--                         même personne en a plusieurs (Mac, portable,
--                         PWA installée) et reçoit sur chacun.
--   task_reminders_sent   verrou d'idempotence : (tâche, offset,
--                         échéance visée). Déplacer l'échéance d'une
--                         tâche RÉARME donc ses rappels, ce qui est le
--                         comportement attendu.
--
--  Idempotent : IF NOT EXISTS + DROP … IF EXISTS partout.
-- ====================================================================
BEGIN;

-- ────────────────────────────────────────────────────────────────────
--  1. HEURE D'ÉCHÉANCE ET RAPPELS SUR LA TÂCHE
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS due_time TIME;

ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS reminder_offsets INTEGER[];

COMMENT ON COLUMN public.team_member_tasks.due_time IS
  'Heure d''échéance (fuseau de l''espace). NULL = heure par défaut de la personne';
COMMENT ON COLUMN public.team_member_tasks.reminder_offsets IS
  'Minutes avant l''échéance. NULL = défauts de la personne, {} = aucun rappel';

-- Un rappel n'a de sens que sur une tâche encore ouverte. « Annulée »
-- est un statut de premier plan (migration 051, et le menu de statut de
-- ProjetDetail le propose) : l'exclure ici ET dans le planificateur est
-- la même règle que partout ailleurs dans le dépôt — reportData.ts et
-- les cinq écrans de tâches filtrent déjà `NOT IN ('done','cancelled')`.
DROP INDEX IF EXISTS public.idx_team_tasks_due_pending;
CREATE INDEX IF NOT EXISTS idx_team_tasks_due_pending
  ON public.team_member_tasks (tenant_id, due_date)
  WHERE due_date IS NOT NULL AND status NOT IN ('done', 'cancelled');

-- Les rappels portés par la TÂCHE méritent le même garde-fou que ceux
-- des préférences : ils entrent par le CRUD générique, qui ne valide
-- rien. Sans cette contrainte, un client mal intentionné (ou un bug)
-- pourrait poser 500 rappels sur une tâche.
ALTER TABLE public.team_member_tasks
  DROP CONSTRAINT IF EXISTS team_member_tasks_reminder_offsets_ck;
ALTER TABLE public.team_member_tasks
  ADD CONSTRAINT team_member_tasks_reminder_offsets_ck
  CHECK (
    reminder_offsets IS NULL
    OR array_length(reminder_offsets, 1) IS NULL
    OR (array_length(reminder_offsets, 1) <= 5
        AND 0 <= ALL(reminder_offsets)
        AND 43200 >= ALL(reminder_offsets))
  );

-- ────────────────────────────────────────────────────────────────────
--  2. PRÉFÉRENCES DE RAPPEL (par personne)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_reminder_prefs (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,

  -- 30 min et 1 jour par défaut : de quoi se préparer la veille et
  -- d'être repris juste avant. Le rappel à 5 min reste un choix, il
  -- n'a de sens que sur une tâche à heure fixe.
  default_offsets INTEGER[] NOT NULL DEFAULT '{30,1440}',

  -- Heure supposée d'une tâche datée sans heure.
  default_due_time TIME NOT NULL DEFAULT '09:00',

  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  inapp_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, user_id)
);

-- Un offset est un nombre de minutes avant l'échéance : ni négatif, ni
-- au-delà d'un mois (43 200 min), et pas plus de 5 rappels par tâche —
-- au sixième, ce n'est plus un rappel, c'est du harcèlement.
ALTER TABLE public.task_reminder_prefs
  DROP CONSTRAINT IF EXISTS task_reminder_prefs_offsets_ck;
ALTER TABLE public.task_reminder_prefs
  ADD CONSTRAINT task_reminder_prefs_offsets_ck
  CHECK (
    array_length(default_offsets, 1) IS NULL
    OR (array_length(default_offsets, 1) <= 5
        AND 0 <= ALL(default_offsets)
        AND 43200 >= ALL(default_offsets))
  );

COMMENT ON TABLE public.task_reminder_prefs IS
  'Rappels de tâches — défauts et canaux, par personne';

-- ────────────────────────────────────────────────────────────────────
--  3. ABONNEMENTS WEB PUSH
--
--  Un abonnement = un navigateur sur un appareil. L'`endpoint` est
--  l'URL fournie par le service de push (FCM pour Chrome, Mozilla
--  autopush pour Firefox…) : il identifie l'abonnement de façon unique,
--  d'où la contrainte globale. Réinstaller la PWA en crée un nouveau ;
--  l'ancien devient invalide et le serveur le supprime au premier 404.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,

  endpoint TEXT NOT NULL,
  -- Clés de chiffrement du navigateur (protocole Web Push) : le serveur
  -- chiffre le message pour ce destinataire, le service de push ne peut
  -- pas le lire.
  p256dh   TEXT NOT NULL,
  auth     TEXT NOT NULL,

  user_agent TEXT,
  label      TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_push_subscriptions_endpoint
  ON public.push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (tenant_id, user_id);

COMMENT ON TABLE public.push_subscriptions IS
  'Abonnements Web Push (un par navigateur/appareil) — notifications hors application';

-- ────────────────────────────────────────────────────────────────────
--  4. VERROU D'IDEMPOTENCE DES ENVOIS
--
--  La clé porte l'échéance VISÉE, pas seulement la tâche : repousser
--  une tâche à demain réarme naturellement ses rappels, sans qu'on ait
--  à nettoyer quoi que ce soit.
--
--  ── Pourquoi `due_key` et non l'instant `due_at` ───────────────────
--  `due_at` est CALCULÉ : date + heure de la tâche, résolues avec
--  l'heure par défaut de la personne et le fuseau de l'espace. Ces deux
--  réglages sont modifiables. Prendre l'instant comme clé ferait donc
--  qu'un simple passage de « 09:00 » à « 10:00 » dans les préférences
--  change la clé de TOUTES les tâches sans heure — et renvoie des
--  rappels déjà partis.
--
--  `due_key` ne retient que ce que la personne a réellement saisi sur
--  la tâche : « 2026-08-18T14:00 », ou « 2026-08-18T~ » quand l'heure
--  est laissée vide. Elle ne change que si l'ÉCHÉANCE change, ce qui
--  est exactement le moment où un nouveau rappel est légitime.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_reminders_sent (
  task_id    UUID NOT NULL REFERENCES public.team_member_tasks(id) ON DELETE CASCADE,
  offset_min INTEGER NOT NULL,
  -- Instant visé, conservé pour l'analyse (« ce rappel visait quand ? »).
  due_at     TIMESTAMPTZ NOT NULL,

  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  channels   TEXT[] NOT NULL DEFAULT '{}',
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (task_id, offset_min, due_at)
);

-- Clé stable de l'échéance SAISIE (voir l'explication ci-dessus).
-- Ajoutée par ALTER pour reprendre proprement une base où la 088 avait
-- déjà tourné avec l'ancienne clé.
ALTER TABLE public.task_reminders_sent
  ADD COLUMN IF NOT EXISTS due_key TEXT;

UPDATE public.task_reminders_sent
   SET due_key = to_char(due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI')
 WHERE due_key IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.task_reminders_sent WHERE due_key IS NULL) THEN
    RAISE EXCEPTION 'due_key non renseignée — reprise impossible';
  END IF;
  ALTER TABLE public.task_reminders_sent ALTER COLUMN due_key SET NOT NULL;

  -- Bascule de clé primaire : (tâche, offset, échéance saisie).
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.task_reminders_sent'::regclass
       AND contype = 'p'
       AND pg_get_constraintdef(oid) LIKE '%due_at%'
  ) THEN
    ALTER TABLE public.task_reminders_sent DROP CONSTRAINT task_reminders_sent_pkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.task_reminders_sent'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.task_reminders_sent
      ADD CONSTRAINT task_reminders_sent_pkey PRIMARY KEY (task_id, offset_min, due_key);
  END IF;
END $$;

-- Purge : les rappels d'il y a plus de 90 jours n'apprennent plus rien.
-- Elle est exécutée par le planificateur (server/lib/taskReminderScheduler.ts,
-- purgeOldReminders) — cet index est là pour elle.
CREATE INDEX IF NOT EXISTS idx_task_reminders_sent_at
  ON public.task_reminders_sent (sent_at);

COMMENT ON TABLE public.task_reminders_sent IS
  'Verrou anti-doublon des rappels de tâches — (tâche, offset, échéance visée)';

-- ────────────────────────────────────────────────────────────────────
--  5. updated_at automatique
-- ────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_task_reminder_prefs_updated_at ON public.task_reminder_prefs;
CREATE TRIGGER trg_task_reminder_prefs_updated_at
  BEFORE UPDATE ON public.task_reminder_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────
--  6. RLS — isolation par espace
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['task_reminder_prefs', 'push_subscriptions', 'task_reminders_sent']
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

COMMIT;
