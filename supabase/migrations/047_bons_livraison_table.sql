-- ================================================================
--  GestiQ — Migration 047 : Table bons_livraison
--  Date : 2026-05-19
--
--  Document de livraison de projet (handover) destiné au client.
--  Contient :
--    - description du projet livré (texte libre / markdown léger)
--    - liens du projet (live, admin, GitHub, etc.) — jsonb
--    - identifiants & mots de passe (admin, FTP, base, etc.) — jsonb
--    - date de livraison + numéro auto (BL-YYYY-NNNN)
--
--  Conformité ARCHITECTURE_TENANT.md :
--    - tenant_id NOT NULL FK CASCADE
--    - RLS forcé + 4 policies
--    - Trigger prevent_tenant_id_change + updated_at
--    - GRANT à gestiq_api
-- ================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.bons_livraison (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Numéro lisible (ex: BL-2026-001) — généré côté UI / serveur
  numero          text        NOT NULL,

  -- Liens facultatifs vers projet / client
  projet_id       uuid        REFERENCES public.projets(id) ON DELETE SET NULL,
  client_id       uuid        REFERENCES public.clients(id) ON DELETE SET NULL,

  -- Contenu principal
  titre           text        NOT NULL,
  description     text,

  -- Liens du projet — jsonb array de { label, url }
  liens           jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Identifiants & mots de passe — jsonb array de { label, valeur, type }
  --   type ∈ 'password' | 'user' | 'email' | 'url' | 'other'
  identifiants    jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Planning livraison
  date_livraison  date        NOT NULL DEFAULT CURRENT_DATE,

  -- Workflow
  statut          text        NOT NULL DEFAULT 'brouillon'
                              CHECK (statut IN ('brouillon','envoye','confirme')),

  -- Notes internes (non affichées au client)
  notes           text,

  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT bons_livraison_numero_tenant_unique UNIQUE (tenant_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_bl_tenant         ON public.bons_livraison (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bl_tenant_projet  ON public.bons_livraison (tenant_id, projet_id);
CREATE INDEX IF NOT EXISTS idx_bl_tenant_client  ON public.bons_livraison (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_bl_tenant_date    ON public.bons_livraison (tenant_id, date_livraison DESC);

-- Triggers
DROP TRIGGER IF EXISTS trg_bl_updated_at ON public.bons_livraison;
CREATE TRIGGER trg_bl_updated_at BEFORE UPDATE ON public.bons_livraison
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lock_tenant_bl ON public.bons_livraison;
CREATE TRIGGER trg_lock_tenant_bl BEFORE UPDATE OF tenant_id ON public.bons_livraison
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

-- RLS
ALTER TABLE public.bons_livraison ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bons_livraison FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_bl ON public.bons_livraison;
DROP POLICY IF EXISTS rls_insert_bl ON public.bons_livraison;
DROP POLICY IF EXISTS rls_update_bl ON public.bons_livraison;
DROP POLICY IF EXISTS rls_delete_bl ON public.bons_livraison;

CREATE POLICY rls_select_bl ON public.bons_livraison FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_bl ON public.bons_livraison FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_bl ON public.bons_livraison FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_bl ON public.bons_livraison FOR DELETE USING (tenant_id = current_tenant_id());

-- GRANT au rôle API
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.bons_livraison TO gestiq_api;
  END IF;
END $$;

COMMIT;
