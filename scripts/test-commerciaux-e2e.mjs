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
 * Puis les DEUX points du lot « permissions et partage », mesurés sur
 * les comptes de tenant_users cette fois — ceux qui ouvrent le CRM
 * d'administration :
 *   7. allowed_modules appliqué CÔTÉ SERVEUR : la barre latérale cachait
 *      « Factures », l'API la servait quand même ;
 *   8. le filtre « Commercial » de la page CRM : l'écran de l'admin doit
 *      montrer EXACTEMENT le portefeuille de la personne — ni une fiche
 *      de moins, ni une de plus.
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

/* ─────────────────────────────────────────────────────────────────
   SECTIONS 7 ET 8 — le lot « permissions et partage »

   Les six premières sections couvrent le module « Les commerciaux »
   (espace /my-space). Les deux suivantes couvrent les deux trous
   restants du CRM d'administration, mesurés sur ce serveur avant ce
   lot :
     · un compte de rôle `commercial` recevait 200 sur /api/factures,
       /api/paiements et /api/contrats — la barre latérale lui cachait
       ces modules pendant que l'API continuait de les servir ;
     · GET /api/prospects?commercial=<uuid> répondait 500 — tout
       paramètre inconnu devenait « colonne = valeur » dans le SQL.

   Ces deux sections ne réutilisent PAS le commercial des sections 1-6 :
   celui-là vient de team_members et passe par /my-space. Ici c'est un
   compte de tenant_users, celui qui ouvre le CRM d'administration —
   c'est lui, et lui seul, que allowed_modules et le filtre concernent.
───────────────────────────────────────────────────────────────── */

/* Pris par e-mail et non par identifiant : un uuid recopié à la main
   devient faux à la première réinstallation de l'espace de démo. */
const EMAIL_COMMERCIALE = process.env.TEST_COMMERCIAL_EMAIL || 'commercial@nextgital.com'

let COMMERCIALE = null   // { id, email, role: 'commercial' } — tenant_users
let ADMIN2      = null   // second administrateur : sert à prouver qu'un admin n'est jamais cloisonné

/* Ce que ces deux sections ont modifié en base et doivent rendre intact.
   `allowed_modules` est une colonne de PRODUCTION : on relève sa valeur
   avant d'y toucher, et `nettoyer()` la repose quoi qu'il arrive. */
const modulesAvant   = new Map()   // user_id → allowed_modules d'origine
const prospectsCrees = []          // fiches posées par la section 8

const pause = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Sonde une route jusqu'à ce qu'elle rende le statut attendu.
 *
 * Le contrat n'exige pas l'effet instantané, il exige « moins d'une
 * minute » : le rôle effectif est déjà mis en cache 30 s
 * (server/lib/effectiveRole.ts) et allowed_modules a le droit de suivre
 * la même règle. Un `sleep(30s)` en dur punirait une implémentation qui
 * purge son cache ; un appel unique ferait échouer celle qui attend sa
 * TTL. On sonde donc, et on RAPPORTE le délai observé — c'est lui que
 * l'assertion §A.5 mesure.
 */
async function attendreStatut(user, path, attendu, budgetMs = 40_000) {
  const debut = Date.now()
  for (;;) {
    const r  = await call(user, 'GET', path)
    const ms = Date.now() - debut
    if (r.status === attendu || ms > budgetMs) return { status: r.status, ms }
    await pause(1_200)
  }
}

/**
 * Pose `allowed_modules` par la ROUTE d'administration réelle
 * (PATCH /api/tenants/members/:id/access), jamais par un UPDATE direct :
 * c'est ce chemin-là que l'écran des accès emprunte, et c'est lui qui
 * doit purger le cache serveur. Un UPDATE en SQL testerait un chemin que
 * personne n'utilise et masquerait une purge manquante.
 */
async function poserModules(userId, valeur) {
  if (!modulesAvant.has(userId)) {
    const r = await pool.query(
      'SELECT allowed_modules FROM tenant_users WHERE tenant_id = $1 AND user_id = $2',
      [TENANT, userId])
    modulesAvant.set(userId, r.rows[0]?.allowed_modules ?? null)
  }
  return call(ADMIN, 'PATCH', `/api/tenants/members/${userId}/access`, { allowed_modules: valeur })
}

/** Les identifiants d'une liste de prospects, en ensemble comparable. */
const idsDe = (r) => new Set((Array.isArray(r.data) ? r.data : []).map(p => p.id))

/* `limit=1000` partout : l'espace porte plus de 130 fiches et la valeur
   par défaut du serveur est 500. Comparer deux ensembles tronqués
   différemment donnerait un test vert sur une implémentation fausse. */
const listeProspects = (u, suffixe = '') => call(u, 'GET', `/api/prospects?limit=1000${suffixe}`)

/**
 * SECTION 7 — le cloisonnement des modules (§A du contrat).
 *
 * Ce qui est prouvé ici : `tenant_users.allowed_modules`, qui ne servait
 * qu'à masquer des entrées de la barre latérale, ferme désormais aussi
 * l'API. Sans cela, un compte commercial qui ne voit pas « Factures »
 * dans son menu peut toujours lire la table entière avec son jeton.
 */
async function cloisonnementModules() {
  section('7. Cloisonnement des modules — allowed_modules appliqué côté serveur (§A)')

  if (!COMMERCIALE) {
    check('le compte commercial de tenant_users existe', false, `${EMAIL_COMMERCIALE} introuvable`)
    return
  }

  /* Restriction volontairement étroite — ni factures, ni paiements, ni
     contrats. `taches` reste dans la liste pour que la sonde « un module
     autorisé reste ouvert » plus bas ne dépende pas de la façon dont la
     table personal_tasks est rattachée à son module. */
  const pose = await poserModules(COMMERCIALE.id, ['prospects', 'clients', 'taches'])
  check('l’admin restreint les modules du commercial (200)', pose.status === 200, `statut ${pose.status}`)

  const fact = await attendreStatut(COMMERCIALE, '/api/factures', 403)
  check('module retiré : /api/factures refusé (403)', fact.status === 403, `statut ${fact.status}`)
  /* §A.5 : le retrait d'un module doit mordre en moins d'une minute, pas
     à l'expiration du jeton (1 h). C'est la différence entre une
     révocation d'urgence qui fonctionne et une qui ne fonctionne pas. */
  check('le retrait prend effet en moins d’une minute', fact.ms < 60_000, `${(fact.ms / 1000).toFixed(1)} s`)

  const pai = await attendreStatut(COMMERCIALE, '/api/paiements', 403)
  check('module retiré : /api/paiements refusé (403)', pai.status === 403, `statut ${pai.status}`)
  const ctr = await attendreStatut(COMMERCIALE, '/api/contrats', 403)
  check('module retiré : /api/contrats refusé (403)', ctr.status === 403, `statut ${ctr.status}`)

  const pro = await call(COMMERCIALE, 'GET', '/api/prospects')
  check('module autorisé : /api/prospects toujours servi (200)', pro.status === 200, `statut ${pro.status}`)
  const cli = await call(COMMERCIALE, 'GET', '/api/clients')
  check('module autorisé : /api/clients toujours servi (200)', cli.status === 200, `statut ${cli.status}`)
  const per = await call(COMMERCIALE, 'GET', '/api/personal_tasks')
  check('une table d’un module autorisé reste ouverte (§A.1)', per.status === 200, `statut ${per.status}`)

  /* §A.4 — le contrôle ne peut QU'ENLEVER un droit. On autorise ici
     `depenses` et `equipe`, deux modules que TABLE_ACL ferme au rôle
     commercial : si l'un des deux s'ouvrait, allowed_modules serait
     devenu une source d'autorisation, et l'écran des accès pourrait
     accorder par mégarde ce que le rôle refuse. */
  const large = await poserModules(COMMERCIALE.id,
    ['prospects', 'clients', 'taches', 'depenses', 'equipe'])
  check('l’admin élargit la liste des modules (200)', large.status === 200, `statut ${large.status}`)
  const dep = await attendreStatut(COMMERCIALE, '/api/depenses', 403, 5_000)
  check('module autorisé mais rôle interdit : /api/depenses reste 403 (§A.4)',
    dep.status === 403, `statut ${dep.status}`)
  const team = await attendreStatut(COMMERCIALE, '/api/team_members', 403, 5_000)
  check('module autorisé mais rôle interdit : /api/team_members reste 403 (§A.4)',
    team.status === 403, `statut ${team.status}`)

  /* §A.3 — un administrateur n'est JAMAIS restreint par ce contrôle.
     Sans cette exception, un admin qui s'enfermerait hors du module
     « Équipe » n'aurait plus aucun moyen de se rouvrir la porte. On le
     mesure sur un SECOND administrateur : la route d'administration
     refuse — à raison — de se restreindre soi-même. */
  if (ADMIN2) {
    const poseA = await poserModules(ADMIN2.id, ['prospects'])
    check('l’admin peut restreindre un second administrateur (200)',
      poseA.status === 200, `statut ${poseA.status}`)
    const f2 = await call(ADMIN2, 'GET', '/api/factures')
    check('un ADMIN restreint atteint quand même /api/factures (§A.3)',
      f2.status === 200, `statut ${f2.status}`)
    const p2 = await call(ADMIN2, 'GET', '/api/paiements')
    check('un ADMIN restreint atteint quand même /api/paiements (§A.3)',
      p2.status === 200, `statut ${p2.status}`)
    const c2 = await call(ADMIN2, 'GET', '/api/contrats')
    check('un ADMIN restreint atteint quand même /api/contrats (§A.3)',
      c2.status === 200, `statut ${c2.status}`)
  } else {
    check('un second administrateur existe pour la sonde §A.3', false,
      'aucun autre admin actif dans cet espace')
  }

  /* §A.2 — allowed_modules NULL signifie « aucun réglage personnalisé »,
     donc comportement d'avant ce lot : le rôle décide seul. Un NULL
     traité comme une liste vide fermerait l'ERP à tout le monde. */
  const remise = await poserModules(COMMERCIALE.id, null)
  check('l’admin remet allowed_modules à NULL (200)', remise.status === 200, `statut ${remise.status}`)
  const fact2 = await attendreStatut(COMMERCIALE, '/api/factures', 200)
  check('NULL : /api/factures de nouveau servi (§A.2)', fact2.status === 200, `statut ${fact2.status}`)
  check('la remise à NULL prend effet en moins d’une minute',
    fact2.ms < 60_000, `${(fact2.ms / 1000).toFixed(1)} s`)
  const pai2 = await attendreStatut(COMMERCIALE, '/api/paiements', 200)
  check('NULL : /api/paiements de nouveau servi (§A.2)', pai2.status === 200, `statut ${pai2.status}`)
  const ctr2 = await attendreStatut(COMMERCIALE, '/api/contrats', 200)
  check('NULL : /api/contrats de nouveau servi (§A.2)', ctr2.status === 200, `statut ${ctr2.status}`)
}

/**
 * SECTION 8 — le filtre « Commercial » de la page CRM (§B du contrat).
 *
 * L'enjeu n'est pas cosmétique : ce filtre est la seule fenêtre par
 * laquelle un administrateur voit le portefeuille d'une personne. S'il
 * montre une fiche de moins, l'admin croit sa commerciale désœuvrée ;
 * une de plus, il lui prête un accès qu'elle n'a pas. D'où l'assertion
 * centrale ci-dessous : les deux ensembles doivent être IDENTIQUES.
 */
async function filtreParCommercial() {
  section('8. Filtre « Commercial » sur GET /api/prospects (§B)')

  if (!COMMERCIALE) {
    check('le compte commercial de tenant_users existe', false, `${EMAIL_COMMERCIALE} introuvable`)
    return
  }

  const autre = (await pool.query(
    `SELECT tu.user_id
       FROM tenant_users tu
       JOIN users u ON u.id = tu.user_id
      WHERE tu.tenant_id = $1 AND tu.status = 'active' AND u.is_active = true
        AND tu.role = 'commercial' AND tu.user_id <> $2
      ORDER BY tu.user_id LIMIT 1`, [TENANT, COMMERCIALE.id])).rows[0]
  check('un second commercial existe (fixture)', !!autre, 'un seul commercial dans cet espace')
  if (!autre) return

  /* Fixtures posées EN BASE, pas par POST /api/prospects : ce qui est
     mesuré ici est le FILTRE, pas la création — celle-ci est déjà
     couverte — et l'insertion directe évite d'expédier une notification
     réelle aux administrateurs à chaque exécution (le SMTP de .env.local
     est celui de production). Les quatre cas couvrent les trois branches
     du périmètre, plus le cas à exclure. */
  const marque = `ZZ-TEST-FILTRE-${Date.now()}`
  const poser = async (suffixe, assignedTo, createdBy) => {
    const r = await pool.query(
      `INSERT INTO prospects (tenant_id, nom, assigned_to, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [TENANT, `${marque} ${suffixe}`, assignedTo, createdBy])
    prospectsCrees.push(r.rows[0].id)
    return r.rows[0].id
  }
  const pAssignee = await poser('assignée',  COMMERCIALE.id, COMMERCIALE.id)
  const pCreee    = await poser('créée',     null,           COMMERCIALE.id)
  const pPartagee = await poser('partagée',  null,           ADMIN.id)
  const pAutre    = await poser('d’un autre', autre.user_id, autre.user_id)

  /* Le partage passe par la ROUTE réelle : c'est celle que l'admin
     emploie, et c'est sa table (crm_record_grants) que le filtre doit
     relire. Un partage inséré en SQL ne prouverait pas que les deux
     s'accordent — or c'est exactement l'accord des deux qui est en jeu. */
  const partage = await call(ADMIN, 'PUT', `/api/crm/grants/prospect/${pPartagee}`,
    { grants: [{ user_id: COMMERCIALE.id, can_view: true }] })
  check('partage de la fiche par l’admin accepté (200)', partage.status === 200, `statut ${partage.status}`)

  /* Ce que la commerciale voit avec SON jeton : la référence. */
  const sien = await listeProspects(COMMERCIALE)
  check('la commerciale lit sa liste (200)', sien.status === 200, `statut ${sien.status}`)
  const vuParElle = idsDe(sien)
  check('elle voit la fiche qui lui est assignée',   vuParElle.has(pAssignee))
  check('elle voit la fiche qu’elle a créée',        vuParElle.has(pCreee))
  check('elle voit la fiche qu’on lui a partagée',   vuParElle.has(pPartagee))
  check('elle ne voit pas la fiche d’un autre commercial', !vuParElle.has(pAutre))

  /* Ce que l'admin voit du même portefeuille, à travers le filtre. */
  const filtre = await listeProspects(ADMIN, `&commercial=${COMMERCIALE.id}`)
  check('l’admin filtre par commercial (200, et jamais 500)',
    filtre.status === 200, `statut ${filtre.status}`)
  const vuParAdmin = idsDe(filtre)

  const manquantes = [...vuParElle].filter(id => !vuParAdmin.has(id))
  const enTrop     = [...vuParAdmin].filter(id => !vuParElle.has(id))
  check('LE FILTRE ADMIN RÉPÈTE EXACTEMENT CE QUE VOIT LA COMMERCIALE',
    manquantes.length === 0 && enTrop.length === 0,
    `${manquantes.length} manquante(s), ${enTrop.length} en trop, ${vuParAdmin.size} fiches`)
  check('le filtre contient sa fiche assignée et sa fiche créée',
    vuParAdmin.has(pAssignee) && vuParAdmin.has(pCreee))
  check('le filtre contient la fiche qu’on lui a partagée',
    vuParAdmin.has(pPartagee), 'le partage n’est pas repris par le filtre')
  check('le filtre exclut la fiche d’un autre commercial', !vuParAdmin.has(pAutre))

  /* §B — pour un rôle non gestionnaire le paramètre est IGNORÉ, en
     silence : ni erreur (qui révélerait l'existence du filtre), ni
     élargissement du périmètre. */
  const forge = await listeProspects(COMMERCIALE, `&commercial=${autre.user_id}`)
  check('le paramètre forgé par la commerciale ne casse rien (200)',
    forge.status === 200, `statut ${forge.status}`)
  const vuForge = idsDe(forge)
  check('le paramètre forgé est ignoré : son périmètre est inchangé',
    vuForge.size === vuParElle.size && [...vuForge].every(id => vuParElle.has(id)),
    `${vuForge.size} fiches contre ${vuParElle.size}`)
  check('le paramètre forgé ne lui ouvre pas la fiche d’un autre', !vuForge.has(pAutre))

  /* Absence de paramètre et « all » : comportement d'avant ce lot. */
  const tout   = await listeProspects(ADMIN)
  const vuTout = idsDe(tout)
  const total  = (await pool.query(
    'SELECT count(*)::int AS n FROM prospects WHERE tenant_id = $1', [TENANT])).rows[0].n
  check('sans paramètre, l’admin voit tout l’espace', vuTout.size === total,
    `${vuTout.size} sur ${total}`)
  const all = await listeProspects(ADMIN, '&commercial=all')
  check('« all » se comporte comme l’absence de paramètre',
    all.status === 200 && idsDe(all).size === vuTout.size,
    `statut ${all.status}, ${idsDe(all).size} contre ${vuTout.size}`)

  /* Avant ce lot, tout paramètre inconnu de GET /api/:table devenait
     « colonne = valeur » dans le SQL : `?commercial=…` répondait 500.
     Une valeur qui n'est pas un identifiant ne doit jamais atteindre la
     base. */
  const bidon = await listeProspects(ADMIN, '&commercial=pas-un-uuid')
  check('une valeur invalide ne provoque pas d’erreur serveur',
    bidon.status !== 500, `statut ${bidon.status}`)
}

async function nettoyer() {
  if (COMMERCIAL) {
    await pool.query(`DELETE FROM crm_user_capabilities WHERE tenant_id=$1 AND user_id=$2`,
      [TENANT, COMMERCIAL.id]).catch(() => {})
  }
  if (prospetsTouches.length) {
    await pool.query(`UPDATE prospects SET assigned_to = NULL WHERE id = ANY($1::uuid[])`,
      [prospetsTouches]).catch(() => {})
  }

  /* `allowed_modules` est une colonne de PRODUCTION : quoi qu'il arrive —
     assertion en échec, exception, serveur qui tombe — chaque valeur
     relevée est reposée telle quelle. Un test qui laisse un compte
     cloisonné derrière lui coûte plus cher que le bug qu'il cherche. */
  for (const [userId, valeur] of modulesAvant) {
    await pool.query(
      'UPDATE tenant_users SET allowed_modules = $1 WHERE tenant_id = $2 AND user_id = $3',
      [valeur, TENANT, userId]).catch(() => {})
  }
  modulesAvant.clear()

  /* Les partages d'abord : crm_record_grants ne porte pas de clé
     étrangère vers prospects (la fiche peut vivre dans trois tables),
     donc rien ne les emporterait avec la fiche. */
  if (prospectsCrees.length) {
    await pool.query(
      `DELETE FROM crm_record_grants
        WHERE tenant_id = $1 AND resource_type = 'prospect' AND resource_id = ANY($2::uuid[])`,
      [TENANT, prospectsCrees]).catch(() => {})
    await pool.query('DELETE FROM prospects WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
      [TENANT, prospectsCrees]).catch(() => {})
    prospectsCrees.length = 0
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

  /* ── 7 et 8. Le lot « permissions et partage » ─────────────────
     Les acteurs viennent de tenant_users, pas de team_members : ce sont
     les comptes qui ouvrent le CRM d'administration. */
  const cRow = (await pool.query(
    `SELECT tu.user_id, u.email
       FROM tenant_users tu
       JOIN users u ON u.id = tu.user_id
      WHERE tu.tenant_id = $1 AND tu.status = 'active' AND u.is_active = true
        AND tu.role = 'commercial' AND lower(u.email) = lower($2)
      LIMIT 1`, [TENANT, EMAIL_COMMERCIALE])).rows[0]
  if (cRow) COMMERCIALE = { id: cRow.user_id, email: cRow.email, role: 'commercial' }

  const aRow = (await pool.query(
    `SELECT tu.user_id, u.email
       FROM tenant_users tu
       JOIN users u ON u.id = tu.user_id
      WHERE tu.tenant_id = $1 AND tu.status = 'active' AND u.is_active = true
        AND tu.role = 'admin' AND tu.user_id <> $2
      ORDER BY tu.user_id LIMIT 1`, [TENANT, ADMIN.id])).rows[0]
  if (aRow) ADMIN2 = { id: aRow.user_id, email: aRow.email, role: 'admin' }

  await cloisonnementModules()
  await filtreParCommercial()

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
