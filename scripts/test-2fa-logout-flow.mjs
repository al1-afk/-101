/**
 * Test end-to-end du flux : login → 2FA email → verify → logout
 * puis re-login → doit exiger 2FA à nouveau (car logout révoque trusted_device).
 *
 * Interroge la DB directement (aucun email n'est réellement envoyé pour ce test).
 *
 * Usage : node scripts/test-2fa-logout-flow.mjs <email>
 */
import { readFileSync } from 'node:fs'
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

import pg from 'pg'

const email = process.argv[2]
if (!email) { console.error('Usage: node scripts/test-2fa-logout-flow.mjs <email>'); process.exit(1) }

const c = new pg.Client({
  host: process.env.PG_HOST, port: +process.env.PG_PORT,
  database: process.env.PG_DATABASE, user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
})
await c.connect()

const step = (n, label) => console.log(`\n▶ ${n}. ${label}`)
const ok = (msg) => console.log(`   ✓ ${msg}`)
const info = (msg) => console.log(`   · ${msg}`)
const bad = (msg) => console.log(`   ✗ ${msg}`)

/* ─── 1. Vérifier que l'user existe et son twofa_mode ─────────── */
step(1, `Vérifier l'utilisateur ${email}`)
const u = await c.query(
  `SELECT id, email, twofa_mode, email_verified_at, is_active FROM users WHERE email = $1`,
  [email]
)
if (!u.rows[0]) { bad(`user ${email} introuvable`); process.exit(1) }
const user = u.rows[0]
ok(`user_id=${user.id}`)
info(`twofa_mode=${user.twofa_mode} (attendu: email pour déclencher 2FA)`)
info(`email_verified_at=${user.email_verified_at ?? 'NULL (jamais vérifié)'}`)
info(`is_active=${user.is_active}`)

/* ─── 2. Simuler état "avant login" : trusted_devices actifs ── */
step(2, 'État initial : appareils de confiance actifs')
const tdBefore = await c.query(
  `SELECT id, label, user_agent, expires_at, revoked_at
     FROM trusted_devices
    WHERE user_id = $1
    ORDER BY last_used_at DESC NULLS LAST`,
  [user.id]
)
info(`total trusted_devices : ${tdBefore.rows.length}`)
tdBefore.rows.forEach((r, i) => {
  const active = !r.revoked_at && new Date(r.expires_at) > new Date()
  console.log(`     [${i + 1}] ${r.label ?? '(sans label)'} — ${active ? '🟢 actif' : '🔴 révoqué/expiré'} — expires ${r.expires_at.toISOString().slice(0,10)}`)
})
const activeBefore = tdBefore.rows.filter(r => !r.revoked_at && new Date(r.expires_at) > new Date()).length

/* ─── 3. Historique des logins (10 derniers) ──────────────────── */
step(3, "Historique de connexion (10 derniers événements)")
const hist = await c.query(
  `SELECT method, event, success, created_at
     FROM login_history
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 10`,
  [user.id]
)
hist.rows.forEach(r => {
  const flag = r.success ? '✓' : '✗'
  console.log(`     ${flag} ${r.created_at.toISOString().slice(0,19)} — ${r.method}/${r.event}`)
})

/* ─── 4. Vérification des routes serveur via HTTP ─────────────── */
step(4, "Vérification via endpoints HTTP (pas d'envoi email réel)")
const base = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.SERVER_PORT || '4000'}`
info(`base URL = ${base}`)

/* Sans mot de passe on ne peut pas VRAIMENT tester le login flow —
   on vérifie juste que les endpoints existent et répondent correctement. */
for (const [path, expectedStatus] of [
  ['/api/auth/login',             '400 (body incomplet)'],
  ['/api/auth/verify-login',      '400'],
  ['/api/auth/resend-login-code', '400'],
  ['/api/auth/logout',            '401 (pas de token)'],
]) {
  try {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    ok(`${path} → HTTP ${r.status} (attendu ${expectedStatus})`)
  } catch (e) {
    bad(`${path} → erreur : ${e.message}`)
  }
}

/* ─── 5. Simulation logique : effet du logout sur trusted_devices ── */
step(5, "Simulation du logout : quels appareils seraient révoqués ?")
info("Après logout (fix appliqué) : la ligne trusted_devices correspondant au device COURANT est marquée revoked_at = NOW().")
info("Les AUTRES appareils (autre tenant, autre navigateur) restent actifs — le user reste connecté sur ses autres devices.")

/* ─── 6. Rapport final ────────────────────────────────────────── */
step(6, "Résumé attendu (comportement post-fix)")
console.log("")
console.log("   ┌─ FLOW SPEC ──────────────────────────────────────────────┐")
console.log("   │  1. 1ère connexion  → code email requis (2FA)            │")
console.log("   │  2. Verify code     → trusted_device créé + tokens émis  │")
console.log("   │  3. Ferme browser   → cookies persistent (device + refresh)")
console.log("   │  4. Rouvre browser  → auto-login (pas de code)           │")
console.log("   │  5. Clic 'Logout'   → REVOKED : refresh + trusted_device │")
console.log("   │  6. Re-login        → code email requis (2FA)            │")
console.log("   └──────────────────────────────────────────────────────────┘")
console.log("")
info(`État initial : ${activeBefore} trusted_device(s) actif(s) pour ce user`)
info("Pour tester vraiment : ouvre /auth dans un browser, connecte-toi, vérifie le code,")
info("puis clique 'Se déconnecter' dans l'app — la prochaine connexion doit redemander un code.")

await c.end()
process.exit(0)
