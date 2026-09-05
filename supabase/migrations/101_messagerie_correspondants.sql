-- ════════════════════════════════════════════════════════════════════
--  GestiQ / NEXT GITAL — Migration 101 : QUI PEUT ÉCRIRE À QUI
--  Date : 2026-09-05
--
--  La migration 100 a ouvert la messagerie à tout l'espace : chaque
--  personne voyait toutes les autres. C'est le comportement d'une
--  messagerie d'équipe — pas celui d'une messagerie d'entreprise, où
--  l'employé échange avec l'encadrement et non avec qui il veut.
--
--  ── La règle ────────────────────────────────────────────────────────
--  Un EMPLOYÉ (fiche team_members, pas de compte d'administration) voit
--  et peut contacter :
--    • l'administration de l'espace (tenant_users, rôle admin ou
--      manager) — toujours, sans réglage : c'est la voie hiérarchique,
--      et la couper laisserait un employé sans interlocuteur ;
--    • plus les personnes que l'administration lui a explicitement
--      autorisées, une par une, dans cette table.
--  Un compte d'ADMINISTRATION, lui, voit tout le monde : c'est lui qui
--  distribue les autorisations, il ne peut pas s'en exclure.
--
--  ── Pourquoi une table plutôt qu'une colonne ────────────────────────
--  Une colonne « peut parler à tout le monde : oui/non » ne saurait pas
--  répondre à « Amin travaille avec Ghita sur ce projet, mais pas avec
--  le reste de l'équipe ». L'autorisation est une RELATION entre deux
--  personnes : une ligne par paire autorisée, et l'absence de ligne est
--  un refus. Aucune migration de données n'est donc nécessaire — un
--  espace qui n'a rien réglé retombe sur « employés ↔ administration »,
--  ce qui est précisément le comportement attendu par défaut.
--
--  ── Sens de lecture ─────────────────────────────────────────────────
--  La ligne (member_user_id = Amin, peer_user_id = Ghita) autorise les
--  DEUX sens : Amin voit Ghita, et Ghita voit Amin. Une autorisation à
--  sens unique n'aurait pas de sens dans une conversation — l'un
--  écrirait à quelqu'un incapable de lui répondre. L'écriture reste
--  dirigée (on règle la fiche d'Amin), la lecture est symétrique.
--
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.dm_contact_rules (
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  /* La personne dont on règle le carnet d'adresses. */
  member_user_id uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  /* La personne qu'elle est autorisée à joindre. */
  peer_user_id   uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  /* Qui a accordé l'autorisation, et quand — une question qui se pose
     toujours après coup (« qui a ouvert cet accès ? »). */
  granted_by     uuid        REFERENCES public.users(id)            ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, member_user_id, peer_user_id),
  CONSTRAINT dm_contact_rules_not_self CHECK (member_user_id <> peer_user_id)
);

/* Le sens de lecture le plus fréquent : « qui Amin peut-il joindre ? ».
   L'autre sens (« qui peut joindre Ghita ? ») sert au calcul
   symétrique, d'où le second index. */
CREATE INDEX IF NOT EXISTS idx_dm_rules_member
  ON public.dm_contact_rules (tenant_id, member_user_id);
CREATE INDEX IF NOT EXISTS idx_dm_rules_peer
  ON public.dm_contact_rules (tenant_id, peer_user_id);

COMMENT ON TABLE public.dm_contact_rules IS
  'Messagerie interne : correspondants autorisés en plus de l''administration. Aucune ligne = l''employé ne joint que l''administration.';

-- ── RLS ─────────────────────────────────────────────────────────────
/* Ces lignes ne sont pas des secrets — savoir qu'on est autorisé à
   écrire à Ghita, c'est exactement ce que l'écran affiche. La lecture
   est donc ouverte à l'espace ; c'est l'ÉCRITURE qui doit être tenue,
   et elle l'est côté route (réservée à l'administration), comme pour
   tous les réglages d'équipe de ce dépôt.

   La condition de participation, elle, reste inutile ici : la table ne
   contient aucun contenu de conversation. */
ALTER TABLE public.dm_contact_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_contact_rules FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_select_dm_rules ON public.dm_contact_rules;
DROP POLICY IF EXISTS rls_insert_dm_rules ON public.dm_contact_rules;
DROP POLICY IF EXISTS rls_update_dm_rules ON public.dm_contact_rules;
DROP POLICY IF EXISTS rls_delete_dm_rules ON public.dm_contact_rules;

CREATE POLICY rls_select_dm_rules ON public.dm_contact_rules FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY rls_insert_dm_rules ON public.dm_contact_rules FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_update_dm_rules ON public.dm_contact_rules FOR UPDATE
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY rls_delete_dm_rules ON public.dm_contact_rules FOR DELETE
  USING (tenant_id = current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_contact_rules TO gestiq_api;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gestiq_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_contact_rules TO gestiq_rls;
  END IF;
END $$;

COMMIT;

-- Vérification :
--   \d public.dm_contact_rules
--   -- Qui Amin peut-il joindre, en plus de l'administration ?
--   SELECT u.email FROM dm_contact_rules r JOIN users u ON u.id = r.peer_user_id
--    WHERE r.member_user_id = '<uuid Amin>';
