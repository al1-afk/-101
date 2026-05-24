-- ================================================================
--  Migration 049 : tables manquantes en prod + fixes
--    1. CREATE TABLE abonnements          (manquait)
--    2. CREATE TABLE client_subscriptions (manquait)
--    3. depenses.user_id : rendre NULL-able (le front n'envoie pas user_id)
-- ================================================================

-- ──────────────────────────────────────────────────────────
-- 1. abonnements
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abonnements (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nom                 TEXT          NOT NULL,
  fournisseur         TEXT,
  montant             NUMERIC(10,2) NOT NULL DEFAULT 0,
  cycle               TEXT          DEFAULT 'mensuel' CHECK (cycle IN ('mensuel','trimestriel','annuel')),
  date_debut          DATE          NOT NULL DEFAULT CURRENT_DATE,
  date_renouvellement DATE,
  statut              TEXT          DEFAULT 'actif' CHECK (statut IN ('actif','pause','annule')),
  notes               TEXT,
  created_at          TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abonnements_tenant ON abonnements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_abonnements_tenant_renouv ON abonnements (tenant_id, date_renouvellement);

ALTER TABLE abonnements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS abonnements_tenant_isolation ON abonnements;
CREATE POLICY abonnements_tenant_isolation ON abonnements
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- ──────────────────────────────────────────────────────────
-- 2. client_subscriptions
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id                         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id                  UUID          REFERENCES clients(id) ON DELETE SET NULL,
  nom                        TEXT          NOT NULL,
  montant                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  cycle                      TEXT          DEFAULT 'mensuel' CHECK (cycle IN ('mensuel','trimestriel','annuel')),
  montant_mensuel            NUMERIC(12,2) DEFAULT 0,
  date_debut                 DATE          NOT NULL DEFAULT CURRENT_DATE,
  date_prochaine_facturation DATE,
  statut                     TEXT          DEFAULT 'actif' CHECK (statut IN ('actif','pause','annule','impaye')),
  facture_auto               BOOLEAN       DEFAULT FALSE,
  date_annulation            DATE,
  annulation_raison          TEXT,
  created_at                 TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientsubs_tenant ON client_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientsubs_tenant_client ON client_subscriptions (tenant_id, client_id);

ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_subscriptions_tenant_isolation ON client_subscriptions;
CREATE POLICY client_subscriptions_tenant_isolation ON client_subscriptions
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- ──────────────────────────────────────────────────────────
-- 3. depenses.user_id : rendre nullable (le front ne l'envoie pas)
-- ──────────────────────────────────────────────────────────
ALTER TABLE depenses ALTER COLUMN user_id DROP NOT NULL;
