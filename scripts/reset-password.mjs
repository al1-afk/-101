#!/usr/bin/env node
/**
 * scripts/reset-password.mjs
 *
 * Script d'urgence pour réinitialiser le mot de passe d'un utilisateur
 * quand l'email de réinitialisation ne fonctionne pas (Resend down,
 * domaine non vérifié, etc.).
 *
 * Utilisation (dans le container Docker ou en local) :
 *
 *   node scripts/reset-password.mjs <email> [nouveauMotDePasse]
 *
 * Si le mot de passe n'est pas fourni, un mot de passe aléatoire
 * cryptographiquement sûr est généré et affiché.
 *
 * Le script :
 *  - hash le mot de passe avec bcrypt (cost 12, comme le reste de l'app)
 *  - met à jour users.password_hash
 *  - révoque toutes les refresh_tokens actives de l'utilisateur (sécurité)
 *  - affiche le résultat proprement
 *
 * Variables d'environnement lues (mêmes que le serveur) :
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
 * Dans le container Docker de Dokploy, les variables POSTGRES_* sont
 * utilisées à la place — on tolère les deux.
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'

/* Charge .env.local si présent, sans dépendance externe */
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* pas de .env.local, on continue avec les env existantes */ }

const [, , emailArg, passwordArg] = process.argv

if (!emailArg) {
  console.error('\nUsage : node scripts/reset-password.mjs <email> [nouveauMotDePasse]\n')
  console.error('Exemple :')
  console.error('  node scripts/reset-password.mjs admin@example.com')
  console.error('  node scripts/reset-password.mjs admin@example.com MonMotDePasse2026!\n')
  process.exit(1)
}

/* Génère un mot de passe fort si l'utilisateur n'en a pas fourni.
   Format : 16 caractères base64url — sûr et copiable partout. */
function generateStrongPassword() {
  const bytes = randomBytes(12)
  const raw = bytes.toString('base64').replace(/[+/=]/g, '')
  /* Force au moins 1 chiffre + 1 lettre pour matcher la validation
     backend (routes/auth.ts change-password). */
  return raw + '7A'
}

const newPassword = passwordArg ?? generateStrongPassword()

if (newPassword.length < 10) {
  console.error('\n❌ Le mot de passe doit contenir au moins 10 caractères.\n')
  process.exit(1)
}
if (!/[0-9]/.test(newPassword) || !/[A-Za-z]/.test(newPassword)) {
  console.error('\n❌ Le mot de passe doit contenir au moins un chiffre et une lettre.\n')
  process.exit(1)
}

const pool = new pg.Pool({
  host:     process.env.PG_HOST     || process.env.POSTGRES_HOST     || 'localhost',
  port:     Number(process.env.PG_PORT || process.env.POSTGRES_PORT || 5432),
  database: process.env.PG_DATABASE || process.env.POSTGRES_DB       || 'postgres',
  user:     process.env.PG_USER     || process.env.POSTGRES_USER     || 'postgres',
  password: process.env.PG_PASSWORD || process.env.POSTGRES_PASSWORD || '',
})

try {
  const email = emailArg.trim().toLowerCase()

  const found = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email])
  if (found.rows.length === 0) {
    console.error(`\n❌ Aucun utilisateur trouvé avec l'email "${email}".\n`)
    process.exit(2)
  }
  const user = found.rows[0]

  const hash = await bcrypt.hash(newPassword, 12)

  await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [hash, user.id],
  )

  const revoked = await pool.query(
    'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false RETURNING id',
    [user.id],
  )

  console.log('\n✅ Mot de passe réinitialisé avec succès.\n')
  console.log(`   Utilisateur : ${user.name ?? '(sans nom)'} <${user.email}>`)
  console.log(`   Sessions révoquées : ${revoked.rows.length}`)
  console.log(`   Nouveau mot de passe : ${newPassword}`)
  console.log('\n⚠  Note-le maintenant, il ne sera plus jamais affiché.')
  console.log('   Change-le après connexion depuis Profil → Sécurité.\n')
} catch (err) {
  console.error('\n❌ Erreur :', err.message ?? err)
  process.exit(3)
} finally {
  await pool.end()
}
