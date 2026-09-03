-- ════════════════════════════════════════════════════════════════════
--  GestiQ — Migration 096 : quels e-mails partent vraiment
--  Date : 2026-09-02
--
--  Les e-mails transactionnels (nouveau prospect, paiement reçu, devis
--  accepté, tâche à valider, expiration domaine/hébergement) partaient
--  systématiquement à tous les admins, sans aucun réglage possible :
--  un espace qui n'en voulait qu'un devait tous les subir.
--
--  `email_kinds` liste les catégories réellement envoyées par e-mail.
--  Le défaut reprend l'ensemble des catégories existantes : aucun espace
--  ne perd un e-mail qu'il recevait avant cette migration.
--
--  Les rapports quotidien / hebdomadaire gardent leurs propres
--  interrupteurs (daily_report_enabled, weekly_report_enabled) : ils
--  sont planifiés, pas déclenchés par un événement.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS email_kinds text[] NOT NULL
    DEFAULT ARRAY['projet_message','prospect_nouveau','paiement_recu',
                  'devis_accepte','tache_validation','tache_creee','expiration'];

COMMENT ON COLUMN public.notification_settings.email_kinds IS
  'Catégories d''e-mails transactionnels réellement envoyées. Une catégorie absente de la liste reste visible dans la cloche et en notification navigateur, mais ne part pas par e-mail.';

COMMIT;

-- Vérification :
--   SELECT tenant_id, email_kinds FROM notification_settings;
--
-- Pour ne recevoir QUE les e-mails de discussion sur un espace :
--   UPDATE notification_settings SET email_kinds = ARRAY['projet_message']
--    WHERE tenant_id = '<uuid>';
