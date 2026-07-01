-- ====================================================================
--  Migration 059 : email_verified_at sur users
--  Marque un utilisateur comme ayant validé son email via code 6 chiffres.
--  À la première connexion, si NULL → le /login déclenche l'envoi d'un
--  code par email et exige /verify-login avant d'émettre les tokens.
--  Une fois vérifié, les connexions suivantes se font en 1 étape.
--
--  Les comptes déjà existants sont considérés vérifiés (pas de re-check
--  rétroactif) afin d'éviter de bloquer les utilisateurs actifs.
-- ====================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

UPDATE users
   SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
 WHERE email_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verified_at
  ON users (email_verified_at)
  WHERE email_verified_at IS NULL;
