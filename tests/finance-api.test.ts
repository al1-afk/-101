/* ─────────────────────────────────────────────────────────────────
   MODULE FINANCIER — tests d'intégration (API + PostgreSQL).

   Ce que ces tests prouvent, et qu'aucun test unitaire ne peut prouver :
     · un revenu / une dépense / un transfert bougent RÉELLEMENT le solde
       calculé par la base (vue bank_accounts_with_solde) ;
     · un ajustement manuel corrige le solde sans créer de revenu ni de
       dépense, et son ancien solde est calculé par le SERVEUR ;
     · une prévision n'impacte pas le solde tant qu'elle n'est pas reçue ;
     · « Marquer comme reçu » est atomique et NON REJOUABLE (pas de
       double encaissement, même sur double-clic) ;
     · l'`op_id` neutralise un double envoi ;
     · le cloisonnement tenant et le RBAC tiennent côté serveur.

   Prérequis :
     1. migration 083_finance_module.sql appliquée sur la base ;
     2. API lancée      →  npm run server            (terminal 1)
     3. tests           →  npm run test:finance:api  (terminal 2)
───────────────────────────────────────────────────────────────── */
import test   from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import { computeSummary, computeAccountBalances, type FinanceData } from '../src/lib/finance/compute'

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

const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32)
  ? process.env.JWT_SECRET
  : `dev-JWT_SECRET-fallback-${'x'.repeat(40)}`

const createdUsers:   string[] = []
const createdTenants: string[] = []

interface Session { token: string; tenantId: string; userId: string; email: string }
type Json = Record<string, any>

async function api<T = Json>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T }> {
  const { token, ...rest } = init
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const body = await res.json().catch(() => ({})) as T
  return { status: res.status, body }
}

const uniq = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

async function createSession(role = 'admin'): Promise<Session> {
  const slug  = uniq('fin')
  const email = `${slug}@example.test`
  const hash  = await bcrypt.hash('Strong-Password-123', 10)

  const u = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id`,
    [email, hash, slug],
  )
  const userId = u.rows[0].id
  const t = await db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name, owner_id) VALUES ($1,$2,$3) RETURNING id`,
    [slug, slug, userId],
  )
  const tenantId = t.rows[0].id
  await db.query(
    `INSERT INTO tenant_users (tenant_id, user_id, role, status) VALUES ($1,$2,$3,'active')`,
    [tenantId, userId, role],
  )
  createdUsers.push(userId)
  createdTenants.push(tenantId)

  return {
    token: jwt.sign({ userId, email, tenantId, role, type: 'access' }, JWT_SECRET, { expiresIn: '1h' }),
    tenantId, userId, email,
  }
}

/** Compte créé directement en base : le CRUD `bank_accounts` est déjà couvert ailleurs. */
async function createAccount(s: Session, nom: string, soldeInitial: number): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO bank_accounts (tenant_id, nom, type, solde_initial, devise, actif)
     VALUES ($1,$2,'banque',$3,'MAD',TRUE) RETURNING id`,
    [s.tenantId, nom, soldeInitial],
  )
  return r.rows[0].id
}

/** Le solde tel que la BASE le calcule — la source de vérité. */
async function soldeOf(accountId: string): Promise<number> {
  const r = await db.query<{ solde_live: string }>(
    `SELECT solde_live FROM bank_accounts_with_solde WHERE id = $1`, [accountId],
  )
  return Math.round(Number(r.rows[0].solde_live) * 100) / 100
}

async function summary(s: Session) {
  const { body } = await api<Json>('/api/finance/soldes', { token: s.token })
  return body
}

const TODAY = new Date().toISOString().slice(0, 10)

test.after(async () => {
  try {
    if (createdTenants.length) {
      await db.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [createdTenants])
    }
    if (createdUsers.length) {
      await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUsers])
    }
  } finally {
    await db.end()
  }
})

/* ════════════════════════════════════════════════════════════════
   1. MOUVEMENTS RÉELS
   ══════════════════════════════════════════════════════════════ */
test('un revenu encaissé augmente le solde du compte', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 3181)

  const { status, body } = await api<Json>('/api/finance/revenus', {
    method: 'POST', token: s.token,
    body: JSON.stringify({
      montant: 1000, date_revenu: TODAY, bank_account_id: cih,
      categorie: 'prestation', source: 'Client A', op_id: uniq('op'),
    }),
  })
  assert.equal(status, 201)
  assert.equal(Number(body.montant), 1000)
  assert.equal(await soldeOf(cih), 4181)

  const sum = await summary(s)
  assert.equal(Number(sum.disponible), 4181)
})

test('une dépense payée diminue le solde du compte', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 3181)

  const { status } = await api('/api/depenses', {
    method: 'POST', token: s.token,
    body: JSON.stringify({
      montant: 181, date_depense: TODAY, categorie: 'transport',
      type: 'personnel', description: 'Essence', bank_account_id: cih,
      op_id: uniq('op'),
    }),
  })
  assert.equal(status, 201)
  assert.equal(await soldeOf(cih), 3000)
})

test('un transfert déplace l\'argent sans changer le patrimoine total', async () => {
  const s      = await createSession()
  const cih    = await createAccount(s, 'CIH', 3181)
  const caisse = await createAccount(s, 'Caisse', 2350)

  const { status } = await api('/api/finance/transferts', {
    method: 'POST', token: s.token,
    body: JSON.stringify({
      compte_source_id: cih, compte_destination_id: caisse,
      montant: 2000, date_transfert: TODAY, note: 'Alimentation caisse',
      op_id: uniq('op'),
    }),
  })
  assert.equal(status, 201)
  assert.equal(await soldeOf(cih), 1181)
  assert.equal(await soldeOf(caisse), 4350)

  const sum = await summary(s)
  assert.equal(Number(sum.disponible), 5531, 'total inchangé (3181 + 2350)')
})

test('un transfert vers le même compte est refusé', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 1000)
  const { status } = await api('/api/finance/transferts', {
    method: 'POST', token: s.token,
    body: JSON.stringify({
      compte_source_id: cih, compte_destination_id: cih,
      montant: 100, date_transfert: TODAY, op_id: uniq('op'),
    }),
  })
  assert.equal(status, 400)
  assert.equal(await soldeOf(cih), 1000)
})

test('un montant nul ou négatif est refusé', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 1000)
  for (const montant of [0, -50, 'abc']) {
    const { status } = await api('/api/finance/revenus', {
      method: 'POST', token: s.token,
      body: JSON.stringify({ montant, date_revenu: TODAY, bank_account_id: cih, op_id: uniq('op') }),
    })
    assert.equal(status, 400, `montant ${montant} doit être refusé`)
  }
  assert.equal(await soldeOf(cih), 1000)
})

/* ════════════════════════════════════════════════════════════════
   2. AJUSTEMENT MANUEL
   ══════════════════════════════════════════════════════════════ */
test('un ajustement aligne le solde sans créer de revenu ni de dépense', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 3181)

  const { status, body } = await api<Json>('/api/finance/ajustements', {
    method: 'POST', token: s.token,
    body: JSON.stringify({
      bank_account_id: cih, nouveau_solde: 3000,
      motif: 'depenses_non_enregistrees', note: 'Retrait non saisi',
      date_ajustement: TODAY, op_id: uniq('op'),
    }),
  })
  assert.equal(status, 201)
  /* L'ancien solde vient du SERVEUR, pas du client. */
  assert.equal(Number(body.ancien_solde), 3181)
  assert.equal(Number(body.nouveau_solde), 3000)
  assert.equal(Number(body.difference), -181)
  assert.equal(await soldeOf(cih), 3000)

  const rev = await db.query(`SELECT 1 FROM revenus  WHERE tenant_id = $1`, [s.tenantId])
  const dep = await db.query(`SELECT 1 FROM depenses WHERE tenant_id = $1`, [s.tenantId])
  assert.equal(rev.rowCount, 0, 'aucun revenu artificiel')
  assert.equal(dep.rowCount, 0, 'aucune dépense artificielle')
})

test('l\'historique des ajustements est conservé, jamais écrasé', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 1000)

  for (const solde of [1200, 900]) {
    const { status } = await api('/api/finance/ajustements', {
      method: 'POST', token: s.token,
      body: JSON.stringify({ bank_account_id: cih, nouveau_solde: solde, motif: 'correction', date_ajustement: TODAY, op_id: uniq('op') }),
    })
    assert.equal(status, 201)
  }
  const rows = await db.query<Json>(
    `SELECT ancien_solde, nouveau_solde, difference FROM bank_account_adjustments
      WHERE bank_account_id = $1 ORDER BY created_at ASC`, [cih],
  )
  assert.equal(rows.rowCount, 2, 'les deux ajustements sont conservés')
  assert.equal(Number(rows.rows[0].difference), 200)
  assert.equal(Number(rows.rows[1].ancien_solde), 1200, 'le 2e part du solde réel après le 1er')
  assert.equal(Number(rows.rows[1].difference), -300)
  assert.equal(await soldeOf(cih), 900)
})

test('un ajustement sans écart est refusé', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 1000)
  const { status } = await api('/api/finance/ajustements', {
    method: 'POST', token: s.token,
    body: JSON.stringify({ bank_account_id: cih, nouveau_solde: 1000, motif: 'correction', date_ajustement: TODAY, op_id: uniq('op') }),
  })
  assert.equal(status, 400)
})

test('les ajustements ne sont ni modifiables ni supprimables via le CRUD', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 1000)
  const { body } = await api<Json>('/api/finance/ajustements', {
    method: 'POST', token: s.token,
    body: JSON.stringify({ bank_account_id: cih, nouveau_solde: 1500, motif: 'correction', date_ajustement: TODAY, op_id: uniq('op') }),
  })
  const patch = await api(`/api/bank_account_adjustments/${body.id}`, {
    method: 'PATCH', token: s.token, body: JSON.stringify({ nouveau_solde: 99999 }),
  })
  const del = await api(`/api/bank_account_adjustments/${body.id}`, { method: 'DELETE', token: s.token })
  assert.equal(patch.status, 403)
  assert.equal(del.status, 403)
  assert.equal(await soldeOf(cih), 1500)
})

/* ════════════════════════════════════════════════════════════════
   3. PRÉVISIONS
   ══════════════════════════════════════════════════════════════ */
async function createPrevision(s: Session, data: Json) {
  return api<Json>('/api/previsions_financieres', {
    method: 'POST', token: s.token,
    body: JSON.stringify({ statut: 'prevu', date_prevue: TODAY, ...data }),
  })
}

test('une prévision ne modifie pas le solde réel mais alimente le prévisionnel', async () => {
  const s    = await createSession()
  const entr = await createAccount(s, 'Entreprise', 49893.82)

  for (const montant of [10000, 801, 172]) {
    const { status } = await createPrevision(s, { sens: 'revenu', montant, bank_account_id: entr })
    assert.equal(status, 201)
  }
  const { status } = await createPrevision(s, { sens: 'depense', montant: 4000, bank_account_id: entr })
  assert.equal(status, 201)

  assert.equal(await soldeOf(entr), 49893.82, 'le solde réel est intact')

  const sum = await summary(s)
  assert.equal(Number(sum.disponible), 49893.82)
  assert.equal(Number(sum.revenus_prevus), 10973)
  assert.equal(Number(sum.depenses_prevues), 4000)
  assert.equal(Number(sum.solde_previsionnel), 56866.82)
})

test('« marquer comme reçu » crée le revenu, crédite le compte et solde la prévision', async () => {
  const s    = await createSession()
  const entr = await createAccount(s, 'Entreprise', 1000)
  const { body: prev } = await createPrevision(s, { sens: 'revenu', montant: 10000, bank_account_id: entr, source: 'Client A' })

  const { status, body } = await api<Json>(`/api/finance/previsions/${prev.id}/settle`, {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 10000, date_realisation: TODAY, bank_account_id: entr, op_id: uniq('op') }),
  })
  assert.equal(status, 201)
  assert.equal(body.sens, 'revenu')
  assert.equal(body.prevision.statut, 'recu')
  assert.equal(body.prevision.revenu_id, body.transaction.id, 'le lien prévision ↔ paiement est conservé')
  assert.equal(Number(body.prevision.montant_realise), 10000)
  assert.equal(await soldeOf(entr), 11000)

  const sum = await summary(s)
  assert.equal(Number(sum.revenus_prevus), 0, 'la prévision ne compte plus dans le prévisionnel')
  assert.equal(Number(sum.solde_previsionnel), 11000, 'pas de double comptage')
})

test('un double-clic sur « marquer comme reçu » n\'encaisse qu\'une fois', async () => {
  const s    = await createSession()
  const entr = await createAccount(s, 'Entreprise', 0)
  const { body: prev } = await createPrevision(s, { sens: 'revenu', montant: 5000, bank_account_id: entr })

  /* Deux requêtes VRAIMENT concurrentes — c'est le verrou de ligne, pas
     le bouton désactivé côté UI, qui doit trancher. */
  const [a, b] = await Promise.all([
    api<Json>(`/api/finance/previsions/${prev.id}/settle`, {
      method: 'POST', token: s.token,
      body: JSON.stringify({ montant: 5000, date_realisation: TODAY, bank_account_id: entr, op_id: uniq('op') }),
    }),
    api<Json>(`/api/finance/previsions/${prev.id}/settle`, {
      method: 'POST', token: s.token,
      body: JSON.stringify({ montant: 5000, date_realisation: TODAY, bank_account_id: entr, op_id: uniq('op') }),
    }),
  ])
  const codes = [a.status, b.status].sort()
  assert.deepEqual(codes, [201, 409], 'un seul encaissement accepté')
  assert.equal(await soldeOf(entr), 5000, 'le compte n\'est crédité qu\'une fois')

  const revenus = await db.query(`SELECT 1 FROM revenus WHERE prevision_id = $1`, [prev.id])
  assert.equal(revenus.rowCount, 1)
})

test('une prévision annulée ne peut plus être encaissée', async () => {
  const s    = await createSession()
  const entr = await createAccount(s, 'Entreprise', 0)
  const { body: prev } = await createPrevision(s, { sens: 'revenu', montant: 1000, bank_account_id: entr })

  const cancel = await api(`/api/finance/previsions/${prev.id}/cancel`, { method: 'POST', token: s.token })
  assert.equal(cancel.status, 200)

  const settle = await api(`/api/finance/previsions/${prev.id}/settle`, {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 1000, date_realisation: TODAY, bank_account_id: entr, op_id: uniq('op') }),
  })
  assert.equal(settle.status, 409)
  assert.equal(await soldeOf(entr), 0)

  const sum = await summary(s)
  assert.equal(Number(sum.revenus_prevus), 0, 'une prévision annulée sort du prévisionnel')
})

test('« marquer comme payé » crée la dépense et débite le compte', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 5000)
  const { body: prev } = await createPrevision(s, {
    sens: 'depense', montant: 4000, bank_account_id: cih,
    categorie: 'maison', description: 'Loyer',
  })

  const { status, body } = await api<Json>(`/api/finance/previsions/${prev.id}/settle`, {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 4000, date_realisation: TODAY, bank_account_id: cih, op_id: uniq('op') }),
  })
  assert.equal(status, 201)
  assert.equal(body.sens, 'depense')
  assert.equal(body.prevision.statut, 'paye')
  assert.equal(body.prevision.depense_id, body.transaction.id)
  assert.equal(body.transaction.categorie, 'maison')
  assert.equal(await soldeOf(cih), 1000)
})

test('supprimer la transaction issue d\'une prévision rouvre la prévision', async () => {
  const s    = await createSession()
  const entr = await createAccount(s, 'Entreprise', 0)
  const { body: prev } = await createPrevision(s, { sens: 'revenu', montant: 2500, bank_account_id: entr })
  const { body: settled } = await api<Json>(`/api/finance/previsions/${prev.id}/settle`, {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 2500, date_realisation: TODAY, bank_account_id: entr, op_id: uniq('op') }),
  })
  assert.equal(await soldeOf(entr), 2500)

  const del = await api(`/api/finance/revenus/${settled.transaction.id}`, { method: 'DELETE', token: s.token })
  assert.equal(del.status, 200)
  assert.equal(await soldeOf(entr), 0, 'le solde revient à son état antérieur')

  const row = await db.query<Json>(`SELECT statut, revenu_id, montant_realise FROM previsions_financieres WHERE id = $1`, [prev.id])
  assert.equal(row.rows[0].statut, 'prevu', 'la prévision est rouverte')
  assert.equal(row.rows[0].revenu_id, null)
  assert.equal(row.rows[0].montant_realise, null)
})

/* ════════════════════════════════════════════════════════════════
   4. ANTI-DOUBLON (op_id)
   ══════════════════════════════════════════════════════════════ */
test('un même op_id rejoué n\'écrit qu\'une seule fois (revenu)', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 0)
  const op  = uniq('op')
  const payload = JSON.stringify({ montant: 750, date_revenu: TODAY, bank_account_id: cih, op_id: op })

  const [a, b] = await Promise.all([
    api<Json>('/api/finance/revenus', { method: 'POST', token: s.token, body: payload }),
    api<Json>('/api/finance/revenus', { method: 'POST', token: s.token, body: payload }),
  ])
  assert.ok([a.status, b.status].every(c => c === 200 || c === 201))
  assert.equal(a.body.id, b.body.id, 'la même ligne est renvoyée')
  assert.equal(await soldeOf(cih), 750, 'le compte n\'est crédité qu\'une fois')

  const rows = await db.query(`SELECT 1 FROM revenus WHERE tenant_id = $1`, [s.tenantId])
  assert.equal(rows.rowCount, 1)
})

test('un même op_id rejoué n\'écrit qu\'une seule fois (transfert)', async () => {
  const s      = await createSession()
  const cih    = await createAccount(s, 'CIH', 1000)
  const caisse = await createAccount(s, 'Caisse', 0)
  const payload = JSON.stringify({
    compte_source_id: cih, compte_destination_id: caisse,
    montant: 300, date_transfert: TODAY, op_id: uniq('op'),
  })

  const [a, b] = await Promise.all([
    api<Json>('/api/finance/transferts', { method: 'POST', token: s.token, body: payload }),
    api<Json>('/api/finance/transferts', { method: 'POST', token: s.token, body: payload }),
  ])
  assert.equal(a.body.id, b.body.id)
  assert.equal(await soldeOf(cih), 700)
  assert.equal(await soldeOf(caisse), 300)
})

/* ════════════════════════════════════════════════════════════════
   5. CLOISONNEMENT & PERMISSIONS
   ══════════════════════════════════════════════════════════════ */
test('un autre espace ne voit ni ne touche les données financières', async () => {
  const a = await createSession()
  const b = await createSession()
  const compteA = await createAccount(a, 'CIH', 1000)
  await api('/api/finance/revenus', {
    method: 'POST', token: a.token,
    body: JSON.stringify({ montant: 500, date_revenu: TODAY, bank_account_id: compteA, op_id: uniq('op') }),
  })

  const list = await api<Json[]>('/api/revenus', { token: b.token })
  assert.equal(list.status, 200)
  assert.equal(list.body.length, 0, 'aucune fuite entre espaces')

  /* B tente d'écrire sur le compte de A. */
  const write = await api('/api/finance/revenus', {
    method: 'POST', token: b.token,
    body: JSON.stringify({ montant: 999, date_revenu: TODAY, bank_account_id: compteA, op_id: uniq('op') }),
  })
  assert.equal(write.status, 400, 'compte hors de son espace → refusé')

  const adj = await api('/api/finance/ajustements', {
    method: 'POST', token: b.token,
    body: JSON.stringify({ bank_account_id: compteA, nouveau_solde: 0, motif: 'correction', date_ajustement: TODAY, op_id: uniq('op') }),
  })
  assert.equal(adj.status, 404)
  assert.equal(await soldeOf(compteA), 1500, 'le solde de A est intact')
})

test('un rôle sans droits financiers est refusé', async () => {
  const admin  = await createSession('admin')
  const viewer = await createSession('viewer')
  const compte = await createAccount(viewer, 'CIH', 1000)

  const post = await api('/api/finance/revenus', {
    method: 'POST', token: viewer.token,
    body: JSON.stringify({ montant: 100, date_revenu: TODAY, bank_account_id: compte, op_id: uniq('op') }),
  })
  assert.equal(post.status, 403)

  const transfert = await api('/api/finance/transferts', {
    method: 'POST', token: viewer.token,
    body: JSON.stringify({ compte_source_id: compte, compte_destination_id: compte, montant: 1, date_transfert: TODAY }),
  })
  assert.equal(transfert.status, 403)
  assert.equal(await soldeOf(compte), 1000)

  /* L'admin, lui, passe. */
  const ok = await api('/api/finance/revenus', {
    method: 'POST', token: admin.token,
    body: JSON.stringify({
      montant: 100, date_revenu: TODAY,
      bank_account_id: await createAccount(admin, 'CIH', 0), op_id: uniq('op'),
    }),
  })
  assert.equal(ok.status, 201)
})

/* ════════════════════════════════════════════════════════════════
   6. LE CALCUL CLIENT ET LE CALCUL SQL DOIVENT CONCORDER
   La page affiche des chiffres calculés dans le navigateur à partir des
   listes ; la base les recalcule de son côté (vue bank_accounts_with_solde).
   Si les deux formules divergeaient un jour, l'utilisateur verrait un
   solde faux sans aucune erreur : ce test l'interdit.
   ══════════════════════════════════════════════════════════════ */
test('le solde affiché par le front est identique à celui calculé par la base', async () => {
  const s      = await createSession()
  const cih    = await createAccount(s, 'CIH', 3181)
  const entr   = await createAccount(s, 'Entreprise', 49893.82)
  const caisse = await createAccount(s, 'Caisse', 2350)

  /* Un mouvement de chaque nature — y compris ceux qui ne sont ni revenu
     ni dépense (transfert, ajustement). */
  await api('/api/finance/revenus', {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 1234.56, date_revenu: TODAY, bank_account_id: entr, op_id: uniq('op') }),
  })
  await api('/api/depenses', {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 321.5, date_depense: TODAY, categorie: 'nourriture', type: 'personnel', bank_account_id: cih, op_id: uniq('op') }),
  })
  await api('/api/finance/transferts', {
    method: 'POST', token: s.token,
    body: JSON.stringify({ compte_source_id: cih, compte_destination_id: caisse, montant: 2000, date_transfert: TODAY, op_id: uniq('op') }),
  })
  await api('/api/finance/ajustements', {
    method: 'POST', token: s.token,
    body: JSON.stringify({ bank_account_id: caisse, nouveau_solde: 5000, motif: 'correction', date_ajustement: TODAY, op_id: uniq('op') }),
  })
  await createPrevision(s, { sens: 'revenu',  montant: 10000, bank_account_id: entr })
  await createPrevision(s, { sens: 'revenu',  montant: 801,   bank_account_id: entr })
  await createPrevision(s, { sens: 'revenu',  montant: 172,   bank_account_id: cih })
  await createPrevision(s, { sens: 'depense', montant: 4000,  bank_account_id: entr })

  /* Les mêmes listes que celles chargées par la page. */
  const [accounts, revenus, depenses, paiements, transferts, ajustements, previsions] = await Promise.all([
    api<Json[]>('/api/bank_accounts',            { token: s.token }),
    api<Json[]>('/api/revenus',                  { token: s.token }),
    api<Json[]>('/api/depenses',                 { token: s.token }),
    api<Json[]>('/api/paiements',                { token: s.token }),
    api<Json[]>('/api/transferts_comptes',       { token: s.token }),
    api<Json[]>('/api/bank_account_adjustments', { token: s.token }),
    api<Json[]>('/api/previsions_financieres',   { token: s.token }),
  ])
  const data = {
    accounts: accounts.body, revenus: revenus.body, depenses: depenses.body,
    paiements: paiements.body, transferts: transferts.body,
    ajustements: ajustements.body, previsions: previsions.body,
  } as unknown as FinanceData

  const front  = computeSummary(data, TODAY.slice(0, 7))
  const serveur = await summary(s)

  assert.equal(front.disponible,        Number(serveur.disponible))
  assert.equal(front.revenusPrevus,     Number(serveur.revenus_prevus))
  assert.equal(front.depensesPrevues,   Number(serveur.depenses_prevues))
  assert.equal(front.soldePrevisionnel, Number(serveur.solde_previsionnel))

  /* …et compte par compte. */
  const balances = computeAccountBalances(data)
  for (const compte of serveur.comptes as Json[]) {
    assert.equal(
      balances.get(compte.id as string)!.solde,
      Math.round(Number(compte.solde_live) * 100) / 100,
      `solde divergent pour ${compte.nom}`,
    )
  }

  /* Contrôle de bout en bout des chiffres attendus. */
  assert.equal(front.disponible, Math.round((3181 - 321.5 - 2000 + 49893.82 + 1234.56 + 5000) * 100) / 100)
  assert.equal(front.revenusPrevus, 10973)
  assert.equal(front.depensesPrevues, 4000)
})

/* ════════════════════════════════════════════════════════════════
   7. INTÉGRITÉ : ce qui ne doit JAMAIS pouvoir arriver
   ══════════════════════════════════════════════════════════════ */
test('supprimer un compte porteur de transferts est refusé (le solde de l\'autre compte serait faussé)', async () => {
  const s      = await createSession()
  const cih    = await createAccount(s, 'CIH', 5000)
  const caisse = await createAccount(s, 'Caisse', 0)
  await api('/api/finance/transferts', {
    method: 'POST', token: s.token,
    body: JSON.stringify({
      compte_source_id: cih, compte_destination_id: caisse,
      montant: 2000, date_transfert: TODAY, op_id: uniq('op'),
    }),
  })
  assert.equal(await soldeOf(caisse), 2000)

  const del = await api<Json>(`/api/bank_accounts/${cih}`, { method: 'DELETE', token: s.token })
  assert.equal(del.status, 409)
  assert.match(String(del.body.error), /transferts/i)

  /* Rien n'a bougé : ni le compte, ni le transfert, ni le solde de l'autre compte. */
  const compte = await db.query(`SELECT 1 FROM bank_accounts WHERE id = $1`, [cih])
  assert.equal(compte.rowCount, 1)
  assert.equal(await soldeOf(caisse), 2000, 'le solde du compte de destination est intact')
})

test('une prévision encaissée ne peut pas être rouverte par un PATCH (pas de double encaissement)', async () => {
  const s    = await createSession()
  const entr = await createAccount(s, 'Entreprise', 0)
  const { body: prev } = await createPrevision(s, { sens: 'revenu', montant: 3000, bank_account_id: entr })
  await api(`/api/finance/previsions/${prev.id}/settle`, {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 3000, date_realisation: TODAY, bank_account_id: entr, op_id: uniq('op') }),
  })
  assert.equal(await soldeOf(entr), 3000)

  /* Tentative de réouverture directe par le CRUD générique. */
  const patch = await api<Json>(`/api/previsions_financieres/${prev.id}`, {
    method: 'PATCH', token: s.token, body: JSON.stringify({ statut: 'prevu' }),
  })
  assert.equal(patch.status, 400, 'la base refuse la réouverture tant que le revenu existe')

  const row = await db.query<Json>(`SELECT statut FROM previsions_financieres WHERE id = $1`, [prev.id])
  assert.equal(row.rows[0].statut, 'recu')

  /* …et un second encaissement reste impossible. */
  const again = await api(`/api/finance/previsions/${prev.id}/settle`, {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 3000, date_realisation: TODAY, bank_account_id: entr, op_id: uniq('op') }),
  })
  assert.equal(again.status, 409)
  assert.equal(await soldeOf(entr), 3000, 'le compte n\'a été crédité qu\'une fois')

  const revenus = await db.query(`SELECT 1 FROM revenus WHERE prevision_id = $1`, [prev.id])
  assert.equal(revenus.rowCount, 1)
})

test('les colonnes de réalisation d\'une prévision ne sont pas modifiables par le client', async () => {
  const s    = await createSession()
  const entr = await createAccount(s, 'Entreprise', 0)
  const { body: prev } = await createPrevision(s, { sens: 'revenu', montant: 1000, bank_account_id: entr })

  const patch = await api<Json>(`/api/previsions_financieres/${prev.id}`, {
    method: 'PATCH', token: s.token,
    body: JSON.stringify({
      montant: 1200,                                    // champ légitime
      montant_realise: 99999, date_realisation: TODAY,  // champs verrouillés
      revenu_id: '00000000-0000-0000-0000-000000000001',
    }),
  })
  assert.equal(patch.status, 200)
  assert.equal(Number(patch.body.montant), 1200, 'le champ légitime est bien écrit')
  assert.equal(patch.body.montant_realise, null, 'le champ verrouillé est ignoré')
  assert.equal(patch.body.revenu_id, null)
  assert.equal(await soldeOf(entr), 0)
})

test('un manager ne peut pas créer ni supprimer de dépense via /api/finance', async () => {
  const s    = await createSession('manager')
  const cih  = await createAccount(s, 'CIH', 5000)

  /* Une dépense prévue : le manager peut la créer (c'est une prévision), pas la solder. */
  const { body: prev } = await createPrevision(s, { sens: 'depense', montant: 500, bank_account_id: cih })
  const settle = await api(`/api/finance/previsions/${prev.id}/settle`, {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 500, date_realisation: TODAY, bank_account_id: cih, op_id: uniq('op') }),
  })
  assert.equal(settle.status, 403, 'créer une dépense reste réservé à admin/comptable')
  assert.equal(await soldeOf(cih), 5000)

  /* Une dépense créée par ailleurs ne peut pas être supprimée par un manager. */
  const dep = await db.query<{ id: string }>(
    `INSERT INTO depenses (tenant_id, montant, date_depense, categorie, type, bank_account_id)
     VALUES ($1, 100, CURRENT_DATE, 'autre', 'business', $2) RETURNING id`,
    [s.tenantId, cih],
  )
  const del = await api(`/api/finance/depenses/${dep.rows[0].id}`, { method: 'DELETE', token: s.token })
  assert.equal(del.status, 403)
  assert.equal(await soldeOf(cih), 4900, 'la dépense est toujours là')

  /* En revanche, encaisser un revenu prévu lui reste ouvert. */
  const { body: prevRev } = await createPrevision(s, { sens: 'revenu', montant: 700, bank_account_id: cih })
  const ok = await api(`/api/finance/previsions/${prevRev.id}/settle`, {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 700, date_realisation: TODAY, bank_account_id: cih, op_id: uniq('op') }),
  })
  assert.equal(ok.status, 201)
  assert.equal(await soldeOf(cih), 5600)
})

test('les colonnes DATE arrivent au client en YYYY-MM-DD, sans décalage de fuseau', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 0)
  /* Le 1er du mois est le cas qui casse : converti en UTC depuis un serveur
     à UTC+1, il devient le dernier jour du mois précédent. */
  await db.query(
    `INSERT INTO revenus (tenant_id, montant, date_revenu, bank_account_id)
     VALUES ($1, 100, DATE '2026-08-01', $2)`,
    [s.tenantId, cih],
  )
  const { body } = await api<Json[]>('/api/revenus', { token: s.token })
  assert.equal(body[0].date_revenu, '2026-08-01')

  const { body: comptes } = await api<Json[]>('/api/bank_accounts', { token: s.token })
  assert.ok(comptes.length > 0)

  /* Le calcul du mois, fait côté client sur cette chaîne, tombe juste. */
  const data = { accounts: comptes, revenus: body } as unknown as FinanceData
  assert.equal(computeSummary(data, '2026-08').revenusMois, 100)
})

test('la création directe de revenus/transferts via le CRUD est fermée', async () => {
  const s   = await createSession()
  const cih = await createAccount(s, 'CIH', 1000)
  const revenu = await api('/api/revenus', {
    method: 'POST', token: s.token,
    body: JSON.stringify({ montant: 500, date_revenu: TODAY, bank_account_id: cih }),
  })
  assert.equal(revenu.status, 403, 'passage obligé par /api/finance (atomicité + anti-doublon)')
  assert.equal(await soldeOf(cih), 1000)
})
