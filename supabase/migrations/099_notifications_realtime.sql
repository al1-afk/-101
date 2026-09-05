-- ════════════════════════════════════════════════════════════════════
--  GestiQ — Migration 099 : notifications multi-appareils + temps réel
--  Date : 2026-09-03
--
--  Le socle existe déjà (086 : cloche et rapports ; 088 : Web Push).
--  Cette migration ne le remplace pas, elle lui ajoute ce qui manque
--  pour qu'une notification atteigne TOUS les appareils d'une personne
--  et que l'état « lu » se propage instantanément entre eux.
--
--  ── 1. Un curseur monotone : notifications.seq ─────────────────────
--  Le flux temps réel (SSE) doit pouvoir reprendre après une coupure
--  sans perdre ni rejouer. Un curseur sur created_at est faux : deux
--  notifications de la même milliseconde sont indiscernables, et
--  « > created_at » en saute une. Une séquence donne un ordre total.
--
--  ── 2. `kind` ET `event` : deux notions, deux colonnes ─────────────
--  `kind` est la CATÉGORIE D'E-MAIL de l'espace (7 valeurs, migration
--  096 : le commutateur « quels e-mails partent vraiment »).
--  `event` est le TYPE D'ÉVÉNEMENT pour les préférences personnelles
--  (10 valeurs : commentaire, message, tâche terminée…). Les deux ne
--  se recouvrent pas — un « fichier ajouté » n'a pas de catégorie
--  d'e-mail — et les confondre aurait obligé à choisir entre réglage
--  d'espace et réglage personnel.
--
--  ── 3. Registre d'appareils : on ÉTEND push_subscriptions ──────────
--  Créer une table jumelle `user_devices` aurait imposé une double
--  écriture : six sites d'appel, un UPSERT sur (endpoint) et un
--  élagage MAX_DEVICES_PER_USER dépendent déjà de cette table. On lui
--  ajoute donc les colonnes du registre demandé (device_id, platform,
--  browser, push_token, last_active) au lieu d'un second inventaire
--  qui divergerait au premier incident.
--  `last_seen_at` n'est PAS renommée : push.ts et webPush.ts l'écrivent
--  et la lisent. Elle est exposée au client sous le nom `last_active`.
--
--  ── 4. Préférences : absence = tout activé ─────────────────────────
--  notification_prefs ne contient QUE les écarts au défaut. Pas de
--  ligne → tout est activé ; une clé absente de `events` → défaut du
--  serveur. C'est la convention de la maison (COALESCE(..., TRUE)
--  partout) et elle a une raison : un incident de base ne doit jamais
--  faire taire le produit. Un nouvel événement n'exige alors ni
--  migration ni reprise de données.
--
--  ── VOLONTAIREMENT INCHANGÉS ───────────────────────────────────────
--  * notifications.user_id reste NOT NULL → users(id). Un employé
--    ACTIF possède déjà une ligne users (créée à l'acceptation de son
--    invitation) et son jeton la porte : il est donc adressable sans
--    rien changer au schéma. Le rendre nullable pour y loger un
--    team_members.id aurait obligé à scinder uniq_notifications_dedupe,
--    dont trois INSERT citent la spécification mot pour mot — ils
--    auraient échoué en 42P10 à l'intérieur des schedulers, pendant
--    qu'un quatrième continuait de fonctionner.
--  * uniq_notifications_dedupe : pas touché, pour la même raison.
--
--  Conformité ARCHITECTURE_TENANT.md :
--    - tenant_id NOT NULL FK CASCADE
--    - RLS forcé + 4 policies ; app.current_tenant via current_tenant_id()
--    - triggers set_updated_at + prevent_tenant_id_change
--    - GRANT à gestiq_api ET gestiq_rls (le dépôt est inconsistant :
--      086→rls, 095/098→api, 088→aucun ; on donne les deux)
--
--  Idempotent : re-jouable sans effet de bord.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1) CURSEUR MONOTONE SUR LES NOTIFICATIONS
-- ────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.notifications_seq_seq;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS seq bigint;

ALTER TABLE public.notifications
  ALTER COLUMN seq SET DEFAULT nextval('public.notifications_seq_seq');

-- Reprise des lignes existantes. Ordre chronologique pour que le
-- curseur reflète l'ordre d'apparition et pas l'ordre physique.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.notifications WHERE seq IS NULL ORDER BY created_at, id
  LOOP
    UPDATE public.notifications
       SET seq = nextval('public.notifications_seq_seq')
     WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.notifications ALTER COLUMN seq SET NOT NULL;
ALTER SEQUENCE public.notifications_seq_seq OWNED BY public.notifications.seq;

-- L'index qui sert la reprise du flux : « mes lignes après ce curseur ».
CREATE INDEX IF NOT EXISTS idx_notifications_user_seq
  ON public.notifications (tenant_id, user_id, seq DESC);

-- ────────────────────────────────────────────────────────────────────
-- 2) COLONNES D'ÉVÉNEMENT, D'AUTEUR ET DE DIAGNOSTIC
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event          text,
  ADD COLUMN IF NOT EXISTS urgent         boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS actor_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_name     text,
  -- Provenance / affichage seulement : jamais une clé de distribution,
  -- jamais un filtre. Les index (tenant_id, user_id) restent suffisants.
  ADD COLUMN IF NOT EXISTS team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  -- Canaux réellement servis : la réponse à « je n'ai rien reçu »,
  -- sans table d'audit supplémentaire.
  ADD COLUMN IF NOT EXISTS channels       text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.notifications.event IS
  'Type d''événement pour les préférences personnelles (comment_new, task_completed…). Distinct de `kind`, qui est la catégorie d''e-mail de l''espace.';
COMMENT ON COLUMN public.notifications.seq IS
  'Curseur monotone : reprise sans perte du flux temps réel après coupure.';

-- ────────────────────────────────────────────────────────────────────
-- 3) REGISTRE D'APPAREILS (extension de push_subscriptions)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.push_subscriptions
  -- Identifiant stable du poste, généré côté client et conservé hors
  -- du préfixe gestiq_ : la déconnexion ne doit pas transformer le même
  -- téléphone en « nouvel appareil » à chaque session.
  ADD COLUMN IF NOT EXISTS device_id    text,
  ADD COLUMN IF NOT EXISTS platform     text    NOT NULL DEFAULT 'web',
  -- browser | pwa | capacitor : d'où l'abonnement a été pris.
  ADD COLUMN IF NOT EXISTS app_kind     text    NOT NULL DEFAULT 'browser',
  ADD COLUMN IF NOT EXISTS provider     text    NOT NULL DEFAULT 'webpush',
  ADD COLUMN IF NOT EXISTS browser      text,
  ADD COLUMN IF NOT EXISTS os           text,
  -- Jeton d'un transport natif (FCM/APNs). Nul pour le Web Push, qui
  -- utilise endpoint + p256dh + auth.
  ADD COLUMN IF NOT EXISTS push_token   text,
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT TRUE;

-- Une ligne native n'a ni endpoint ni clés : ces colonnes ne peuvent
-- plus être NOT NULL. La contrainte de forme ci-dessous garantit qu'une
-- ligne reste toujours livrable par UN transport.
ALTER TABLE public.push_subscriptions ALTER COLUMN endpoint DROP NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN p256dh   DROP NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN auth     DROP NOT NULL;

-- ADD CONSTRAINT n'a pas de IF NOT EXISTS : on garde le contrôle.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_platform_check') THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_platform_check
      CHECK (platform IN ('web','android','ios','desktop'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_provider_check') THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_provider_check
      CHECK (provider IN ('webpush','fcm','apns'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_transport_check') THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_transport_check
      CHECK (
        (provider =  'webpush' AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL)
        OR
        (provider <> 'webpush' AND push_token IS NOT NULL)
      );
  END IF;
END $$;

-- Partiel : les nombreux NULL des lignes Web Push ne se heurtent pas,
-- et ON CONFLICT (endpoint) continue d'inférer son propre index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_push_subscriptions_token
  ON public.push_subscriptions (push_token) WHERE push_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device
  ON public.push_subscriptions (tenant_id, user_id, device_id) WHERE device_id IS NOT NULL;

-- Le verrou de tenant que la migration 088 avait oublié.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_tenant_id_change') THEN
    DROP TRIGGER IF EXISTS trg_lock_tenant_push_subscriptions ON public.push_subscriptions;
    CREATE TRIGGER trg_lock_tenant_push_subscriptions
      BEFORE UPDATE OF tenant_id ON public.push_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();
  END IF;
END $$;

-- 088 n'accordait rien : en production, gestiq_api n'aurait aucun droit
-- sur cette table si le GRANT par défaut de 082 ne l'avait pas couverte.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO gestiq_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO gestiq_rls;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 4) PRÉFÉRENCES PERSONNELLES DE NOTIFICATION
--
--  Même forme de clé que task_reminder_prefs (088) et time_settings
--  (087) : (tenant_id, user_id). Elle fonctionne pour les DEUX
--  populations — patron comme employé — puisque toutes deux possèdent
--  une ligne users.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,

  -- Canaux (requirement « Paramètres → Notifications »)
  mobile_enabled    BOOLEAN NOT NULL DEFAULT TRUE,   -- push téléphone
  desktop_enabled   BOOLEAN NOT NULL DEFAULT TRUE,   -- push / notification système ordinateur
  inapp_enabled     BOOLEAN NOT NULL DEFAULT TRUE,   -- cloche
  sound_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  vibration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  urgent_enabled    BOOLEAN NOT NULL DEFAULT TRUE,   -- traverse les heures calmes

  -- Écarts au défaut UNIQUEMENT, par événement :
  --   {"file_added": {"email": false}, "mention": {"push": true}}
  -- Une clé absente = défaut serveur (EVENT_DEFAULTS).
  events JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Heures calmes : pas de push entre quiet_start et quiet_end (heure
  -- locale de l'espace). L'urgent passe outre si urgent_enabled.
  quiet_start SMALLINT CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end   SMALLINT CHECK (quiet_end   BETWEEN 0 AND 23),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, user_id)
);

COMMENT ON TABLE public.notification_prefs IS
  'Préférences de notification par personne (canaux + événements). Absence de ligne = tout activé.';

DROP TRIGGER IF EXISTS trg_notification_prefs_updated_at ON public.notification_prefs;
CREATE TRIGGER trg_notification_prefs_updated_at
  BEFORE UPDATE ON public.notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_tenant_id_change') THEN
    DROP TRIGGER IF EXISTS trg_lock_tenant_notification_prefs ON public.notification_prefs;
    CREATE TRIGGER trg_lock_tenant_notification_prefs
      BEFORE UPDATE OF tenant_id ON public.notification_prefs
      FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();
  END IF;
END $$;

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_prefs FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_notification_prefs ON public.notification_prefs;
DROP POLICY IF EXISTS rls_insert_notification_prefs ON public.notification_prefs;
DROP POLICY IF EXISTS rls_update_notification_prefs ON public.notification_prefs;
DROP POLICY IF EXISTS rls_delete_notification_prefs ON public.notification_prefs;
-- current_tenant_id() lit app.current_tenant (défini par pool.ts).
-- Écrire « app.current_tenant_id » n'échoue pas : cela refuse toutes
-- les lignes, en silence — c'est le post-mortem de la migration 081.
CREATE POLICY rls_select_notification_prefs ON public.notification_prefs FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_notification_prefs ON public.notification_prefs FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_notification_prefs ON public.notification_prefs FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_notification_prefs ON public.notification_prefs FOR DELETE USING (tenant_id = current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs TO gestiq_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs TO gestiq_rls;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 5) MENTIONS @ DANS LES MESSAGES DE PROJET
--
--  Résolues à l'ÉCRITURE : renommer un membre plus tard ne doit pas
--  changer qui a été notifié.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.projet_messages
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_projet_messages_mentions
  ON public.projet_messages USING GIN (mentioned_user_ids);

-- ────────────────────────────────────────────────────────────────────
-- 6) STATUT « BLOQUÉ » SUR LES TÂCHES
--
--  « L'employé demande mon intervention » n'avait aucun verbe : un
--  membre bloqué ne pouvait que laisser sa tâche en cours.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS blocked_reason text;

-- Même nom et même forme qu'en 051 : on reprend la liste EXISTANTE
-- ('cancelled' comprise — la migration 090 s'en sert) et on y ajoute
-- 'blocked'. Réécrire la liste de mémoire aurait invalidé les tâches
-- annulées déjà en base.
ALTER TABLE public.team_member_tasks DROP CONSTRAINT IF EXISTS team_member_tasks_status_check;
ALTER TABLE public.team_member_tasks ADD CONSTRAINT team_member_tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'validation', 'done', 'cancelled', 'blocked'));

COMMIT;

-- Vérification :
--   \d public.notification_prefs
--   \d public.push_subscriptions
--   SELECT max(seq), count(*) FROM public.notifications;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.team_member_tasks'::regclass AND contype = 'c';
--
--  APRÈS APPLICATION EN PRODUCTION : redémarrer le conteneur API.
--  server/db/tenantColumns.ts met en cache, pour la durée du process,
--  la liste des tables portant tenant_id ; sans redémarrage,
--  notification_prefs perd son filtre applicatif tenant_id = $n (la RLS
--  tient toujours, mais la défense en profondeur tombe à une couche).
