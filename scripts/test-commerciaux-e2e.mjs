#!/usr/bin/env node
/**
 * Test de bout en bout du module « Les commerciaux ».
 *
 * Il vérifie les SIX scénarios de sécurité énoncés par le client, contre
 * le serveur réel et la base réelle — pas contre des simulacres :
 *   1. commercial sans accès CRM        → aucun accès ;
 *   2. avec accès                       → uniquement les modules autorisés ;
 *   3. périmètre « mes prospects »      → les fiches des autres restent
 *                                          inatteignables, même par ID ;
 *   4. sans droit de modification       → PATCH refusé ;
 *   5. sans droit de conversion         → conversion refusée ;
 *   6. sans droit client                → /clients et l'accès direct refusés.
 *
 * Les jetons sont signés avec le secret du serveur, comme le fait
 * /api/auth/login : la double authentification interdit un vrai login
 * automatisé, mais le serveur applique ensuite TOUS ses contrôles.
 *
 * Le script REMET LA BASE EN L'ÉTAT : les capacités accordées et les
 * attributions posées sont retirées à la fin, y compris en cas d'échec.
 */
import jwt from 'jsonwebtoken'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const API    = process.env.API_URL || `http://localhost:${process.env.SERVER_PORT || 4000}`
const TENANT = '0f1ba85a-55ae-49ab-8de4-b14dbe8d5019'
const ADMIN  = { id: '2f7561a4-b92c-4175-a7c1-f6c752a95896', email: 'nextgital1@gmail.com', role: 'admin' }

const SECRET = process.env.JWT_SECRET
if (!SECRET || SECRET.length < 32) { console.error('✗ JWT_SECRET absent'); process.exit(1) }

const token = (u) => jwt.sign(
  { userId: u.id, email: u.email, tenantId: TENANT, role: u.role, type: 'access' },
  SECRET, { expiresIn: '30m' },
)

const pool = new pg.Pool({
  host: process.env.PG_HOST, port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE, user: process.env.PG_USER, password: process.env.PG_PASSWORD,
})

let ok = 0, ko = 0
const echecs = []
const check = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✅ ${nom}`) }
  else { ko++; echecs.push(`${nom}${detail ? ` (${detail})` : ''}`); console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

async function call(user, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(user)}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data
  const txt = await res.text()
  try { data = JSON.parse(txt) } catch { data = txt }
  return { status: res.status, data }
}

let COMMERCIAL = null      // { id, email, role: 'team_member' }
const prospetsTouches = []

async function nettoyer() {
  if (COMMERCIAL) {
    await pool.query(`DELETE FROM crm_user_capabilities WHERE tenant_id=$1 AND user_id=$2`,
      [TENANT, COMMERCIAL.id]).catch(() => {})
  }
  if (prospetsTouches.length) {
    await pool.query(`UPDATE prospects SET assigned_to = NULL WHERE id = ANY($1::uuid[])`,
      [prospetsTouches]).catch(() => {})
  }
}

async function main() {
  console.log(`\n🧪 Module « Les commerciaux » — test de bout en bout sur ${API}\n`)

  try {
    const h = await fetch(`${API}/health`); if (!h.ok) throw new Error(`HTTP ${h.status}`)
  } catch (e) {
    console.error(`✗ Serveur injoignable (${e.message}). Lancez « npm run server ».`); process.exit(1)
  }

  /* Un employé actif de l'espace, avec un compte : c'est lui qu'on va
     rendre commercial. On le prend en base plutôt qu'en dur — la fixture
     doit survivre à un changement de données. */
  const { rows } = await pool.query(
    `SELECT user_id, email FROM team_members
      WHERE tenant_id=$1 AND account_status='active' AND user_id IS NOT NULL
      ORDER BY created_at LIMIT 1`, [TENANT])
  if (!rows.length) { console.error('✗ Aucun employé actif avec compte sur cet espace'); process.exit(1) }
  COMMERCIAL = { id: rows[0].user_id, email: rows[0].email, role: 'team_member' }
  console.log(`Commercial de test : ${COMMERCIAL.email}\n`)

  await nettoyer()

  /* ── 1. Sans accès CRM ─────────────────────────────────────────── */
  section('1. Commercial SANS accès CRM (§16.1)')
  const p0 = await call(COMMERCIAL, 'GET', '/api/my-space/crm/permissions')
  check('GET /permissions répond', p0.status === 200, `statut ${p0.status}`)
  check('enabled = false', p0.data?.enabled === false, JSON.stringify(p0.data?.enabled))
  const l0 = await call(COMMERCIAL, 'GET', '/api/my-space/crm/prospects')
  check('la liste des prospects est refusée (403)', l0.status === 403, `statut ${l0.status}`)
  const c0 = await call(COMMERCIAL, 'GET', '/api/my-space/crm/clients')
  check('la liste des clients est refusée (403)', c0.status === 403, `statut ${c0.status}`)

  /* ── 2. Administration du module ───────────────────────────────── */
  section('2. Module d’administration')
  const cand = await call(ADMIN, 'GET', '/api/commercials/candidates')
  check('GET /candidates répond', cand.status === 200, `statut ${cand.status}`)
  const trouve = (cand.data?.people ?? []).find(p => p.user_id === COMMERCIAL.id)
  check('l’employé figure parmi les personnes rattachables', !!trouve,
    'personnelActif ne lit peut-être que tenant_users')
  const add = await call(ADMIN, 'POST', '/api/commercials', { user_id: COMMERCIAL.id })
  check('rattachement accepté', add.status === 200 || add.status === 201, `statut ${add.status}`)
  const liste = await call(ADMIN, 'GET', '/api/commercials')
  const ligne = (liste.data?.commercials ?? []).find(c => c.user_id === COMMERCIAL.id)
  check('il apparaît dans la liste des commerciaux', !!ligne)
  check('son accès CRM est actif', ligne?.crm_enabled === true)
  check('les compteurs sont présents', typeof ligne?.counts?.prospects === 'number')

  const refus = await call(COMMERCIAL, 'GET', '/api/commercials')
  check('un employé ne peut PAS lire le module d’administration (403)',
    refus.status === 403, `statut ${refus.status}`)

  /* ── 3. Avec accès, mais rien d’attribué ───────────────────────── */
  section('3. Accès accordé, portefeuille vide')
  const p1 = await call(COMMERCIAL, 'GET', '/api/my-space/crm/permissions')
  check('enabled = true', p1.data?.enabled === true)
  check('il peut voir les prospects', p1.data?.can?.prospects_view === true)
  check('il ne peut PAS voir les clients (non accordé)', p1.data?.can?.clients_view === false)
  const l1 = await call(COMMERCIAL, 'GET', '/api/my-space/crm/prospects')
  check('la liste répond 200', l1.status === 200, `statut ${l1.status}`)

  /* L'invariant qui compte n'est pas « la liste est vide » — l'espace
     peut déjà porter des attributions — mais « il ne voit QUE ce qui lui
     revient ». On le vérifie contre la base : chaque fiche retournée
     doit être la sienne, et le total de l'espace doit rester hors de
     portée. C'est la propriété de sécurité ; le reste est de la fixture. */
  const vus = (l1.data?.prospects ?? []).map(p => p.id)
  const total = (await pool.query(`SELECT count(*)::int AS n FROM prospects WHERE tenant_id=$1`, [TENANT])).rows[0].n
  check('il ne voit pas tout le portefeuille de l’espace',
    vus.length < total, `${vus.length} vues sur ${total}`)
  if (vus.length) {
    const miennes = await pool.query(
      `SELECT count(*)::int AS n FROM prospects
        WHERE id = ANY($1::uuid[]) AND (assigned_to = $2 OR created_by = $2)`,
      [vus, COMMERCIAL.id])
    check('chaque fiche visible lui est bien attribuée',
      miennes.rows[0].n === vus.length, `${miennes.rows[0].n}/${vus.length}`)
  } else {
    check('chaque fiche visible lui est bien attribuée', true)
  }

  /* ── 4. Attribution et périmètre ───────────────────────────────── */
  section('4. Périmètre « mes prospects » (§16.3)')
  const dispo = await pool.query(
    `SELECT id FROM prospects WHERE tenant_id=$1 AND assigned_to IS NULL ORDER BY created_at LIMIT 3`,
    [TENANT])
  const [a, b, autre] = dispo.rows.map(r => r.id)
  prospetsTouches.push(a, b)
  /* On raisonne en ÉCART, jamais en valeur absolue : cet espace peut
     déjà porter des attributions faites à la main, et un test qui exige
     « exactement 2 » échouerait sur un état parfaitement sain. */
  const avant = ((await call(COMMERCIAL, 'GET', '/api/my-space/crm/prospects')).data?.prospects ?? []).length

  const assign = await call(ADMIN, 'POST', `/api/commercials/${COMMERCIAL.id}/prospects`,
    { prospect_ids: [a, b] })
  check('attribution en lot acceptée', assign.status === 200, `statut ${assign.status}`)

  const l2 = await call(COMMERCIAL, 'GET', '/api/my-space/crm/prospects')
  const apres = (l2.data?.prospects ?? []).length
  check('les 2 prospects attribués apparaissent dans sa liste',
    apres === avant + 2, `${avant} avant, ${apres} après`)
  const ids = new Set((l2.data?.prospects ?? []).map(p => p.id))
  check('ce sont bien CES deux fiches-là', ids.has(a) && ids.has(b))
  const sien = await call(COMMERCIAL, 'GET', `/api/my-space/crm/prospects/${a}`)
  check('il ouvre une fiche qui lui est attribuée', sien.status === 200, `statut ${sien.status}`)
  const vole = await call(COMMERCIAL, 'GET', `/api/my-space/crm/prospects/${autre}`)
  check('il NE PEUT PAS ouvrir une fiche d’un autre, même par ID (403/404)',
    [403, 404].includes(vole.status), `statut ${vole.status}`)

  /* ── 5. Droits fins ────────────────────────────────────────────── */
  section('5. Droits fins : modification, conversion, clients (§16.4 à 16.6)')
  await call(ADMIN, 'PUT', `/api/commercials/${COMMERCIAL.id}/capabilities`,
    { capabilities: ['crm.access', 'prospects.view'] })
  const patch = await call(COMMERCIAL, 'PATCH', `/api/my-space/crm/prospects/${a}`, { nom: 'Tentative' })
  check('sans prospects.edit : modification refusée (403)', patch.status === 403, `statut ${patch.status}`)
  const conv = await call(COMMERCIAL, 'POST', `/api/my-space/crm/prospects/${a}/convert`, {})
  check('sans convert.all : conversion refusée (403)', conv.status === 403, `statut ${conv.status}`)
  const cli = await call(COMMERCIAL, 'GET', '/api/my-space/crm/clients')
  check('sans clients.view : liste clients refusée (403)', cli.status === 403, `statut ${cli.status}`)

  await call(ADMIN, 'PUT', `/api/commercials/${COMMERCIAL.id}/capabilities`,
    { capabilities: ['crm.access', 'prospects.view', 'prospects.edit'] })
  const patch2 = await call(COMMERCIAL, 'PATCH', `/api/my-space/crm/prospects/${a}`,
    { notes: 'Note posée par le test' })
  check('avec prospects.edit : modification acceptée', patch2.status === 200, `statut ${patch2.status}`)

  const capBidon = await call(ADMIN, 'PUT', `/api/commercials/${COMMERCIAL.id}/capabilities`,
    { capabilities: ['crm.access', 'prospects.tout_pouvoir'] })
  check('une capacité inconnue est refusée (400)', capBidon.status === 400, `statut ${capBidon.status}`)

  /* ── 6. Retrait de l’accès ─────────────────────────────────────── */
  section('6. Retrait de l’accès, historique conservé (§14)')
  const del = await call(ADMIN, 'DELETE', `/api/commercials/${COMMERCIAL.id}`)
  check('retrait accepté', del.status === 200, `statut ${del.status}`)
  const p2 = await call(COMMERCIAL, 'GET', '/api/my-space/crm/permissions')
  check('son CRM est refermé', p2.data?.enabled === false)
  const l3 = await call(COMMERCIAL, 'GET', '/api/my-space/crm/prospects')
  check('ses routes CRM répondent de nouveau 403', l3.status === 403, `statut ${l3.status}`)
  const reste = await pool.query(
    `SELECT count(*)::int AS n FROM prospects WHERE assigned_to = $1 AND id = ANY($2::uuid[])`,
    [COMMERCIAL.id, [a, b]])
  check('ses prospects lui restent attribués (historique conservé)', reste.rows[0].n === 2,
    `${reste.rows[0].n}/2 fiche(s)`)

  /* ── Bilan ─────────────────────────────────────────────────────── */
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${ok} réussi(s), ${ko} échec(s)`)
  if (ko) { console.log('\n  Échecs :'); echecs.forEach(e => console.log(`   • ${e}`)) }
  console.log(`${'─'.repeat(64)}\n`)

  await nettoyer()
  await pool.end()
  process.exit(ko ? 1 : 0)
}

main().catch(async (e) => {
  console.error('\n✗ Test interrompu :', e)
  await nettoyer().catch(() => {})
  await pool.end().catch(() => {})
  process.exit(1)
})
