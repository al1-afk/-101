-- ════════════════════════════════════════════════════════════════════
--  GestiQ — Migration 098 : module SOP v2
--  Date : 2026-09-03
--
--  Trois apports, sur la table sops existante — pas de table parallèle :
--    1) cycle de vie   : brouillon / actif / archivé
--    2) images         : fichiers sur disque, plus de base64 en base
--    3) versionnage    : historique consultable et restaurable
--
--  ── Pourquoi ne pas créer une nouvelle table « sops v2 » ───────────
--  142 SOPs vivent déjà dans public.sops, lues par /sop (admin),
--  /my-space/sops (membre), le mode formation et le lecteur de tâches.
--  On étend l'existant ; aucun écran n'a besoin d'être réécrit pour
--  continuer à fonctionner.
--
--  Conformité ARCHITECTURE_TENANT.md :
--    - tenant_id NOT NULL FK CASCADE sur les deux nouvelles tables
--    - RLS forcé + 4 policies chacune
--    - triggers set_updated_at + prevent_tenant_id_change
--    - GRANT à gestiq_api
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1) CYCLE DE VIE ET MÉTADONNÉES
--
-- status : un SOP archivé n'est pas supprimé, il sort simplement des
-- listes par défaut. La valeur par défaut 'active' garantit que les 142
-- SOPs existantes restent visibles exactement comme avant.
--
-- difficulty et read_min : read_min existe déjà (durée estimée en
-- minutes), on ne le double pas.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.sops
  ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS difficulty text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sops_status_check') THEN
    ALTER TABLE public.sops
      ADD CONSTRAINT sops_status_check CHECK (status IN ('draft', 'active', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sops_difficulty_check') THEN
    ALTER TABLE public.sops
      ADD CONSTRAINT sops_difficulty_check
      CHECK (difficulty IS NULL OR difficulty IN ('facile', 'moyen', 'difficile'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sops_tenant_status ON public.sops (tenant_id, status);

COMMENT ON COLUMN public.sops.status IS
  'Cycle de vie : draft (visible de son auteur), active (publié), archived (retiré des listes sans suppression).';
COMMENT ON COLUMN public.sops.difficulty IS
  'Niveau indicatif : facile, moyen ou difficile. NULL = non renseigné.';

-- ────────────────────────────────────────────────────────────────────
-- 2) IMAGES DES SOP
--
-- Le fichier vit sur le volume Docker (UPLOAD_DIR), comme les pièces
-- jointes de discussion (migration 095). La base ne garde que la fiche
-- signalétique : une capture d'écran de 4 Mo encodée en base64 dans le
-- champ blocks pesait 5,3 Mo de JSON, rechargés à chaque ouverture de
-- la liste — et embarqués dans chaque dump PostgreSQL.
--
-- sop_id est NULLABLE : l'image est téléversée AVANT que le SOP existe
-- (on crée l'image, puis le SOP qui la référence). Une image orpheline
-- de plus de 24 h est un téléversement abandonné, purgeable.
--
-- position sert aux images gérées comme une galerie ordonnée ; une
-- image posée directement dans le contenu est référencée par son id
-- depuis le bloc correspondant.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sop_images (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sop_id        uuid        REFERENCES public.sops(id)             ON DELETE CASCADE,
  filename      text        NOT NULL,
  mime          text        NOT NULL DEFAULT 'image/jpeg',
  size_bytes    bigint      NOT NULL DEFAULT 0,
  storage_path  text        NOT NULL,
  caption       text,
  position      int         NOT NULL DEFAULT 0,
  uploader_name text        NOT NULL DEFAULT '',
  /* Qui a téléversé : sert à protéger une image encore orpheline
     (téléversée, pas encore rattachée à un SOP) — sinon n'importe quel
     membre de l'espace pourrait la lire en devinant son identifiant. */
  uploader_member_id uuid   REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sop_images_tenant ON public.sop_images (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sop_images_sop    ON public.sop_images (sop_id, position);
CREATE INDEX IF NOT EXISTS idx_sop_images_orphan ON public.sop_images (created_at) WHERE sop_id IS NULL;

-- ────────────────────────────────────────────────────────────────────
-- 3) HISTORIQUE DES VERSIONS
--
-- Une ligne par enregistrement : on y copie l'état AVANT modification,
-- pour que « restaurer cette version » ait un sens. version_number est
-- attribué par le serveur (max + 1 par SOP).
--
-- blocks est copié tel quel : les images étant désormais des références
-- de fichiers, une version ne duplique pas les octets des images.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sop_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sop_id         uuid        NOT NULL REFERENCES public.sops(id)    ON DELETE CASCADE,
  version_number int         NOT NULL,
  title          text        NOT NULL,
  description    text,
  category       text        NOT NULL,
  tags           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  read_min       int         NOT NULL DEFAULT 2,
  difficulty     text,
  blocks         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  author_name    text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (sop_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_sop_versions_tenant ON public.sop_versions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sop_versions_sop    ON public.sop_versions (sop_id, version_number DESC);

-- ────────────────────────────────────────────────────────────────────
-- 4) FAVORIS PERSONNELS
--
-- La colonne sops.popular existait déjà et sert la mise en avant
-- éditoriale de l'espace : elle pilote le tri commun et le compteur
-- « Populaires » de /sop. S'en servir pour l'étoile d'un membre aurait
-- fait qu'un favori posé par une personne réordonne la liste de tout le
-- monde. Un favori est personnel : il lui faut sa propre table.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sop_favorites (
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id)      ON DELETE CASCADE,
  team_member_id uuid        NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  sop_id         uuid        NOT NULL REFERENCES public.sops(id)         ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_member_id, sop_id)
);

CREATE INDEX IF NOT EXISTS idx_sop_favorites_tenant ON public.sop_favorites (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sop_favorites_sop    ON public.sop_favorites (sop_id);

ALTER TABLE public.sop_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_favorites FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_sop_favorites ON public.sop_favorites;
DROP POLICY IF EXISTS rls_insert_sop_favorites ON public.sop_favorites;
DROP POLICY IF EXISTS rls_update_sop_favorites ON public.sop_favorites;
DROP POLICY IF EXISTS rls_delete_sop_favorites ON public.sop_favorites;
CREATE POLICY rls_select_sop_favorites ON public.sop_favorites FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_sop_favorites ON public.sop_favorites FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_sop_favorites ON public.sop_favorites FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_sop_favorites ON public.sop_favorites FOR DELETE USING (tenant_id = current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_favorites TO gestiq_api;
  END IF;
END $$;

-- ── Triggers ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sop_images_updated_at ON public.sop_images;
CREATE TRIGGER trg_sop_images_updated_at BEFORE UPDATE ON public.sop_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lock_tenant_sop_images ON public.sop_images;
CREATE TRIGGER trg_lock_tenant_sop_images BEFORE UPDATE OF tenant_id ON public.sop_images
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_lock_tenant_sop_versions ON public.sop_versions;
CREATE TRIGGER trg_lock_tenant_sop_versions BEFORE UPDATE OF tenant_id ON public.sop_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.sop_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_images   FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.sop_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_versions FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_sop_images ON public.sop_images;
DROP POLICY IF EXISTS rls_insert_sop_images ON public.sop_images;
DROP POLICY IF EXISTS rls_update_sop_images ON public.sop_images;
DROP POLICY IF EXISTS rls_delete_sop_images ON public.sop_images;
CREATE POLICY rls_select_sop_images ON public.sop_images FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_sop_images ON public.sop_images FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_sop_images ON public.sop_images FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_sop_images ON public.sop_images FOR DELETE USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS rls_select_sop_versions ON public.sop_versions;
DROP POLICY IF EXISTS rls_insert_sop_versions ON public.sop_versions;
DROP POLICY IF EXISTS rls_update_sop_versions ON public.sop_versions;
DROP POLICY IF EXISTS rls_delete_sop_versions ON public.sop_versions;
CREATE POLICY rls_select_sop_versions ON public.sop_versions FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_sop_versions ON public.sop_versions FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_sop_versions ON public.sop_versions FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_sop_versions ON public.sop_versions FOR DELETE USING (tenant_id = current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_images   TO gestiq_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_versions TO gestiq_api;
  END IF;
END $$;

COMMIT;

-- Vérification :
--   SELECT status, count(*) FROM sops GROUP BY status;   -- tout doit être 'active'
--   \d public.sop_images
--   \d public.sop_versions
