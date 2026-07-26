-- ====================================================================
--  Migration 077 : table prestation_models
--
--  Bibliothèque de modèles de prestations pour les devis.
--  Chaque tenant gère sa propre bibliothèque : modèles personnalisés
--  + modèles par défaut (20 modèles définis en dur dans le code, cf.
--  src/lib/prestationTemplates.ts) qu'il peut réinitialiser à tout
--  moment (« Restaurer les modèles par défaut »).
--
--  Les `elements` (puces) sont stockés en JSONB (tableau de chaînes).
--  Isolation tenant : RLS via app.current_tenant (convention du pool,
--  cf. server/db/pool.ts → SET LOCAL "app.current_tenant").
-- ====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS prestation_models (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- clé du modèle par défaut d'origine (NULL = modèle 100% personnalisé) ;
  -- sert à ré-injecter les défauts manquants de façon idempotente.
  source_key   TEXT,
  titre        TEXT NOT NULL,
  type         TEXT        DEFAULT 'custom',
  category     TEXT        DEFAULT 'Prestations personnalisées',
  description  TEXT        DEFAULT '',
  elements     JSONB NOT NULL DEFAULT '[]'::jsonb,
  objectif     TEXT        DEFAULT '',
  prix_defaut  NUMERIC(14,2) NOT NULL DEFAULT 0,
  tva_defaut   NUMERIC(5,2)  NOT NULL DEFAULT 20,
  unite        TEXT        DEFAULT 'projet',
  is_unique    BOOLEAN NOT NULL DEFAULT FALSE,
  actif        BOOLEAN NOT NULL DEFAULT TRUE,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prestation_models_tenant
  ON prestation_models(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prestation_models_tenant_position
  ON prestation_models(tenant_id, position);

ALTER TABLE prestation_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prestation_models_tenant_isolation ON prestation_models;
CREATE POLICY prestation_models_tenant_isolation ON prestation_models
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

CREATE OR REPLACE FUNCTION trg_prestation_models_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prestation_models_updated_at ON prestation_models;
CREATE TRIGGER prestation_models_updated_at
  BEFORE UPDATE ON prestation_models
  FOR EACH ROW EXECUTE FUNCTION trg_prestation_models_set_updated_at();

COMMIT;
