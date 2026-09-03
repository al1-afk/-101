-- ════════════════════════════════════════════════════════════════════
--  GestiQ — Migration 095 : discussion projet — accusés de lecture
--                            et pièces jointes
--  Date : 2026-09-02
--
--  1) projet_chat_reads   : « vu / lu » façon WhatsApp
--  2) projet_message_files: fichiers et images du fil
--  3) assouplit la contrainte sur projet_messages.text (message = fichier seul)
--
--  Conformité ARCHITECTURE_TENANT.md :
--    - tenant_id NOT NULL FK CASCADE sur les deux tables
--    - RLS forcé + 4 policies chacune
--    - trigger prevent_tenant_id_change + set_updated_at
--    - GRANT à gestiq_api
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1) ACCUSÉS DE LECTURE
--
-- Un curseur par personne et par projet, pas une ligne par message lu :
-- une équipe de 5 sur un fil de 500 messages ferait 2 500 lignes pour
-- une information que « dernière lecture à telle heure » résume sans
-- perte. Un message est lu par X si le curseur de X est postérieur ou
-- égal à sa date de création.
--
-- Le lecteur est soit un compte admin (reader_user_id), soit un membre
-- d'équipe (reader_team_member_id) — jamais les deux.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projet_chat_reads (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id)       ON DELETE CASCADE,
  projet_id             uuid        NOT NULL REFERENCES public.projets(id)       ON DELETE CASCADE,
  reader_user_id        uuid        REFERENCES public.users(id)                  ON DELETE CASCADE,
  reader_team_member_id uuid        REFERENCES public.team_members(id)           ON DELETE CASCADE,
  reader_name           text        NOT NULL,
  last_read_at          timestamptz NOT NULL DEFAULT NOW(),
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT projet_chat_reads_one_reader CHECK (
    (reader_user_id IS NOT NULL) <> (reader_team_member_id IS NOT NULL)
  )
);

/* Un seul curseur par personne et par projet. Deux index partiels
   plutôt qu'un UNIQUE composite : avec une colonne NULL, un UNIQUE
   ordinaire laisserait passer les doublons. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_reads_user
  ON public.projet_chat_reads (projet_id, reader_user_id)
  WHERE reader_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_reads_member
  ON public.projet_chat_reads (projet_id, reader_team_member_id)
  WHERE reader_team_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_reads_tenant ON public.projet_chat_reads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_reads_projet ON public.projet_chat_reads (projet_id);

-- ────────────────────────────────────────────────────────────────────
-- 2) PIÈCES JOINTES
--
-- Le fichier vit sur le disque du serveur (volume Docker), pas en base :
-- un dump PostgreSQL qui embarque des vidéos devient inrestaurable.
-- Ici on ne garde que la fiche signalétique et le chemin relatif.
--
-- message_id est NULLABLE : le fichier est téléversé AVANT que le
-- message existe (on envoie le fichier, puis le message qui le porte).
-- Une pièce jointe orpheline plus de 24 h est un téléversement
-- abandonné, purgeable sans risque.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projet_message_files (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.tenants(id)          ON DELETE CASCADE,
  projet_id               uuid        NOT NULL REFERENCES public.projets(id)          ON DELETE CASCADE,
  message_id              uuid        REFERENCES public.projet_messages(id)           ON DELETE CASCADE,
  filename                text        NOT NULL,
  mime                    text        NOT NULL DEFAULT 'application/octet-stream',
  size_bytes              bigint      NOT NULL DEFAULT 0,
  storage_path            text        NOT NULL,
  uploader_name           text        NOT NULL,
  uploader_user_id        uuid        REFERENCES public.users(id)                     ON DELETE SET NULL,
  uploader_team_member_id uuid        REFERENCES public.team_members(id)              ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT NOW(),
  updated_at              timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_files_tenant  ON public.projet_message_files (tenant_id);
CREATE INDEX IF NOT EXISTS idx_msg_files_message ON public.projet_message_files (message_id);
CREATE INDEX IF NOT EXISTS idx_msg_files_projet  ON public.projet_message_files (projet_id, created_at DESC);
/* Purge des téléversements abandonnés : WHERE message_id IS NULL */
CREATE INDEX IF NOT EXISTS idx_msg_files_orphan  ON public.projet_message_files (created_at)
  WHERE message_id IS NULL;

-- ────────────────────────────────────────────────────────────────────
-- 3) UN MESSAGE PEUT N'ÊTRE QU'UN FICHIER
--
-- La contrainte d'origine imposait un texte non vide. Envoyer une photo
-- sans légende était donc impossible. Le contrôle « texte OU pièce
-- jointe » se fait côté API : la base ne peut pas voir les fichiers au
-- moment de l'insertion du message (ils sont rattachés juste après).
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.projet_messages DROP CONSTRAINT IF EXISTS projet_messages_text_check;

-- ── Triggers ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_chat_reads_updated_at ON public.projet_chat_reads;
CREATE TRIGGER trg_chat_reads_updated_at BEFORE UPDATE ON public.projet_chat_reads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_msg_files_updated_at ON public.projet_message_files;
CREATE TRIGGER trg_msg_files_updated_at BEFORE UPDATE ON public.projet_message_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lock_tenant_chat_reads ON public.projet_chat_reads;
CREATE TRIGGER trg_lock_tenant_chat_reads BEFORE UPDATE OF tenant_id ON public.projet_chat_reads
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_lock_tenant_msg_files ON public.projet_message_files;
CREATE TRIGGER trg_lock_tenant_msg_files BEFORE UPDATE OF tenant_id ON public.projet_message_files
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.projet_chat_reads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projet_chat_reads    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.projet_message_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projet_message_files FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_chat_reads ON public.projet_chat_reads;
DROP POLICY IF EXISTS rls_insert_chat_reads ON public.projet_chat_reads;
DROP POLICY IF EXISTS rls_update_chat_reads ON public.projet_chat_reads;
DROP POLICY IF EXISTS rls_delete_chat_reads ON public.projet_chat_reads;
CREATE POLICY rls_select_chat_reads ON public.projet_chat_reads FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_chat_reads ON public.projet_chat_reads FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_chat_reads ON public.projet_chat_reads FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_chat_reads ON public.projet_chat_reads FOR DELETE USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS rls_select_msg_files ON public.projet_message_files;
DROP POLICY IF EXISTS rls_insert_msg_files ON public.projet_message_files;
DROP POLICY IF EXISTS rls_update_msg_files ON public.projet_message_files;
DROP POLICY IF EXISTS rls_delete_msg_files ON public.projet_message_files;
CREATE POLICY rls_select_msg_files ON public.projet_message_files FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_msg_files ON public.projet_message_files FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_msg_files ON public.projet_message_files FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_msg_files ON public.projet_message_files FOR DELETE USING (tenant_id = current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.projet_chat_reads    TO gestiq_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.projet_message_files TO gestiq_api;
  END IF;
END $$;

COMMIT;

-- Vérification :
--   \d public.projet_chat_reads
--   \d public.projet_message_files
--   SELECT conname FROM pg_constraint WHERE conrelid = 'projet_messages'::regclass;
