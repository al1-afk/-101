-- ====================================================================
--  Migration 083 : MODULE FINANCIER COMPLET
--
--  ── Ce qui existait ────────────────────────────────────────────────
--  bank_accounts (solde_initial) + depenses.bank_account_id +
--  paiements.bank_account_id, avec une vue bank_accounts_with_solde
--  qui recalculait le solde = solde_initial + Σ paiements − Σ dépenses.
--
--  Manquaient : les revenus hors facturation, les prévisions (revenus
--  et dépenses à venir), les virements internes et la correction
--  manuelle d'un solde. Cette migration les ajoute SANS toucher aux
--  données existantes — aucune colonne n'est supprimée ni réécrite.
--
--  ── Principes de cohérence (cf. cahier des charges) ────────────────
--    Revenu encaissé   → augmente le compte
--    Dépense payée     → diminue le compte
--    Transfert         → déplace l'argent, patrimoine total inchangé
--    Ajustement manuel → corrige le solde SANS créer de revenu/dépense
--    Prévision         → n'impacte JAMAIS le solde réel avant réalisation
--
--  Le solde réel d'un compte est donc :
--      solde_initial
--    + Σ paiements encaissés (status='paye')
--    + Σ revenus
--    + Σ ajustements.difference        (delta, jamais un écrasement)
--    + Σ transferts entrants
--    − Σ dépenses
--    − Σ transferts sortants
--
--  Isolation tenant : RLS via app.current_tenant (réglage canonique
--  posé par server/db/pool.ts → tenantQuery).
--
--  Idempotent : re-runnable sans effet de bord.
-- ====================================================================
BEGIN;

-- ────────────────────────────────────────────────────────────────────
--  1. PRÉVISIONS FINANCIÈRES (revenus prévus + dépenses prévues)
--
--  Une seule table pour les deux sens : la logique métier est
--  identique (montant, date prévue, compte, statut, réalisation), seul
--  le signe change. Éviter deux tables jumelles évite deux fois le
--  code serveur, les politiques RLS et les hooks front.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS previsions_financieres (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sens             TEXT NOT NULL CHECK (sens IN ('revenu', 'depense')),
  montant          NUMERIC(14,2) NOT NULL CHECK (montant > 0),
  date_prevue      DATE NOT NULL DEFAULT CURRENT_DATE,
  bank_account_id  UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  categorie        TEXT,
  -- Client / source pour un revenu ; fournisseur / bénéficiaire pour une dépense
  source           TEXT,
  client_id        UUID,
  projet_id        UUID,
  description      TEXT,
  type             TEXT NOT NULL DEFAULT 'business'
                     CHECK (type IN ('personnel', 'business')),
  -- prevu / facture / en_retard : ACTIF (compte dans le prévisionnel)
  -- recu / paye / annule        : SOLDÉ (ne compte plus)
  statut           TEXT NOT NULL DEFAULT 'prevu'
                     CHECK (statut IN ('prevu','facture','en_retard','recu','paye','annule')),
  -- Réalisation : montant réellement encaissé/payé, qui peut différer
  -- du montant prévu. La prévision n'est jamais supprimée : on garde
  -- le lien vers la transaction réelle.
  montant_realise  NUMERIC(14,2),
  date_realisation DATE,
  revenu_id        UUID,
  depense_id       UUID,
  op_id            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_previsions_tenant        ON previsions_financieres(tenant_id);
CREATE INDEX IF NOT EXISTS idx_previsions_tenant_statut ON previsions_financieres(tenant_id, sens, statut);
CREATE INDEX IF NOT EXISTS idx_previsions_date          ON previsions_financieres(date_prevue);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_previsions_op
  ON previsions_financieres(tenant_id, op_id) WHERE op_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
--  2. REVENUS ENCAISSÉS
--
--  Distincts de `paiements` (qui reste le règlement d'une facture
--  client). Ici : tout encaissement — apport, remboursement, vente
--  directe, subvention… Les deux alimentent le solde, sans doublon
--  puisque ce sont deux enregistrements distincts.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenus (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  montant          NUMERIC(14,2) NOT NULL CHECK (montant > 0),
  date_revenu      DATE NOT NULL DEFAULT CURRENT_DATE,
  bank_account_id  UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  categorie        TEXT NOT NULL DEFAULT 'autre',
  source           TEXT,
  client_id        UUID,
  projet_id        UUID,
  description      TEXT,
  type             TEXT NOT NULL DEFAULT 'business'
                     CHECK (type IN ('personnel', 'business')),
  -- Lien vers la prévision dont ce revenu est la réalisation (NULL si
  -- revenu saisi directement).
  prevision_id     UUID REFERENCES previsions_financieres(id) ON DELETE SET NULL,
  op_id            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenus_tenant   ON revenus(tenant_id);
CREATE INDEX IF NOT EXISTS idx_revenus_date     ON revenus(date_revenu);
CREATE INDEX IF NOT EXISTS idx_revenus_account  ON revenus(bank_account_id) WHERE bank_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_revenus_op
  ON revenus(tenant_id, op_id) WHERE op_id IS NOT NULL;

/* UNE prévision ne peut avoir qu'UNE réalisation. Garantie structurelle du
   « pas de double encaissement » : même si un chemin applicatif rouvrait une
   prévision déjà soldée, la base refuserait le second revenu. */
CREATE UNIQUE INDEX IF NOT EXISTS uniq_revenus_prevision
  ON revenus(prevision_id) WHERE prevision_id IS NOT NULL;

-- Le lien inverse prévision → revenu (posé après création des 2 tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'previsions_revenu_fk'
  ) THEN
    ALTER TABLE previsions_financieres
      ADD CONSTRAINT previsions_revenu_fk
      FOREIGN KEY (revenu_id) REFERENCES revenus(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
--  3. DÉPENSES : lien vers la prévision + garde anti-doublon
--     (colonnes additives — aucune donnée existante touchée)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE depenses
  ADD COLUMN IF NOT EXISTS prevision_id UUID
    REFERENCES previsions_financieres(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS op_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_depenses_op
  ON depenses(tenant_id, op_id) WHERE op_id IS NOT NULL;

/* Même garantie que pour les revenus : une dépense prévue ne peut pas être
   payée deux fois. */
CREATE UNIQUE INDEX IF NOT EXISTS uniq_depenses_prevision
  ON depenses(prevision_id) WHERE prevision_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'previsions_depense_fk'
  ) THEN
    ALTER TABLE previsions_financieres
      ADD CONSTRAINT previsions_depense_fk
      FOREIGN KEY (depense_id) REFERENCES depenses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
--  4. TRANSFERTS ENTRE COMPTES
--
--  Ni revenu ni dépense : l'argent change de poche, le patrimoine
--  total est inchangé. Une seule ligne porte les deux mouvements —
--  impossible d'avoir un débit sans son crédit.
-- ────────────────────────────────────────────────────────────────────
/*  ON DELETE RESTRICT — et non CASCADE : un transfert appartient à DEUX
    comptes. Effacer la ligne avec le compte source ferait chuter le solde
    du compte de DESTINATION (qui, lui, existe toujours) du montant
    transféré, sans aucune ligne d'historique pour l'expliquer. La base
    refuse donc de supprimer un compte porteur de transferts ; l'API le dit
    explicitement à l'utilisateur (server/routes/crud.ts), qui peut soit
    supprimer les transferts concernés, soit désactiver le compte. */
CREATE TABLE IF NOT EXISTS transferts_comptes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compte_source_id       UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  compte_destination_id  UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  montant                NUMERIC(14,2) NOT NULL CHECK (montant > 0),
  date_transfert         DATE NOT NULL DEFAULT CURRENT_DATE,
  note                   TEXT,
  op_id                  TEXT,
  created_by             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transfert_comptes_differents
    CHECK (compte_source_id <> compte_destination_id)
);

/* Réparation idempotente : si la table existait déjà avec des FK en
   CASCADE (première version de cette migration), on les repasse en
   RESTRICT sans toucher aux données. */
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname, att.attname
      FROM pg_constraint con
      JOIN pg_attribute  att ON att.attrelid = con.conrelid
                            AND att.attnum   = con.conkey[1]
     WHERE con.conrelid = 'transferts_comptes'::regclass
       AND con.contype  = 'f'
       AND con.confrelid = 'bank_accounts'::regclass
       AND con.confdeltype <> 'r'          -- 'r' = RESTRICT
  LOOP
    EXECUTE format('ALTER TABLE transferts_comptes DROP CONSTRAINT %I', c.conname);
    EXECUTE format(
      'ALTER TABLE transferts_comptes ADD CONSTRAINT %I
         FOREIGN KEY (%I) REFERENCES bank_accounts(id) ON DELETE RESTRICT',
      c.conname, c.attname);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_transferts_tenant ON transferts_comptes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transferts_source ON transferts_comptes(compte_source_id);
CREATE INDEX IF NOT EXISTS idx_transferts_dest   ON transferts_comptes(compte_destination_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transferts_op
  ON transferts_comptes(tenant_id, op_id) WHERE op_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
--  5. AJUSTEMENTS MANUELS DE SOLDE
--
--  Table de journal, en AJOUT SEUL : on n'écrase jamais un solde, on
--  enregistre l'écart constaté. Le solde calculé intègre la somme des
--  écarts — ce qui rend l'ajustement réversible et traçable, et
--  garantit qu'il n'est comptabilisé ni en revenu ni en dépense.
-- ────────────────────────────────────────────────────────────────────
/*  Ici CASCADE est volontaire (contrairement aux transferts) : un
    ajustement ne concerne QU'UN compte. Si ce compte disparaît, sa ligne
    de journal n'a plus de sujet et aucun autre solde n'en dépend. « Ajout
    seul » porte sur le fait de ne jamais écraser un écart enregistré, pas
    sur la survie du compte lui-même. */
CREATE TABLE IF NOT EXISTS bank_account_adjustments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id  UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  ancien_solde     NUMERIC(14,2) NOT NULL,
  nouveau_solde    NUMERIC(14,2) NOT NULL,
  difference       NUMERIC(14,2) NOT NULL,
  motif            TEXT NOT NULL DEFAULT 'correction'
                     CHECK (motif IN ('depenses_non_enregistrees',
                                      'revenus_non_enregistres',
                                      'correction',
                                      'autre')),
  note             TEXT,
  date_ajustement  DATE NOT NULL DEFAULT CURRENT_DATE,
  op_id            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adjustments_tenant  ON bank_account_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_account ON bank_account_adjustments(bank_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_adjustments_op
  ON bank_account_adjustments(tenant_id, op_id) WHERE op_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────
--  6. RLS — cloisonnement tenant (réglage canonique app.current_tenant)
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['previsions_financieres', 'revenus',
                           'transferts_comptes', 'bank_account_adjustments']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         USING (tenant_id = current_setting(''app.current_tenant'', TRUE)::uuid)
         WITH CHECK (tenant_id = current_setting(''app.current_tenant'', TRUE)::uuid)',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;

-- Droits pour le rôle d'exécution soumis à la RLS (migration 082).
-- ALTER DEFAULT PRIVILEGES devrait suffire ; on l'explicite pour les
-- environnements où la migration 082 a été jouée par un autre rôle.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON previsions_financieres, revenus, transferts_comptes, bank_account_adjustments
      TO gestiq_rls;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
--  7. updated_at automatique
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_finance_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS previsions_updated_at ON previsions_financieres;
CREATE TRIGGER previsions_updated_at
  BEFORE UPDATE ON previsions_financieres
  FOR EACH ROW EXECUTE FUNCTION trg_finance_set_updated_at();

DROP TRIGGER IF EXISTS revenus_updated_at ON revenus;
CREATE TRIGGER revenus_updated_at
  BEFORE UPDATE ON revenus
  FOR EACH ROW EXECUTE FUNCTION trg_finance_set_updated_at();

-- ────────────────────────────────────────────────────────────────────
--  7 bis. GARDE-FOU : une prévision réalisée ne se rouvre pas toute seule
--
--  Le seul moyen légitime de rouvrir une prévision « reçue » / « payée »
--  est de supprimer la transaction qu'elle a produite (le serveur le fait
--  dans une transaction unique : DELETE du revenu/de la dépense, PUIS
--  réouverture). Sans ce garde-fou, un simple PATCH `statut='prevu'` via
--  l'API CRUD générique permettrait de re-encaisser la même prévision une
--  seconde fois. La règle vit ici, en base : elle tient quel que soit le
--  chemin d'écriture.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_previsions_guard_reouverture()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.statut IN ('recu', 'paye') AND NEW.statut NOT IN ('recu', 'paye') THEN
    IF (OLD.revenu_id  IS NOT NULL AND EXISTS (SELECT 1 FROM revenus  WHERE id = OLD.revenu_id))
    OR (OLD.depense_id IS NOT NULL AND EXISTS (SELECT 1 FROM depenses WHERE id = OLD.depense_id)) THEN
      RAISE EXCEPTION
        'Cette prévision est déjà réalisée : supprimez la transaction liée pour la rouvrir.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS previsions_guard_reouverture ON previsions_financieres;
CREATE TRIGGER previsions_guard_reouverture
  BEFORE UPDATE OF statut ON previsions_financieres
  FOR EACH ROW EXECUTE FUNCTION trg_previsions_guard_reouverture();

-- ────────────────────────────────────────────────────────────────────
--  8. VUE « solde réel » — source de vérité SQL
--
--  Remplace la définition de 073 en intégrant revenus, transferts et
--  ajustements. Deux corrections au passage :
--    · seuls les paiements encaissés (status='paye') comptent — un
--      paiement en attente n'est pas encore sur le compte (c'est déjà
--      ce que faisait le calcul côté client, la vue divergeait) ;
--    · le solde ne dépend d'aucun trigger : il se recalcule toujours
--      à partir des mouvements, donc il ne peut pas « dériver ».
-- ────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS bank_accounts_with_solde;
CREATE VIEW bank_accounts_with_solde AS
SELECT
  a.*,
  COALESCE((SELECT SUM(p.montant) FROM paiements p
             WHERE p.bank_account_id = a.id AND p.status = 'paye'), 0) AS total_paiements,
  COALESCE((SELECT SUM(r.montant) FROM revenus r
             WHERE r.bank_account_id = a.id), 0)                        AS total_revenus,
  COALESCE((SELECT SUM(d.montant) FROM depenses d
             WHERE d.bank_account_id = a.id), 0)                        AS total_depenses,
  COALESCE((SELECT SUM(t.montant) FROM transferts_comptes t
             WHERE t.compte_destination_id = a.id), 0)                  AS total_transferts_entrants,
  COALESCE((SELECT SUM(t.montant) FROM transferts_comptes t
             WHERE t.compte_source_id = a.id), 0)                       AS total_transferts_sortants,
  COALESCE((SELECT SUM(j.difference) FROM bank_account_adjustments j
             WHERE j.bank_account_id = a.id), 0)                        AS total_ajustements,
  a.solde_initial
    + COALESCE((SELECT SUM(p.montant) FROM paiements p
                 WHERE p.bank_account_id = a.id AND p.status = 'paye'), 0)
    + COALESCE((SELECT SUM(r.montant) FROM revenus r
                 WHERE r.bank_account_id = a.id), 0)
    + COALESCE((SELECT SUM(t.montant) FROM transferts_comptes t
                 WHERE t.compte_destination_id = a.id), 0)
    + COALESCE((SELECT SUM(j.difference) FROM bank_account_adjustments j
                 WHERE j.bank_account_id = a.id), 0)
    - COALESCE((SELECT SUM(d.montant) FROM depenses d
                 WHERE d.bank_account_id = a.id), 0)
    - COALESCE((SELECT SUM(t.montant) FROM transferts_comptes t
                 WHERE t.compte_source_id = a.id), 0)
    AS solde_live
FROM bank_accounts a;

-- Une vue s'exécute par défaut avec les droits de son PROPRIÉTAIRE :
-- la RLS des tables sous-jacentes serait évaluée pour lui, pas pour
-- l'appelant — soit un contournement du cloisonnement. `security_invoker`
-- (PostgreSQL ≥ 15) rétablit l'évaluation du côté de l'appelant.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW bank_accounts_with_solde SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT ON bank_accounts_with_solde TO gestiq_rls;
  END IF;
END $$;

COMMIT;
