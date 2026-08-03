-- ================================================================
--  Migration 081 : DURCISSEMENT DU CLOISONNEMENT MULTI-TENANT
--
--  Contexte — ce que l'audit a réellement constaté :
--
--  1. Trois tables (`projet_assignees`, `projet_messages`,
--     `projet_templates`) ont des politiques RLS qui lisent le réglage
--     `app.current_tenant_id`, alors que l'application définit
--     `app.current_tenant` (server/db/pool.ts → tenantQuery).
--     Le réglage lu n'existant jamais, `current_setting()` renvoie NULL
--     et la condition `tenant_id = NULL` est FAUSSE pour toute ligne :
--     ces politiques REFUSENT tout. Si elles fonctionnent aujourd'hui,
--     c'est uniquement parce que la RLS est CONTOURNÉE (rôle superuser
--     ou propriétaire d'une table non FORCÉE). Autrement dit : le jour
--     où le cloisonnement s'appliquerait vraiment, ces trois tables
--     deviendraient vides. On corrige le nom du réglage.
--
--  2. Dix tables avaient la RLS activée SANS `FORCE`. Or `ENABLE ROW
--     LEVEL SECURITY` ne s'applique pas au PROPRIÉTAIRE de la table :
--     si le rôle applicatif possède la table, l'isolation est nulle.
--     On force donc la RLS partout où c'est possible sans casser un
--     usage légitime.
--
--  `tenants` est délibérément EXCLUE : c'est une table globale, lue
--  sans contexte tenant (résolution d'un espace par son slug avant
--  authentification, JOIN pendant le login) et écrite à l'inscription.
--  La forcer casserait la connexion et l'inscription. Son cloisonnement
--  est assuré applicativement.
--
--  Rappel : depuis cette version, l'API CRUD générique ajoute EN PLUS
--  un filtre applicatif `tenant_id = $n` (server/routes/crud.ts +
--  server/db/tenantColumns.ts). La RLS n'est donc plus l'unique ligne
--  de défense — mais elle doit quand même être correcte.
--
--  Idempotent : DROP POLICY IF EXISTS + CREATE. Safe à re-runner.
-- ================================================================
BEGIN;

-- ─────────────────────────────────────────────────────────────────
--  1. Correction du réglage lu par les politiques « projet_* »
--     app.current_tenant_id  →  app.current_tenant  (canonique)
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t   TEXT;
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['projet_assignees', 'projet_messages', 'projet_templates']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    /* Supprime les politiques existantes de la table (quel que soit
       leur nom : elles diffèrent d'un environnement à l'autre). */
    FOR pol IN
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY rls_all_%1$s ON public.%1$I
         FOR ALL
         USING (tenant_id = current_tenant_id())
         WITH CHECK (tenant_id = current_tenant_id())', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
--  2. FORCE ROW LEVEL SECURITY
--
--  Toutes ces tables sont exclusivement lues/écrites via `tenantQuery`
--  (contexte tenant positionné) — vérifié route par route avant
--  d'appliquer cette migration.
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'abonnements',
    'ai_quote_generations',
    'client_subscriptions',
    'contacts',
    'prestation_models',
    'projet_assignees',
    'projet_messages',
    'projet_templates',
    'security_audit_log'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────
--  3. Filet : toute table publique portant `tenant_id`, ayant déjà des
--     politiques, mais dont la RLS n'est ni activée ni forcée, est
--     alignée. Évite qu'une table ajoutée plus tard passe entre les
--     mailles (c'est exactement ce qui s'est produit ici).
--
--     Les tables d'infrastructure d'authentification et de monitoring
--     sont exclues : elles sont volontairement hors RLS (événements
--     pré-authentification sans tenant, cf. migration 080) et leur
--     cloisonnement est appliqué explicitement dans chaque requête.
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity                      -- RLS déjà activée
       AND NOT c.relforcerowsecurity             -- mais pas forcée
       AND EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = c.relname)
       AND EXISTS (SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema = 'public'
                      AND col.table_name = c.relname
                      AND col.column_name = 'tenant_id')
       AND c.relname <> 'tenants'
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
    RAISE NOTICE 'FORCE RLS appliquée sur %', r.relname;
  END LOOP;
END $$;

COMMIT;
