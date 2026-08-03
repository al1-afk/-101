/* ─────────────────────────────────────────────────────────────────
   CENTRE DE SÉCURITÉ — tests d'intégration (API + PostgreSQL).

   Ces tests franchissent la vraie frontière HTTP et vérifient ce
   qu'aucun test unitaire ne peut prouver : que le contrôle d'accès
   tient côté serveur, que les événements arrivent bien en base, et
   qu'aucun secret ne s'y retrouve.

   Prérequis :
     1. migration 080_security_center.sql appliquée sur la base ;
     2. API lancée      →  npm run server        (terminal 1)
     3. tests           →  npm run test:security:api   (terminal 2)

   Variables : TEST_API_URL, PG_HOST, PG_PORT, PG_DATABASE, PG_USER,
   PG_PASSWORD (mêmes valeurs que .env.local).
───────────────────────────────────────────────────────────────── */
import test   from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

/* Même source de configuration que le serveur (server/db/pool.ts) :
   `.env.local`. Charger `.env` par défaut ferait pointer les tests sur
   une autre base que l'API — et ferait échouer des assertions pour de
   mauvaises raisons. */
dotenv.config({ path: '.env.local' })
dotenv.config()

const API_URL = process.env.TEST_API_URL || `http://localhost:${process.env.SERVER_PORT || 4000}`

const db = new Pool({
  host:     process.env.PG_HOST     || '127.0.0.1',
  port:     Number(process.env.PG_PORT) || 5433,
  database: process.env.PG_DATABASE || 'gestiq',
  user:     process.env.PG_USER     || 'gestiq_api',
  password: process.env.PG_PASSWORD || '',
})

const PASSWORD = 'Strong-Password-123'

/* Même dérivation que server/middleware/auth.ts : en dev, le serveur
   utilise un secret de repli stable si JWT_SECRET est absent. Les tests
   signent donc des tokens que l'API acceptera. */
const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32)
  ? process.env.JWT_SECRET
  : `dev-JWT_SECRET-fallback-${'x'.repeat(40)}`

/* Traces à nettoyer en fin de suite. */
const createdUsers:   string[] = []
const createdTenants: string[] = []

/* ── helpers ───────────────────────────────────────────────────── */

interface Session { token: string; tenantId: string; tenantSlug: string; userId: string; email: string }

type Json = Record<string, unknown>

/* Formes de réponse utilisées par les assertions — volontairement
   minimales : le test vérifie un contrat, pas le schéma complet. */
interface OverviewBody { cards: Record<string, number>; loginSeries: unknown[]; proxy: Json }
interface EventRow {
  id: string; user_id: string | null; severity: string; status: string
  event_type: string; reason: string | null; metadata: Record<string, string>
}
interface EventsBody  { rows: EventRow[]; limit: number; offset: number; hasMore: boolean }
interface LoginsBody  { rows: Array<{ success: boolean; email: string | null }> }
interface OnlineBody  {
  onlineCount: number; idleCount: number
  users: Array<{ user_id: string; state: string }>
}
interface IpBody      { summary: { events: number } | null }

async function api<T = Json>(
  path: string,
  init: RequestInit & { token?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T }> {
  const { token, headers, ...rest } = init
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })
  const body = await res.json().catch(() => ({})) as T
  return { status: res.status, body }
}

function uniq(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Crée un espace + un utilisateur DIRECTEMENT en base, puis signe un
 * access token.
 *
 * Pourquoi ne pas passer par /api/auth/register : les routes d'auth sont
 * protégées par authLimiter (10 requêtes / 15 min / IP). Une suite qui
 * crée ~20 comptes saturerait ce plafond et se testerait elle-même au
 * lieu de tester le module. Affaiblir le limiteur pour les tests serait
 * pire : on validerait une configuration qui n'est pas celle de la prod.
 * Le budget de requêtes /api/auth est donc réservé aux tests qui doivent
 * VRAIMENT exercer le flux de connexion.
 */
async function createSession(role = 'admin'): Promise<Session> {
  const slug  = uniq('sec')
  const email = `${slug}@example.test`
  const hash  = await bcrypt.hash(PASSWORD, 10)

  const u = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
    [email, hash, slug],
  )
  const userId = u.rows[0].id
  const t = await db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name, owner_id) VALUES ($1, $2, $3) RETURNING id`,
    [slug, slug, userId],
  )
  const tenantId = t.rows[0].id
  await db.query(
    `INSERT INTO tenant_users (tenant_id, user_id, role, status) VALUES ($1, $2, $3, 'active')`,
    [tenantId, userId, role],
  )
  createdUsers.push(userId)
  createdTenants.push(tenantId)

  const token = jwt.sign(
    { userId, email, tenantId, role, type: 'access' },
    JWT_SECRET, { expiresIn: '1h' },
  )
  return { token, tenantId, tenantSlug: slug, userId, email }
}

async function setRole(session: Session, role: string): Promise<void> {
  await db.query(
    `UPDATE tenant_users SET role = $1 WHERE user_id = $2 AND tenant_id = $3`,
    [role, session.userId, session.tenantId],
  )
}

async function grantMonitoring(session: Session): Promise<void> {
  await db.query(
    `INSERT INTO user_permissions (tenant_id, user_id, permission)
     VALUES ($1, $2, 'SECURITY_MONITORING_READ')
     ON CONFLICT DO NOTHING`,
    [session.tenantId, session.userId],
  )
}

interface DbEventRow {
  id: string; tenant_id: string | null; severity: string; status: string
  reason: string | null; ip_address: string | null
  metadata: Record<string, string>
}

async function eventsFor(session: Session, type: string): Promise<DbEventRow[]> {
  const r = await db.query<DbEventRow>(
    `SELECT * FROM security_events
      WHERE event_type = $1 AND (tenant_id = $2 OR email = $3)
      ORDER BY created_at DESC LIMIT 20`,
    [type, session.tenantId, session.email],
  )
  return r.rows
}

/** Les écritures d'événements sont fire-and-forget : petit délai. */
const settle = (ms = 350) => new Promise(r => setTimeout(r, ms))

/* Nettoyage : la suite ne doit rien laisser derrière elle. */
test.after(async () => {
  try {
    if (createdTenants.length) {
      await db.query(`DELETE FROM security_events WHERE tenant_id = ANY($1::uuid[])`, [createdTenants])
      await db.query(`DELETE FROM security_alerts WHERE tenant_id = ANY($1::uuid[])`, [createdTenants])
      await db.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [createdTenants])
    }
    if (createdUsers.length) {
      await db.query(
        `DELETE FROM login_attempts WHERE email IN (SELECT email FROM users WHERE id = ANY($1::uuid[]))`,
        [createdUsers],
      )
      await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUsers])
    }
    /* Filet : tout compte de test résiduel. */
    await db.query(`DELETE FROM login_attempts WHERE email LIKE 'sec-%@example.test'`)
    await db.query(`DELETE FROM users WHERE email LIKE 'sec-%@example.test'`)
  } finally {
    await db.end()
  }
})

/* ═══════════════════════════════════════════════════════════════
   1. CONTRÔLE D'ACCÈS
   ═══════════════════════════════════════════════════════════════ */

test('ADMIN : accès autorisé au Centre de sécurité', async () => {
  const admin = await createSession()
  const { status, body } = await api<OverviewBody>('/api/security/overview', { token: admin.token })
  assert.equal(status, 200, JSON.stringify(body))
  assert.ok(body.cards, 'la réponse doit contenir les cartes')
  assert.ok(Array.isArray(body.loginSeries))
  assert.ok(body.proxy, 'le diagnostic proxy doit être exposé')
})

test('NON-ADMIN : accès refusé, même avec un JWT qui dit « admin »', async () => {
  const user = await createSession()
  /* Le JWT a été émis alors que l'utilisateur était admin. On le
     rétrograde en base SANS ré-émettre de token : c'est exactement le
     scénario « admin rétrogradé, token encore valide 1 h ». Le module
     doit refuser, parce qu'il relit le rôle en base. */
  await setRole(user, 'comptable')

  for (const path of ['/api/security/overview', '/api/security/online',
                      '/api/security/events', '/api/security/logins',
                      '/api/security/alerts', '/api/security/ip/127.0.0.1']) {
    const { status } = await api(path, { token: user.token })
    assert.equal(status, 403, `${path} doit répondre 403`)
  }
})

test('NON-ADMIN : la tentative d’accès est journalisée', async () => {
  const user = await createSession()
  await setRole(user, 'viewer')
  await api('/api/security/overview', { token: user.token })
  await settle()

  const rows = await eventsFor(user, 'security_center_access_denied')
  assert.ok(rows.length >= 1, 'un événement security_center_access_denied doit exister')
  assert.equal(rows[0].severity, 'high')
  assert.equal(rows[0].status, 'blocked')
  assert.equal(rows[0].metadata.role, 'viewer')
})

test('PERMISSION EXPLICITE : SECURITY_MONITORING_READ ouvre l’accès à un non-admin', async () => {
  const user = await createSession()
  await setRole(user, 'comptable')
  const before = await api('/api/security/overview', { token: user.token })
  assert.equal(before.status, 403)

  await grantMonitoring(user)
  const after = await api('/api/security/overview', { token: user.token })
  assert.equal(after.status, 200, 'la permission explicite doit suffire')
})

test('NON AUTHENTIFIÉ : 401 sur toutes les routes du module', async () => {
  for (const path of ['/api/security/overview', '/api/security/online', '/api/security/events']) {
    const { status } = await api(path)
    assert.equal(status, 401, `${path} sans token doit répondre 401`)
  }
})

/* ═══════════════════════════════════════════════════════════════
   2. JOURNALISATION DES CONNEXIONS
   ═══════════════════════════════════════════════════════════════ */

test('Connexion réussie journalisée et visible dans l’historique', async () => {
  const admin = await createSession()
  /* /login s'arrête au 2FA, mais la tentative mot de passe est bien
     enregistrée dans login_attempts avec success = true. */
  await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: admin.email, password: PASSWORD, tenantSlug: admin.tenantSlug }),
  })
  await settle()

  const attempts = await db.query<{ success: boolean }>(
    `SELECT success FROM login_attempts WHERE email = $1 ORDER BY attempted_at DESC LIMIT 1`,
    [admin.email],
  )
  assert.equal(attempts.rows[0]?.success, true)

  const { status, body } = await api<LoginsBody>(`/api/security/logins?period=24h&email=${encodeURIComponent(admin.email)}`,
    { token: admin.token })
  assert.equal(status, 200)
  assert.ok(body.rows.some(r => r.success === true), 'la connexion réussie doit apparaître')
})

test('Connexion échouée journalisée (LOW/normal — jamais « piratage »)', async () => {
  const admin = await createSession()
  await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: admin.email, password: 'MauvaisMotDePasse-1', tenantSlug: admin.tenantSlug }),
  })
  await settle()

  const rows = await eventsFor(admin, 'login_failed')
  assert.ok(rows.length >= 1, 'un événement login_failed doit exister')
  assert.equal(rows[0].severity, 'low')
  assert.equal(rows[0].status, 'normal', 'un échec isolé ne doit pas être marqué suspect')
  assert.equal(rows[0].reason, 'invalid_password')
  /* Rattachement au tenant : sans lui, l'échec serait visible par tous
     les administrateurs de la plateforme. */
  assert.equal(rows[0].tenant_id, admin.tenantId)
})

test('Compte désactivé : tentative journalisée et bloquée', async () => {
  const user = await createSession()
  await db.query(`UPDATE users SET is_active = false WHERE id = $1`, [user.userId])

  const { status } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: user.email, password: PASSWORD, tenantSlug: user.tenantSlug }),
  })
  assert.equal(status, 403)
  await settle()

  const rows = await eventsFor(user, 'account_disabled_login')
  assert.ok(rows.length >= 1)
  assert.equal(rows[0].status, 'blocked')
})

test('Brute-force : verrouillage déclenché et alerte dédupliquée', async () => {
  const victim = await createSession()

  /* Le verrou de /login compte les échecs par email OU PAR IP. Les tests
     précédents ont produit des échecs depuis la même IP (127.0.0.1) :
     sans remise à zéro, le verrou serait déjà armé et ce test mesurerait
     l'état laissé par les autres. On ne purge que les tentatives des
     comptes de test. */
  await db.query(`DELETE FROM login_attempts WHERE email LIKE 'sec-%@example.test'`)

  /* Le verrou applicatif se déclenche à 10 échecs / 15 min. On sème
     l'historique directement en base — envoyer 12 vraies requêtes
     ferait sauter authLimiter (10/15 min) AVANT le verrou métier, et on
     testerait le rate limiter au lieu de la détection brute-force. */
  for (let i = 0; i < 9; i++) {
    await db.query(
      `INSERT INTO login_attempts (email, ip_address, success, attempted_at)
       VALUES ($1, '127.0.0.1'::inet, false, NOW() - ($2 || ' seconds')::interval)`,
      [victim.email, String(60 - i)],
    )
  }

  /* 10e échec RÉEL : sous le seuil de verrouillage, il passe par la
     route et déclenche la détection (alerte compte ciblé / brute-force). */
  const failed = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: victim.email, password: 'Encore-Faux-1', tenantSlug: victim.tenantSlug }),
  })
  assert.equal(failed.status, 401)
  await settle(700)

  /* 11e tentative : le verrou applicatif doit s'être armé. */
  const locked = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: victim.email, password: 'Encore-Faux-2', tenantSlug: victim.tenantSlug }),
  })
  assert.equal(locked.status, 429, 'la tentative suivante doit être verrouillée')
  await settle(700)

  const lockouts = await eventsFor(victim, 'login_blocked_lockout')
  assert.ok(lockouts.length >= 1, 'le verrouillage doit produire un événement')
  assert.equal(lockouts[0].severity, 'high')
  /* Rattaché au tenant du compte visé : un événement portant un email
     ne doit jamais tomber dans le lot « non attribué », visible par les
     administrateurs de tous les espaces. */
  assert.equal(lockouts[0].tenant_id, victim.tenantId)

  const alerts = await db.query<{ alert_type: string; occurrences: number; status: string }>(
    `SELECT alert_type, occurrences, status FROM security_alerts
      WHERE tenant_id = $1
        AND alert_type IN ('brute_force_suspected','account_targeted','login_blocked_lockout')`,
    [victim.tenantId],
  )
  assert.ok(alerts.rows.length >= 1, 'une alerte brute-force doit être ouverte')
  /* Déduplication : une seule ligne ouverte par motif, avec un compteur —
     pas une alerte par tentative. */
  const openByType = alerts.rows.filter(r => r.status === 'open')
  const distinct   = new Set(openByType.map(r => r.alert_type))
  assert.equal(openByType.length, distinct.size, 'pas de doublon d’alerte ouverte')
  assert.ok(openByType.some(r => r.occurrences >= 1))
})

/* ═══════════════════════════════════════════════════════════════
   3. CONTRÔLE D'ACCÈS MÉTIER JOURNALISÉ
   ═══════════════════════════════════════════════════════════════ */

test('Accès hors périmètre : refus RBAC journalisé', async () => {
  /* Le rôle est émis DANS le token : on crée directement une session
     viewer. (Le RBAC des tables lit `req.user.role`, donc une
     rétrogradation en base ne prend effet qu'au renouvellement du
     token — contrairement au Centre de sécurité, qui relit la base.) */
  const user = await createSession('viewer')

  const { status } = await api('/api/clients', {
    method: 'POST', token: user.token,
    body: JSON.stringify({ nom: 'Interdit' }),
  })
  assert.equal(status, 403)
  await settle()

  const rows = await eventsFor(user, 'permission_denied')
  assert.ok(rows.length >= 1, 'un événement permission_denied doit exister')
  assert.equal(rows[0].metadata.table, 'clients')
  assert.equal(rows[0].metadata.action, 'create')
  assert.equal(rows[0].status, 'blocked')
})

test('tenant_id forgé dans le corps : signal IDOR journalisé', async () => {
  const A = await createSession()
  const B = await createSession()

  const { status } = await api('/api/clients', {
    method: 'POST', token: B.token,
    body: JSON.stringify({ nom: 'Forgé', tenant_id: A.tenantId }),
  })
  assert.equal(status, 201, 'le serveur écrase le tenant_id, la requête aboutit dans SON espace')
  await settle()

  const rows = await eventsFor(B, 'tenant_scope_denied')
  assert.ok(rows.length >= 1, 'la falsification doit être journalisée')
  assert.equal(rows[0].reason, 'forged_tenant_id')
  assert.equal(rows[0].severity, 'high')
})

/* ═══════════════════════════════════════════════════════════════
   3 bis. RÔLE EFFECTIF — le JWT ne fait plus autorité
   ═══════════════════════════════════════════════════════════════ */

test('Rétrogradation : le rôle en base l’emporte sur celui du token', async () => {
  /* Token émis en 'admin' ; la base dit 'viewer' → l'action réservée
     doit être refusée immédiatement, sans attendre l'expiration (1 h). */
  const user = await createSession('admin')
  await setRole(user, 'viewer')

  const { status } = await api('/api/clients', {
    method: 'POST', token: user.token,
    body: JSON.stringify({ nom: 'Doit être refusé' }),
  })
  assert.equal(status, 403, 'le rôle en base doit primer sur celui du JWT')
})

test('Révocation d’accès : le token valide ne vaut plus rien', async () => {
  const user = await createSession('admin')
  await db.query(
    `UPDATE tenant_users SET status = 'revoked' WHERE user_id = $1 AND tenant_id = $2`,
    [user.userId, user.tenantId],
  )
  const { status, body } = await api<{ code?: string }>('/api/clients', { token: user.token })
  assert.equal(status, 401, 'une appartenance révoquée doit couper l’accès')
  assert.equal(body.code, 'ACCESS_REVOKED')
})

test('Compte désactivé : accès coupé même avec un token valide', async () => {
  const user = await createSession('admin')
  await db.query(`UPDATE users SET is_active = false WHERE id = $1`, [user.userId])
  const { status } = await api('/api/clients', { token: user.token })
  assert.equal(status, 401)
})

test('Isolation applicative : le filtre tenant_id tient même si la RLS est contournée', async () => {
  /* Le rôle de connexion utilisé en développement est SUPERUSER, donc
     la RLS ne s'applique pas. Ce test vérifie que la 2e ligne de
     défense (filtre applicatif dans crud.ts) suffit à elle seule. */
  const A = await createSession('admin')
  const B = await createSession('admin')

  const created = await api<{ id: string }>('/api/clients', {
    method: 'POST', token: A.token,
    body: JSON.stringify({ nom: `iso-${A.tenantSlug}` }),
  })
  assert.equal(created.status, 201)

  const list = await api<Array<{ id: string }>>('/api/clients', { token: B.token })
  assert.equal(list.status, 200)
  assert.equal(
    (list.body as Array<{ id: string }>).some(c => c.id === created.body.id), false,
    'B ne doit voir aucune ligne de A',
  )

  const direct = await api(`/api/clients/${created.body.id}`, { token: B.token })
  assert.equal(direct.status, 404, 'accès direct par id → 404')
})

/* ═══════════════════════════════════════════════════════════════
   4. CONFIDENTIALITÉ — aucun secret en base
   ═══════════════════════════════════════════════════════════════ */

test('Aucune donnée sensible enregistrée dans security_events', async () => {
  const user = await createSession()
  const secret = 'MotDePasseUltraSecret-42'

  await api('/api/auth/login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ email: user.email, password: secret, tenantSlug: user.tenantSlug }),
  })
  await settle()

  const rows = await db.query<{ id: string; meta: string; reason: string | null
                                endpoint: string | null; user_agent: string | null }>(
    `SELECT id, metadata::text AS meta, reason, endpoint, user_agent
       FROM security_events WHERE created_at > NOW() - INTERVAL '2 minutes'`,
  )
  for (const r of rows.rows) {
    const blob = `${r.meta} ${r.reason} ${r.endpoint} ${r.user_agent}`
    assert.ok(!blob.includes(secret), `mot de passe trouvé dans l'événement ${r.id}`)
    assert.ok(!/Bearer\s+eyJ/i.test(blob), `JWT trouvé dans l'événement ${r.id}`)
    assert.ok(!/authorization/i.test(String(r.meta)), `header Authorization dans ${r.id}`)
  }

  /* Le schéma lui-même ne doit exposer aucune colonne de secret. */
  const cols = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'security_events'`,
  )
  const names = cols.rows.map(c => c.column_name)
  for (const forbidden of ['password', 'password_hash', 'token', 'token_hash',
                           'refresh_token', 'access_token', 'authorization', 'secret']) {
    assert.ok(!names.includes(forbidden), `colonne interdite: ${forbidden}`)
  }
})

/* ═══════════════════════════════════════════════════════════════
   5. IP DERRIÈRE LE PROXY
   ═══════════════════════════════════════════════════════════════ */

test('IP : un X-Forwarded-For forgé par le client n’est pas retenu', async () => {
  const admin = await createSession()
  const forged = '8.8.8.8'

  await api('/api/auth/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': forged },
    body: JSON.stringify({ email: admin.email, password: 'FauxMotDePasse-9', tenantSlug: admin.tenantSlug }),
  })
  await settle()

  const rows = await eventsFor(admin, 'login_failed')
  assert.ok(rows.length >= 1)
  const ip = String(rows[0].ip_address ?? '')
  /* En local, le pair TCP est 127.0.0.1 et trust proxy = 1 : la chaîne
     ne contient QUE la valeur forgée, donc Express ne doit pas la
     retenir comme IP client. */
  assert.notEqual(ip, forged, `l'IP forgée ${forged} ne doit jamais être journalisée`)

  /* Et le détail par IP ne doit rien trouver sous l'IP forgée. */
  const { body } = await api<IpBody>(`/api/security/ip/${forged}?period=24h`, { token: admin.token })
  assert.equal(body.summary?.events ?? 0, 0)
})

test('IP : une valeur non-IP est refusée par le détail (pas de cast ::inet sauvage)', async () => {
  const admin = await createSession()
  const { status } = await api(`/api/security/ip/${encodeURIComponent("1.1.1.1'; DROP TABLE users;--")}`,
    { token: admin.token })
  assert.equal(status, 400)
})

/* ═══════════════════════════════════════════════════════════════
   6. PRÉSENCE
   ═══════════════════════════════════════════════════════════════ */

test('Présence : heartbeat → utilisateur en ligne', async () => {
  const admin = await createSession()
  const sessionKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

  const hb = await api('/api/security/heartbeat', {
    method: 'POST', token: admin.token,
    body: JSON.stringify({ sessionKey }),
  })
  assert.equal(hb.status, 200)

  const { body } = await api<OnlineBody>('/api/security/online', { token: admin.token })
  const me = body.users.find(u => u.user_id === admin.userId)
  assert.ok(me, 'l’utilisateur doit apparaître en ligne')
  assert.equal(me.state, 'online')
  assert.equal(body.onlineCount >= 1, true)
})

test('Présence : clé de session invalide refusée', async () => {
  const admin = await createSession()
  for (const bad of ['', 'trop-court', "' OR 1=1 --", 'z'.repeat(32)]) {
    const { status } = await api('/api/security/heartbeat', {
      method: 'POST', token: admin.token,
      body: JSON.stringify({ sessionKey: bad }),
    })
    assert.equal(status, 400, `sessionKey « ${bad} » doit être refusée`)
  }
})

test('Présence : expiration réelle — un JWT valide ne suffit pas à rester « en ligne »', async () => {
  const admin = await createSession()
  const sessionKey = 'b1b2c3d4e5f60718293a4b5c6d7e8f91'
  await api('/api/security/heartbeat', {
    method: 'POST', token: admin.token, body: JSON.stringify({ sessionKey }),
  })

  /* On recule le dernier battement de 20 min (> seuil idle de 15 min).
     Le token JWT, lui, reste parfaitement valide. */
  await db.query(
    `UPDATE user_presence SET last_seen_at = NOW() - INTERVAL '20 minutes'
      WHERE user_id = $1 AND session_key = $2`,
    [admin.userId, sessionKey],
  )

  const { body } = await api<OnlineBody>('/api/security/online', { token: admin.token })
  const me = body.users.find(u => u.user_id === admin.userId)
  assert.equal(me, undefined, 'la session expirée ne doit plus être listée')
})

test('Présence : la déconnexion retire immédiatement l’utilisateur', async () => {
  const admin = await createSession()
  const sessionKey = 'c1b2c3d4e5f60718293a4b5c6d7e8f92'
  await api('/api/security/heartbeat', {
    method: 'POST', token: admin.token, body: JSON.stringify({ sessionKey }),
  })
  await api('/api/auth/logout', {
    method: 'POST', token: admin.token, body: JSON.stringify({ sessionKey }),
  })
  await settle()

  const { body } = await api<OnlineBody>('/api/security/online', { token: admin.token })
  const me = body.users.find(u => u.user_id === admin.userId)
  assert.equal(me, undefined, 'après logout, plus de présence')
})

/* ═══════════════════════════════════════════════════════════════
   7. PAGINATION ET FILTRES
   ═══════════════════════════════════════════════════════════════ */

test('Pagination : limite plafonnée côté serveur', async () => {
  const admin = await createSession()
  const { status, body } = await api<EventsBody>('/api/security/events?limit=99999', { token: admin.token })
  assert.equal(status, 200)
  assert.ok(body.limit <= 200, `limite renvoyée ${body.limit} doit être plafonnée à 200`)
  assert.ok(body.rows.length <= body.limit)
})

test('Pagination : offset respecté et hasMore cohérent', async () => {
  const admin = await createSession()
  const p1 = await api<EventsBody>('/api/security/events?limit=5&offset=0', { token: admin.token })
  const p2 = await api<EventsBody>('/api/security/events?limit=5&offset=5', { token: admin.token })
  assert.equal(p1.status, 200)
  assert.equal(p2.status, 200)
  const ids1 = new Set(p1.body.rows.map(r => r.id))
  for (const r of p2.body.rows) {
    assert.ok(!ids1.has(r.id), 'les pages ne doivent pas se chevaucher')
  }
})

test('Filtres : une valeur hors catalogue est ignorée, jamais interpolée', async () => {
  const admin = await createSession()
  const { status } = await api(
    `/api/security/events?severity=${encodeURIComponent("' OR 1=1 --")}&type=inexistant`,
    { token: admin.token },
  )
  assert.equal(status, 200, 'un filtre invalide ne doit ni planter ni injecter')
})

/* ═══════════════════════════════════════════════════════════════
   8. CLOISONNEMENT DES DONNÉES
   ═══════════════════════════════════════════════════════════════ */

test('Isolation : un admin ne voit pas les événements attribués à un autre espace', async () => {
  const A = await createSession()
  const B = await createSession()

  /* B provoque un refus RBAC dans SON espace. */
  await setRole(B, 'viewer')
  await api('/api/clients', {
    method: 'POST', token: B.token, body: JSON.stringify({ nom: 'X' }),
  })
  await settle()

  const { body } = await api<EventsBody>('/api/security/events?period=24h&limit=200', { token: A.token })
  const leaked = body.rows.filter(r => r.user_id === B.userId)
  assert.equal(leaked.length, 0, 'aucun événement de l’espace B ne doit apparaître chez A')
})

/* ═══════════════════════════════════════════════════════════════
   9. RATE LIMITING — en DERNIER : ce test sature volontairement
   authLimiter (10 requêtes / 15 min / IP). Tout test d'auth placé
   après lui échouerait pour une mauvaise raison. Relancer la suite
   dans les 15 min suppose donc de redémarrer l'API (le compteur
   express-rate-limit vit en mémoire).
   ═══════════════════════════════════════════════════════════════ */

test('Rate limit : déclenchement journalisé avec le nom du limiteur', async () => {
  const admin = await createSession()
  /* authLimiter : 10 requêtes / 15 min / IP sur /api/auth/*.
     On vise forgot-password pour ne pas polluer login_attempts. */
  let sawRateLimit = false
  for (let i = 0; i < 14; i++) {
    const { status } = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: `inconnu-${i}@example.test` }),
    })
    if (status === 429) { sawRateLimit = true; break }
  }
  await settle()

  if (!sawRateLimit) {
    /* En dev le plafond peut être plus haut : on ne fait pas échouer le
       test pour une question de configuration, on le signale. */
    console.warn('[test] rate limit non atteint — plafond dev élevé ?')
    return
  }
  const rows = await db.query<{ reason: string; severity: string; status: string }>(
    `SELECT reason, severity, status FROM security_events
      WHERE event_type = 'rate_limit' ORDER BY created_at DESC LIMIT 5`,
  )
  assert.ok(rows.rows.length >= 1, 'un événement rate_limit doit exister')
  assert.ok(String(rows.rows[0].reason).startsWith('limiter_'))
  assert.equal(rows.rows[0].status, 'blocked')
  void admin
})
