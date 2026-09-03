-- ════════════════════════════════════════════════════════════════════
--  GestiQ — Migration 097 : accusé de consultation des tâches
--  Date : 2026-09-03
--
--  « L'employé a-t-il vu la tâche que je lui ai assignée ? » — jusqu'ici
--  la seule réponse était le statut, qui ne bouge que s'il commence à
--  travailler. Une tâche jamais ouverte et une tâche lue puis remise à
--  plus tard se ressemblaient trait pour trait.
--
--  Deux colonnes plutôt qu'une table dédiée : une tâche a un seul
--  destinataire, et la liste admin passe par le CRUD générique, qui ne
--  sait pas faire de jointure. Une table aurait imposé une requête de
--  plus par affichage de projet pour une information à deux champs.
--
--  viewed_at n'est écrit qu'à la PREMIÈRE consultation : c'est le moment
--  « ✓✓ » de WhatsApp, pas un compteur de passages.
--
--  Ces colonnes ne sont jamais écrites par le client : le serveur seul
--  les pose (server/routes/mySpace.ts), et elles figurent dans
--  READONLY_COLUMNS côté API — un accusé de lecture falsifiable ne
--  prouverait rien.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.team_member_tasks
  ADD COLUMN IF NOT EXISTS viewed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_by_name text;

COMMENT ON COLUMN public.team_member_tasks.viewed_at IS
  'Première consultation de la tâche par la personne assignée (posé par le serveur). NULL = jamais ouverte.';
COMMENT ON COLUMN public.team_member_tasks.viewed_by_name IS
  'Nom de la personne qui a consulté la tâche en premier (instantané).';

COMMIT;

-- Vérification :
--   SELECT title, viewed_at, viewed_by_name FROM team_member_tasks WHERE viewed_at IS NOT NULL;
