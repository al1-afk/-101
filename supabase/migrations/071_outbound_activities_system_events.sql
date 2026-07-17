-- ================================================================
--  Migration 071 : outbound_activities.auteur_id nullable
--
--  Certaines activités sont générées par le SYSTÈME (Autopilot,
--  webhooks WhatsApp, jobs cron) sans utilisateur connecté. Rendre
--  auteur_id nullable évite d'inventer un "system user" fictif.
--
--  auteur_nom reste utilisé (ex: "Autopilot", "Webhook Meta").
-- ================================================================
BEGIN;

ALTER TABLE outbound_activities
  ALTER COLUMN auteur_id DROP NOT NULL;

COMMIT;
