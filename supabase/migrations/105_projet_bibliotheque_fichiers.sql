-- ====================================================================
--  Migration 105 : BIBLIOTHÈQUE DE FICHIERS DU PROJET
--
--  Besoin : « quand un employé m'envoie un fichier par e-mail ou par
--  Google Drive, je veux pouvoir le déposer ici, le retrouver, le
--  télécharger sur mon ordinateur et le supprimer — sans retourner
--  fouiller ma boîte mail. »
--
--  ── Pourquoi AUCUNE table nouvelle ──────────────────────────────────
--  `projet_message_files` fait déjà exactement ce travail : elle porte
--  la fiche signalétique (nom, type, poids, date, déposant) et le chemin
--  sur le volume, avec sa RLS, ses triggers et son index
--  (projet_id, created_at DESC) — celui-là même dont une liste a besoin.
--  Elle n'exige pas de message : `message_id` est déjà NULLABLE, parce
--  qu'un fichier est téléversé AVANT le message qui le portera.
--
--  Créer une seconde table de fichiers aurait dupliqué le stockage, les
--  règles d'accès, la suppression et le diagnostic de volume — pour
--  décrire la même chose.
--
--  ── Pourquoi une colonne `origine` malgré tout ──────────────────────
--  La migration 095 écrit noir sur blanc qu'« une pièce jointe orpheline
--  plus de 24 h est un téléversement abandonné, purgeable sans risque »,
--  et pose l'index `idx_msg_files_orphan` pour cette purge. Un fichier
--  déposé dans la bibliothèque n'a, lui, jamais de message : sans cette
--  colonne, il serait indiscernable d'un envoi avorté, et la première
--  purge écrite l'effacerait — un an de documents effacés par une
--  routine de ménage qui croit bien faire.
--
--  `origine` tranche : 'chat' (défaut, comportement historique) ou
--  'bibliotheque' (déposé sciemment dans l'espace du projet). La purge à
--  venir devra donc lire `origine = 'chat' AND message_id IS NULL`.
--
--  Idempotente : ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--  Aucune donnée existante n'est touchée — les 23 lignes actuelles
--  reçoivent 'chat', qui est bien ce qu'elles sont.
-- ====================================================================
BEGIN;

ALTER TABLE public.projet_message_files
  ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'chat';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.projet_message_files'::regclass
       AND conname  = 'projet_message_files_origine_check'
  ) THEN
    ALTER TABLE public.projet_message_files
      ADD CONSTRAINT projet_message_files_origine_check
      CHECK (origine IN ('chat', 'bibliotheque'));
  END IF;
END $$;

COMMENT ON COLUMN public.projet_message_files.origine IS
  'chat = pièce jointe d''un message ; bibliotheque = fichier déposé dans '
  'l''espace du projet. La purge des téléversements abandonnés ne doit '
  'viser que origine = ''chat'' AND message_id IS NULL.';

/* La liste de la bibliothèque se lit par projet, du plus récent au plus
   ancien : l'index partiel évite de parcourir les pièces jointes de
   discussion, largement majoritaires sur un projet actif. */
CREATE INDEX IF NOT EXISTS idx_msg_files_bibliotheque
  ON public.projet_message_files (projet_id, created_at DESC)
  WHERE origine = 'bibliotheque';

COMMIT;
