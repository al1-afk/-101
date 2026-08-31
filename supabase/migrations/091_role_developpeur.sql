-- ====================================================================
--  Migration 091 : rôle « Développeur » (profil Production / Tech)
--
--  L'organisation cible sépare Production des fonctions commerciales et
--  financières. Il manquait un rôle pour les personnes qui livrent :
--  développeurs, designers, SEO, ads. Elles avaient jusqu'ici le choix
--  entre « commercial » (qui ouvre devis et factures) et « viewer » (qui
--  ne permet même pas de tenir un domaine à jour).
--
--  ── Ce que la migration fait, et ne fait pas ───────────────────────
--  Elle n'ajoute qu'une valeur autorisée sur team_members.role. Les
--  DROITS réels ne vivent pas ici : ils sont dans TABLE_ACL
--  (server/middleware/rbac.ts), appliqué à chaque requête du CRUD.
--
--  Le rôle est ajouté table par table dans cette matrice, jamais à la
--  constante ALL : 34 tables ouvrent leur lecture à ALL, dont paiements,
--  factures, devis et contrats. Un profil technique n'a rien à y faire.
--
--  Périmètre accordé : clients (lecture), projets (lecture/création/
--  modification), tâches, domaines et hébergements (complet), SOPs,
--  guides, produits, contacts.
--  Refusé : devis, factures, paiements, dépenses, contrats, fiches RH,
--  chèques, comptes bancaires, salaires, prévisions — et la vision de
--  l'entreprise, qui reste strictement personnelle à l'administrateur.
--
--  `tenant_users.role` n'a aucune contrainte CHECK : rien à y modifier.
--
--  Idempotent : la contrainte est reprise à chaque exécution.
-- ====================================================================
BEGIN;

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_role_check;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IS NULL OR role = ANY (ARRAY[
    'admin', 'manager', 'commercial', 'comptable', 'developpeur', 'viewer',
    -- Valeurs héritées, conservées pour ne pas invalider l'existant.
    'Admin', 'Employé', 'Stagiaire'
  ]));

COMMENT ON COLUMN public.team_members.role IS
  'Rôle applicatif indicatif de la fiche. L''autorisation effective vient de tenant_users.role (getEffectiveRole) et de TABLE_ACL.';

COMMIT;
