-- ════════════════════════════════════════════════════════════════════
--  GestiQ / NEXT GITAL — Migration 104 : INDEX POUR LA CONNEXION
--                          INSENSIBLE À LA CASSE
--  Date : 2026-09-08
--
--  ── Le défaut refermé ───────────────────────────────────────────────
--  Une adresse e-mail est insensible à la casse pour tout le monde sauf
--  pour PostgreSQL. Or ni l'inscription, ni l'invitation, ni le
--  formulaire de connexion ne normalisaient l'adresse saisie : la
--  colonne conserve la casse tapée le jour de la création, et toutes les
--  requêtes d'authentification comparaient avec `email = $1`.
--
--  Conséquence, mesurée sur les données réelles : trois comptes portent
--  une majuscule (« Aya@… »). Ces personnes ne peuvent pas se connecter
--  en tapant leur adresse en minuscules — la réponse est « identifiants
--  invalides », strictement indiscernable d'un mot de passe erroné.
--  L'utilisateur ne peut pas deviner qu'il doit respecter une casse
--  qu'il n'a aucune raison de connaître.
--
--  Les requêtes d'authentification comparent désormais
--  `LOWER(email) = LOWER($1)` (server/routes/auth.ts, server/routes/team.ts).
--
--  ── Pourquoi cette migration existe ─────────────────────────────────
--  Un LOWER() sur la colonne rend l'index ordinaire `idx_users_email`
--  INUTILISABLE : le planificateur retombe sur un parcours séquentiel à
--  chaque tentative de connexion. Invisible sur 61 utilisateurs,
--  désastreux sur dix mille — et c'est précisément le chemin qu'un
--  attaquant sollicite en rafale. On pose donc les index fonctionnels
--  correspondants.
--
--  ── Ce que cette migration NE fait PAS ──────────────────────────────
--  Elle ne réécrit AUCUNE adresse. Mettre la colonne en minuscules
--  changerait ce qui s'affiche dans les fiches, dans les en-têtes d'e-mail
--  et dans les exports, pour un gain nul : la comparaison est déjà
--  insensible. La donnée reste telle que la personne l'a saisie.
--
--  Elle n'ajoute pas non plus d'unicité insensible à la casse. Ce serait
--  souhaitable — deux comptes « Aya@ » et « aya@ » seraient aujourd'hui
--  acceptés — mais un index UNIQUE échouerait sur une base contenant
--  déjà de tels doublons, et cette migration doit pouvoir s'appliquer
--  partout sans examen préalable. Le contrôle d'existence à
--  l'inscription est en revanche devenu insensible à la casse, ce qui
--  empêche d'en créer de nouveaux.
--
--  Additive, idempotente, sans verrou long.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON public.users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_team_members_email_lower
  ON public.team_members (LOWER(email))
  WHERE email IS NOT NULL;

COMMENT ON INDEX public.idx_users_email_lower IS
  'Sert les comparaisons LOWER(email) = LOWER($1) des routes d''authentification. Sans lui, chaque connexion parcourt toute la table.';

COMMIT;

-- Vérification :
--   EXPLAIN SELECT id FROM users WHERE LOWER(email) = LOWER('AYA@nextgital.com');
--   -- doit montrer « Index Scan using idx_users_email_lower »
--
-- Comptes concernés aujourd'hui :
--   SELECT email FROM users WHERE email <> LOWER(email);
