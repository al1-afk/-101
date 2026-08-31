-- ====================================================================
--  092 — Security Center
--
--  Le Security Center s'appuie presque entièrement sur des tables qui
--  existent déjà et contiennent de vraies données : refresh_tokens
--  (sessions), trusted_devices, security_events, security_alerts,
--  audit_logs, login_attempts. Cette migration n'en crée donc qu'UNE,
--  celle qui manquait vraiment, et ajoute ce qu'il faut pour lire les
--  autres vite et sûrement.
--
--  1. security_settings — la politique de sécurité de l'espace. Les
--     seuils vivaient en dur dans le code ; ils deviennent réglables,
--     mais restent appliqués CÔTÉ SERVEUR (le front ne fait que les
--     afficher).
--  2. Index de pagination pour l'onglet Audit et l'onglet Sessions :
--     sans eux, chaque page de journal ferait un balayage complet.
--  3. Protection en écriture du journal d'audit : un utilisateur
--     standard ne doit pas pouvoir réécrire l'histoire.
--
--  Idempotent : rejouable sans effet de bord.
-- ====================================================================
BEGIN;

-- ────────────────────────────────────────────────────────────────────
--  1. Réglages de sécurité (une ligne par espace)
--     Convention du projet : cf. notification_settings.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_settings (
  tenant_id                UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Sessions
  session_max_days         INTEGER     NOT NULL DEFAULT 90,   -- durée de vie d'une session
  idle_timeout_minutes     INTEGER     NOT NULL DEFAULT 0,    -- 0 = pas d'expiration sur inactivité

  -- Connexion
  max_login_attempts       INTEGER     NOT NULL DEFAULT 5,
  lockout_minutes          INTEGER     NOT NULL DEFAULT 15,

  -- 2FA
  require_2fa_admins       BOOLEAN     NOT NULL DEFAULT FALSE,
  require_2fa_all          BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Appareils de confiance
  trusted_devices_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  trusted_device_days      INTEGER     NOT NULL DEFAULT 30,

  -- Politique de mot de passe
  password_min_length      INTEGER     NOT NULL DEFAULT 8,
  password_require_upper   BOOLEAN     NOT NULL DEFAULT FALSE,
  password_require_digit   BOOLEAN     NOT NULL DEFAULT FALSE,
  password_require_symbol  BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/* Bornes de bon sens, appliquées par la base : une valeur absurde
   saisie dans l'écran ne doit pas pouvoir désarmer la sécurité —
   « 0 tentative maximum » bloquerait tout le monde, « 3650 jours »
   rendrait les sessions éternelles. */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'security_settings_bornes') THEN
    ALTER TABLE public.security_settings ADD CONSTRAINT security_settings_bornes CHECK (
      session_max_days        BETWEEN 1 AND 365
      AND idle_timeout_minutes    BETWEEN 0 AND 1440
      AND max_login_attempts      BETWEEN 3 AND 20
      AND lockout_minutes         BETWEEN 1 AND 1440
      AND trusted_device_days     BETWEEN 1 AND 365
      AND password_min_length     BETWEEN 8 AND 64
    );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_security_settings_updated_at ON public.security_settings;
CREATE TRIGGER trg_security_settings_updated_at
  BEFORE UPDATE ON public.security_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.security_settings IS
  'Politique de sécurité par espace. Appliquée côté serveur ; le front ne fait que l''afficher.';

-- ────────────────────────────────────────────────────────────────────
--  2. Index de lecture — pagination et filtres du Security Center
--     Sans eux, chaque page du journal balaie toute la table.
-- ────────────────────────────────────────────────────────────────────

/* Créés seulement si la table existe : les environnements n'ont pas
   tous le même historique de migrations, et un index manquant ne doit
   pas faire échouer toute la migration. */
DO $$
DECLARE
  cible RECORD;
BEGIN
  FOR cible IN
    SELECT * FROM (VALUES
      -- Onglet Audit Log : tri par date, puis filtres utilisateur et module.
      ('audit_logs',      'idx_audit_logs_tenant_date',       '(tenant_id, created_at DESC)',                        ''),
      ('audit_logs',      'idx_audit_logs_tenant_user',       '(tenant_id, user_id, created_at DESC)',               ''),
      ('audit_logs',      'idx_audit_logs_tenant_table',      '(tenant_id, table_name, created_at DESC)',            ''),
      -- Onglet Sessions : index partiel, les sessions mortes n'intéressent personne ici.
      ('refresh_tokens',  'idx_refresh_tokens_actives',       '(tenant_id, user_id, created_at DESC)',               ' WHERE revoked = FALSE'),
      -- Onglet Appareils.
      ('trusted_devices', 'idx_trusted_devices_actifs',       '(tenant_id, user_id, last_used_at DESC)',             ' WHERE revoked_at IS NULL'),
      -- Onglets Événements et Alertes.
      ('security_events', 'idx_security_events_tenant_date',  '(tenant_id, created_at DESC)',                        ''),
      ('security_alerts', 'idx_security_alerts_tenant_statut','(tenant_id, status, last_seen_at DESC)',              ''),
      -- Onglet Historique (login_history est la source de l'écran actuel).
      ('login_history',   'idx_login_history_tenant_date',    '(tenant_id, created_at DESC)',                        ''),
      -- Tentatives échouées du jour (carte du tableau de bord).
      -- NB : login_attempts est ANTÉRIEURE à l'authentification, donc
      -- sans tenant_id, et sa colonne de date est attempted_at.
      ('login_attempts',  'idx_login_attempts_echecs',        '(attempted_at DESC)',                                 ' WHERE success = FALSE')
    ) AS v(tbl, idx, cols, filtre)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = cible.tbl) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I %s%s',
                     cible.idx, cible.tbl, cible.cols, cible.filtre);
    ELSE
      RAISE NOTICE 'index % ignoré : table % absente', cible.idx, cible.tbl;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────
--  3. RLS sur les réglages
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_settings FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_security_settings ON public.security_settings;
DROP POLICY IF EXISTS rls_insert_security_settings ON public.security_settings;
DROP POLICY IF EXISTS rls_update_security_settings ON public.security_settings;
DROP POLICY IF EXISTS rls_delete_security_settings ON public.security_settings;

CREATE POLICY rls_select_security_settings ON public.security_settings
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_security_settings ON public.security_settings
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_security_settings ON public.security_settings
  FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_security_settings ON public.security_settings
  FOR DELETE USING (tenant_id = current_tenant_id());

-- ────────────────────────────────────────────────────────────────────
--  4. Le journal d'audit ne se réécrit pas
--
--  Un journal que l'on peut modifier ne prouve rien. Le rôle applicatif
--  restreint (gestiq_rls, celui sous lequel tournent les requêtes
--  utilisateur) peut LIRE et AJOUTER, mais ni modifier ni supprimer.
--  Les écritures internes du serveur passent par le rôle propriétaire
--  et ne sont pas concernées.
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    FOREACH t IN ARRAY ARRAY['audit_logs', 'security_audit_log', 'security_events', 'login_history']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM gestiq_rls', t);
        EXECUTE format('GRANT  SELECT, INSERT            ON public.%I TO   gestiq_rls', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
--  5. Le journal d'audit apprend QUI a agi
--
--  `log_mutation` enregistrait fidèlement ce qui changeait — table,
--  enregistrement, ancienne et nouvelle valeur — mais jamais l'auteur :
--  les 403 lignes de production avaient toutes user_id à NULL. Un
--  journal sans responsable ne répond pas à la seule question qu'on lui
--  pose vraiment après un incident.
--
--  Le déclencheur n'a aucun moyen de connaître l'utilisateur applicatif.
--  Il le lit donc dans la variable de session que l'API pose déjà à
--  chaque écriture, à côté de app.current_tenant (cf. db/pool.ts).
--  `current_setting(..., true)` renvoie NULL si elle est absente : les
--  écritures internes, les migrations et les scripts continuent de
--  fonctionner exactement comme avant.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_mutation() RETURNS TRIGGER AS $log_mutation$
DECLARE
  auteur UUID;
BEGIN
  BEGIN
    auteur := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    auteur := NULL;   -- valeur illisible : on journalise quand même
  END;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, user_id)
    VALUES (OLD.tenant_id, TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::jsonb, auteur);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, old_data, new_data, user_id)
    VALUES (NEW.tenant_id, TG_TABLE_NAME, NEW.id, 'UPDATE',
            row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, auteur);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, new_data, user_id)
    VALUES (NEW.tenant_id, TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW)::jsonb, auteur);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
/* Contexte de privilège INCHANGÉ (pas de SECURITY DEFINER) : la fonction
   d'origine s'exécutait sous le rôle appelant, et audit_logs est en RLS
   FORCÉE avec une politique d'insertion par tenant. Passer en DEFINER
   aurait modifié en silence qui insère, pour un gain nul — le GRANT
   INSERT ci-dessus suffit à ce que le rôle applicatif écrive. */
$log_mutation$ LANGUAGE plpgsql;

COMMIT;
