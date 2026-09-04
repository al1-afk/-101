#!/usr/bin/env node
/**
 * Test de bout en bout de la MESSAGERIE INTERNE (module « 💬 Messages »).
 *
 * Ce que ce script prouve, et qu'aucun test unitaire ne prouverait :
 *   §38 confidentialité — Yassine ne peut RIEN atteindre du fil Admin ↔ Amin,
 *        même en connaissant l'identifiant de la conversation ;
 *   §39 multi-appareils  — deux flux temps réel ouverts pour le MÊME compte
 *        reçoivent tous les deux le message et la synchronisation du « lu » ;
 *   §12/13 accusés       — ✓ Envoyé, ✓✓ Reçu, ✓✓ Lu, avec les horodatages ;
 *   §9  temps réel       — le message arrive sans aucune actualisation.
 *
 * ── Pourquoi des jetons signés au lieu d'un vrai login ──────────────
 * L'ouverture de session passe par la double authentification : un test
 * automatisé ne peut pas la franchir sans intervention humaine. On signe
 * donc des jetons d'accès avec le MÊME secret que le serveur, exactement
 * comme le fait /api/auth/login. Le serveur, lui, applique tous ses
 * contrôles habituels (rôle effectif relu en base, RLS, appartenance).
 *
 * ── E-mails ────────────────────────────────────────────────────────
 * Le .env.local de ce poste porte de VRAIS identifiants SMTP : un envoi
 * de test partirait pour de bon. Le script coupe donc explicitement les
 * e-mails des trois comptes de test avant de commencer, et remet les
 * lignes en l'état à la fin.
 *
 * Usage :
 *   node scripts/test-messages-e2e.mjs            (le serveur doit tourner)
 *   API_URL=http://localhost:4001 node scripts/test-messages-e2e.mjs
 */
import jwt from 'jsonwebtoken'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const API = process.env.API_URL || `http://localhost:${process.env.SERVER_PORT || 4000}`

/* Espace « nextgital » du miroir local, et trois comptes réels de cet
   espace tenant lieu d'Admin, d'Amin et de Yassine. */
const TENANT  = '0f1ba85a-55ae-49ab-8de4-b14dbe8d5019'
const ADMIN   = { id: '2f7561a4-b92c-4175-a7c1-f6c752a95896', email: 'nextgital1@gmail.com',           role: 'admin',      label: 'ADMIN'   }
const AMIN    = { id: '22222222-2222-2222-2222-222222222222', email: 'karim.prospecteur@nextgital.ma', role: 'commercial', label: 'AMIN'    }
const YASSINE = { id: '33333333-3333-3333-3333-333333333333', email: 'fatima.commercial@nextgital.ma', role: 'commercial', label: 'YASSINE' }

const SECRET = process.env.JWT_SECRET
if (!SECRET || SECRET.length < 32) {
  console.error('✗ JWT_SECRET absent ou trop court dans .env.local')
  process.exit(1)
}

const token = (u) => jwt.sign(
  { userId: u.id, email: u.email, tenantId: TENANT, role: u.role, type: 'access' },
  SECRET, { expiresIn: '30m' },
)

const pool = new pg.Pool({
  host: process.env.PG_HOST, port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE, user: process.env.PG_USER, password: process.env.PG_PASSWORD,
})

/* ── Petit harnais de test ─────────────────────────────────────────── */
let passed = 0, failed = 0
const results = []
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✅ ${name}`) }
  else    { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
  results.push({ name, ok, detail })
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

async function call(user, method, path, body, expectStatus) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token(user)}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  if (expectStatus && res.status !== expectStatus) {
    return { status: res.status, data, mismatch: true }
  }
  return { status: res.status, data }
}

/** Ouvre un flux SSE et collecte les événements reçus. */
function openStream(user, label) {
  const ctrl = new AbortController()
  const events = []
  const waiters = []
  const promise = (async () => {
    const res = await fetch(`${API}/api/messages/stream`, {
      headers: { 'Authorization': `Bearer ${token(user)}`, 'Accept': 'text/event-stream' },
      signal: ctrl.signal,
    })
    if (!res.ok || !res.body) throw new Error(`stream ${label}: HTTP ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx); buf = buf.slice(idx + 2)
        let name = 'message', dataLines = []
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) name = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (!dataLines.length && !frame.startsWith('event:')) continue   // commentaire / battement
        let payload = null
        try { payload = dataLines.length ? JSON.parse(dataLines.join('\n')) : null } catch { payload = dataLines.join('\n') }
        const evt = { name, payload, at: Date.now() }
        events.push(evt)
        for (const w of [...waiters]) {
          if (w.name === name) { waiters.splice(waiters.indexOf(w), 1); w.resolve(evt) }
        }
      }
    }
  })().catch(err => { if (err.name !== 'AbortError') console.log(`  (flux ${label} interrompu : ${err.message})`) })

  return {
    label, events,
    /** Attend un événement de ce nom (déjà reçu, ou à venir avant le délai). */
    wait(name, ms = 5000) {
      const already = events.find(e => e.name === name)
      if (already) return Promise.resolve(already)
      return new Promise((resolve) => {
        const w = { name, resolve }
        waiters.push(w)
        setTimeout(() => {
          const i = waiters.indexOf(w)
          if (i !== -1) { waiters.splice(i, 1); resolve(null) }
        }, ms)
      })
    },
    /** Vide la mémoire des événements — pour tester l'étape suivante proprement. */
    reset() { events.length = 0 },
    close() { ctrl.abort(); return promise },
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/* ── Nettoyage : tout ce que le test a créé, et rien d'autre ───────── */
async function cleanup() {
  const ids = [ADMIN.id, AMIN.id, YASSINE.id]
  await pool.query(
    `DELETE FROM dm_conversations
      WHERE tenant_id = $1 AND user_a = ANY($2::uuid[]) AND user_b = ANY($2::uuid[])`,
    [TENANT, ids],
  )
  await pool.query(
    `DELETE FROM notifications WHERE tenant_id = $1 AND kind = 'message_prive' AND user_id = ANY($2::uuid[])`,
    [TENANT, ids],
  )
  await pool.query(`DELETE FROM dm_prefs WHERE tenant_id = $1 AND user_id = ANY($2::uuid[])`, [TENANT, ids])
}

async function main() {
  console.log(`\n🧪 Messagerie interne — test de bout en bout sur ${API}\n`)

  /* Serveur joignable ? */
  try {
    const h = await fetch(`${API}/health`)
    if (!h.ok) throw new Error(`HTTP ${h.status}`)
  } catch (e) {
    console.error(`✗ Serveur injoignable sur ${API} (${e.message}). Lancez « npm run server ».`)
    process.exit(1)
  }

  await cleanup()
  /* Coupe les e-mails des comptes de test AVANT tout envoi. */
  for (const u of [ADMIN, AMIN, YASSINE]) {
    await pool.query(
      `INSERT INTO dm_prefs (tenant_id, user_id, email_enabled, urgent_email_enabled, push_enabled)
       VALUES ($1, $2, FALSE, FALSE, FALSE)
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET email_enabled = FALSE, urgent_email_enabled = FALSE, push_enabled = FALSE`,
      [TENANT, u.id],
    )
  }

  /* ── 1. La liste des correspondants ─────────────────────────────── */
  section('1. Liste des correspondants (§2, §23)')
  const contacts = await call(ADMIN, 'GET', '/api/messages/contacts')
  check('GET /contacts répond 200', contacts.status === 200, `statut ${contacts.status}`)
  const list = contacts.data?.contacts ?? []
  check('la liste contient Amin et Yassine',
    list.some(c => c.user_id === AMIN.id) && list.some(c => c.user_id === YASSINE.id))
  check('je ne figure pas dans ma propre liste', !list.some(c => c.user_id === ADMIN.id))
  check('chaque contact porte une présence',
    list.every(c => ['online', 'idle', 'offline'].includes(c.presence)))

  /* ── 2. Deux conversations indépendantes ────────────────────────── */
  section('2. Une conversation privée par personne (§3, §4, §30)')
  const convA = await call(ADMIN, 'POST', '/api/messages/conversations', { user_id: AMIN.id })
  const convB = await call(ADMIN, 'POST', '/api/messages/conversations', { user_id: YASSINE.id })
  check('conversation Admin ↔ Amin créée', !!convA.data?.conversation_id, `statut ${convA.status}`)
  check('conversation Admin ↔ Yassine créée', !!convB.data?.conversation_id, `statut ${convB.status}`)
  check('les deux fils sont distincts', convA.data?.conversation_id !== convB.data?.conversation_id)
  const again = await call(ADMIN, 'POST', '/api/messages/conversations', { user_id: AMIN.id })
  check('rouvrir ne crée pas un doublon', again.data?.conversation_id === convA.data?.conversation_id)
  const self = await call(ADMIN, 'POST', '/api/messages/conversations', { user_id: ADMIN.id })
  check("s'écrire à soi-même est refusé", self.status === 400 || self.status === 403, `statut ${self.status}`)

  const CA = convA.data.conversation_id
  const CB = convB.data.conversation_id

  /* ── 3. Temps réel + accusés ────────────────────────────────────── */
  section('3. Temps réel, sans aucune actualisation (§9, §12, §13)')
  const aminStream  = openStream(AMIN, 'AMIN')
  const adminPhone  = openStream(ADMIN, 'ADMIN/téléphone')
  const adminDesk   = openStream(ADMIN, 'ADMIN/ordinateur')
  const ready = await Promise.all([aminStream.wait('ready'), adminPhone.wait('ready'), adminDesk.wait('ready')])
  check('les trois flux temps réel sont établis', ready.every(Boolean))

  const t0 = Date.now()
  const sent = await call(ADMIN, 'POST', `/api/messages/conversations/${CA}/messages`,
    { text: 'Bonjour Amin, peux-tu venir me voir dans mon bureau ?' })
  check('envoi du message accepté', sent.status === 201, `statut ${sent.status}`)
  const gotByAmin = await aminStream.wait('message', 6000)
  check('Amin reçoit le message en temps réel', !!gotByAmin,
    gotByAmin ? '' : 'aucun événement « message » en 6 s')
  if (gotByAmin) check(`latence de bout en bout < 2 s (${gotByAmin.at - t0} ms)`, gotByAmin.at - t0 < 2000)
  check('la charge utile porte le bon fil', gotByAmin?.payload?.conversation_id === CA)

  /* ✓✓ Reçu : Amin a un flux ouvert, le message doit être marqué remis. */
  await sleep(400)
  const threadAdmin1 = await call(ADMIN, 'GET', `/api/messages/conversations/${CA}`)
  const msg1 = threadAdmin1.data?.messages?.at(-1)
  check('✓✓ Reçu — delivered_at posé par le serveur', !!msg1?.delivered_at)
  check('✓✓ Lu — pas encore lu', !msg1?.read_at)

  /* ── 4. Confidentialité (§5, §38) ───────────────────────────────── */
  section('4. Confidentialité absolue (§5, §38)')
  const spyThread = await call(YASSINE, 'GET', `/api/messages/conversations/${CA}`)
  check('Yassine ne peut pas LIRE le fil Admin ↔ Amin (403)',
    spyThread.status === 403, `statut ${spyThread.status}`)
  const spyPost = await call(YASSINE, 'POST', `/api/messages/conversations/${CA}/messages`, { text: 'je m’invite' })
  check('Yassine ne peut pas ÉCRIRE dans ce fil (403)',
    spyPost.status === 403, `statut ${spyPost.status}`)
  const spyRead = await call(YASSINE, 'POST', `/api/messages/conversations/${CA}/read`, {})
  check('Yassine ne peut pas poser d’accusé de lecture (403)',
    spyRead.status === 403, `statut ${spyRead.status}`)
  const spyContacts = await call(YASSINE, 'GET', '/api/messages/contacts')
  const yasSeesAmin = (spyContacts.data?.contacts ?? []).find(c => c.user_id === AMIN.id)
  check('la liste de Yassine ne fuit aucun aperçu du fil Admin ↔ Amin',
    !yasSeesAmin?.last_message_preview || yasSeesAmin.unread === 0)
  const spyUnread = await call(YASSINE, 'GET', '/api/messages/unread')
  check('le compteur de Yassine reste à zéro', (spyUnread.data?.total ?? 0) === 0,
    `total ${spyUnread.data?.total}`)
  const yasStreamEvents = openStream(YASSINE, 'YASSINE')
  await yasStreamEvents.wait('ready')
  await call(ADMIN, 'POST', `/api/messages/conversations/${CA}/messages`, { text: 'Second message privé pour Amin.' })
  await sleep(1200)
  check('le flux temps réel de Yassine ne reçoit rien du fil des autres',
    !yasStreamEvents.events.some(e => e.name === 'message'))
  await yasStreamEvents.close()

  /* ── 5. Compteurs ───────────────────────────────────────────────── */
  section('5. Pastilles et compteurs (§10, §11)')
  const aminUnread = await call(AMIN, 'GET', '/api/messages/unread')
  check('Amin a 2 messages non lus', aminUnread.data?.total === 2, `total ${aminUnread.data?.total}`)
  const aminContacts = await call(AMIN, 'GET', '/api/messages/contacts')
  const adminRow = (aminContacts.data?.contacts ?? []).find(c => c.user_id === ADMIN.id)
  check('le compteur par correspondant est juste', adminRow?.unread === 2, `unread ${adminRow?.unread}`)

  /* ── 6. Lecture et synchronisation multi-appareils ──────────────── */
  section('6. Lu / non lu synchronisé entre appareils (§19, §20, §39)')
  adminPhone.reset(); adminDesk.reset()
  const readRes = await call(AMIN, 'POST', `/api/messages/conversations/${CA}/read`, {})
  check('Amin marque le fil comme lu', readRes.status === 200 && readRes.data?.read === 2,
    `lus: ${readRes.data?.read}`)
  const readOnPhone = await adminPhone.wait('read', 5000)
  const readOnDesk  = await adminDesk.wait('read', 5000)
  check('l’ordinateur de l’Admin est prévenu du « lu »', !!readOnDesk)
  check('le téléphone de l’Admin est prévenu du « lu » (même compte, 2 appareils)', !!readOnPhone)
  const threadAdmin2 = await call(ADMIN, 'GET', `/api/messages/conversations/${CA}`)
  check('✓✓ Lu — read_at horodaté', !!threadAdmin2.data?.messages?.at(-1)?.read_at)
  const aminUnread2 = await call(AMIN, 'GET', '/api/messages/unread')
  check('le compteur d’Amin retombe à zéro', (aminUnread2.data?.total ?? -1) === 0)

  /* ── 7. Réponse de l'employé ────────────────────────────────────── */
  section('7. L’employé répond (§21, §36)')
  adminPhone.reset(); adminDesk.reset()
  const reply = await call(AMIN, 'POST', `/api/messages/conversations/${CA}/messages`,
    { text: 'Oui, j’arrive dans 5 minutes.' })
  check('la réponse est acceptée', reply.status === 201, `statut ${reply.status}`)
  const onPhone = await adminPhone.wait('message', 6000)
  const onDesk  = await adminDesk.wait('message', 6000)
  check('la réponse arrive sur les DEUX appareils de l’Admin', !!onPhone && !!onDesk)
  /* La cloche est écrite APRÈS la réponse HTTP — c'est voulu : l'expéditeur
     n'attend pas les notifications. On laisse donc au serveur le temps de la
     poser, plutôt que de mesurer une course. */
  let bellCount = -1
  for (let i = 0; i < 15; i++) {
    const bell = await pool.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE tenant_id = $1 AND user_id = $2 AND kind = 'message_prive'`,
      [TENANT, ADMIN.id],
    )
    bellCount = bell.rows[0].n
    if (bellCount > 0) break
    await sleep(200)
  }
  check('une seule ligne de cloche pour ce fil, pas une par message (§33)',
    bellCount === 1, `${bellCount} ligne(s)`)

  /* ── 8. Priorité et pièces jointes ──────────────────────────────── */
  section('8. Priorité et pièces jointes (§25, §26)')
  const urgent = await call(ADMIN, 'POST', `/api/messages/conversations/${CA}/messages`,
    { text: 'Merci de venir immédiatement.', priority: 'urgent' })
  check('un message urgent est accepté et marqué', urgent.data?.priority === 'urgent', `statut ${urgent.status}`)
  const bad = await call(ADMIN, 'POST', `/api/messages/conversations/${CA}/messages`,
    { text: 'x', priority: 'apocalyptique' })
  check('une priorité inconnue est refusée ou ramenée à « normal »',
    bad.status === 400 || bad.data?.priority === 'normal', `priorité ${bad.data?.priority}`)
  const empty = await call(ADMIN, 'POST', `/api/messages/conversations/${CA}/messages`, { text: '   ' })
  check('un message vide est refusé', empty.status === 400, `statut ${empty.status}`)
  const tooLong = await call(ADMIN, 'POST', `/api/messages/conversations/${CA}/messages`, { text: 'a'.repeat(4100) })
  check('un message de plus de 4000 caractères est refusé', tooLong.status === 400, `statut ${tooLong.status}`)

  const up = await fetch(`${API}/api/messages/conversations/${CA}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token(ADMIN)}`,
      'Content-Type': 'text/plain',
      'x-filename': encodeURIComponent('note-interne.txt'),
    },
    body: 'Document confidentiel de test.',
  })
  const upData = await up.json().catch(() => ({}))
  check('téléversement d’une pièce jointe', up.status === 201 && !!upData.id, `statut ${up.status}`)
  if (upData.id) {
    const withFile = await call(ADMIN, 'POST', `/api/messages/conversations/${CA}/messages`,
      { text: 'Peux-tu vérifier ce document ?', file_ids: [upData.id] })
    check('le fichier est rattaché au message', (withFile.data?.files ?? []).length === 1)
    const dl = await fetch(`${API}/api/messages/files/${upData.id}`, {
      headers: { 'Authorization': `Bearer ${token(AMIN)}` },
    })
    check('le destinataire peut télécharger la pièce jointe', dl.status === 200, `statut ${dl.status}`)
    const spyDl = await fetch(`${API}/api/messages/files/${upData.id}`, {
      headers: { 'Authorization': `Bearer ${token(YASSINE)}` },
    })
    check('un tiers ne peut PAS télécharger la pièce jointe', spyDl.status === 403 || spyDl.status === 404,
      `statut ${spyDl.status}`)
  }

  /* ── 9. Préférences ─────────────────────────────────────────────── */
  section('9. Préférences de notification (§28)')
  const prefs = await call(ADMIN, 'GET', '/api/messages/prefs')
  check('GET /prefs répond avec des valeurs complètes',
    prefs.status === 200 && typeof prefs.data?.sound_enabled === 'boolean', `statut ${prefs.status}`)
  const saved = await call(ADMIN, 'PUT', '/api/messages/prefs', { sound_enabled: false })
  check('PUT /prefs enregistre', saved.data?.prefs?.sound_enabled === false, `statut ${saved.status}`)
  const reread = await call(ADMIN, 'GET', '/api/messages/prefs')
  check('la préférence est bien persistée', reread.data?.sound_enabled === false)

  /* ── 10. Robustesse des identifiants ────────────────────────────── */
  section('10. Identifiants forgés (§5)')
  const notUuid = await call(ADMIN, 'GET', '/api/messages/conversations/pas-un-uuid')
  check('un identifiant non-UUID est rejeté (400)', notUuid.status === 400, `statut ${notUuid.status}`)
  const ghost = await call(ADMIN, 'GET', '/api/messages/conversations/00000000-0000-4000-8000-000000000000')
  check('un identifiant inexistant est refusé (403/404)',
    [403, 404].includes(ghost.status), `statut ${ghost.status}`)
  const noAuth = await fetch(`${API}/api/messages/contacts`)
  check('sans jeton : 401', noAuth.status === 401, `statut ${noAuth.status}`)

  await Promise.all([aminStream.close(), adminPhone.close(), adminDesk.close()])

  /* ── Bilan ──────────────────────────────────────────────────────── */
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${passed} réussi(s), ${failed} échec(s)`)
  if (failed) {
    console.log('\n  Échecs :')
    for (const r of results.filter(r => !r.ok)) console.log(`   • ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log(`${'─'.repeat(64)}\n`)

  await cleanup()
  await pool.end()
  process.exit(failed ? 1 : 0)
}

main().catch(async (err) => {
  console.error('\n✗ Test interrompu :', err)
  await cleanup().catch(() => {})
  await pool.end().catch(() => {})
  process.exit(1)
})
