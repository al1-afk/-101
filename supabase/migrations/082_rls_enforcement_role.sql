-- ================================================================
--  Migration 082 : RÔLE D'EXÉCUTION SOUMIS À LA RLS
--
--  ── Le problème que cette migration ferme ───────────────────────
--  Le cloisonnement multi-tenant de la quasi-totalité des routes
--  (team.ts, stock.ts, vehicles.ts, outbound.ts, mySpace.ts…) repose
--  sur `tenantQuery()`, qui pose `app.current_tenant` et laisse la RLS
--  filtrer. Les requêtes s'écrivent `... WHERE id = $1`, sans filtre
--  tenant explicite. C'est correct — À CONDITION que la RLS s'applique.
--
--  Or elle ne s'applique PAS si le rôle de connexion est SUPERUSER ou
--  BYPASSRLS. C'est le cas constaté en développement (`said`), où un
--  espace voyait 104 clients d'autres espaces. Corriger les ~200
--  requêtes une par une serait long, risqué et facile à régresser :
--  il suffirait d'oublier un `AND tenant_id = $n` dans une future
--  route pour rouvrir la brèche.
--
--  ── La correction ───────────────────────────────────────────────
--  On crée un rôle `gestiq_rls`, explicitement NOSUPERUSER et
--  NOBYPASSRLS. `tenantQuery()` bascule sur ce rôle le temps de la
--  transaction (`SET LOCAL ROLE`). Résultat : même si l'application se
--  connecte avec un compte superuser (dev, incident de configuration,
--  migration de rôle oubliée), les requêtes métier restent soumises à
--  la RLS. La sécurité ne dépend plus de la configuration du compte de
--  connexion.
--
--  Le basculement est conditionnel côté applicatif : au démarrage, le
--  serveur teste s'il peut prendre ce rôle. S'il ne peut pas (rôle
--  absent, droits insuffisants), il continue SANS basculer et journalise
--  un avertissement — jamais de panne totale à cause de ce durcissement.
--
--  Idempotent.
-- ================================================================
BEGIN;

-- ── 1. Le rôle, sans aucun privilège d'échappement ────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    CREATE ROLE gestiq_rls NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  ELSE
    /* Garantit les attributs même si le rôle préexistait. */
    ALTER ROLE gestiq_rls NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- ── 2. Droits strictement nécessaires aux opérations métier ───────
GRANT USAGE ON SCHEMA public TO gestiq_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO gestiq_rls;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO gestiq_rls;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO gestiq_rls;

-- Les tables/séquences créées plus tard héritent des mêmes droits :
-- sans ça, la première migration suivante casserait l'application.
DO $$
DECLARE owner_role TEXT;
BEGIN
  FOR owner_role IN
    SELECT DISTINCT pg_get_userbyid(c.relowner)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestiq_rls', owner_role);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
         GRANT USAGE, SELECT ON SEQUENCES TO gestiq_rls', owner_role);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
         GRANT EXECUTE ON FUNCTIONS TO gestiq_rls', owner_role);
  END LOOP;
END $$;

-- ── 3. Le compte de connexion de l'application doit pouvoir prendre
--      ce rôle. On l'accorde à tous les rôles de connexion existants
--      susceptibles d'être utilisés par l'API.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['gestiq_api', 'said', 'postgres']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT gestiq_rls TO %I', r);
    END IF;
  END LOOP;
  /* Et au rôle courant, quel qu'il soit (déploiements où le compte
     applicatif porte un autre nom). */
  IF current_user <> 'gestiq_rls' THEN
    EXECUTE format('GRANT gestiq_rls TO %I', current_user);
  END IF;
END $$;

COMMIT;
