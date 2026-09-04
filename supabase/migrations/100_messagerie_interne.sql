-- ════════════════════════════════════════════════════════════════════
--  GestiQ / NEXT GITAL — Migration 100 : MESSAGERIE INTERNE (1-to-1)
--  Date : 2026-09-03
--
--  ── Ce que ce module N'EST PAS ──────────────────────────────────────
--  Ce n'est ni la discussion de projet (projet_messages, migration 053
--  + 095), ni les commentaires de tâche, ni les SOP. Ces fils-là sont
--  attachés à un OBJET de travail et visibles par tous ceux qui y
--  travaillent. Ici, c'est l'inverse : un canal PRIVÉ entre deux
--  personnes, sans objet métier, pour « peux-tu passer me voir ? ».
--  Mélanger les deux aurait rendu impossible d'écrire à quelqu'un sans
--  choisir d'abord un projet — et aurait exposé des messages personnels
--  à tous les assignés du projet.
--
--  ── Pourquoi une paire (user_a, user_b) et pas une table membres ────
--  Le cahier des charges est catégorique : une conversation privée ne
--  contient JAMAIS trois personnes. Une table `conversation_members`
--  rendrait cette règle dépendante du code applicatif — il suffirait
--  d'un INSERT de trop pour qu'un employé lise le fil d'un autre.
--  Avec deux colonnes et une contrainte d'unicité, la règle est portée
--  par le schéma : ajouter un tiers est structurellement impossible.
--  L'ordre canonique (user_a < user_b) garantit en prime qu'il ne peut
--  pas exister deux conversations pour la même paire.
--
--  ── Pourquoi les accusés vivent sur le message ──────────────────────
--  Une table `message_receipts` est la bonne réponse pour un fil de
--  groupe (N destinataires par message). Dans un 1-to-1 il y a
--  exactement UN destinataire : `delivered_at` / `read_at` posés sur la
--  ligne du message disent la même chose, sans jointure ni ligne
--  supplémentaire par message. Le compteur de non-lus devient un simple
--  COUNT sur index partiel.
--
--  ── Sécurité : la RLS connaît la PERSONNE, pas seulement l'espace ───
--  Partout ailleurs dans ce dépôt, la RLS isole les espaces
--  (tenant_id = current_tenant_id()). Ce n'est pas suffisant ici : Amin
--  et Yassine appartiennent au MÊME espace, et Amin ne doit rien voir
--  du fil Admin ↔ Yassine, même en forgeant un identifiant dans l'URL.
--  Les politiques ci-dessous ajoutent donc la condition « je suis l'un
--  des deux participants », lue depuis `app.current_user_id` — la
--  variable de session que server/db/pool.ts pose déjà pour l'audit.
--
--  CONSÉQUENCE POUR LE CODE : toute requête sur ces tables DOIT passer
--  l'utilisateur agissant à tenantQuery/tenantTransaction (4e argument).
--  Sans lui, current_app_user_id() vaut NULL et la requête ne renvoie
--  RIEN. C'est délibéré : en cas d'oubli, on échoue de façon visible
--  plutôt que d'ouvrir silencieusement les fils de tout le monde.
--
--  Idempotent (IF NOT EXISTS / DROP … IF EXISTS partout).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────
--  0. QUI EST L'UTILISATEUR COURANT ?
--
--  Pendant de current_tenant_id() (migration 004/007), pour la personne
--  au lieu de l'espace. `true` en second argument de current_setting :
--  la variable peut ne pas être posée du tout — on veut NULL, pas une
--  erreur.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

COMMENT ON FUNCTION public.current_app_user_id() IS
  'Utilisateur agissant, lu depuis app.current_user_id (posé par server/db/pool.ts). NULL si non renseigné — les politiques de la messagerie refusent alors tout.';

-- ────────────────────────────────────────────────────────────────────
--  1. CONVERSATIONS — exactement deux personnes, à jamais
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  /* Ordre canonique : user_a est toujours le plus petit UUID des deux.
     C'est ce qui rend l'unicité de la paire vérifiable par un index. */
  user_a               uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_b               uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  /* Dénormalisation assumée : la liste des conversations affiche le
     dernier message et se trie dessus. Sans ces trois colonnes, ouvrir
     l'écran Messages coûterait une sous-requête par correspondant. */
  last_message_at      timestamptz,
  last_message_preview text,
  last_sender_id       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT NOW(),
  updated_at           timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT dm_conversations_pair_order CHECK (user_a < user_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dm_conversations_pair
  ON public.dm_conversations (tenant_id, user_a, user_b);
CREATE INDEX IF NOT EXISTS idx_dm_conv_user_a
  ON public.dm_conversations (tenant_id, user_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_conv_user_b
  ON public.dm_conversations (tenant_id, user_b, last_message_at DESC);

COMMENT ON TABLE public.dm_conversations IS
  'Messagerie interne : un fil privé par paire de personnes. La contrainte user_a < user_b + l''index unique garantissent qu''une paire n''a qu''un fil et qu''un tiers ne peut pas s''y ajouter.';

-- ────────────────────────────────────────────────────────────────────
--  2. MESSAGES
--
--  `recipient_id` est redondant avec la conversation — et c'est voulu :
--  « combien de messages non lus pour moi ? » devient un COUNT sur un
--  index partiel, sans jointure, à chaque chargement de la barre
--  latérale. Une colonne dupliquée contre une jointure sur deux tables,
--  plusieurs fois par minute et par utilisateur : le choix est vite vu.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id)           ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES public.dm_conversations(id)  ON DELETE CASCADE,
  sender_id       uuid        NOT NULL REFERENCES public.users(id)             ON DELETE CASCADE,
  recipient_id    uuid        NOT NULL REFERENCES public.users(id)             ON DELETE CASCADE,
  /* Instantané du nom au moment de l'envoi : un membre supprimé ne doit
     pas transformer l'historique en « (inconnu) ». */
  sender_name     text        NOT NULL DEFAULT '',
  body            text        NOT NULL DEFAULT '',
  priority        text        NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('normal', 'important', 'urgent')),
  /* Les deux dates de l'accusé « ✓✓ ». Elles ne sont JAMAIS écrites par
     le client : seul le serveur les pose, à la réception effective et à
     l'ouverture réelle de la conversation. */
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT dm_messages_not_self CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conv
  ON public.dm_messages (conversation_id, created_at DESC);
/* Le compteur de non-lus — c'est LA requête chaude du module. */
CREATE INDEX IF NOT EXISTS idx_dm_messages_unread
  ON public.dm_messages (tenant_id, recipient_id)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dm_messages_undelivered
  ON public.dm_messages (recipient_id)
  WHERE delivered_at IS NULL;

COMMENT ON COLUMN public.dm_messages.delivered_at IS
  'Message effectivement parvenu au destinataire (flux temps réel ouvert, ou liste/fil rechargés). Posé par le serveur uniquement.';
COMMENT ON COLUMN public.dm_messages.read_at IS
  'Conversation réellement ouverte par le destinataire. Posé par le serveur uniquement — un accusé de lecture falsifiable ne prouverait rien.';

-- ────────────────────────────────────────────────────────────────────
--  3. PIÈCES JOINTES
--
--  Même dispositif que les fichiers de discussion projet (migration
--  095) : la base ne garde que la fiche signalétique, l'octet vit sur
--  le volume. message_id est NULLABLE — le fichier est téléversé avant
--  que le message qui le porte n'existe.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_files (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id)          ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  message_id      uuid        REFERENCES public.dm_messages(id)               ON DELETE CASCADE,
  filename        text        NOT NULL,
  mime            text        NOT NULL DEFAULT 'application/octet-stream',
  size_bytes      bigint      NOT NULL DEFAULT 0,
  storage_path    text        NOT NULL,
  uploader_id     uuid        NOT NULL REFERENCES public.users(id)            ON DELETE CASCADE,
  uploader_name   text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_files_message ON public.dm_files (message_id);
CREATE INDEX IF NOT EXISTS idx_dm_files_conv    ON public.dm_files (conversation_id, created_at DESC);
/* Purge des téléversements abandonnés : WHERE message_id IS NULL */
CREATE INDEX IF NOT EXISTS idx_dm_files_orphan  ON public.dm_files (created_at)
  WHERE message_id IS NULL;

-- ────────────────────────────────────────────────────────────────────
--  4. PRÉFÉRENCES DE NOTIFICATION (par personne)
--
--  Pourquoi en base et pas en localStorage : le cahier des charges veut
--  le même compte sur téléphone ET ordinateur. Un réglage rangé dans le
--  navigateur serait à refaire sur chaque appareil — et le serveur, qui
--  décide d'envoyer ou non le push et l'e-mail, ne pourrait pas le lire.
--
--  Les e-mails de messages ORDINAIRES sont coupés par défaut : une
--  messagerie qui écrit un mail à chaque « ok merci » se fait couper au
--  bout d'une journée. Les messages URGENTS, eux, partent par e-mail :
--  c'est précisément la voie de secours quand la personne n'est pas
--  devant l'application.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_prefs (
  tenant_id            uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id              uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  inapp_enabled        boolean     NOT NULL DEFAULT TRUE,   -- cloche + pastille
  popup_enabled        boolean     NOT NULL DEFAULT TRUE,   -- fenêtre surgissante dans l'app
  sound_enabled        boolean     NOT NULL DEFAULT TRUE,
  browser_enabled      boolean     NOT NULL DEFAULT TRUE,   -- notification système (onglet en fond)
  push_enabled         boolean     NOT NULL DEFAULT TRUE,   -- Web Push (application fermée)
  email_enabled        boolean     NOT NULL DEFAULT FALSE,  -- e-mail à CHAQUE message
  urgent_email_enabled boolean     NOT NULL DEFAULT TRUE,   -- e-mail sur les messages urgents
  created_at           timestamptz NOT NULL DEFAULT NOW(),
  updated_at           timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

COMMENT ON TABLE public.dm_prefs IS
  'Messagerie interne — canaux de notification, par personne et par espace. Suit l''utilisateur d''un appareil à l''autre.';

-- ── Triggers : updated_at + tenant_id immuable ──────────────────────
DROP TRIGGER IF EXISTS trg_dm_conv_updated_at ON public.dm_conversations;
CREATE TRIGGER trg_dm_conv_updated_at BEFORE UPDATE ON public.dm_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_dm_msg_updated_at ON public.dm_messages;
CREATE TRIGGER trg_dm_msg_updated_at BEFORE UPDATE ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_dm_files_updated_at ON public.dm_files;
CREATE TRIGGER trg_dm_files_updated_at BEFORE UPDATE ON public.dm_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_dm_prefs_updated_at ON public.dm_prefs;
CREATE TRIGGER trg_dm_prefs_updated_at BEFORE UPDATE ON public.dm_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lock_tenant_dm_conv ON public.dm_conversations;
CREATE TRIGGER trg_lock_tenant_dm_conv BEFORE UPDATE OF tenant_id ON public.dm_conversations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();
DROP TRIGGER IF EXISTS trg_lock_tenant_dm_msg ON public.dm_messages;
CREATE TRIGGER trg_lock_tenant_dm_msg BEFORE UPDATE OF tenant_id ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();
DROP TRIGGER IF EXISTS trg_lock_tenant_dm_files ON public.dm_files;
CREATE TRIGGER trg_lock_tenant_dm_files BEFORE UPDATE OF tenant_id ON public.dm_files
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

-- ────────────────────────────────────────────────────────────────────
--  5. RLS — espace ET personne
--
--  Test de confidentialité attendu (cahier des charges §38) :
--    SET app.current_tenant  = '<espace>';
--    SET app.current_user_id = '<Amin>';
--    SELECT * FROM dm_messages;        → uniquement ses fils à lui,
--                                        même en connaissant les ID.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_conversations FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.dm_files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_files         FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.dm_prefs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_prefs         FORCE  ROW LEVEL SECURITY;

/* ── Conversations ── */
DROP POLICY IF EXISTS rls_select_dm_conv ON public.dm_conversations;
DROP POLICY IF EXISTS rls_insert_dm_conv ON public.dm_conversations;
DROP POLICY IF EXISTS rls_update_dm_conv ON public.dm_conversations;
DROP POLICY IF EXISTS rls_delete_dm_conv ON public.dm_conversations;

CREATE POLICY rls_select_dm_conv ON public.dm_conversations FOR SELECT
  USING (tenant_id = current_tenant_id()
         AND current_app_user_id() IN (user_a, user_b));
CREATE POLICY rls_insert_dm_conv ON public.dm_conversations FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id()
              AND current_app_user_id() IN (user_a, user_b));
CREATE POLICY rls_update_dm_conv ON public.dm_conversations FOR UPDATE
  USING (tenant_id = current_tenant_id()
         AND current_app_user_id() IN (user_a, user_b))
  WITH CHECK (tenant_id = current_tenant_id()
              AND current_app_user_id() IN (user_a, user_b));
CREATE POLICY rls_delete_dm_conv ON public.dm_conversations FOR DELETE
  USING (tenant_id = current_tenant_id()
         AND current_app_user_id() IN (user_a, user_b));

/* ── Messages ──
   Écriture : on ne peut envoyer qu'EN SON PROPRE NOM (sender_id = moi).
   Modification : réservée au DESTINATAIRE — les seules mises à jour sont
   les accusés de réception et de lecture, et un expéditeur qui pourrait
   les poser lui-même s'auto-décernerait un « ✓✓ Lu ». */
DROP POLICY IF EXISTS rls_select_dm_msg ON public.dm_messages;
DROP POLICY IF EXISTS rls_insert_dm_msg ON public.dm_messages;
DROP POLICY IF EXISTS rls_update_dm_msg ON public.dm_messages;
DROP POLICY IF EXISTS rls_delete_dm_msg ON public.dm_messages;

CREATE POLICY rls_select_dm_msg ON public.dm_messages FOR SELECT
  USING (tenant_id = current_tenant_id()
         AND current_app_user_id() IN (sender_id, recipient_id));
CREATE POLICY rls_insert_dm_msg ON public.dm_messages FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id()
              AND sender_id = current_app_user_id()
              AND EXISTS (
                SELECT 1 FROM public.dm_conversations c
                 WHERE c.id = conversation_id
                   AND c.tenant_id = dm_messages.tenant_id
                   AND recipient_id IN (c.user_a, c.user_b)
                   AND sender_id    IN (c.user_a, c.user_b)));
CREATE POLICY rls_update_dm_msg ON public.dm_messages FOR UPDATE
  USING (tenant_id = current_tenant_id()
         AND recipient_id = current_app_user_id())
  WITH CHECK (tenant_id = current_tenant_id()
              AND recipient_id = current_app_user_id());
CREATE POLICY rls_delete_dm_msg ON public.dm_messages FOR DELETE
  USING (tenant_id = current_tenant_id()
         AND sender_id = current_app_user_id());

/* ── Pièces jointes ──
   L'appartenance se lit sur la conversation : une seule règle à tenir
   à jour, et elle est déjà éprouvée juste au-dessus. */
DROP POLICY IF EXISTS rls_select_dm_files ON public.dm_files;
DROP POLICY IF EXISTS rls_insert_dm_files ON public.dm_files;
DROP POLICY IF EXISTS rls_update_dm_files ON public.dm_files;
DROP POLICY IF EXISTS rls_delete_dm_files ON public.dm_files;

CREATE POLICY rls_select_dm_files ON public.dm_files FOR SELECT
  USING (tenant_id = current_tenant_id() AND EXISTS (
           SELECT 1 FROM public.dm_conversations c
            WHERE c.id = dm_files.conversation_id
              AND c.tenant_id = dm_files.tenant_id
              AND current_app_user_id() IN (c.user_a, c.user_b)));
CREATE POLICY rls_insert_dm_files ON public.dm_files FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id()
              AND uploader_id = current_app_user_id()
              AND EXISTS (
                SELECT 1 FROM public.dm_conversations c
                 WHERE c.id = conversation_id
                   AND c.tenant_id = dm_files.tenant_id
                   AND current_app_user_id() IN (c.user_a, c.user_b)));
CREATE POLICY rls_update_dm_files ON public.dm_files FOR UPDATE
  USING (tenant_id = current_tenant_id() AND uploader_id = current_app_user_id())
  WITH CHECK (tenant_id = current_tenant_id() AND uploader_id = current_app_user_id());
CREATE POLICY rls_delete_dm_files ON public.dm_files FOR DELETE
  USING (tenant_id = current_tenant_id() AND uploader_id = current_app_user_id());

/* ── Préférences : strictement les miennes ── */
DROP POLICY IF EXISTS rls_select_dm_prefs ON public.dm_prefs;
DROP POLICY IF EXISTS rls_insert_dm_prefs ON public.dm_prefs;
DROP POLICY IF EXISTS rls_update_dm_prefs ON public.dm_prefs;
DROP POLICY IF EXISTS rls_delete_dm_prefs ON public.dm_prefs;

CREATE POLICY rls_select_dm_prefs ON public.dm_prefs FOR SELECT
  USING (tenant_id = current_tenant_id() AND user_id = current_app_user_id());
CREATE POLICY rls_insert_dm_prefs ON public.dm_prefs FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() AND user_id = current_app_user_id());
CREATE POLICY rls_update_dm_prefs ON public.dm_prefs FOR UPDATE
  USING (tenant_id = current_tenant_id() AND user_id = current_app_user_id())
  WITH CHECK (tenant_id = current_tenant_id() AND user_id = current_app_user_id());
CREATE POLICY rls_delete_dm_prefs ON public.dm_prefs FOR DELETE
  USING (tenant_id = current_tenant_id() AND user_id = current_app_user_id());

-- ── Droits ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.dm_conversations, public.dm_messages, public.dm_files, public.dm_prefs
      TO gestiq_api;
    GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO gestiq_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.dm_conversations, public.dm_messages, public.dm_files, public.dm_prefs
      TO gestiq_rls;
    GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO gestiq_rls;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
--  6. L'ESPACE PEUT COUPER LES E-MAILS DE MESSAGERIE
--
--  `email_kinds` (migration 096) est l'interrupteur général par espace.
--  On y ajoute la nouvelle catégorie — y compris sur les lignes
--  existantes, sinon les espaces déjà configurés auraient la catégorie
--  « absente », donc désactivée, sans l'avoir jamais choisi.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.notification_settings
  ALTER COLUMN email_kinds SET DEFAULT ARRAY['projet_message','prospect_nouveau','paiement_recu',
                                             'devis_accepte','tache_validation','tache_creee',
                                             'expiration','message_prive'];

UPDATE public.notification_settings
   SET email_kinds = array_append(email_kinds, 'message_prive')
 WHERE NOT ('message_prive' = ANY(email_kinds));

COMMIT;

-- Vérification :
--   \d public.dm_conversations
--   SELECT policyname, cmd FROM pg_policies WHERE tablename LIKE 'dm_%' ORDER BY tablename, cmd;
--
-- Test de cloisonnement (à exécuter sous le rôle gestiq_rls) :
--   BEGIN;
--     SET LOCAL ROLE gestiq_rls;
--     SET LOCAL "app.current_tenant"  = '<uuid espace>';
--     SET LOCAL "app.current_user_id" = '<uuid Amin>';
--     SELECT count(*) FROM dm_messages;        -- uniquement les siens
--     SELECT * FROM dm_conversations WHERE id = '<fil Admin↔Yassine>';  -- 0 ligne
--   ROLLBACK;
