-- ================================================================
--  Migration 068 : OUTBOUND — Enrichment, verification, AI drafts,
--                  WhatsApp templates Meta (Cloud API).
--
--  Dépend de : 067_outbound_marketing_module.sql
--
--  Ajoute :
--    - outbound_prospects : verification email/phone, drafts AI,
--                           traçabilité enrichissement (Google Places).
--    - outbound_templates : nom + langue du template Meta pré-approuvé.
--    - outbound_activities.metadata : conserve wamid / message-id email
--                                     pour delivery tracking futur (Phase 2).
-- ================================================================
BEGIN;

/* ── outbound_prospects — enrichissement & vérification ── */
ALTER TABLE outbound_prospects
  ADD COLUMN IF NOT EXISTS email_verified              BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verified_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verification_status   TEXT
    CHECK (email_verification_status IN ('valid','invalid','risky','unknown') OR email_verification_status IS NULL),
  ADD COLUMN IF NOT EXISTS phone_verified              BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_draft_email_subject      TEXT,
  ADD COLUMN IF NOT EXISTS ai_draft_email_body         TEXT,
  ADD COLUMN IF NOT EXISTS ai_draft_whatsapp           TEXT,
  ADD COLUMN IF NOT EXISTS ai_generated_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_generated_lang           TEXT,
  ADD COLUMN IF NOT EXISTS google_place_id             TEXT,
  ADD COLUMN IF NOT EXISTS enriched_from               TEXT
    CHECK (enriched_from IN ('google_places','manual','csv','api') OR enriched_from IS NULL),
  ADD COLUMN IF NOT EXISTS enriched_at                 TIMESTAMPTZ;

/* Index unique tenant-scoped sur google_place_id → dédup import. */
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_prospects_gplace
  ON outbound_prospects (tenant_id, google_place_id)
  WHERE google_place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_prospects_email_verified
  ON outbound_prospects (email_verified) WHERE email IS NOT NULL;

/* ── outbound_templates — Meta WhatsApp templates ── */
ALTER TABLE outbound_templates
  ADD COLUMN IF NOT EXISTS whatsapp_template_name      TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_template_language  TEXT DEFAULT 'ar'
    CHECK (whatsapp_template_language IN ('ar','fr','en') OR whatsapp_template_language IS NULL);

COMMIT;
