-- ================================================================
--  Migration 084 : type d'activité 'whatsapp' dans prospect_logs
--
--  Nouveau canal de suivi CRM : « Audio WhatsApp » (vocal envoyé/reçu,
--  message WhatsApp). La contrainte CHECK de la migration 075 refusait
--  toute valeur hors ('creation','statut','note','edit','appel','email'),
--  ce qui faisait échouer l'insert du nouveau type.
--
--  Idempotent : DROP CONSTRAINT IF EXISTS + recréation. Safe à re-runner.
-- ================================================================
BEGIN;

-- Supprime TOUTE contrainte CHECK portant sur prospect_logs.type, quel que
-- soit son nom (la 075 la créait inline → nom auto-généré par Postgres).
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class     rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
      JOIN pg_attribute att ON att.attrelid = rel.oid
                           AND att.attnum = ANY (con.conkey)
     WHERE ns.nspname  = 'public'
       AND rel.relname = 'prospect_logs'
       AND con.contype = 'c'
       AND att.attname = 'type'
  LOOP
    EXECUTE format('ALTER TABLE public.prospect_logs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.prospect_logs
  ADD CONSTRAINT prospect_logs_type_check
  CHECK (type IN ('creation','statut','note','edit','appel','email','whatsapp'));

COMMIT;
