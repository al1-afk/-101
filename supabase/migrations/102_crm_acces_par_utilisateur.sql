-- ════════════════════════════════════════════════════════════════════
--  GestiQ / NEXT GITAL — Migration 102 : ACCÈS CRM PAR UTILISATEUR
--  Date : 2026-09-07
--
--  ── Ce que le client demande ────────────────────────────────────────
--  ADMIN et MANAGER voient tout. Le COMMERCIAL ne voit que ce qui est
--  À LUI : ce qu'il a créé, ce qu'on lui a assigné, ce qu'on lui a
--  explicitement partagé. Sur les prospects, les clients, les devis,
--  les activités et les tableaux de bord.
--
--  Cette migration ne fait que POSER LE SCHÉMA de cette règle. Elle ne
--  l'applique pas : c'est Express qui l'applique (server/lib/crmScope.ts,
--  appelé par server/routes/crud.ts). Le pourquoi est expliqué au §5.
--
--  ── Contraintes absolues ────────────────────────────────────────────
--  Additive, idempotente. AUCUNE colonne supprimée, AUCUNE donnée
--  réécrite, AUCUN backfill. 176 prospects vivent en production : le
--  pipeline doit être identique à la seconde d'après.
--
--  ── Ce qu'on NE touche PAS, et pourquoi ─────────────────────────────
--  `prospects.responsable` existe déjà et ressemble à une colonne de
--  propriété. Ce n'en est pas une : c'est du TEXTE LIBRE, qui vaut
--  littéralement 'Moi' sur 131 lignes sur 144. La convertir en identité
--  reviendrait à attribuer 131 prospects à « personne » ou, pire, tous
--  à la même personne au hasard. Elle reste donc telle quelle, affichée
--  telle quelle, et la propriété réelle vit dans les DEUX NOUVELLES
--  colonnes ci-dessous.
--
--  On ne rebranche pas non plus le déclencheur `log_mutation()` sur les
--  tables CRM : il écrit dans `audit_logs`, une table qui N'EXISTE PAS
--  dans ce schéma. Chaque INSERT sur prospects échouerait. Le journal
--  utilisé ici est `activity_logs`, alimenté depuis le code applicatif.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────
--  1. LA PROPRIÉTÉ, SUR LES TROIS TABLES DU CRM
--
--  Deux colonnes, pas une seule :
--   • created_by  — qui a saisi la fiche. Ne change jamais. C'est ce
--     qui garantit qu'un commercial ne perd pas l'accès à son propre
--     travail le jour où un manager réassigne le dossier.
--   • assigned_to — qui s'en occupe MAINTENANT. Seul un gestionnaire
--     peut la poser sur quelqu'un d'autre que lui.
--
--  NULLABLE est impératif, dans les deux cas. NOT NULL exigerait un
--  backfill (interdit ici : aucune donnée fiable pour deviner l'auteur
--  des 176 lignes existantes) et ferait échouer tout code qui n'envoie
--  pas la colonne — c'est-à-dire tout le code actuel. NULL a d'ailleurs
--  un sens métier exact : « non attribué ». Un enregistrement non
--  attribué n'appartient à aucun commercial, donc seuls les
--  gestionnaires le voient — ce qui satisfait l'exigence « les anciens
--  prospects restent accessibles à l'Admin » sans toucher à une ligne.
--
--  ON DELETE SET NULL et non CASCADE : supprimer un compte ne doit
--  JAMAIS emporter les prospects qu'il avait saisis. La fiche retombe
--  simplement dans « non attribué ».
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL;

/* Index composites (tenant_id, colonne) et non (colonne) seule : la
   clause de périmètre d'un commercial est TOUJOURS jointe au filtre
   d'espace, et c'est la requête la plus chaude de l'application — la
   liste des prospects est rechargée à chaque ouverture de l'écran. */
CREATE INDEX IF NOT EXISTS idx_prospects_tenant_assigned   ON public.prospects (tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_prospects_tenant_created_by ON public.prospects (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_assigned     ON public.clients   (tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_created_by   ON public.clients   (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_devis_tenant_assigned       ON public.devis     (tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_devis_tenant_created_by     ON public.devis     (tenant_id, created_by);

COMMENT ON COLUMN public.prospects.created_by IS
  'Auteur de la fiche. Posé par le serveur au POST, jamais accepté depuis le corps de la requête. NULL = fiche antérieure à la migration 102, donc « non attribuée ».';
COMMENT ON COLUMN public.prospects.assigned_to IS
  'Commercial en charge. Seul un gestionnaire (admin/manager) peut l''attribuer à un tiers. NULL = non attribué : visible des seuls gestionnaires.';
COMMENT ON COLUMN public.clients.created_by  IS 'Cf. prospects.created_by.';
COMMENT ON COLUMN public.clients.assigned_to IS 'Cf. prospects.assigned_to.';
COMMENT ON COLUMN public.devis.created_by    IS 'Cf. prospects.created_by.';
COMMENT ON COLUMN public.devis.assigned_to   IS 'Cf. prospects.assigned_to.';

-- ────────────────────────────────────────────────────────────────────
--  2. LE PARTAGE EXPLICITE, ENREGISTREMENT PAR ENREGISTREMENT
--
--  « Partager ce prospect avec Yassine, qui pourra le consulter et
--  journaliser ses appels, mais ni le modifier ni le convertir. »
--  Cinq droits INDÉPENDANTS, et non un niveau unique (lecture <
--  écriture < tout) : le cahier des charges les énumère séparément
--  parce qu'ils se combinent réellement — « peut chiffrer sans pouvoir
--  modifier la fiche » est un cas courant chez ce client.
--
--  ── Pourquoi une seule table pour trois types de ressources ─────────
--  Trois tables jumelles (prospect_grants, client_grants, devis_grants)
--  auraient triplé chaque règle : trois politiques RLS à tenir
--  synchronisées, trois requêtes dans crmScope, trois écrans
--  d'administration. Une divergence entre les trois serait une faille
--  silencieuse. Ici la règle s'écrit une fois.
--
--  ── Le prix à payer : pas de clé étrangère sur resource_id ──────────
--  Postgres ne sait pas référencer trois tables depuis une colonne.
--  On l'assume, et on paie la note explicitement :
--   • la cohérence est garantie à l'écriture par le code
--     (server/routes/crmAccess.ts vérifie que la ressource existe et
--     appartient à l'espace avant d'insérer) ;
--   • les lignes devenues orphelines — ressource supprimée — sont
--     nettoyées par crm_purge_orphan_grants() (§7). Elles ne sont
--     JAMAIS dangereuses entre-temps : un partage qui pointe vers un
--     prospect disparu ne donne accès à rien, puisque toute lecture
--     part de la table CRM et joint le partage, et non l'inverse.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_record_grants (
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource_type text        NOT NULL CHECK (resource_type IN ('prospect', 'client', 'devis')),
  /* Pas de FK : voir le commentaire ci-dessus. */
  resource_id   uuid        NOT NULL,
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  /* can_view à TRUE par défaut : une ligne de partage qui ne donnerait
     même pas la lecture n'aurait aucun sens — les quatre autres droits
     la présupposent tous. */
  can_view      boolean     NOT NULL DEFAULT TRUE,
  can_log       boolean     NOT NULL DEFAULT FALSE,  -- journaliser appels, notes, e-mails
  can_edit      boolean     NOT NULL DEFAULT FALSE,  -- modifier la fiche
  can_quote     boolean     NOT NULL DEFAULT FALSE,  -- établir un devis
  can_convert   boolean     NOT NULL DEFAULT FALSE,  -- convertir en client
  granted_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  /* La clé primaire porte la règle « un seul partage par (ressource,
     personne) » : l'écran d'administration réécrit la liste complète à
     chaque enregistrement, un ON CONFLICT DO UPDATE suffit donc, sans
     risque de doublon contradictoire. tenant_id en tête parce que
     toutes les lectures partent de l'espace. */
  PRIMARY KEY (tenant_id, resource_type, resource_id, user_id)
);

/* L'autre sens de lecture : « que m'a-t-on partagé ? ». C'est celui
   qu'emprunte la clause de périmètre du commercial, à chaque liste. */
CREATE INDEX IF NOT EXISTS idx_crm_grants_user
  ON public.crm_record_grants (tenant_id, user_id, resource_type);

COMMENT ON TABLE public.crm_record_grants IS
  'Partage explicite d''un enregistrement CRM (prospect/client/devis) avec une personne, droit par droit. resource_id n''a volontairement pas de clé étrangère : elle vise trois tables — cf. crm_purge_orphan_grants().';
COMMENT ON COLUMN public.crm_record_grants.resource_id IS
  'Identifiant dans prospects, clients ou devis selon resource_type. Sans FK possible : la cohérence est tenue par server/routes/crmAccess.ts et par crm_purge_orphan_grants().';

-- ────────────────────────────────────────────────────────────────────
--  3. LES CAPACITÉS TRANSVERSES (« voir tous les prospects »)
--
--  Le cas réel : un commercial senior qui doit voir tout le portefeuille
--  sans pour autant devenir manager (le rôle manager ouvrirait aussi la
--  gestion d'équipe, la paie, les paramètres de l'espace).
--
--  ── Pourquoi ici et pas dans tenant_users.allowed_modules ───────────
--  Cette colonne existe déjà et n'est JAMAIS lue côté serveur : elle est
--  purement cosmétique. S'y greffer donnerait l'illusion d'un droit
--  appliqué alors qu'il ne le serait pas. Une table à part, lue par
--  crmScope à chaque décision, ne peut pas mentir.
--
--  ── Pourquoi text[] et pas une CHECK ────────────────────────────────
--  Le vocabulaire fermé (prospects.view_all, devis.edit_all, …) est
--  déclaré UNE fois, dans server/lib/crmScope.ts (CRM_CAPABILITIES), et
--  toute valeur hors liste est refusée par un 400 à l'écriture ET
--  ignorée à la lecture. Une CHECK ici obligerait à une migration à
--  chaque capacité ajoutée, et une capacité inconnue restée en base
--  après un retour arrière bloquerait toutes les mises à jour de la
--  ligne. Le schéma stocke, le code décide.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_user_capabilities (
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  capabilities text[]      NOT NULL DEFAULT '{}',
  updated_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_id)
);

COMMENT ON TABLE public.crm_user_capabilities IS
  'Cases « voir tout / modifier tout » accordées à une personne, hors rôle. Vocabulaire fermé déclaré dans server/lib/crmScope.ts (CRM_CAPABILITIES) ; toute valeur inconnue est ignorée à la lecture.';

-- ────────────────────────────────────────────────────────────────────
--  4. DÉCLENCHEURS : updated_at, et tenant_id immuable
--
--  prevent_tenant_id_change : sans lui, un UPDATE qui changerait
--  tenant_id ferait franchir la frontière d'espace à un partage — la
--  RLS ne relit pas les lignes déjà modifiées.
-- ────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_crm_grants_updated_at ON public.crm_record_grants;
CREATE TRIGGER trg_crm_grants_updated_at BEFORE UPDATE ON public.crm_record_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_caps_updated_at ON public.crm_user_capabilities;
CREATE TRIGGER trg_crm_caps_updated_at BEFORE UPDATE ON public.crm_user_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lock_tenant_crm_grants ON public.crm_record_grants;
CREATE TRIGGER trg_lock_tenant_crm_grants BEFORE UPDATE OF tenant_id ON public.crm_record_grants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_lock_tenant_crm_caps ON public.crm_user_capabilities;
CREATE TRIGGER trg_lock_tenant_crm_caps BEFORE UPDATE OF tenant_id ON public.crm_user_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

-- ════════════════════════════════════════════════════════════════════
--  5. RLS — LE CHOIX D'ARCHITECTURE LE PLUS IMPORTANT DE CE LOT
--
--  La messagerie interne (migration 100) ajoute `current_app_user_id()`
--  à ses politiques : la base elle-même refuse de rendre le fil d'un
--  autre. C'est la bonne réponse là-bas. Ici, ce serait une panne
--  générale, et voici le fait qui tranche :
--
--      378 des 387 appels à tenantQuery / tenantTransaction du dépôt ne
--      passent PAS le 4e argument (l'utilisateur agissant). Sans lui,
--      `app.current_user_id` n'est pas posée et current_app_user_id()
--      vaut NULL.
--
--  Une politique par utilisateur sur prospects / clients / devis les
--  ferait donc toutes renvoyer ZÉRO LIGNE — à commencer par les deux
--  lectures principales de server/routes/crud.ts, qui n'envoient
--  aujourd'hui que le tenant. Le CRM se viderait à la seconde du
--  déploiement, sur 176 prospects en production.
--
--  D'où la règle tenue dans TOUT ce lot :
--    • la RLS cloisonne l'ESPACE  → tenant_id = current_tenant_id() ;
--    • le PÉRIMÈTRE PAR PERSONNE est appliqué dans Express, dans
--      server/lib/crmScope.ts, qui est le seul endroit où la règle
--      d'accès est écrite.
--
--  Ce n'est pas un pis-aller : c'est exactement ce que fait déjà le
--  module Outbound (server/routes/outbound.ts, ownershipWhere) depuis
--  la migration 067, sur le même schéma de propriété. Le filtrage reste
--  côté BACKEND — l'exigence du client — mais dans la couche qui, elle,
--  connaît l'utilisateur à coup sûr.
--
--  Conséquence pratique : les DEUX tables ci-dessous portent des
--  politiques sur le seul tenant_id. Surtout NE PAS y ajouter
--  current_app_user_id() : crmScope les interroge depuis le chemin chaud
--  du CRUD, sans poser cette variable.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE public.crm_record_grants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_record_grants     FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.crm_user_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_user_capabilities FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_crm_grants ON public.crm_record_grants;
DROP POLICY IF EXISTS rls_insert_crm_grants ON public.crm_record_grants;
DROP POLICY IF EXISTS rls_update_crm_grants ON public.crm_record_grants;
DROP POLICY IF EXISTS rls_delete_crm_grants ON public.crm_record_grants;

CREATE POLICY rls_select_crm_grants ON public.crm_record_grants FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_crm_grants ON public.crm_record_grants FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_crm_grants ON public.crm_record_grants FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_crm_grants ON public.crm_record_grants FOR DELETE
  USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS rls_select_crm_caps ON public.crm_user_capabilities;
DROP POLICY IF EXISTS rls_insert_crm_caps ON public.crm_user_capabilities;
DROP POLICY IF EXISTS rls_update_crm_caps ON public.crm_user_capabilities;
DROP POLICY IF EXISTS rls_delete_crm_caps ON public.crm_user_capabilities;

CREATE POLICY rls_select_crm_caps ON public.crm_user_capabilities FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_crm_caps ON public.crm_user_capabilities FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_crm_caps ON public.crm_user_capabilities FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_crm_caps ON public.crm_user_capabilities FOR DELETE
  USING (tenant_id = current_tenant_id());

-- ── Droits ──────────────────────────────────────────────────────────
--  Les GRANT au niveau TABLE couvrent aussi les colonnes ajoutées au §1
--  sur prospects / clients / devis : rien à redonner de ce côté.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.crm_record_grants, public.crm_user_capabilities
      TO gestiq_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.crm_record_grants, public.crm_user_capabilities
      TO gestiq_rls;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
--  7. NETTOYAGE DES PARTAGES ORPHELINS
--
--  La contrepartie du « pas de FK sur resource_id » (§2). Supprimer un
--  prospect laisse derrière lui ses lignes de partage ; elles ne
--  donnent accès à rien, mais elles s'accumulent et faussent l'écran
--  « Gérer les accès » si un jour un nouvel enregistrement réutilisait
--  l'identifiant (impossible avec gen_random_uuid(), mais on ne parie
--  pas là-dessus).
--
--  SECURITY INVOKER, volontairement : la fonction est soumise à la RLS
--  de celui qui l'appelle. Exécutée avec `app.current_tenant` posée,
--  elle ne nettoie QUE cet espace — ce qui est exactement ce qu'on veut
--  depuis l'application. Une fonction SECURITY DEFINER appartenant à un
--  superutilisateur balaierait tous les espaces d'un seul appel, y
--  compris depuis une route mal protégée.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_purge_orphan_grants() RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE supprimees integer;
BEGIN
  DELETE FROM public.crm_record_grants g
   WHERE (g.resource_type = 'prospect'
          AND NOT EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = g.resource_id))
      OR (g.resource_type = 'client'
          AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = g.resource_id))
      OR (g.resource_type = 'devis'
          AND NOT EXISTS (SELECT 1 FROM public.devis d WHERE d.id = g.resource_id));
  GET DIAGNOSTICS supprimees = ROW_COUNT;
  RETURN supprimees;
END
$fn$;

COMMENT ON FUNCTION public.crm_purge_orphan_grants() IS
  'Supprime les partages dont la ressource n''existe plus (crm_record_grants.resource_id n''a pas de FK : elle vise trois tables). SECURITY INVOKER : ne nettoie que l''espace courant, sous RLS.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT EXECUTE ON FUNCTION public.crm_purge_orphan_grants() TO gestiq_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT EXECUTE ON FUNCTION public.crm_purge_orphan_grants() TO gestiq_rls;
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
--  VÉRIFICATION (après application)
--
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('prospects','clients','devis')
--      AND column_name IN ('created_by','assigned_to')
--    ORDER BY table_name, column_name;                  -- 6 lignes
--
--   \d public.crm_record_grants
--   \d public.crm_user_capabilities
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('crm_record_grants','crm_user_capabilities')
--    ORDER BY tablename, cmd;                           -- 8 lignes
--
--  NON-RÉGRESSION — le pipeline doit être intact :
--   SELECT count(*) FROM prospects;                     -- inchangé
--   SELECT count(*) FROM prospects WHERE assigned_to IS NULL;  -- = total
--
--  Cloisonnement d'espace des deux nouvelles tables (sous gestiq_rls,
--  car en local le compte `said` est SUPERUSER + BYPASSRLS et validerait
--  À TORT n'importe quel test) :
--   BEGIN;
--     SET LOCAL ROLE gestiq_rls;
--     SET LOCAL "app.current_tenant" = '<uuid espace A>';
--     SELECT count(*) FROM crm_record_grants;   -- uniquement l'espace A
--   ROLLBACK;
-- ════════════════════════════════════════════════════════════════════
