#!/usr/bin/env node
/**
 * Test de bout en bout de l'ACCÈS CRM PAR UTILISATEUR (§20 du cahier des
 * charges) — prospects, clients, devis.
 *
 * Ce que ce script prouve, et qu'aucun test unitaire ne prouverait :
 *   §20.1  l'ADMIN voit tout, et exactement autant qu'avant ce lot ;
 *   §20.2  le COMMERCIAL ne voit que ses données, celles qu'on lui a
 *          assignées et celles qu'on lui a explicitement partagées ;
 *   §20.3  ouvrir la fiche d'un autre répond 403 — pas 404, pas 200 ;
 *   §20.4  une assignation lui ouvre la fiche, immédiatement ;
 *   §20.5  le retrait la lui referme, immédiatement ;
 *   §20.6  un devis créé par l'admin lui reste invisible ;
 *   §20.7  le partage de ce devis le lui rend visible ;
 *   §20.8  forcer un devis interdit par l'URL/API répond 403 ;
 *   §20.9  convertir SON prospect en client lui laisse le client ;
 *   §20.10 ses statistiques ne portent aucune donnée hors périmètre.
 *
 * Et quatre pièges que le cahier des charges ne nomme pas, mais qui
 * annuleraient tout le dispositif s'ils étaient ouverts :
 *   • un commercial qui s'AUTO-ASSIGNE une fiche (POST, puis PATCH sur
 *     une fiche qu'on lui a partagée en modification) ;
 *   • `created_by` falsifié depuis le corps de la requête — le POST
 *     générique n'applique pas READONLY_COLUMNS, c'est donc le seul
 *     forçage écrit à la main dans crud.ts ;
 *   • un GET unitaire hors périmètre qui répondrait 404 : le contrat
 *     exige 403, et le 404 doit rester réservé à ce qui n'existe pas ;
 *   • l'ADMIN qui perdrait au passage une partie de son périmètre.
 *
 * ── Pourquoi des jetons signés au lieu d'un vrai login ──────────────
 * L'ouverture de session passe par la double authentification : un test
 * automatisé ne peut pas la franchir sans intervention humaine. On signe
 * donc des jetons d'accès avec le MÊME secret que le serveur, exactement
 * comme le fait /api/auth/login. Le serveur, lui, applique tous ses
 * contrôles habituels — et notamment il RELIT le rôle en base
 * (getEffectiveRole) : le rôle inscrit dans le jeton ne décide de rien.
 *
 * ── Le test ne vérifie JAMAIS une règle d'accès contre elle-même ────
 * Chaque affirmation « il voit exactement ce qu'il doit voir » est
 * confrontée à la BASE, par une requête SQL indépendante d'Express. Un
 * test qui se contenterait de comparer deux réponses HTTP validerait
 * aussi bien un serveur qui ne filtre rien.
 *
 * ── E-mails ────────────────────────────────────────────────────────
 * Le .env.local de ce poste porte de VRAIS identifiants SMTP, et créer
 * un prospect déclenche notifyNewProspect vers tous les admins. Le
 * script coupe donc la catégorie `prospect_nouveau` de l'espace avant de
 * commencer, et remet la liste EXACTEMENT en l'état à la fin.
 *
 * ── Données ────────────────────────────────────────────────────────
 * Rien n'est écrit sur les 133 prospects existants : ils servent de
 * témoin de non-régression (l'admin doit continuer à tous les voir), pas
 * de cobayes. Le test crée ses propres fiches, toutes préfixées
 * ZZTEST-CRM, et les supprime à la fin — y compris en cas d'échec.
 *
 * Usage :
 *   node scripts/test-crm-acces-e2e.mjs           (le serveur doit tourner)
 *   API_URL=http://localhost:4001 node scripts/test-crm-acces-e2e.mjs
 */
import jwt from 'jsonwebtoken'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const API = process.env.API_URL || `http://localhost:${process.env.SERVER_PORT || 4000}`

/* Espace « nextgital » du miroir local, et trois comptes réels de cet
   espace : un administrateur et DEUX commerciaux. Deux et non un : le
   cloisonnement ne se démontre qu'entre pairs de même rang — prouver
   qu'un commercial ne voit pas les fiches de l'admin ne dirait rien du
   cas qui intéresse le client, un commercial face à son collègue. */
const TENANT = '0f1ba85a-55ae-49ab-8de4-b14dbe8d5019'
const ADMIN  = { id: '2f7561a4-b92c-4175-a7c1-f6c752a95896', email: 'nextgital1@gmail.com',           role: 'admin',      label: 'ADMIN'  }
const KARIM  = { id: '22222222-2222-2222-2222-222222222222', email: 'karim.prospecteur@nextgital.ma', role: 'commercial', label: 'KARIM'  }
const FATIMA = { id: '33333333-3333-3333-3333-333333333333', email: 'fatima.commercial@nextgital.ma', role: 'commercial', label: 'FATIMA' }

/* Préfixe reconnaissable : c'est LUI qui sert au nettoyage, et non la
   liste des identifiants créés. Un test interrompu au milieu laisse
   sinon des fiches que plus personne ne sait relier à un test. */
const PREFIXE = 'ZZTEST-CRM'

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

/** Liste complète d'une table pour un utilisateur (limite haute du CRUD). */
const liste = (user, table) => call(user, 'GET', `/api/${table}?limit=1000`)

const idsDe = (rep) => (Array.isArray(rep.data) ? rep.data.map(r => r.id) : [])

/* ─────────────────────────────────────────────────────────────────
   NETTOYAGE

   Appelé AU DÉBUT et à la FIN, y compris sur exception. Au début parce
   qu'un test précédent interrompu laisserait des fiches homonymes — et
   `devis.numero` porte une contrainte d'unicité GLOBALE, pas par espace :
   une seule fiche oubliée ferait échouer toutes les exécutions suivantes
   en 409, avec un message qui ne dit pas pourquoi.
───────────────────────────────────────────────────────────────── */
async function cleanup() {
  const cibles = []
  for (const [table, col] of [['prospects', 'nom'], ['clients', 'nom'], ['devis', 'numero']]) {
    const { rows } = await pool.query(
      `SELECT id FROM public.${table} WHERE tenant_id = $1 AND ${col} LIKE $2`,
      [TENANT, `${PREFIXE}%`],
    )
    cibles.push(...rows.map(r => r.id))
    await pool.query(
      `DELETE FROM public.${table} WHERE tenant_id = $1 AND ${col} LIKE $2`,
      [TENANT, `${PREFIXE}%`],
    )
  }
  if (cibles.length) {
    /* crm_record_grants n'a pas de clé étrangère sur resource_id (elle
       vise trois tables) : la cascade ne joue pas, on efface à la main. */
    await pool.query(
      `DELETE FROM public.crm_record_grants WHERE tenant_id = $1 AND resource_id = ANY($2::uuid[])`,
      [TENANT, cibles],
    )
    await pool.query(
      `DELETE FROM public.activity_logs WHERE tenant_id = $1 AND record_id = ANY($2::text[])`,
      [TENANT, cibles],
    )
  }
  /* Les capacités transverses des deux commerciaux sont restaurées à
     l'identique par restaurerCapacites() ; rien à supprimer ici. */
}

/* ── Capacités transverses : sauvegarde / restauration ─────────────
   Le test accorde puis retire `prospects.view_all` à Karim. Si ces
   lignes existaient déjà (réglage d'un administrateur), les effacer
   serait une régression silencieuse pour l'espace. On les remet donc
   telles quelles, y compris l'absence de ligne. */
let capacitesAvant = []
async function sauvegarderCapacites() {
  const { rows } = await pool.query(
    `SELECT user_id, capabilities FROM public.crm_user_capabilities
      WHERE tenant_id = $1 AND user_id = ANY($2::uuid[])`,
    [TENANT, [KARIM.id, FATIMA.id]],
  )
  capacitesAvant = rows
}
async function restaurerCapacites() {
  await pool.query(
    `DELETE FROM public.crm_user_capabilities WHERE tenant_id = $1 AND user_id = ANY($2::uuid[])`,
    [TENANT, [KARIM.id, FATIMA.id]],
  )
  for (const r of capacitesAvant) {
    await pool.query(
      `INSERT INTO public.crm_user_capabilities (tenant_id, user_id, capabilities)
       VALUES ($1, $2, $3::text[])`,
      [TENANT, r.user_id, r.capabilities],
    )
  }
}

/* ── E-mails de l'espace : sauvegarde / restauration ───────────────── */
let reglagesEmail = null
async function couperEmailProspect() {
  const { rows } = await pool.query(
    `SELECT email_enabled, email_kinds FROM public.notification_settings WHERE tenant_id = $1`,
    [TENANT],
  )
  reglagesEmail = rows[0] ?? null
  if (!reglagesEmail) {
    /* Aucune ligne = tout est autorisé (cf. emailKindAllowed). On en
       pose une, restreinte, et on la retirera à la fin. */
    await pool.query(
      `INSERT INTO public.notification_settings (tenant_id, email_enabled, email_kinds)
       VALUES ($1, FALSE, '{}')`,
      [TENANT],
    )
    return
  }
  const sansProspect = (reglagesEmail.email_kinds ?? []).filter(k => k !== 'prospect_nouveau')
  await pool.query(
    `UPDATE public.notification_settings SET email_kinds = $2::text[] WHERE tenant_id = $1`,
    [TENANT, sansProspect],
  )
}
async function restaurerEmail() {
  if (reglagesEmail === null) {
    await pool.query(`DELETE FROM public.notification_settings WHERE tenant_id = $1`, [TENANT])
    return
  }
  await pool.query(
    `UPDATE public.notification_settings SET email_enabled = $2, email_kinds = $3::text[] WHERE tenant_id = $1`,
    [TENANT, reglagesEmail.email_enabled, reglagesEmail.email_kinds],
  )
}

/* ─────────────────────────────────────────────────────────────────
   LA VÉRITÉ, LUE EN BASE

   `perimetreReel` recalcule en SQL — indépendamment d'Express — les
   identifiants qu'une personne a le droit de voir. C'est l'étalon
   contre lequel on mesure ce que l'API a servi. Sans lui, le test ne
   ferait que comparer le serveur à lui-même.
───────────────────────────────────────────────────────────────── */
async function perimetreReel(userId, table, type) {
  const { rows } = await pool.query(
    `SELECT t.id FROM public.${table} t
      WHERE t.tenant_id = $1
        AND (t.assigned_to = $2
             OR t.created_by = $2
             OR EXISTS (SELECT 1 FROM public.crm_record_grants g
                         WHERE g.tenant_id = $1 AND g.user_id = $2
                           AND g.resource_type = $3 AND g.resource_id = t.id
                           AND g.can_view))`,
    [TENANT, userId, type],
  )
  return new Set(rows.map(r => r.id))
}

async function compterEnBase(table) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM public.${table} WHERE tenant_id = $1`, [TENANT])
  return rows[0].n
}

async function ficheEnBase(table, id) {
  const { rows } = await pool.query(
    `SELECT * FROM public.${table} WHERE id = $1 AND tenant_id = $2`, [id, TENANT])
  return rows[0] ?? null
}

/* Identifiant qui n'existe dans aucune table : sert à distinguer un
   « hors périmètre » (403) d'un « n'existe pas » (404). */
const FANTOME = '00000000-0000-4000-8000-000000000000'

async function main() {
  console.log(`\n🔐 Accès CRM par utilisateur — test de bout en bout sur ${API}\n`)

  /* ── Serveur joignable ? ─────────────────────────────────────────
     Consigne explicite : on ne LANCE pas le serveur, on constate. */
  try {
    const h = await fetch(`${API}/health`)
    if (!h.ok) throw new Error(`HTTP ${h.status}`)
  } catch (e) {
    console.error(`✗ Serveur injoignable sur ${API} (${e.message}).`)
    console.error('  Le test ne le démarre pas : lancez « npm run server » et relancez.')
    process.exit(1)
  }

  /* ── La migration 102 est-elle appliquée sur cette base ? ─────────
     Sans elle, crud.ts répond 503 sur les listes d'un commercial (état
     « indisponible » de perimetreListeCrm) et le test entier échouerait
     sur un symptôme qui n'a rien à voir avec le code testé. */
  const { rows: schema } = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name  IN ('prospects', 'clients', 'devis')
        AND column_name IN ('created_by', 'assigned_to')`)
  if (schema[0].n !== 6) {
    console.error(`✗ Migration 102 non appliquée sur ${process.env.PG_DATABASE} (${schema[0].n}/6 colonnes).`)
    process.exit(1)
  }

  await sauvegarderCapacites()
  await restaurerCapacites()   // purge d'une exécution précédente interrompue
  await cleanup()
  await couperEmailProspect()

  /* Témoin de non-régression, relevé AVANT toute écriture. */
  const avant = {
    prospects: await compterEnBase('prospects'),
    clients:   await compterEnBase('clients'),
    devis:     await compterEnBase('devis'),
  }
  console.log(`  (espace de test : ${avant.prospects} prospects, ${avant.clients} clients, ${avant.devis} devis existants)`)

  /* ══════════════════════════════════════════════════════════════
     0. FABRICATION DU DÉCOR

     Tout est créé PAR L'API, jamais par SQL : c'est le seul moyen de
     vérifier au passage que le serveur estampille bien created_by et
     assigned_to lui-même.
  ══════════════════════════════════════════════════════════════ */
  section('0. Fabrication du décor (création via l’API réelle)')

  const creer = async (user, table, corps) => {
    const r = await call(user, 'POST', `/api/${table}`, corps)
    if (r.status !== 201) throw new Error(
      `création ${table} par ${user.label} : HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`)
    return r.data
  }

  const pAdmin  = await creer(ADMIN,  'prospects', { nom: `${PREFIXE} Prospect de l'admin` })
  const pKarim  = await creer(KARIM,  'prospects', { nom: `${PREFIXE} Prospect de Karim` })
  const pFatima = await creer(FATIMA, 'prospects', { nom: `${PREFIXE} Prospect de Fatima` })
  const pPartag = await creer(FATIMA, 'prospects', { nom: `${PREFIXE} Prospect de Fatima partagé` })

  const dAdmin  = await creer(ADMIN,  'devis', { numero: `${PREFIXE}-D-ADMIN`,  montant_ht: 10000, montant_ttc: 12000 })
  const dFatima = await creer(FATIMA, 'devis', { numero: `${PREFIXE}-D-FATIMA`, montant_ht: 20000, montant_ttc: 24000 })
  const cAdmin  = await creer(ADMIN,  'clients', { nom: `${PREFIXE} Client de l'admin` })

  check('les 7 fiches de test sont créées', true)

  /* ── created_by posé par le SERVEUR et non falsifiable ─────────── */
  const pForge = await creer(KARIM, 'prospects', {
    nom: `${PREFIXE} Prospect forgé`,
    created_by:  ADMIN.id,     // tentative : « c'est l'admin qui l'a saisi »
    assigned_to: FATIMA.id,    // tentative : « il est à Fatima »
  })
  check('POST : `created_by` envoyé par le client est IGNORÉ (le serveur pose l’auteur réel)',
    pForge.created_by === KARIM.id, `created_by = ${pForge.created_by}`)
  check('POST : un commercial ne peut pas attribuer sa fiche à un tiers',
    pForge.assigned_to === KARIM.id, `assigned_to = ${pForge.assigned_to}`)

  const pAdminForge = await creer(ADMIN, 'prospects', {
    nom: `${PREFIXE} Prospect forgé par l'admin`, created_by: KARIM.id,
  })
  check('POST : même un admin ne peut pas se faire passer pour un autre auteur',
    pAdminForge.created_by === ADMIN.id, `created_by = ${pAdminForge.created_by}`)

  /* L'admin ne précise pas de responsable : la fiche reste « non
     attribuée », donc visible des seuls gestionnaires. C'est le
     comportement documenté par la migration, et c'est ce qui rend le
     test §20.6 possible. */
  check('POST : l’admin qui ne désigne personne laisse la fiche non attribuée',
    pAdmin.assigned_to === null, `assigned_to = ${pAdmin.assigned_to}`)

  /* ══════════════════════════════════════════════════════════════
     1. L'ADMIN VOIT TOUT                                    (§20.1)
  ══════════════════════════════════════════════════════════════ */
  section('1. L’administrateur voit tout (§20.1)')

  const totalProspects = await compterEnBase('prospects')
  const totalClients   = await compterEnBase('clients')
  const totalDevis     = await compterEnBase('devis')

  const lpAdmin = await liste(ADMIN, 'prospects')
  check('GET /api/prospects répond 200 à l’admin', lpAdmin.status === 200, `statut ${lpAdmin.status}`)
  check(`l’admin voit les ${totalProspects} prospects de l’espace, sans exception`,
    idsDe(lpAdmin).length === totalProspects, `${idsDe(lpAdmin).length} sur ${totalProspects}`)

  const lcAdmin = await liste(ADMIN, 'clients')
  check(`l’admin voit les ${totalClients} clients`,
    idsDe(lcAdmin).length === totalClients, `${idsDe(lcAdmin).length} sur ${totalClients}`)

  const ldAdmin = await liste(ADMIN, 'devis')
  check(`l’admin voit les ${totalDevis} devis`,
    idsDe(ldAdmin).length === totalDevis, `${idsDe(ldAdmin).length} sur ${totalDevis}`)

  const vusAdmin = new Set(idsDe(lpAdmin))
  check('l’admin voit les fiches des DEUX commerciaux, et les siennes',
    [pAdmin, pKarim, pFatima, pPartag, pForge].every(p => vusAdmin.has(p.id)))

  /* Non-régression : les fiches antérieures à la migration 102 n'ont ni
     created_by ni assigned_to. Elles ne doivent pas avoir disparu de la
     vue de l'admin — c'est précisément le risque d'un filtre mal posé. */
  const { rows: heritees } = await pool.query(
    `SELECT count(*)::int AS n FROM public.prospects
      WHERE tenant_id = $1 AND created_by IS NULL AND assigned_to IS NULL`, [TENANT])
  check(`les ${heritees[0].n} prospects hérités (sans propriétaire) restent visibles de l’admin`,
    heritees[0].n > 0 && idsDe(lpAdmin).length >= heritees[0].n)

  /* ══════════════════════════════════════════════════════════════
     2. LE COMMERCIAL NE VOIT QUE SON PÉRIMÈTRE              (§20.2)
  ══════════════════════════════════════════════════════════════ */
  section('2. Le commercial ne voit que ses données (§20.2)')

  const lpKarim = await liste(KARIM, 'prospects')
  check('GET /api/prospects répond 200 au commercial', lpKarim.status === 200, `statut ${lpKarim.status}`)

  const vusKarim = new Set(idsDe(lpKarim))
  const attenduKarim = await perimetreReel(KARIM.id, 'prospects', 'prospect')
  check('il voit ses propres prospects', vusKarim.has(pKarim.id) && vusKarim.has(pForge.id))
  check('il NE voit PAS le prospect de sa collègue', !vusKarim.has(pFatima.id))
  check('il NE voit PAS le prospect non attribué de l’admin', !vusKarim.has(pAdmin.id))
  check(`il ne reçoit AUCUN des ${heritees[0].n} prospects hérités`,
    ![...vusKarim].some(id => !attenduKarim.has(id)),
    `${[...vusKarim].filter(id => !attenduKarim.has(id)).length} fiche(s) hors périmètre servie(s)`)
  check('sa liste est exactement son périmètre, calculé en base indépendamment',
    vusKarim.size === attenduKarim.size && [...attenduKarim].every(id => vusKarim.has(id)),
    `API ${vusKarim.size} / SQL ${attenduKarim.size}`)

  const lpFatima = await liste(FATIMA, 'prospects')
  const vusFatima = new Set(idsDe(lpFatima))
  check('le cloisonnement joue dans les DEUX sens (Fatima ne voit pas Karim)',
    vusFatima.has(pFatima.id) && !vusFatima.has(pKarim.id))

  /* ── Le filtre d'égalité et le périmètre, ensemble ────────────────
     GET /api/:table accepte n'importe quel `?colonne=valeur`, et le
     périmètre est ajouté APRÈS, avec un numéro de placeholder calculé
     à la main (whereVals.length + 1). Une erreur d'un seul cran ici ne
     ferait pas planter la requête : elle comparerait `assigned_to` à la
     valeur du filtre, et servirait les mauvaises lignes en silence.
     C'est le genre de bogue qu'aucune relecture ne rattrape. */
  await call(KARIM, 'PATCH', `/api/prospects/${pKarim.id}`, { statut: 'gagne' })
  const { rows: gagnes } = await pool.query(
    `SELECT count(*)::int AS n FROM public.prospects WHERE tenant_id = $1 AND statut = 'gagne'`, [TENANT])
  const filtre = await call(KARIM, 'GET', '/api/prospects?statut=gagne&limit=1000')
  const nomsFiltres = Array.isArray(filtre.data) ? filtre.data.map(r => r.nom) : []
  check(`filtre ?statut=gagne : il n’obtient QUE le sien (1 sur ${gagnes[0].n} dans l’espace)`,
    filtre.status === 200 && nomsFiltres.length === 1 && nomsFiltres[0].startsWith(PREFIXE),
    `${nomsFiltres.length} ligne(s) : ${nomsFiltres.slice(0, 3).join(', ')}`)
  const parId = await call(KARIM, 'GET', `/api/prospects?id=${pFatima.id}`)
  check('filtre ?id=<fiche d’autrui> : liste vide, pas de contournement par la liste',
    Array.isArray(parId.data) && parId.data.length === 0,
    `${Array.isArray(parId.data) ? parId.data.length : parId.status}`)
  const triPage = await call(KARIM, 'GET', '/api/prospects?statut=gagne&orderBy=nom&order=asc&limit=5&offset=0')
  check('le périmètre survit au tri et à la pagination',
    Array.isArray(triPage.data) && triPage.data.length === 1)

  /* ══════════════════════════════════════════════════════════════
     3. LA FICHE D'UN AUTRE : 403, ET NON 404                (§20.3)
  ══════════════════════════════════════════════════════════════ */
  section('3. Il ouvre le prospect d’un autre → 403 (§20.3)')

  const ficheInterdite = await call(KARIM, 'GET', `/api/prospects/${pFatima.id}`)
  check('GET unitaire hors périmètre → 403', ficheInterdite.status === 403, `statut ${ficheInterdite.status}`)
  check('la réponse ne laisse fuir AUCUNE donnée de la fiche',
    !JSON.stringify(ficheInterdite.data).includes('Fatima'))

  /* Le contraste est la moitié de la preuve : si 403 était rendu pour
     tout, il ne dirait rien. Un identifiant qui n'existe pas doit
     rester un 404. */
  const ficheFantome = await call(KARIM, 'GET', `/api/prospects/${FANTOME}`)
  check('un identifiant INEXISTANT reste un 404 (le 403 n’est pas une réponse par défaut)',
    ficheFantome.status === 404, `statut ${ficheFantome.status}`)

  /* Robustesse, pas cloisonnement : le SELECT part avant tout contrôle
     de format, et Postgres refuse le cast en 22P02. L'utilisateur reçoit
     « Erreur serveur » là où une URL simplement mal formée devrait dire
     400. Rien ne fuit — mais un 500 déclenche une astreinte pour rien. */
  const ficheMalformee = await call(KARIM, 'GET', '/api/prospects/pas-un-uuid')
  check('un identifiant MALFORMÉ répond 400 et non 500',
    ficheMalformee.status === 400, `statut ${ficheMalformee.status} (attendu 400)`)

  const patchInterdit = await call(KARIM, 'PATCH', `/api/prospects/${pFatima.id}`, { statut: 'perdu' })
  check('PATCH sur la fiche d’un autre → 403', patchInterdit.status === 403, `statut ${patchInterdit.status}`)
  const apresPatch = await ficheEnBase('prospects', pFatima.id)
  check('…et la fiche est intacte en base', apresPatch?.statut === pFatima.statut,
    `statut ${apresPatch?.statut}`)

  /* ══════════════════════════════════════════════════════════════
     4. L'ADMIN LUI ASSIGNE LA FICHE                         (§20.4)
  ══════════════════════════════════════════════════════════════ */
  section('4. L’admin la lui assigne → il la voit (§20.4)')

  const assignation = await call(ADMIN, 'PUT', `/api/crm/grants/prospect/${pFatima.id}`,
    { assigned_to: KARIM.id, grants: [] })
  check('PUT /api/crm/grants accepté pour l’admin', assignation.status === 200, `statut ${assignation.status}`)

  const ficheAssignee = await call(KARIM, 'GET', `/api/prospects/${pFatima.id}`)
  check('la fiche assignée s’ouvre pour lui (200)', ficheAssignee.status === 200, `statut ${ficheAssignee.status}`)
  const lpKarim2 = await liste(KARIM, 'prospects')
  check('elle apparaît dans SA liste, sans délai ni cache', new Set(idsDe(lpKarim2)).has(pFatima.id))
  check('Fatima, qui l’a créée, la voit toujours (created_by ne se perd pas)',
    new Set(idsDe(await liste(FATIMA, 'prospects'))).has(pFatima.id))

  /* Le geste doit laisser une trace lisible dans le Journal d'activité :
     « qui a ouvert cet accès, et quand » est la première question posée
     après un incident. */
  const { rows: trace } = await pool.query(
    `SELECT description FROM public.activity_logs
      WHERE tenant_id = $1 AND record_id = $2 ORDER BY created_at DESC LIMIT 5`,
    [TENANT, pFatima.id])
  check('la réassignation est journalisée dans activity_logs',
    trace.some(t => /responsable/i.test(t.description ?? '')),
    trace.map(t => t.description).join(' | ').slice(0, 120) || 'aucune ligne')

  /* ══════════════════════════════════════════════════════════════
     5. L'ADMIN RETIRE L'ACCÈS                               (§20.5)
  ══════════════════════════════════════════════════════════════ */
  section('5. L’admin retire l’accès → il ne la voit plus (§20.5)')

  const retrait = await call(ADMIN, 'PUT', `/api/crm/grants/prospect/${pFatima.id}`,
    { assigned_to: null, grants: [] })
  check('PUT /api/crm/grants (désattribution) accepté', retrait.status === 200, `statut ${retrait.status}`)

  const ficheRetiree = await call(KARIM, 'GET', `/api/prospects/${pFatima.id}`)
  check('la fiche se referme immédiatement (403)', ficheRetiree.status === 403, `statut ${ficheRetiree.status}`)
  check('elle disparaît de sa liste',
    !new Set(idsDe(await liste(KARIM, 'prospects'))).has(pFatima.id))
  check('la fiche existe toujours en base — retirer un accès n’efface rien',
    !!(await ficheEnBase('prospects', pFatima.id)))

  /* ══════════════════════════════════════════════════════════════
     6 & 7. LE DEVIS DE L'ADMIN                       (§20.6, §20.7)
  ══════════════════════════════════════════════════════════════ */
  section('6. L’admin crée un devis → le commercial ne le voit pas (§20.6)')

  const ldKarim = await liste(KARIM, 'devis')
  check('GET /api/devis répond 200 au commercial', ldKarim.status === 200, `statut ${ldKarim.status}`)
  check('le devis de l’admin est absent de sa liste', !new Set(idsDe(ldKarim)).has(dAdmin.id))
  const devisInterdit = await call(KARIM, 'GET', `/api/devis/${dAdmin.id}`)
  check('et sa fiche répond 403', devisInterdit.status === 403, `statut ${devisInterdit.status}`)

  section('7. L’admin partage le devis → il le voit (§20.7)')

  const partage = await call(ADMIN, 'PUT', `/api/crm/grants/devis/${dAdmin.id}`,
    { grants: [{ user_id: KARIM.id, can_view: true }] })
  check('PUT /api/crm/grants/devis accepté', partage.status === 200, `statut ${partage.status}`)

  const devisPartage = await call(KARIM, 'GET', `/api/devis/${dAdmin.id}`)
  check('le devis partagé s’ouvre (200)', devisPartage.status === 200, `statut ${devisPartage.status}`)
  check('il apparaît dans sa liste', new Set(idsDe(await liste(KARIM, 'devis'))).has(dAdmin.id))

  /* Le partage accordé est « consultation » et rien d'autre. Si la
     lecture emportait l'écriture, les cinq droits de la table de
     partages ne serviraient à rien. */
  const modifPartage = await call(KARIM, 'PATCH', `/api/devis/${dAdmin.id}`, { statut: 'envoye' })
  check('un partage en LECTURE seule ne donne pas la modification (403)',
    modifPartage.status === 403, `statut ${modifPartage.status}`)

  /* ══════════════════════════════════════════════════════════════
     8. FORCER UN DEVIS INTERDIT PAR L'URL / L'API           (§20.8)
  ══════════════════════════════════════════════════════════════ */
  section('8. Il force un devis non autorisé par l’URL/API → 403 (§20.8)')

  const forceGet = await call(KARIM, 'GET', `/api/devis/${dFatima.id}`)
  check('GET direct sur le devis d’une collègue → 403', forceGet.status === 403, `statut ${forceGet.status}`)

  const forcePatch = await call(KARIM, 'PATCH', `/api/devis/${dFatima.id}`, { montant_ttc: 1 })
  check('PATCH direct → 403', forcePatch.status === 403, `statut ${forcePatch.status}`)
  const devisApres = await ficheEnBase('devis', dFatima.id)
  check('…le montant n’a pas bougé', Number(devisApres?.montant_ttc) === 24000,
    `montant_ttc = ${devisApres?.montant_ttc}`)

  const forceDelete = await call(KARIM, 'DELETE', `/api/devis/${dFatima.id}`)
  check('DELETE direct → 403', forceDelete.status === 403, `statut ${forceDelete.status}`)
  check('…et le devis existe toujours', !!(await ficheEnBase('devis', dFatima.id)))

  /* La route dédiée qui contourne le CRUD générique : elle rattache une
     génération IA à un devis, donc elle écrit dans SA traçabilité. */
  const forceLink = await call(KARIM, 'POST', `/api/ai-quote/${FANTOME}/link`, { quoteId: dFatima.id })
  check('la route dédiée /api/ai-quote/:id/link refuse aussi (403)',
    forceLink.status === 403, `statut ${forceLink.status}`)

  /* Le contournement historique : /api/ai-quote/context lisait n'importe
     quel prospect de l'espace, notes comprises — et ce sont ces notes
     que le module envoie au fournisseur d'IA. */
  const forceContext = await call(KARIM, 'GET', `/api/ai-quote/context/${pFatima.id}`)
  check('/api/ai-quote/context sur le prospect d’une autre → 403',
    forceContext.status === 403, `statut ${forceContext.status}`)
  const contextSien = await call(KARIM, 'GET', `/api/ai-quote/context/${pKarim.id}`)
  check('…mais reste ouverte sur SON prospect (pas de sur-blocage)',
    contextSien.status !== 403, `statut ${contextSien.status}`)

  /* Les écrans d'administration des accès sont, eux aussi, une porte. */
  const grantParCommercial = await call(KARIM, 'PUT', `/api/crm/grants/prospect/${pFatima.id}`,
    { assigned_to: KARIM.id, grants: [] })
  check('un commercial ne peut pas se PARTAGER une fiche lui-même (403)',
    grantParCommercial.status === 403, `statut ${grantParCommercial.status}`)
  const capsParCommercial = await call(KARIM, 'PUT', `/api/crm/capabilities/${KARIM.id}`,
    { capabilities: ['prospects.view_all'] })
  check('…ni s’accorder la capacité « voir tous les prospects » (403)',
    capsParCommercial.status === 403, `statut ${capsParCommercial.status}`)
  const { rows: capsEnBase } = await pool.query(
    `SELECT capabilities FROM public.crm_user_capabilities WHERE tenant_id=$1 AND user_id=$2`,
    [TENANT, KARIM.id])
  check('…et rien n’a été écrit en base', !capsEnBase.length || !capsEnBase[0].capabilities.length)

  const sansJeton = await fetch(`${API}/api/prospects`)
  check('sans jeton : 401', sansJeton.status === 401, `statut ${sansJeton.status}`)

  /* Le rôle inscrit dans le jeton ne doit décider de RIEN : requireAuth
     le remplace par celui de tenant_users (getEffectiveRole). Sans cela,
     tout ce dispositif se contournerait en signant « manager ». */
  for (const usurpe of ['manager', 'admin']) {
    const r = await call({ ...KARIM, role: usurpe }, 'GET', '/api/prospects?limit=1000')
    check(`un jeton signé « ${usurpe} » pour un commercial ne donne rien de plus`,
      idsDe(r).length === (await perimetreReel(KARIM.id, 'prospects', 'prospect')).size,
      `${idsDe(r).length} ligne(s) servie(s)`)
  }

  /* ══════════════════════════════════════════════════════════════
     8 bis. LES ACTIVITÉS DU PROSPECT  (table prospect_logs)

     Le cahier des charges énumère la portée : « prospects, clients,
     devis, ACTIVITÉS, tableaux de bord ». Les activités, dans cette
     application, ce sont les lignes de `prospect_logs` : notes, comptes
     rendus d'appel, e-mails, changements de statut, montants de devis
     générés. C'est le contenu le PLUS sensible du CRM — plus que la
     fiche elle-même, qui ne porte qu'un nom et un téléphone.

     Deux raisons de le tester ici plutôt qu'ailleurs :
      • src/pages/Prospects.tsx appelle `useAllProspectLogs()`, soit
        GET /api/prospect_logs?limit=1000 — l'écran de liste d'un
        commercial télécharge donc la timeline de TOUT l'espace, puis
        n'en affiche qu'une partie. C'est exactement le « cacher la
        carte dans l'interface » que le client a écarté ;
      • la fiche d'un prospect hors périmètre répond bien 403 (§20.3),
        et son journal s'obtient malgré tout par prospect_id.
  ══════════════════════════════════════════════════════════════ */
  section('8 bis. Les ACTIVITÉS du prospect (notes, appels, e-mails)')

  const SECRET_METIER = `${PREFIXE} marge réelle 45 %, plancher 62 000 MAD`
  const noteFatima = await call(FATIMA, 'POST', '/api/prospect_logs', {
    prospect_id: pFatima.id, type: 'note', message: SECRET_METIER, auteur: 'Fatima',
  })
  check('Fatima journalise une note sur SON prospect', noteFatima.status === 201,
    `statut ${noteFatima.status}`)
  /* Karim en pose une sur le sien : sans elle, « il ne voit rien » se
     confondrait avec « la route est cassée ». */
  const noteKarim = await call(KARIM, 'POST', '/api/prospect_logs', {
    prospect_id: pKarim.id, type: 'appel', message: `${PREFIXE} relance téléphonique`, auteur: 'Karim',
  })
  check('Karim journalise une note sur le SIEN', noteKarim.status === 201, `statut ${noteKarim.status}`)

  const timelineVolee = await call(KARIM, 'GET', `/api/prospect_logs?prospect_id=${pFatima.id}`)
  const contenuVole = JSON.stringify(timelineVolee.data)
  check('la timeline d’un prospect hors périmètre est refusée (403) ou vide',
    timelineVolee.status === 403 || (Array.isArray(timelineVolee.data) && timelineVolee.data.length === 0),
    `statut ${timelineVolee.status}, ${Array.isArray(timelineVolee.data) ? timelineVolee.data.length : '?'} ligne(s)`)
  check('le secret commercial de la collègue ne sort PAS par cette route',
    !contenuVole.includes('62 000'), 'la note confidentielle a été servie mot pour mot')

  const toutesActivites = await call(KARIM, 'GET', '/api/prospect_logs?limit=1000')
  const { rows: totalLogs } = await pool.query(
    `SELECT count(*)::int AS n FROM public.prospect_logs WHERE tenant_id = $1`, [TENANT])
  const { rows: logsAutorises } = await pool.query(
    `SELECT count(*)::int AS n FROM public.prospect_logs l
       JOIN public.prospects p ON p.id = l.prospect_id
      WHERE l.tenant_id = $1
        AND (p.assigned_to = $2 OR p.created_by = $2
             OR EXISTS (SELECT 1 FROM public.crm_record_grants g
                         WHERE g.tenant_id = $1 AND g.user_id = $2
                           AND g.resource_type = 'prospect' AND g.resource_id = p.id
                           AND g.can_view))`,
    [TENANT, KARIM.id])
  check(`GET /api/prospect_logs ne rend que ses ${logsAutorises[0].n} activité(s), pas les ${totalLogs[0].n} de l’espace`,
    Array.isArray(toutesActivites.data) && toutesActivites.data.length === logsAutorises[0].n,
    `${Array.isArray(toutesActivites.data) ? toutesActivites.data.length : toutesActivites.status} ligne(s) servie(s) sur ${totalLogs[0].n}`)

  const intrusion = await call(KARIM, 'POST', '/api/prospect_logs', {
    prospect_id: pFatima.id, type: 'appel', message: `${PREFIXE} intrusion`,
  })
  check('écrire dans la timeline d’un prospect hors périmètre est refusé (403)',
    intrusion.status === 403, `statut ${intrusion.status}`)
  if (intrusion.status === 201) {
    await pool.query(`DELETE FROM public.prospect_logs WHERE id = $1`, [intrusion.data.id])
  }

  /* ══════════════════════════════════════════════════════════════
     AUTO-ASSIGNATION : le vol de dossier
  ══════════════════════════════════════════════════════════════ */
  section('9. Un commercial ne peut pas s’auto-assigner une fiche')

  /* On lui donne le droit de MODIFIER la fiche de Fatima : c'est le cas
     limite. S'il peut la modifier, peut-il en profiter pour se
     l'attribuer — et la retirer ainsi du périmètre de sa collègue ? */
  const partageEdit = await call(ADMIN, 'PUT', `/api/crm/grants/prospect/${pPartag.id}`,
    { grants: [{ user_id: KARIM.id, can_view: true, can_edit: true }] })
  check('l’admin partage une fiche EN MODIFICATION avec Karim',
    partageEdit.status === 200, `statut ${partageEdit.status}`)

  const volSeul = await call(KARIM, 'PATCH', `/api/prospects/${pPartag.id}`, { assigned_to: KARIM.id })
  check('PATCH ne portant QUE `assigned_to` : refusé (400, rien à mettre à jour)',
    volSeul.status === 400, `statut ${volSeul.status}`)

  const volGlisse = await call(KARIM, 'PATCH', `/api/prospects/${pPartag.id}`,
    { statut: 'contacte', assigned_to: KARIM.id })
  check('PATCH légitime avec `assigned_to` glissé dedans : accepté…',
    volGlisse.status === 200, `statut ${volGlisse.status}`)
  const apresVol = await ficheEnBase('prospects', pPartag.id)
  check('…la modification légitime est bien enregistrée', apresVol?.statut === 'contacte',
    `statut ${apresVol?.statut}`)
  check('…mais le responsable n’a PAS changé (pas de vol de dossier)',
    apresVol?.assigned_to === FATIMA.id, `assigned_to = ${apresVol?.assigned_to}`)
  check('…et la réponse HTTP ne lui annonce pas le contraire',
    volGlisse.data?.assigned_to === FATIMA.id, `assigned_to renvoyé = ${volGlisse.data?.assigned_to}`)

  /* ══════════════════════════════════════════════════════════════
     10. LA CONVERSION EN CLIENT                             (§20.9)
  ══════════════════════════════════════════════════════════════ */
  section('10. Il convertit SON prospect en client (§20.9)')

  const gagne = await call(KARIM, 'PATCH', `/api/prospects/${pKarim.id}`, { statut: 'gagne' })
  check('il peut marquer SON prospect comme gagné', gagne.status === 200, `statut ${gagne.status}`)

  const clientConverti = await call(KARIM, 'POST', '/api/clients', {
    nom: `${PREFIXE} Client converti par Karim`,
    email: 'zztest-crm@example.invalid',
    statut: 'Actif',
  })
  check('la création du client aboutit (201)', clientConverti.status === 201, `statut ${clientConverti.status}`)
  const cKarim = clientConverti.data
  check('le client existe bien en base', !!(await ficheEnBase('clients', cKarim?.id)))
  check('il en est l’auteur ET le responsable — sans quoi il le perdrait aussitôt',
    cKarim?.created_by === KARIM.id && cKarim?.assigned_to === KARIM.id,
    `created_by=${cKarim?.created_by} assigned_to=${cKarim?.assigned_to}`)

  const ficheClient = await call(KARIM, 'GET', `/api/clients/${cKarim.id}`)
  check('la fiche client lui reste accessible (200)', ficheClient.status === 200, `statut ${ficheClient.status}`)
  const lcKarim = await liste(KARIM, 'clients')
  check('elle figure dans sa liste de clients', new Set(idsDe(lcKarim)).has(cKarim.id))
  check('mais il ne voit toujours pas le client de l’admin', !new Set(idsDe(lcKarim)).has(cAdmin.id))
  check('…dont la fiche répond 403',
    (await call(KARIM, 'GET', `/api/clients/${cAdmin.id}`)).status === 403)
  check('Fatima ne voit pas le client que Karim vient de créer',
    !new Set(idsDe(await liste(FATIMA, 'clients'))).has(cKarim.id))

  /* ══════════════════════════════════════════════════════════════
     11. LES STATISTIQUES                                   (§20.10)

     Les écrans de ce dépôt (Prospects.tsx, Clients.tsx, Dashboard.tsx)
     calculent leurs KPI EN MÉMOIRE, sur la liste que l'API leur a
     servie : il n'existe pas de route d'agrégation à interroger. La
     bonne question n'est donc pas « le compteur est-il juste ? » mais
     « la matière première du compteur est-elle propre ? ». On vérifie
     ligne à ligne, sur les trois tables, contre la base.
  ══════════════════════════════════════════════════════════════ */
  section('11. Ses statistiques ne portent aucune donnée non autorisée (§20.10)')

  for (const [table, type] of [['prospects', 'prospect'], ['clients', 'client'], ['devis', 'devis']]) {
    const rep = await liste(KARIM, table)
    const servis = idsDe(rep)
    const autorises = await perimetreReel(KARIM.id, table, type)
    const intrus = servis.filter(id => !autorises.has(id))
    const total = await compterEnBase(table)
    check(`${table} : les ${servis.length} lignes servies sont toutes dans son périmètre (sur ${total} dans l’espace)`,
      intrus.length === 0, `${intrus.length} intrus : ${intrus.slice(0, 3).join(', ')}`)
    check(`${table} : aucune ligne de son périmètre ne manque (le filtre ne sur-bloque pas)`,
      autorises.size === servis.length, `SQL ${autorises.size} / API ${servis.length}`)
  }

  /* Le chiffre d'affaires est le KPI le plus sensible : il doit être
     calculé sur SES devis, pas sur la caisse de l'espace. */
  const devisKarim = (await liste(KARIM, 'devis')).data
  const caKarim = devisKarim.reduce((s, d) => s + Number(d.montant_ttc ?? 0), 0)
  const { rows: caTotal } = await pool.query(
    `SELECT COALESCE(SUM(montant_ttc), 0)::float AS s FROM public.devis WHERE tenant_id = $1`, [TENANT])
  check('le total de ses devis est strictement inférieur à celui de l’espace',
    caKarim < caTotal[0].s, `${caKarim} vs ${caTotal[0].s}`)
  check('le devis de Fatima ne pèse pas dans son chiffre d’affaires',
    !devisKarim.some(d => d.id === dFatima.id))

  /* ══════════════════════════════════════════════════════════════
     12. LA CAPACITÉ TRANSVERSE, ET SA RÉVOCATION IMMÉDIATE

     C'est le mécanisme « commercial senior qui suit tout le
     portefeuille sans être manager ». Son point faible est le cache de
     30 s de crmScope : si la révocation ne le vidait pas, retirer un
     droit resterait sans effet une demi-minute — et l'administrateur
     qui vérifie aussitôt conclurait que le réglage ne marche pas.
  ══════════════════════════════════════════════════════════════ */
  section('12. Capacité « voir tous les prospects » : accordée, puis révoquée')

  const accorde = await call(ADMIN, 'PUT', `/api/crm/capabilities/${KARIM.id}`,
    { capabilities: ['prospects.view_all'] })
  check('l’admin accorde la capacité (200)', accorde.status === 200, `statut ${accorde.status}`)
  const lpVueTotale = await liste(KARIM, 'prospects')
  check('Karim voit alors TOUS les prospects, comme un gestionnaire',
    idsDe(lpVueTotale).length === await compterEnBase('prospects'),
    `${idsDe(lpVueTotale).length} sur ${await compterEnBase('prospects')}`)
  check('…mais la capacité est bornée aux prospects : les clients restent filtrés',
    idsDe(await liste(KARIM, 'clients')).length < await compterEnBase('clients'))

  const inconnue = await call(ADMIN, 'PUT', `/api/crm/capabilities/${KARIM.id}`,
    { capabilities: ['prospects.view_all', 'tout.voir'] })
  check('une capacité hors vocabulaire est refusée (400) et n’écrase rien',
    inconnue.status === 400, `statut ${inconnue.status}`)

  const revoque = await call(ADMIN, 'PUT', `/api/crm/capabilities/${KARIM.id}`, { capabilities: [] })
  check('l’admin révoque la capacité (200)', revoque.status === 200, `statut ${revoque.status}`)
  const lpApresRevoc = await liste(KARIM, 'prospects')
  const attenduApres = await perimetreReel(KARIM.id, 'prospects', 'prospect')
  check('la révocation prend effet TOUT DE SUITE, sans attendre le cache de 30 s',
    idsDe(lpApresRevoc).length === attenduApres.size,
    `API ${idsDe(lpApresRevoc).length} / SQL ${attenduApres.size}`)

  /* ══════════════════════════════════════════════════════════════
     13. L'ADMIN N'A RIEN PERDU

     La question la plus importante du lot après la fuite elle-même :
     a-t-on cassé l'existant pour installer la nouveauté ?
  ══════════════════════════════════════════════════════════════ */
  section('13. L’admin conserve exactement le même périmètre qu’avant')

  const finP = await compterEnBase('prospects')
  const finC = await compterEnBase('clients')
  const finD = await compterEnBase('devis')
  check('aucune donnée existante n’a été supprimée par le test',
    finP >= avant.prospects && finC >= avant.clients && finD >= avant.devis,
    `${finP}/${avant.prospects} ${finC}/${avant.clients} ${finD}/${avant.devis}`)

  check('l’admin voit toujours 100 % des prospects',
    idsDe(await liste(ADMIN, 'prospects')).length === finP)
  check('l’admin voit toujours 100 % des clients',
    idsDe(await liste(ADMIN, 'clients')).length === finC)
  check('l’admin voit toujours 100 % des devis',
    idsDe(await liste(ADMIN, 'devis')).length === finD)

  for (const [label, table, id] of [
    ['le prospect de Karim',  'prospects', pKarim.id],
    ['le prospect de Fatima', 'prospects', pFatima.id],
    ['le devis de Fatima',    'devis',     dFatima.id],
    ['le client de Karim',    'clients',   cKarim.id],
  ]) {
    const r = await call(ADMIN, 'GET', `/api/${table}/${id}`)
    check(`l’admin ouvre ${label} sans restriction (200)`, r.status === 200, `statut ${r.status}`)
  }

  const patchAdmin = await call(ADMIN, 'PATCH', `/api/prospects/${pFatima.id}`, { statut: 'qualifie' })
  check('l’admin modifie la fiche d’un commercial (200)', patchAdmin.status === 200, `statut ${patchAdmin.status}`)

  /* Un prospect hérité, sans propriétaire : c'est le cas de production
     le plus fréquent (133 fiches sur 139 ici). L'admin doit pouvoir
     l'ouvrir, sinon le pipeline est cassé au premier clic. */
  const { rows: unHerite } = await pool.query(
    `SELECT id FROM public.prospects
      WHERE tenant_id = $1 AND created_by IS NULL AND assigned_to IS NULL LIMIT 1`, [TENANT])
  if (unHerite.length) {
    const r = await call(ADMIN, 'GET', `/api/prospects/${unHerite[0].id}`)
    check('l’admin ouvre un prospect hérité, sans propriétaire (200)', r.status === 200, `statut ${r.status}`)
    const rk = await call(KARIM, 'GET', `/api/prospects/${unHerite[0].id}`)
    check('…que le commercial, lui, ne peut pas ouvrir (403)', rk.status === 403, `statut ${rk.status}`)
  }

  /* ── Bilan ──────────────────────────────────────────────────────── */
  console.log(`\n${'─'.repeat(70)}`)
  console.log(`  ${passed} réussi(s), ${failed} échec(s)`)
  if (failed) {
    console.log('\n  Échecs :')
    for (const r of results.filter(r => !r.ok)) console.log(`   • ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
  console.log(`${'─'.repeat(70)}\n`)

  await restaurerCapacites()
  await restaurerEmail()
  await cleanup()
  await pool.end()
  process.exit(failed ? 1 : 0)
}

main().catch(async (err) => {
  console.error('\n✗ Test interrompu :', err)
  /* Le nettoyage doit passer MÊME en cas d'échec : sans lui, les fiches
     ZZTEST restent dans le CRM et le `devis.numero` unique bloque toutes
     les exécutions suivantes. */
  await restaurerCapacites().catch(() => {})
  await restaurerEmail().catch(() => {})
  await cleanup().catch(() => {})
  await pool.end().catch(() => {})
  process.exit(1)
})
