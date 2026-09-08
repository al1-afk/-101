#!/usr/bin/env node
/**
 * TRANSFERT DE RESPONSABLE — test de bout en bout de POST /api/crm/transfer.
 *
 * Le bouton « Transférer » du tableau CRM ne fait qu'appeler cette
 * route. Ce que le script prouve, et qu'aucun clic ne prouverait :
 *
 *   §1  l'ADMIN transfère une fiche, et la BASE le confirme ;
 *   §2  le nouveau responsable la voit, l'ancien ne la voit plus ;
 *   §3  les partages accordés à des tiers SURVIVENT au transfert —
 *       c'est la différence avec PUT /grants, qui les remplace tous ;
 *   §4  un COMMERCIAL reçoit 403, même sur SA propre fiche, même en
 *       appelant l'API directement (§15 du cahier des charges :
 *       « Changer le commercial responsable — ADMIN ✅ COMMERCIALE ❌ ») ;
 *   §5  il ne peut pas non plus s'attribuer la fiche d'un collègue ;
 *   §6  un transfert de masse porte sur toute la sélection ;
 *   §7  une fiche d'un AUTRE espace n'est pas touchée (isolation) ;
 *   §8  un destinataire hors du personnel actif est refusé (400) ;
 *   §9  le journal d'activité garde une trace nominative par fiche.
 *
 * Comme les autres tests de ce dossier : jetons signés avec le secret du
 * serveur (la double authentification n'est pas franchissable en
 * automatique), vérité relue en SQL hors d'Express, données préfixées
 * ZZTEST-TRANSF et effacées à la fin, y compris sur exception.
 *
 * Usage :
 *   node scripts/test-crm-transfert-e2e.mjs
 *   API_URL=http://localhost:4001 node scripts/test-crm-transfert-e2e.mjs
 */
import jwt from 'jsonwebtoken'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const API = process.env.API_URL || `http://localhost:${process.env.SERVER_PORT || 4000}`

const TENANT = '0f1ba85a-55ae-49ab-8de4-b14dbe8d5019'
const ADMIN  = { id: '2f7561a4-b92c-4175-a7c1-f6c752a95896', email: 'nextgital1@gmail.com',           role: 'admin',      label: 'ADMIN'  }
const KARIM  = { id: '22222222-2222-2222-2222-222222222222', email: 'karim.prospecteur@nextgital.ma', role: 'commercial', label: 'KARIM'  }
const FATIMA = { id: '33333333-3333-3333-3333-333333333333', email: 'fatima.commercial@nextgital.ma', role: 'commercial', label: 'FATIMA' }

const PREFIXE = 'ZZTEST-TRANSF'

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

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✅ ${name}`) }
  else    { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

async function call(user, method, path, body) {
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
  return { status: res.status, data }
}

const transferer = (user, ids, assignedTo) =>
  call(user, 'POST', '/api/crm/transfer', { ids, assigned_to: assignedTo })

/** Les identifiants de prospects qu'une personne voit RÉELLEMENT, relus
 *  en SQL : l'étalon contre lequel on mesure les réponses HTTP. */
async function perimetreReel(userId) {
  const { rows } = await pool.query(
    `SELECT t.id FROM public.prospects t
      WHERE t.tenant_id = $1
        AND (t.assigned_to = $2
             OR t.created_by = $2
             OR EXISTS (SELECT 1 FROM public.crm_record_grants g
                         WHERE g.tenant_id = $1 AND g.user_id = $2
                           AND g.resource_type = 'prospect' AND g.resource_id = t.id
                           AND g.can_view))`,
    [TENANT, userId],
  )
  return new Set(rows.map(r => r.id))
}

const responsableEnBase = async (id) => {
  const { rows } = await pool.query(
    `SELECT assigned_to FROM public.prospects WHERE id = $1`, [id])
  return rows[0]?.assigned_to ?? null
}

/* Crée une fiche DIRECTEMENT en base : passer par l'API déclencherait
   les e-mails de nouveau prospect, que ce test-ci n'a pas à envoyer. */
async function creerProspect(nom, assignedTo, createdBy = ADMIN.id) {
  const { rows } = await pool.query(
    `INSERT INTO public.prospects (tenant_id, nom, statut, assigned_to, created_by)
     VALUES ($1, $2, 'nouveau', $3, $4) RETURNING id`,
    [TENANT, `${PREFIXE}-${nom}`, assignedTo, createdBy],
  )
  return rows[0].id
}

let autreTenant = null
async function cleanup() {
  const { rows } = await pool.query(
    `SELECT id FROM public.prospects WHERE nom LIKE $1`, [`${PREFIXE}%`])
  const ids = rows.map(r => r.id)
  await pool.query(`DELETE FROM public.prospects WHERE nom LIKE $1`, [`${PREFIXE}%`])
  if (ids.length) {
    await pool.query(
      `DELETE FROM public.crm_record_grants WHERE resource_id = ANY($1::uuid[])`, [ids])
    await pool.query(
      `DELETE FROM public.activity_logs WHERE record_id = ANY($1::text[])`, [ids])
  }
}

async function main() {
  console.log(`\n🔄 Transfert de responsable — test de bout en bout sur ${API}\n`)

  try {
    const h = await fetch(`${API}/health`)
    if (!h.ok) throw new Error(`HTTP ${h.status}`)
  } catch (e) {
    console.error(`✗ Serveur injoignable sur ${API} (${e.message}).`)
    console.error('  Le test ne le démarre pas : lancez « npm run server » et relancez.')
    process.exit(1)
  }

  await cleanup()

  try {
    /* ───────────────────────────────────────────────────────────── */
    section('§1-2  L\'ADMIN transfère, la base suit, le périmètre bascule')

    const p1 = await creerProspect('un', KARIM.id)
    check('départ : la fiche est à Karim', await responsableEnBase(p1) === KARIM.id)
    check('départ : Karim la voit',       (await perimetreReel(KARIM.id)).has(p1))
    check('départ : Fatima ne la voit pas', !(await perimetreReel(FATIMA.id)).has(p1))

    const t1 = await transferer(ADMIN, [p1], FATIMA.id)
    check('POST /api/crm/transfer → 200', t1.status === 200, `HTTP ${t1.status} ${JSON.stringify(t1.data)}`)
    check('la réponse annonce 1 fiche transférée', t1.data?.transferees === 1, JSON.stringify(t1.data))
    check('EN BASE : la fiche est passée à Fatima', await responsableEnBase(p1) === FATIMA.id)
    check('Fatima la voit maintenant',  (await perimetreReel(FATIMA.id)).has(p1))
    check('Karim ne la voit plus',     !(await perimetreReel(KARIM.id)).has(p1))

    /* L'API confirme le basculement, pas seulement le SQL. */
    const vueKarim  = await call(KARIM,  'GET', `/api/prospects/${p1}`)
    const vueFatima = await call(FATIMA, 'GET', `/api/prospects/${p1}`)
    check('GET de l\'ancien responsable → 403', vueKarim.status === 403,  `HTTP ${vueKarim.status}`)
    check('GET du nouveau responsable → 200',   vueFatima.status === 200, `HTTP ${vueFatima.status}`)

    /* ───────────────────────────────────────────────────────────── */
    section('§3  Les partages existants survivent au transfert')

    const p2 = await creerProspect('partage', KARIM.id)
    await pool.query(
      `INSERT INTO public.crm_record_grants
         (tenant_id, resource_type, resource_id, user_id, can_view, granted_by)
       VALUES ($1, 'prospect', $2, $3, TRUE, $4)`,
      [TENANT, p2, FATIMA.id, ADMIN.id],
    )
    check('départ : Fatima a un partage en lecture', (await perimetreReel(FATIMA.id)).has(p2))

    const t2 = await transferer(ADMIN, [p2], ADMIN.id)
    check('transfert vers l\'admin → 200', t2.status === 200, `HTTP ${t2.status}`)
    const { rows: gr } = await pool.query(
      `SELECT user_id, can_view FROM public.crm_record_grants
        WHERE tenant_id = $1 AND resource_type = 'prospect' AND resource_id = $2`,
      [TENANT, p2],
    )
    check('le partage de Fatima est TOUJOURS là',
      gr.length === 1 && gr[0].user_id === FATIMA.id && gr[0].can_view === true,
      JSON.stringify(gr))
    check('Fatima voit toujours la fiche après transfert', (await perimetreReel(FATIMA.id)).has(p2))
    check('Karim, lui, l\'a perdue',                      !(await perimetreReel(KARIM.id)).has(p2))

    /* ───────────────────────────────────────────────────────────── */
    section('§4-5  Le COMMERCIAL est refusé par le SERVEUR, pas par l\'écran')

    const p3 = await creerProspect('a-karim', KARIM.id, KARIM.id)

    const r1 = await transferer(KARIM, [p3], FATIMA.id)
    check('Karim cède SA fiche → 403', r1.status === 403, `HTTP ${r1.status} ${JSON.stringify(r1.data)}`)
    check('EN BASE : rien n\'a bougé', await responsableEnBase(p3) === KARIM.id)

    const r2 = await transferer(KARIM, [p3], KARIM.id)
    check('Karim se réattribue sa propre fiche → 403 (même sans changement)', r2.status === 403, `HTTP ${r2.status}`)

    const p4 = await creerProspect('a-fatima', FATIMA.id, FATIMA.id)
    const r3 = await transferer(KARIM, [p4], KARIM.id)
    check('Karim s\'empare de la fiche de Fatima → 403', r3.status === 403, `HTTP ${r3.status}`)
    check('EN BASE : la fiche reste à Fatima', await responsableEnBase(p4) === FATIMA.id)

    const r4 = await transferer(KARIM, [p3], null)
    check('Karim se décharge au pot commun → 403', r4.status === 403, `HTTP ${r4.status}`)
    check('EN BASE : la fiche est toujours la sienne', await responsableEnBase(p3) === KARIM.id)

    /* ───────────────────────────────────────────────────────────── */
    section('§6  Transfert de masse — toute la sélection, en une fois')

    const lot = []
    for (const n of ['lot1', 'lot2', 'lot3']) lot.push(await creerProspect(n, KARIM.id))
    const t3 = await transferer(ADMIN, lot, FATIMA.id)
    check('3 fiches → 200', t3.status === 200, `HTTP ${t3.status}`)
    check('la réponse annonce 3 transferts', t3.data?.transferees === 3, JSON.stringify(t3.data))
    const apres = await Promise.all(lot.map(responsableEnBase))
    check('EN BASE : les 3 sont à Fatima', apres.every(v => v === FATIMA.id), JSON.stringify(apres))

    /* Rejouer le même transfert ne doit rien changer NI mentir. */
    const t4 = await transferer(ADMIN, lot, FATIMA.id)
    check('rejeu du même transfert → 0 changement annoncé', t4.data?.transferees === 0, JSON.stringify(t4.data))

    /* Pot commun : assigned_to = NULL est une valeur, pas une absence. */
    const t5 = await transferer(ADMIN, [lot[0]], null)
    check('remise au pot commun → 200', t5.status === 200, `HTTP ${t5.status}`)
    check('EN BASE : plus de responsable', await responsableEnBase(lot[0]) === null)
    check('Fatima ne voit plus cette fiche', !(await perimetreReel(FATIMA.id)).has(lot[0]))

    /* ───────────────────────────────────────────────────────────── */
    section('§7  Isolation — une fiche d\'un autre espace n\'est pas touchée')

    const { rows: autres } = await pool.query(
      `SELECT id, tenant_id, assigned_to FROM public.prospects
        WHERE tenant_id <> $1 LIMIT 1`, [TENANT])
    if (!autres.length) {
      console.log('  ⏭️  aucun autre espace sur ce miroir — cas non mesurable ici')
    } else {
      autreTenant = autres[0]
      const t6 = await transferer(ADMIN, [autreTenant.id], FATIMA.id)
      const { rows: apresIso } = await pool.query(
        `SELECT assigned_to FROM public.prospects WHERE id = $1`, [autreTenant.id])
      check('la fiche de l\'autre espace n\'a pas changé de responsable',
        apresIso[0].assigned_to === autreTenant.assigned_to,
        `${autreTenant.assigned_to} → ${apresIso[0].assigned_to}`)
      check('la réponse ne prétend pas l\'avoir transférée',
        t6.data?.transferees === 0 && t6.data?.introuvables === 1, JSON.stringify(t6.data))
    }

    /* ───────────────────────────────────────────────────────────── */
    section('§8  Un destinataire hors du personnel actif est refusé')

    const p5 = await creerProspect('destinataire', KARIM.id)
    const t7 = await transferer(ADMIN, [p5], '00000000-0000-4000-8000-000000000000')
    check('destinataire inconnu → 400', t7.status === 400, `HTTP ${t7.status} ${JSON.stringify(t7.data)}`)
    check('EN BASE : la fiche est intacte', await responsableEnBase(p5) === KARIM.id)

    const t8 = await transferer(ADMIN, ['pas-un-uuid'], FATIMA.id)
    check('identifiant de fiche invalide → 400', t8.status === 400, `HTTP ${t8.status}`)

    const t9 = await call(ADMIN, 'POST', '/api/crm/transfer', { ids: [p5] })
    check('responsable absent du corps → 400 (et non « pot commun »)', t9.status === 400, `HTTP ${t9.status}`)
    check('EN BASE : toujours à Karim', await responsableEnBase(p5) === KARIM.id)

    const t10 = await transferer(ADMIN, [], FATIMA.id)
    check('sélection vide → 400', t10.status === 400, `HTTP ${t10.status}`)

    /* ───────────────────────────────────────────────────────────── */
    section('§9  Le journal d\'activité garde une trace nominative')

    /* Le journal s'écrit APRÈS la réponse : on lui laisse le temps. */
    await new Promise(r => setTimeout(r, 700))
    const { rows: logs } = await pool.query(
      `SELECT description, user_id, old_value, new_value FROM public.activity_logs
        WHERE tenant_id = $1 AND record_id = $2 ORDER BY created_at DESC`,
      [TENANT, p1],
    )
    check('une ligne de journal pour le transfert', logs.length >= 1, `${logs.length} ligne(s)`)
    check('elle nomme l\'ancien et le nouveau responsable',
      logs.some(l => /Responsable commercial du prospect/.test(l.description || '')),
      JSON.stringify(logs.map(l => l.description)))
    check('elle est attribuée à l\'admin qui a agi',
      logs.some(l => l.user_id === ADMIN.id))
    /* pg rend le jsonb DÉJÀ analysé : `String(objet)` donnerait
       « [object Object] » et l'assertion échouerait sur une donnée
       pourtant correcte. */
    check('elle porte l\'avant et l\'après',
      logs.some(l => l.new_value?.assigned_to === FATIMA.id
                  && l.old_value?.assigned_to === KARIM.id),
      JSON.stringify(logs.map(l => ({ old: l.old_value, new: l.new_value }))))

  } finally {
    await cleanup()
    await pool.end()
  }

  console.log(`\n${failed === 0 ? '\x1b[32m✅' : '\x1b[31m❌'} ${passed} réussis, ${failed} échoués\x1b[0m\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('\n💥', e)
  try { await cleanup(); await pool.end() } catch {}
  process.exit(1)
})
