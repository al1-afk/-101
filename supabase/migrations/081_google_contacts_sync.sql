-- ====================================================================
--  Migration 079 : Synchronisation Google Contacts (Caller ID)
--
--  Objectif : quand un prospect appelle, son nom s'affiche sur le
--  téléphone du commercial. On pousse les prospects (nom + téléphone)
--  vers les Google Contacts de l'utilisateur ; son téléphone les
--  synchronise nativement → le dialer affiche le nom à l'appel.
--
--  1. google_contacts_links  : un lien OAuth Google par utilisateur
--     (le refresh_token est stocké CHIFFRÉ — jamais en clair).
--  2. google_contact_map      : correspondance prospect ↔ contact Google
--     (resourceName + etag People API + hash de contenu pour le diff).
--
--  Isolation tenant : RLS via current_setting('app.current_tenant')
--  (même convention que 077/078, cf. server/db/pool.ts).
--
--  100 % réversible / idempotent : IF [NOT] EXISTS partout.
-- ====================================================================
BEGIN;

-- ─── 1. Lien OAuth Google (par utilisateur) ────────────────────────
CREATE TABLE IF NOT EXISTS public.google_contacts_links (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- users.id qui a relié SON compte Google (pas de FK dure : users vit
  -- dans une autre table selon l'environnement, l'isolation reste le tenant)
  user_id                UUID NOT NULL,
  google_email           TEXT,
  -- refresh_token chiffré (AES-256-GCM, cf. server/lib/secretBox.ts)
  refresh_token_enc      TEXT NOT NULL,
  scope                  TEXT,
  -- groupe People API "contactGroups/xxx" qui isole les contacts CRM
  contact_group_resource TEXT,
  contact_group_name     TEXT DEFAULT 'NEXT GITAL – Prospects',
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','needs_reauth','error')),
  auto_sync              BOOLEAN NOT NULL DEFAULT TRUE,
  -- préfixe/suffixe optionnel du nom affiché (ex. " ·Prospect")
  name_suffix            TEXT DEFAULT '',
  include_company        BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at         TIMESTAMPTZ,
  last_error             TEXT,
  contacts_count         INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gcontacts_links_tenant
  ON public.google_contacts_links(tenant_id);

ALTER TABLE public.google_contacts_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gcontacts_links_tenant_isolation ON public.google_contacts_links;
CREATE POLICY gcontacts_links_tenant_isolation ON public.google_contacts_links
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- ─── 2. Correspondance prospect ↔ contact Google ───────────────────
--  prospect_id volontairement SANS FK cascade : si un prospect est
--  supprimé, on garde la ligne pour pouvoir SUPPRIMER le contact Google
--  correspondant au prochain sync (le resourceName est ici).
CREATE TABLE IF NOT EXISTS public.google_contact_map (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  link_id        UUID NOT NULL REFERENCES public.google_contacts_links(id) ON DELETE CASCADE,
  prospect_id    UUID NOT NULL,
  resource_name  TEXT NOT NULL,
  etag           TEXT,
  content_hash   TEXT,
  phone_e164     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (link_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_gcontact_map_tenant   ON public.google_contact_map(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gcontact_map_link      ON public.google_contact_map(link_id);
CREATE INDEX IF NOT EXISTS idx_gcontact_map_prospect  ON public.google_contact_map(tenant_id, prospect_id);

ALTER TABLE public.google_contact_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gcontact_map_tenant_isolation ON public.google_contact_map;
CREATE POLICY gcontact_map_tenant_isolation ON public.google_contact_map
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

-- ─── updated_at automatique ────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_gcontacts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcontacts_links_updated_at') THEN
    CREATE TRIGGER trg_gcontacts_links_updated_at BEFORE UPDATE ON public.google_contacts_links
      FOR EACH ROW EXECUTE FUNCTION trg_gcontacts_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gcontact_map_updated_at') THEN
    CREATE TRIGGER trg_gcontact_map_updated_at BEFORE UPDATE ON public.google_contact_map
      FOR EACH ROW EXECUTE FUNCTION trg_gcontacts_set_updated_at();
  END IF;
END$$;

COMMIT;
