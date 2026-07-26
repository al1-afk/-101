-- ====================================================================
--  Migration 078 : Génération de devis par IA
--
--  1. Lie un devis à son prospect d'origine (devis.prospect_id) et rend
--     client_id nullable — un brouillon IA part d'un prospect qui n'est
--     pas encore un client (aucune conversion automatique).
--  2. Table de traçabilité ai_quote_generations : une ligne par
--     génération (analyse + proposition), pour l'audit et le suivi.
--
--  Isolation tenant : RLS via current_setting('app.current_tenant')
--  (même convention que 077_prestation_models.sql, cf. server/db/pool.ts).
--
--  100 % réversible / idempotent : IF [NOT] EXISTS partout, aucune
--  donnée existante n'est touchée, les anciens devis continuent de
--  fonctionner (les deux colonnes ajoutées sont facultatives).
-- ====================================================================
BEGIN;

-- ─── 1. devis : lien prospect + client_id facultatif ───────────────
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS prospect_id UUID
  REFERENCES public.prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_devis_prospect ON public.devis(prospect_id);

-- Un brouillon IA généré depuis un prospect n'a pas (encore) de client.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'devis'
      AND column_name = 'client_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.devis ALTER COLUMN client_id DROP NOT NULL;
  END IF;
END$$;

-- ─── 2. Table de traçabilité des générations IA ────────────────────
CREATE TABLE IF NOT EXISTS public.ai_quote_generations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  prospect_id      UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  quote_id         UUID REFERENCES public.devis(id)     ON DELETE SET NULL,
  -- utilisateur (users.id) ayant lancé la génération
  generated_by     UUID,
  -- analyzed → generated → quote_created | error
  status           TEXT NOT NULL DEFAULT 'analyzed'
                     CHECK (status IN ('analyzed','generated','quote_created','error')),
  -- instantané des sources envoyées à l'IA (données nettoyées — pas de secret)
  input_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_result  JSONB,
  generated_result JSONB,
  model_name       TEXT,
  prompt_version   TEXT,
  confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
  warning_count    INTEGER NOT NULL DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_quote_gen_tenant
  ON public.ai_quote_generations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_quote_gen_prospect
  ON public.ai_quote_generations(tenant_id, prospect_id);
CREATE INDEX IF NOT EXISTS idx_ai_quote_gen_quote
  ON public.ai_quote_generations(quote_id);

ALTER TABLE public.ai_quote_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_quote_generations_tenant_isolation ON public.ai_quote_generations;
CREATE POLICY ai_quote_generations_tenant_isolation ON public.ai_quote_generations
  USING (tenant_id = current_setting('app.current_tenant', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', TRUE)::uuid);

CREATE OR REPLACE FUNCTION trg_ai_quote_generations_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_quote_generations_updated_at ON public.ai_quote_generations;
CREATE TRIGGER ai_quote_generations_updated_at
  BEFORE UPDATE ON public.ai_quote_generations
  FOR EACH ROW EXECUTE FUNCTION trg_ai_quote_generations_set_updated_at();

COMMIT;

-- ─── Rollback (manuel) ─────────────────────────────────────────────
-- BEGIN;
--   DROP TABLE IF EXISTS public.ai_quote_generations;
--   DROP INDEX IF EXISTS idx_devis_prospect;
--   ALTER TABLE public.devis DROP COLUMN IF EXISTS prospect_id;
--   -- (client_id reste nullable — inoffensif)
-- COMMIT;
