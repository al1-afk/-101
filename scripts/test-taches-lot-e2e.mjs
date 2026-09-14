#!/usr/bin/env node
/**
 * CRÉATION DE TÂCHES EN LOT — test de bout en bout.
 *
 * Ce que ce script prouve, et qu'aucun clic ne prouverait :
 *   §1  un collage de 10 lignes donne 10 titres propres — puces,
 *       tirets, numéros et cases à cocher retirés, lignes vides
 *       ignorées (aucune tâche fantôme) ;
 *   §2  les 10 tâches existent VRAIMENT en base, avec les 10 titres,
 *       dans le bon projet et le bon tenant ;
 *   §3  les réglages communs du formulaire (catégorie, personne,
 *       priorité, échéance) sont posés sur TOUTES les lignes ;
 *   §4  images et description ne sont posées que sur la première —
 *       les recopier dix fois alourdirait chaque ligne pour rien ;
 *   §5  l'ordre du collage est conservé : la 1ʳᵉ ligne est la plus
 *       ancienne, donc la 1ʳᵉ affichée dans la catégorie ;
 *   §6  une ligne seule reste une tâche seule (pas de régression sur
 *       le chemin normal) ;
 *   §7  tout est effacé à la fin, y compris sur exception.
 *
 * Le découpage testé est CELUI de l'app : on importe src/lib/bulkTasks.ts,
 * pas une copie. D'où le lancement avec tsx.
 *
 * Usage : API_URL=http://localhost:4001 npx tsx scripts/test-taches-lot-e2e.mjs
 */
import jwt from 'jsonwebtoken'
import pg from 'pg'
import dotenv from 'dotenv'
import { splitTaskLines } from '../src/lib/bulkTasks'

dotenv.config({ path: '.env.local' })

const API = process.env.API_URL || `http://localhost:${process.env.SERVER_PORT || 4000}`
const TENANT = '0f1ba85a-55ae-49ab-8de4-b14dbe8d5019'
const ADMIN  = { id: '2f7561a4-b92c-4175-a7c1-f6c752a95896', email: 'nextgital1@gmail.com', role: 'admin' }
const PREFIXE = 'ZZTEST-LOT'

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

let passed = 0, failed = 0
const check = (nom, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ✅ ${nom}`) }
  else    { failed++; console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

async function call(user, method, chemin, body) {
  const res = await fetch(`${API}${chemin}`, {
    method,
    headers: { Authorization: `Bearer ${token(user)}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const brut = await res.text()
  let data; try { data = JSON.parse(brut) } catch { data = brut }
  return { status: res.status, data }
}

/* Le collage type d'un client : listes mélangées, lignes vides, espaces. */
const COLLAGE = `Appeler le client pour le brief
- Rédiger le cahier des charges

1. Maquette de la page d'accueil
2) Maquette de la page contact
• Intégration HTML/CSS
[ ] Intégration des formulaires
   [x] Connexion du nom de domaine
▪ Mise en ligne
– Formation du client
Envoyer la facture finale
`

/* Réglages communs saisis une seule fois dans le formulaire. */
const CATEGORIE = `${PREFIXE}-Design`
const ECHEANCE  = '2026-12-31'
const PRIORITE  = 'high'
const IMAGE     = 'data:image/png;base64,iVBORw0KGgo='
const DESCRIPTION = JSON.stringify({ blocks: [{ id: 'b1', type: 'paragraph', text: 'Brief complet' }] })

let projetId = null

async function cleanup() {
  await pool.query(
    `DELETE FROM team_member_tasks
      WHERE tenant_id = $1 AND (category = $2 OR project_id IN (
            SELECT id FROM projets WHERE tenant_id = $1 AND nom LIKE $3))`,
    [TENANT, CATEGORIE, `${PREFIXE}%`])
  await pool.query(`DELETE FROM projets WHERE tenant_id = $1 AND nom LIKE $2`, [TENANT, `${PREFIXE}%`])
}

async function main() {
  console.log(`\n📋 Création de tâches en lot — test de bout en bout sur ${API}\n`)
  try {
    const h = await fetch(`${API}/health`)
    if (!h.ok) throw new Error(`HTTP ${h.status}`)
  } catch (e) {
    console.error(`✗ Serveur injoignable sur ${API} (${e.message}). Lancez « npm run server ».`)
    process.exit(1)
  }

  await cleanup()

  try {
    /* ───────────────────────────────────────────────────────────── */
    section('§1  Le découpage — une ligne = une tâche')

    const titres = splitTaskLines(COLLAGE)
    check('un collage de 10 lignes donne 10 titres', titres.length === 10, `${titres.length} titres`)
    check('les lignes vides ne créent pas de tâche fantôme',
      titres.every(t => t.trim().length > 0))
    check('les puces et tirets sont retirés',
      !titres.some(t => /^[-*•▪–—>]/.test(t)), titres.find(t => /^[-*•▪–—>]/.test(t)))
    check('les numéros « 1. » et « 2) » sont retirés',
      !titres.some(t => /^\(?\d+[.)]/.test(t)), titres.find(t => /^\(?\d+[.)]/.test(t)))
    check('les cases à cocher sont retirées',
      !titres.some(t => /^\[[ xX]?\]/.test(t)), titres.find(t => /^\[[ xX]?\]/.test(t)))
    check('la 1ʳᵉ et la 10ᵉ ligne sont bien celles collées',
      titres[0] === 'Appeler le client pour le brief' && titres[9] === 'Envoyer la facture finale',
      `${titres[0]} … ${titres[9]}`)

    /* ───────────────────────────────────────────────────────────── */
    section('§2  Les 10 tâches arrivent vraiment en base')

    const { rows: p } = await pool.query(
      `INSERT INTO projets (tenant_id, nom, statut) VALUES ($1, $2, 'en_cours') RETURNING id`,
      [TENANT, `${PREFIXE}-projet`])
    projetId = p[0].id

    /* Exactement la charge que l'écran envoie, ligne par ligne. */
    const partage = {
      project_id: projetId,
      team_member_id: null, assigned_user_id: null, assigned_stagiaire_id: null,
      priority: PRIORITE, due_date: ECHEANCE, category: CATEGORIE, recurrence: null,
    }
    const envois = []
    for (let i = 0; i < titres.length; i++) {
      envois.push(await call(ADMIN, 'POST', '/api/team_member_tasks', {
        ...partage,
        status: 'todo',
        title: titres[i],
        attachments: i === 0 ? [IMAGE] : [],
        description: i === 0 ? DESCRIPTION : null,
      }))
    }
    const refusees = envois.filter(r => r.status >= 300)
    check('les 10 créations sont acceptées par l\'API',
      refusees.length === 0, refusees.map(r => `HTTP ${r.status} ${JSON.stringify(r.data)}`)[0])

    const { rows: base } = await pool.query(
      /* to_char : une colonne date revient en objet Date côté pg, et la
         comparer en texte se ferait décaler d'un jour par le fuseau. */
      `SELECT id, title, category, priority, to_char(due_date, 'YYYY-MM-DD') AS due_date,
              status, tenant_id, project_id, team_member_id,
              description, attachments, created_at
         FROM team_member_tasks WHERE project_id = $1 ORDER BY created_at ASC`, [projetId])
    check('10 lignes en base, pas 1 ni 11', base.length === 10, `${base.length} lignes`)
    check('les 10 titres sont ceux du collage',
      JSON.stringify(base.map(r => r.title)) === JSON.stringify(titres),
      base.map(r => r.title).join(' | '))
    check('tout est rangé dans le bon tenant',
      base.every(r => r.tenant_id === TENANT))

    /* ───────────────────────────────────────────────────────────── */
    section('§3  Les réglages du formulaire valent pour toutes les lignes')

    check('même catégorie sur les 10',   base.every(r => r.category === CATEGORIE))
    check('même priorité sur les 10',    base.every(r => r.priority === PRIORITE))
    check('même échéance sur les 10',
      base.every(r => r.due_date === ECHEANCE), String(base[0]?.due_date))
    check('toutes « à faire », aucune déjà terminée', base.every(r => r.status === 'todo'))
    check('aucune n\'est assignée par erreur',
      base.every(r => r.team_member_id === null || r.team_member_id === undefined))

    /* ───────────────────────────────────────────────────────────── */
    section('§4  Images et description : sur la première seulement')

    const premiere = base[0]
    const suivantes = base.slice(1)
    check('la première porte l\'image collée',
      Array.isArray(premiere.attachments) && premiere.attachments.length === 1,
      JSON.stringify(premiere.attachments))
    check('la première porte la description', (premiere.description ?? '').includes('Brief complet'))
    check('les 9 autres n\'ont ni image…',
      suivantes.every(r => !r.attachments || r.attachments.length === 0))
    check('…ni description recopiée',
      suivantes.every(r => r.description === null || r.description === ''))

    /* ───────────────────────────────────────────────────────────── */
    section('§5  L\'ordre du collage est conservé')

    const dates = base.map(r => new Date(r.created_at).getTime())
    check('la 1ʳᵉ ligne est la plus ancienne (donc affichée en tête)',
      dates[0] === Math.min(...dates))
    check('created_at croissant du 1er au 10e',
      dates.every((d, i) => i === 0 || d >= dates[i - 1]))

    /* ───────────────────────────────────────────────────────────── */
    section('§6  Une ligne seule reste une tâche seule')

    const seule = splitTaskLines('  Relancer le client vendredi  ')
    check('pas de découpage sur une saisie normale', seule.length === 1, `${seule.length}`)
    const r1 = await call(ADMIN, 'POST', '/api/team_member_tasks', {
      ...partage, status: 'todo', title: seule[0], attachments: [], description: null,
    })
    check('la tâche unique est créée', r1.status < 300, `HTTP ${r1.status}`)
    const { rows: apres } = await pool.query(
      `SELECT count(*)::int AS n FROM team_member_tasks WHERE project_id = $1`, [projetId])
    check('le projet compte 11 tâches (10 + 1), pas une de plus', apres[0].n === 11, `${apres[0].n}`)

  } finally {
    await cleanup()
    const { rows: reste } = await pool.query(
      `SELECT count(*)::int AS n FROM team_member_tasks WHERE tenant_id = $1 AND category = $2`,
      [TENANT, CATEGORIE])
    section('§7  Nettoyage')
    check('plus aucune tâche de test en base', reste[0].n === 0, `${reste[0].n} restantes`)
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
