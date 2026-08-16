-- ====================================================================
--  Migration 087 : MODULE 7aty — « Où va mon temps ? »
--
--  Objectif : répondre honnêtement, chaque semaine, à quatre questions —
--  qu'est-ce que je dois ARRÊTER, DÉLÉGUER, AUGMENTER, et combien
--  d'heures ai-je RÉCUPÉRÉES ?
--
--  Le module enregistre des BLOCS DE TEMPS saisis à la main (aucune
--  surveillance du téléphone ni des applications) et les classe en
--  quatre natures :
--
--    'valeur'  💰 temps à haute valeur   (vente, production, stratégie…)
--    'neutre'  🟡 nécessaire mais pas stratégique (admin, trajets…)
--    'repos'   🟢 repos PLANIFIÉ         (famille, sport, film choisi)
--    'perdu'   🔴 temps réellement perdu (scroll non planifié, dérive)
--
--  ── Pourquoi `kind` ET `control_level` ────────────────────────────
--  La règle centrale du module est que « repos planifié ≠ temps perdu ».
--  Un film de 21 h à 22 h décidé la veille est du repos ; le même film
--  ouvert à 14 h au milieu du travail est du temps perdu. La CATÉGORIE
--  seule ne peut donc pas trancher — c'est le niveau de contrôle qui
--  fait la différence :
--
--    'controle'      🟢 choisi, pendant un temps de repos
--    'necessaire'    🟡 c'était nécessaire
--    'non_planifie'  🟠 arrivé sans avoir été prévu
--    'perte_controle'🔴 entré dedans sans le vouloir, et continué
--
--  `kind` est la classification FINALE (proposée par l'interface depuis
--  catégorie + niveau de contrôle, toujours modifiable). C'est elle qui
--  alimente les totaux et le Distraction Score ; le niveau de contrôle
--  reste stocké pour l'analyse des schémas (perte de contrôle récurrente
--  le soir, après les réunions, après une longue session de code…).
--
--  ── Tables créées ─────────────────────────────────────────────────
--   time_entries   un bloc de temps. `ended_at IS NULL` = chronomètre en
--                  cours. Un seul chronomètre à la fois par personne
--                  (index unique partiel).
--   time_goals     plafond hebdomadaire par catégorie (ex. Instagram
--                  3 h/semaine).
--   time_settings  heures de travail, seuil d'alerte, objectif d'heures
--                  à haute valeur. Une ligne par personne.
--
--  ── Confidentialité ───────────────────────────────────────────────
--  Ces lignes sont PERSONNELLES : chaque table porte `user_id` et
--  l'API (server/routes/timeTracking.ts) filtre systématiquement sur
--  `req.user.userId`. La RLS assure l'isolation entre espaces ; le
--  filtre `user_id` assure l'isolation entre personnes du même espace.
--  Le module n'est volontairement PAS exposé par le CRUD générique
--  (/api/:table), qui ne sait pas scoper à l'utilisateur.
--
--  Idempotent : IF NOT EXISTS + DROP … IF EXISTS partout.
-- ====================================================================
BEGIN;

-- ────────────────────────────────────────────────────────────────────
--  1. BLOCS DE TEMPS
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,

  -- Nom libre de l'activité (« Instagram », « Appel client Nadia »…).
  label        TEXT NOT NULL,
  -- Clé du catalogue partagé (src/lib/timeCategories.ts). Volontairement
  -- TEXT libre et non ENUM : le catalogue évolue côté produit sans
  -- migration, et une clé retirée reste lisible dans l'historique.
  category_key TEXT NOT NULL,

  kind          TEXT NOT NULL
                  CHECK (kind IN ('valeur', 'neutre', 'repos', 'perdu')),
  control_level TEXT
                  CHECK (control_level IN ('controle', 'necessaire',
                                           'non_planifie', 'perte_controle')),

  started_at TIMESTAMPTZ NOT NULL,
  -- NULL = chronomètre en cours de route.
  ended_at   TIMESTAMPTZ,
  -- Posée par trigger, jamais par le client : deux onglets ouverts ne
  -- peuvent pas produire deux durées différentes pour le même bloc.
  duration_min INTEGER,

  notes  TEXT,
  -- 'timer' = Start/Stop, 'quick' = Quick Log 1 clic, 'manual' = saisie.
  source TEXT NOT NULL DEFAULT 'manual'
           CHECK (source IN ('manual', 'timer', 'quick')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un bloc terminé finit forcément après avoir commencé. Sans ce garde-fou
-- une inversion de champs produirait une durée négative qui fausserait
-- tous les totaux de la semaine.
ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_period_ck;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_period_ck
  CHECK (ended_at IS NULL OR ended_at > started_at);

-- Un seul chronomètre en cours par personne : « Start » alors qu'un
-- autre tourne doit fermer le précédent, pas en ouvrir un second.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_running_per_user
  ON public.time_entries (user_id)
  WHERE ended_at IS NULL;

-- Lecture dominante : « mes blocs entre deux dates », toujours triés.
CREATE INDEX IF NOT EXISTS time_entries_user_started_idx
  ON public.time_entries (tenant_id, user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS time_entries_category_idx
  ON public.time_entries (tenant_id, user_id, category_key);

COMMENT ON TABLE public.time_entries IS
  '7aty — blocs de temps saisis manuellement (haute valeur, neutre, repos planifié, temps perdu)';
COMMENT ON COLUMN public.time_entries.kind IS
  'Classification finale : valeur / neutre / repos (planifié) / perdu';
COMMENT ON COLUMN public.time_entries.control_level IS
  'Niveau de contrôle ressenti : controle / necessaire / non_planifie / perte_controle';
COMMENT ON COLUMN public.time_entries.ended_at IS
  'NULL = chronomètre en cours (un seul par personne, index unique partiel)';

-- ────────────────────────────────────────────────────────────────────
--  2. OBJECTIFS HEBDOMADAIRES PAR CATÉGORIE
--
--  « Instagram : 3 h max par semaine ». Le dépassement n'empêche rien —
--  il est affiché, et il alourdit le Distraction Score.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_goals (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,

  category_key     TEXT    NOT NULL,
  -- 10 080 minutes = une semaine entière : au-delà, c'est une faute de saisie.
  max_minutes_week INTEGER NOT NULL
                     CHECK (max_minutes_week > 0 AND max_minutes_week <= 10080),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un seul plafond par catégorie et par personne (l'API fait un UPSERT
-- sur cette contrainte).
CREATE UNIQUE INDEX IF NOT EXISTS time_goals_unique_category
  ON public.time_goals (tenant_id, user_id, category_key);

COMMENT ON TABLE public.time_goals IS
  '7aty — plafond hebdomadaire de minutes par catégorie (objectif personnel)';

-- ────────────────────────────────────────────────────────────────────
--  3. RÉGLAGES PERSONNELS
--
--  Sert à distinguer « pendant le travail » de « en dehors » : c'est
--  cette frontière qui décide si 45 min de scroll sont du repos ou du
--  temps perdu, et qui déclenche l'alerte intelligente.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_settings (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,

  work_start_hour SMALLINT NOT NULL DEFAULT 9
                    CHECK (work_start_hour BETWEEN 0 AND 23),
  work_end_hour   SMALLINT NOT NULL DEFAULT 18
                    CHECK (work_end_hour BETWEEN 1 AND 24),
  -- Jours travaillés, convention ISO : 1 = lundi … 7 = dimanche.
  work_days       SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6}',

  -- Alerte « tu es dessus depuis X minutes, pendant le travail ».
  alert_threshold_min SMALLINT NOT NULL DEFAULT 45
                        CHECK (alert_threshold_min BETWEEN 5 AND 240),
  alerts_enabled      BOOLEAN  NOT NULL DEFAULT TRUE,

  -- Objectif d'heures à haute valeur par semaine (barre de progression).
  weekly_high_value_hours SMALLINT NOT NULL DEFAULT 30
                            CHECK (weekly_high_value_hours BETWEEN 1 AND 168),

  -- Rappel du soir : « as-tu saisi ta journée ? ». Une seule fois par
  -- jour, dans la cloche, et SEULEMENT si la journée n'est pas déjà
  -- expliquée (cf. server/lib/timeReminderScheduler.ts).
  reminder_enabled BOOLEAN  NOT NULL DEFAULT TRUE,
  reminder_hour    SMALLINT NOT NULL DEFAULT 22
                     CHECK (reminder_hour BETWEEN 0 AND 23),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, user_id)
);

COMMENT ON TABLE public.time_settings IS
  '7aty — heures de travail, seuil d''alerte et objectif hebdomadaire (par personne)';

-- Colonnes du rappel du soir, ajoutées après coup : une base où la 087
-- avait déjà tourné possède la table sans elles, et le CREATE TABLE
-- ci-dessus est alors sauté en silence.
ALTER TABLE public.time_settings
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN  NOT NULL DEFAULT TRUE;
ALTER TABLE public.time_settings
  ADD COLUMN IF NOT EXISTS reminder_hour    SMALLINT NOT NULL DEFAULT 22;
ALTER TABLE public.time_settings
  DROP CONSTRAINT IF EXISTS time_settings_reminder_hour_ck;
ALTER TABLE public.time_settings
  ADD CONSTRAINT time_settings_reminder_hour_ck
  CHECK (reminder_hour BETWEEN 0 AND 23);

-- ────────────────────────────────────────────────────────────────────
--  4. DURÉE CALCULÉE EN BASE
--
--  Quel que soit le chemin d'écriture (Start/Stop, Quick Log, saisie
--  manuelle, correction a posteriori), `duration_min` reflète toujours
--  started_at → ended_at. Aucun client ne la renseigne.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_time_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NULL THEN
    NEW.duration_min := NULL;
  ELSE
    NEW.duration_min := GREATEST(
      0,
      ROUND(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60.0)
    )::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_time_entries_duration ON public.time_entries;
CREATE TRIGGER trg_time_entries_duration
  BEFORE INSERT OR UPDATE OF started_at, ended_at ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_time_entry_duration();

-- Rattrapage pour un run partiel antérieur (colonne ajoutée sans trigger).
UPDATE public.time_entries
   SET duration_min = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0))::INTEGER
 WHERE ended_at IS NOT NULL AND duration_min IS NULL;

-- ────────────────────────────────────────────────────────────────────
--  5. updated_at automatique
-- ────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_time_entries_updated_at ON public.time_entries;
CREATE TRIGGER trg_time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_time_goals_updated_at ON public.time_goals;
CREATE TRIGGER trg_time_goals_updated_at
  BEFORE UPDATE ON public.time_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_time_settings_updated_at ON public.time_settings;
CREATE TRIGGER trg_time_settings_updated_at
  BEFORE UPDATE ON public.time_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────
--  6. RLS — isolation par espace
--
--  Réglage canonique app.current_tenant, posé par server/db/pool.ts
--  (tenantQuery / tenantTransaction).
-- ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['time_entries', 'time_goals', 'time_settings']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_delete_' || t, t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (tenant_id = current_tenant_id())',
      'rls_select_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (tenant_id = current_tenant_id())',
      'rls_insert_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      'rls_update_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (tenant_id = current_tenant_id())',
      'rls_delete_' || t, t);
  END LOOP;
END $$;

-- Interdit le déplacement d'une ligne vers un autre espace (même
-- garde-fou que les autres tables tenant, cf. migration 046).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_tenant_id_change') THEN
    DROP TRIGGER IF EXISTS trg_time_entries_lock_tenant ON public.time_entries;
    CREATE TRIGGER trg_time_entries_lock_tenant
      BEFORE UPDATE OF tenant_id ON public.time_entries
      FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

    DROP TRIGGER IF EXISTS trg_time_goals_lock_tenant ON public.time_goals;
    CREATE TRIGGER trg_time_goals_lock_tenant
      BEFORE UPDATE OF tenant_id ON public.time_goals
      FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();
  END IF;
END $$;

COMMIT;
