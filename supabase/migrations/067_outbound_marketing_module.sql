-- ================================================================
--  Migration 067 : Module OUTBOUND MARKETING
--
--  Séparé du CRM Prospects (Inbound). Les données ne sont jamais
--  mélangées : tables dédiées, isolation tenant via RLS + owner_id.
--
--  Rôles NEXT GITAL utilisés :
--    admin       → SUPER_ADMIN   (voit tout)
--    manager     → OUTBOUND_MANAGER (voit son équipe)
--    commercial  → OUTBOUND_AGENT (voit uniquement ses prospects)
--
--  Sécurité :
--    1. Isolation tenant   → RLS classique (current_tenant_id())
--    2. Isolation owner    → appliquée dans les routes Express
--       (WHERE assigned_to_id = req.user.userId pour commercial)
--    3. Colonne tenant_id  → immutable après création
-- ================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
--  1. outbound_sectors  — secteurs configurables
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_sectors (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom           TEXT        NOT NULL,
  parent_id     UUID        REFERENCES outbound_sectors(id) ON DELETE CASCADE,
  couleur       TEXT        DEFAULT '#64748B',
  icone         TEXT,
  actif         BOOLEAN     DEFAULT TRUE,
  ordre         INT         DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, nom, parent_id)
);
CREATE INDEX IF NOT EXISTS idx_outbound_sectors_tenant ON outbound_sectors (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_sectors_parent ON outbound_sectors (parent_id);

-- ================================================================
--  2. outbound_sources  — sources de prospection configurables
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_sources (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom           TEXT        NOT NULL,
  slug          TEXT,
  icone         TEXT,
  actif         BOOLEAN     DEFAULT TRUE,
  ordre         INT         DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, nom)
);
CREATE INDEX IF NOT EXISTS idx_outbound_sources_tenant ON outbound_sources (tenant_id);

-- ================================================================
--  3. outbound_campaigns  — campagnes de prospection
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_campaigns (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom            TEXT        NOT NULL,
  description    TEXT,
  objectif       TEXT,
  secteur_id     UUID        REFERENCES outbound_sectors(id) ON DELETE SET NULL,
  cible_prospects INT        DEFAULT 0,
  cible_contacts  INT        DEFAULT 0,
  date_debut     DATE,
  date_fin       DATE,
  statut         TEXT        DEFAULT 'active' CHECK (statut IN ('brouillon','active','pausee','terminee','archivee')),
  created_by_id  UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_tenant ON outbound_campaigns (tenant_id);

-- ================================================================
--  4. outbound_templates  — modèles messages (email / whatsapp / sms)
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_templates (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom            TEXT        NOT NULL,
  canal          TEXT        NOT NULL CHECK (canal IN ('email','whatsapp','sms','linkedin','autre')),
  objet          TEXT,
  corps          TEXT        NOT NULL,
  langue         TEXT        DEFAULT 'fr',
  variables      JSONB       DEFAULT '[]',
  actif          BOOLEAN     DEFAULT TRUE,
  usage_count    INT         DEFAULT 0,
  created_by_id  UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbound_templates_tenant ON outbound_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_templates_canal  ON outbound_templates (canal);

-- ================================================================
--  5. outbound_prospects  — fiche prospect Outbound
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_prospects (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  /* Identité */
  nom_contact         TEXT,
  prenom_contact      TEXT,
  entreprise          TEXT          NOT NULL,
  fonction            TEXT,
  taille_entreprise   TEXT,
  description         TEXT,

  /* Secteur */
  secteur_id          UUID          REFERENCES outbound_sectors(id) ON DELETE SET NULL,
  sous_secteur_id     UUID          REFERENCES outbound_sectors(id) ON DELETE SET NULL,

  /* Coordonnées */
  telephone           TEXT,
  whatsapp            TEXT,
  email               TEXT,
  email_secondaire    TEXT,
  site_web            TEXT,
  linkedin_url        TEXT,
  instagram_url       TEXT,
  facebook_url        TEXT,
  google_maps_url     TEXT,

  /* Adresse */
  adresse             TEXT,
  ville               TEXT,
  region              TEXT,
  pays                TEXT          DEFAULT 'Maroc',

  /* Prospection */
  source_id           UUID          REFERENCES outbound_sources(id) ON DELETE SET NULL,
  source_libre        TEXT,
  campaign_id         UUID          REFERENCES outbound_campaigns(id) ON DELETE SET NULL,
  statut              TEXT          DEFAULT 'a_contacter' CHECK (statut IN (
    'a_contacter','contacte','en_conversation','rdv_pris','interesse',
    'proposition_envoyee','ne_repond_pas','refuse','non_qualifie','converti'
  )),
  priorite            TEXT          DEFAULT 'normale' CHECK (priorite IN ('basse','normale','haute','urgente')),
  niveau_interet      INT           DEFAULT 0 CHECK (niveau_interet BETWEEN 0 AND 5),
  canal_prefere       TEXT          CHECK (canal_prefere IN ('email','whatsapp','telephone','linkedin','sms') OR canal_prefere IS NULL),

  /* Suivi commercial */
  nb_tentatives       INT           DEFAULT 0,
  valeur_potentielle  NUMERIC(12,2) DEFAULT 0,
  service_propose     TEXT,
  motif_perte         TEXT,
  motif_refus         TEXT,
  ne_plus_contacter   BOOLEAN       DEFAULT FALSE,

  /* Dates */
  date_dernier_contact  TIMESTAMPTZ,
  date_prochaine_relance DATE,
  last_activity_at    TIMESTAMPTZ   DEFAULT NOW(),

  /* Propriété (fondation RBAC owner-based) */
  owner_id            UUID          NOT NULL,
  assigned_to_id      UUID          NOT NULL,
  created_by_id       UUID          NOT NULL,

  /* Métadonnées */
  notes               TEXT,
  tags                JSONB         DEFAULT '[]',

  /* Conversion vers CRM Inbound */
  converted_to_crm    BOOLEAN       DEFAULT FALSE,
  converted_at        TIMESTAMPTZ,
  converted_by_id     UUID,
  crm_prospect_id     UUID          REFERENCES prospects(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_tenant     ON outbound_prospects (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_assigned   ON outbound_prospects (assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_owner      ON outbound_prospects (owner_id);
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_statut     ON outbound_prospects (statut);
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_secteur    ON outbound_prospects (secteur_id);
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_campaign   ON outbound_prospects (campaign_id);
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_relance    ON outbound_prospects (date_prochaine_relance) WHERE date_prochaine_relance IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_converted  ON outbound_prospects (converted_to_crm);
/* Anti-doublon léger — même entreprise + téléphone/email dans le même tenant */
CREATE INDEX IF NOT EXISTS idx_outbound_prospects_dedup ON outbound_prospects (tenant_id, LOWER(entreprise), LOWER(COALESCE(email, telephone, '')));

-- ================================================================
--  6. outbound_activities  — journal des actions (appel, email, whatsapp, note, statut, edit)
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_activities (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id     UUID        NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN (
    'creation','statut','note','edit','appel','email','whatsapp','linkedin','sms',
    'rdv','conversion','assignment','follow_up'
  )),
  message         TEXT        NOT NULL,
  metadata        JSONB       DEFAULT '{}',
  auteur_id       UUID        NOT NULL,
  auteur_nom      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbound_activities_tenant   ON outbound_activities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_activities_prospect ON outbound_activities (prospect_id);
CREATE INDEX IF NOT EXISTS idx_outbound_activities_type     ON outbound_activities (type);

-- ================================================================
--  7. outbound_follow_ups  — relances programmées
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_follow_ups (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id     UUID        NOT NULL REFERENCES outbound_prospects(id) ON DELETE CASCADE,
  assigned_to_id  UUID        NOT NULL,
  titre           TEXT        NOT NULL,
  description     TEXT,
  canal           TEXT        CHECK (canal IN ('email','whatsapp','telephone','linkedin','sms','rdv') OR canal IS NULL),
  date_prevue     TIMESTAMPTZ NOT NULL,
  statut          TEXT        DEFAULT 'a_faire' CHECK (statut IN ('a_faire','fait','annule','reporte')),
  fait_a          TIMESTAMPTZ,
  created_by_id   UUID        NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbound_follow_ups_tenant     ON outbound_follow_ups (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_follow_ups_prospect   ON outbound_follow_ups (prospect_id);
CREATE INDEX IF NOT EXISTS idx_outbound_follow_ups_assigned   ON outbound_follow_ups (assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_outbound_follow_ups_date       ON outbound_follow_ups (date_prevue);

-- ================================================================
--  8. outbound_agent_settings  — spécialisation employés
--     Un employé peut avoir plusieurs secteurs, villes, sources, campagnes autorisés.
--     Stocké en JSONB pour souplesse (pas de table de jonction lourde).
-- ================================================================
CREATE TABLE IF NOT EXISTS outbound_agent_settings (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL,
  actif                 BOOLEAN     DEFAULT TRUE,

  /* Autorisations */
  secteurs_autorises    JSONB       DEFAULT '[]',  -- [uuid, uuid]
  villes_autorisees     JSONB       DEFAULT '[]',  -- ['Oujda','Casablanca']
  sources_autorisees    JSONB       DEFAULT '[]',  -- [uuid, uuid]
  campagnes_accessibles JSONB       DEFAULT '[]',  -- [uuid, uuid]

  /* Objectifs mensuels */
  objectif_prospects_mois  INT      DEFAULT 0,
  objectif_contacts_mois   INT      DEFAULT 0,
  objectif_rdv_mois        INT      DEFAULT 0,
  objectif_conversions_mois INT     DEFAULT 0,

  /* Limites */
  limite_prospects_jour    INT      DEFAULT 0,

  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_outbound_agent_settings_tenant ON outbound_agent_settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbound_agent_settings_user   ON outbound_agent_settings (user_id);

-- ================================================================
--  RLS (isolation tenant) — les routes Express ajoutent en plus
--  le filtre owner_id / assigned_to_id selon le rôle.
-- ================================================================
ALTER TABLE outbound_sectors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_prospects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_activities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_follow_ups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_agent_settings ENABLE ROW LEVEL SECURITY;

/* FORCE RLS — sinon le propriétaire des tables (utilisateur DB) contourne les policies.
   Sans FORCE, l'API tourne avec un compte propriétaire → aucune isolation tenant. */
ALTER TABLE outbound_sectors        FORCE ROW LEVEL SECURITY;
ALTER TABLE outbound_sources        FORCE ROW LEVEL SECURITY;
ALTER TABLE outbound_campaigns      FORCE ROW LEVEL SECURITY;
ALTER TABLE outbound_templates      FORCE ROW LEVEL SECURITY;
ALTER TABLE outbound_prospects      FORCE ROW LEVEL SECURITY;
ALTER TABLE outbound_activities     FORCE ROW LEVEL SECURITY;
ALTER TABLE outbound_follow_ups     FORCE ROW LEVEL SECURITY;
ALTER TABLE outbound_agent_settings FORCE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'outbound_sectors','outbound_sources','outbound_campaigns','outbound_templates',
    'outbound_prospects','outbound_activities','outbound_follow_ups','outbound_agent_settings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_select_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS rls_insert_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS rls_update_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS rls_delete_%I ON %I', t, t);

    EXECUTE format(
      'CREATE POLICY rls_select_%I ON %I FOR SELECT
       USING (tenant_id = current_tenant_id())', t, t);
    EXECUTE format(
      'CREATE POLICY rls_insert_%I ON %I FOR INSERT
       WITH CHECK (tenant_id = current_tenant_id())', t, t);
    EXECUTE format(
      'CREATE POLICY rls_update_%I ON %I FOR UPDATE
       USING (tenant_id = current_tenant_id())
       WITH CHECK (tenant_id = current_tenant_id())', t, t);
    EXECUTE format(
      'CREATE POLICY rls_delete_%I ON %I FOR DELETE
       USING (tenant_id = current_tenant_id())', t, t);
  END LOOP;
END $$;

-- ================================================================
--  Triggers updated_at + trace lastActivity
-- ================================================================
CREATE OR REPLACE FUNCTION outbound_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'outbound_sectors','outbound_campaigns','outbound_templates',
    'outbound_prospects','outbound_follow_ups','outbound_agent_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION outbound_touch_updated_at()', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION outbound_touch_prospect_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE outbound_prospects
     SET last_activity_at = NOW()
   WHERE id = NEW.prospect_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_touch_prospect_activity ON outbound_activities;
CREATE TRIGGER trg_touch_prospect_activity
  AFTER INSERT ON outbound_activities
  FOR EACH ROW EXECUTE FUNCTION outbound_touch_prospect_activity();

-- ================================================================
--  Immutabilité tenant_id (comme sur les autres tables métier)
-- ================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'outbound_sectors','outbound_sources','outbound_campaigns','outbound_templates',
    'outbound_prospects','outbound_activities','outbound_follow_ups','outbound_agent_settings'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_lock_tenant_%I ON %I;
       CREATE TRIGGER trg_lock_tenant_%I
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION prevent_tenant_id_change()',
      t, t, t, t);
  END LOOP;
END $$;

-- ================================================================
--  Seeds — pour chaque tenant existant, on installe la liste
--  de départ des secteurs et sources.
-- ================================================================
DO $$
DECLARE t_id UUID;
BEGIN
  FOR t_id IN SELECT id FROM tenants LOOP

    /* Sources */
    INSERT INTO outbound_sources (tenant_id, nom, slug, ordre) VALUES
      (t_id, 'Google Maps',          'google_maps',      1),
      (t_id, 'Google Search',        'google_search',    2),
      (t_id, 'LinkedIn',             'linkedin',         3),
      (t_id, 'Instagram',            'instagram',        4),
      (t_id, 'Facebook',             'facebook',         5),
      (t_id, 'Annuaire professionnel','annuaire',        6),
      (t_id, 'Site web',             'site_web',         7),
      (t_id, 'Salon professionnel',  'salon',            8),
      (t_id, 'Recommandation',       'recommandation',   9),
      (t_id, 'Base importée',        'import',          10),
      (t_id, 'Recherche manuelle',   'manuel',          11),
      (t_id, 'Autre',                'autre',           12)
    ON CONFLICT (tenant_id, nom) DO NOTHING;

    /* Secteurs */
    INSERT INTO outbound_sectors (tenant_id, nom, couleur, ordre) VALUES
      (t_id, 'Médecins',              '#EF4444',  1),
      (t_id, 'Cliniques',             '#EC4899',  2),
      (t_id, 'Dentistes',             '#F97316',  3),
      (t_id, 'Restaurants',           '#F59E0B',  4),
      (t_id, 'Cafés',                 '#FBBF24',  5),
      (t_id, 'Hôtels',                '#84CC16',  6),
      (t_id, 'Immobilier',            '#10B981',  7),
      (t_id, 'BTP',                   '#14B8A6',  8),
      (t_id, 'Automobile',            '#06B6D4',  9),
      (t_id, 'Écoles',                '#0EA5E9', 10),
      (t_id, 'Instituts',             '#3B82F6', 11),
      (t_id, 'Formations',            '#6366F1', 12),
      (t_id, 'E-commerce',            '#8B5CF6', 13),
      (t_id, 'Commerces',             '#A855F7', 14),
      (t_id, 'Cabinets comptables',   '#D946EF', 15),
      (t_id, 'Cabinets d''avocats',   '#EC4899', 16),
      (t_id, 'Transport',             '#F43F5E', 17),
      (t_id, 'Industrie',             '#64748B', 18),
      (t_id, 'Services',              '#475569', 19),
      (t_id, 'Tourisme',              '#22C55E', 20),
      (t_id, 'Beauté',                '#F472B6', 21),
      (t_id, 'Bien-être',             '#38BDF8', 22),
      (t_id, 'Autre',                 '#94A3B8', 23)
    ON CONFLICT (tenant_id, nom, parent_id) DO NOTHING;
  END LOOP;
END $$;

COMMIT;
