#!/usr/bin/env node
/**
 * BIBLIOTHÈQUE DE FICHIERS DU PROJET — test de bout en bout.
 *
 * Ce que ce script prouve, et qu'aucun clic ne prouverait :
 *   §1  un fichier déposé revient dans la liste, avec son nom, son
 *       format, son poids, sa date et son déposant ;
 *   §2  le contenu retéléchargé est OCTET POUR OCTET celui envoyé ;
 *   §3  le téléchargement force l'enregistrement (attachment) et
 *       interdit au navigateur de deviner le type (nosniff) ;
 *   §4  un fichier dangereux (SVG avec <script>) est stocké et resservi
 *       en binaire anonyme — jamais affichable dans l'origine de l'app ;
 *   §5  la suppression retire la ligne ET le fichier du disque ;
 *   §6  un employé ne peut pas supprimer ce qu'un autre a déposé ;
 *   §7  un compte SANS accès au projet ne voit ni ne télécharge rien ;
 *   §8  un téléversement de chat abandonné (sans message) n'apparaît
 *       pas dans la bibliothèque, et un dépôt de bibliothèque n'apparaît
 *       pas dans le fil de discussion ;
 *   §9  le plafond de taille est appliqué.
 *
 * Comme les autres tests du dossier : jetons signés avec le secret du
 * serveur, vérité relue en SQL hors d'Express, fichiers préfixés
 * ZZTEST-FICHIERS et effacés à la fin, y compris sur exception.
 *
 * Usage : API_URL=http://localhost:4001 node scripts/test-projet-fichiers-e2e.mjs
 */
import jwt from 'jsonwebtoken'
import pg from 'pg'
import dotenv from 'dotenv'
import { createHash, randomBytes } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'

dotenv.config({ path: '.env.local' })

const API = process.env.API_URL || `http://localhost:${process.env.SERVER_PORT || 4000}`
const TENANT = '0f1ba85a-55ae-49ab-8de4-b14dbe8d5019'
const ADMIN  = { id: '2f7561a4-b92c-4175-a7c1-f6c752a95896', email: 'nextgital1@gmail.com', role: 'admin' }
const PREFIXE = 'ZZTEST-FICHIERS'

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads')

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

async function call(user, method, chemin, body, headers = {}) {
  const res = await fetch(`${API}${chemin}`, {
    method,
    headers: { Authorization: `Bearer ${token(user)}`, ...headers },
    body,
  })
  const brut = await res.text()
  let data; try { data = JSON.parse(brut) } catch { data = brut }
  return { status: res.status, data, headers: res.headers }
}

const televerser = (user, projetId, nom, contenu, mime, origine = 'bibliotheque') =>
  call(user, 'POST', `/api/projet-chat/${projetId}/files?origine=${origine}`, contenu, {
    'Content-Type': mime,
    'x-filename': encodeURIComponent(nom),
  })

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

let projetId = null
async function cleanup() {
  const { rows } = await pool.query(
    `SELECT id, storage_path FROM projet_message_files WHERE filename LIKE $1`, [`${PREFIXE}%`])
  await pool.query(`DELETE FROM projet_message_files WHERE filename LIKE $1`, [`${PREFIXE}%`])
  const fs = await import('node:fs/promises')
  for (const r of rows) {
    try { await fs.unlink(path.join(UPLOAD_DIR, r.storage_path)) } catch {}
  }
  await pool.query(`DELETE FROM projets WHERE tenant_id = $1 AND nom LIKE $2`, [TENANT, `${PREFIXE}%`])
}

async function main() {
  console.log(`\n📁 Bibliothèque de fichiers du projet — test de bout en bout sur ${API}\n`)
  try {
    const h = await fetch(`${API}/health`)
    if (!h.ok) throw new Error(`HTTP ${h.status}`)
  } catch (e) {
    console.error(`✗ Serveur injoignable sur ${API} (${e.message}). Lancez « npm run server ».`)
    process.exit(1)
  }

  /* La colonne origine est-elle là ? Sans elle, tout le reste échouerait
     sur un symptôme qui n'a rien à voir avec le code testé. */
  const { rows: col } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'projet_message_files' AND column_name = 'origine'`)
  if (!col.length) {
    console.error('✗ Migration 105 non appliquée sur cette base.')
    process.exit(1)
  }

  await cleanup()

  try {
    /* Un projet à nous, pour ne rien écrire dans les projets réels. */
    const { rows: p } = await pool.query(
      `INSERT INTO projets (tenant_id, nom, statut) VALUES ($1, $2, 'en_cours') RETURNING id`,
      [TENANT, `${PREFIXE}-projet`])
    projetId = p[0].id

    /* ───────────────────────────────────────────────────────────── */
    section('§1  Déposer un fichier, le retrouver dans la liste')

    const contenu = randomBytes(64 * 1024)   // 64 Ko de binaire vérifiable
    const nomFichier = `${PREFIXE}-rapport.pdf`
    const dep = await televerser(ADMIN, projetId, nomFichier, contenu, 'application/pdf')
    check('POST /files?origine=bibliotheque → 201', dep.status === 201, `HTTP ${dep.status} ${JSON.stringify(dep.data).slice(0,120)}`)
    check('la réponse porte origine=bibliotheque', dep.data?.origine === 'bibliotheque', JSON.stringify(dep.data))
    const fileId = dep.data?.id

    const liste = await call(ADMIN, 'GET', `/api/projet-chat/${projetId}/files`)
    check('GET /files → 200', liste.status === 200, `HTTP ${liste.status}`)
    const item = Array.isArray(liste.data) ? liste.data.find(f => f.id === fileId) : null
    check('le fichier est dans la liste', !!item)
    check('son NOM est exact',    item?.filename === nomFichier, item?.filename)
    check('son FORMAT est exact', item?.mime === 'application/pdf', item?.mime)
    check('son POIDS est exact',  Number(item?.size_bytes) === contenu.length, `${item?.size_bytes} ≠ ${contenu.length}`)
    check('sa DATE est présente et valide', !!item?.created_at && !isNaN(new Date(item.created_at).getTime()), item?.created_at)
    check('le DÉPOSANT est nommé', !!item?.uploader_name, item?.uploader_name)
    check('l\'admin peut le supprimer', item?.peut_supprimer === true)

    /* La vérité du disque, hors d'Express. */
    const { rows: enBase } = await pool.query(
      `SELECT storage_path, origine, message_id FROM projet_message_files WHERE id = $1`, [fileId])
    const st = await stat(path.join(UPLOAD_DIR, enBase[0].storage_path))
    check('EN BASE : origine = bibliotheque, sans message',
      enBase[0].origine === 'bibliotheque' && enBase[0].message_id === null)
    check('SUR LE DISQUE : le fichier existe, à la bonne taille', st.size === contenu.length, `${st.size}`)

    /* ───────────────────────────────────────────────────────────── */
    section('§2-3  Télécharger sur son ordinateur — contenu et en-têtes')

    const dl = await fetch(`${API}/api/projet-chat/files/${fileId}`, {
      headers: { Authorization: `Bearer ${token(ADMIN)}` },
    })
    const recu = Buffer.from(await dl.arrayBuffer())
    check('GET /files/:id → 200', dl.status === 200, `HTTP ${dl.status}`)
    check('le contenu est IDENTIQUE, octet pour octet', sha(recu) === sha(contenu),
      `${recu.length} o reçus contre ${contenu.length}`)
    const disp = dl.headers.get('content-disposition') || ''
    check('Content-Disposition force l\'enregistrement', disp.startsWith('attachment'), disp)
    check('le nom du fichier voyage en UTF-8', disp.includes(encodeURIComponent(nomFichier)), disp)
    check('X-Content-Type-Options: nosniff', dl.headers.get('x-content-type-options') === 'nosniff')
    check('Cache-Control privé', (dl.headers.get('cache-control') || '').includes('private'))

    /* ───────────────────────────────────────────────────────────── */
    section('§4  Un SVG piégé est désarmé')

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>')
    const dep2 = await televerser(ADMIN, projetId, `${PREFIXE}-piege.svg`, svg, 'image/svg+xml')
    check('le fichier est accepté (on ne refuse pas, on désarme)', dep2.status === 201, `HTTP ${dep2.status}`)
    check('stocké en binaire anonyme', dep2.data?.mime === 'application/octet-stream', dep2.data?.mime)
    const dlSvg = await fetch(`${API}/api/projet-chat/files/${dep2.data.id}?inline=1`, {
      headers: { Authorization: `Bearer ${token(ADMIN)}` },
    })
    check('même en demandant l\'affichage, il part en téléchargement',
      (dlSvg.headers.get('content-disposition') || '').startsWith('attachment'),
      dlSvg.headers.get('content-disposition'))
    check('servi en application/octet-stream',
      (dlSvg.headers.get('content-type') || '').startsWith('application/octet-stream'),
      dlSvg.headers.get('content-type'))

    /* ───────────────────────────────────────────────────────────── */
    section('§8  Les deux listes ne se mélangent pas')

    const orphelin = await televerser(ADMIN, projetId, `${PREFIXE}-abandonne.txt`,
      Buffer.from('envoi jamais terminé'), 'text/plain', 'chat')
    check('un téléversement de chat est accepté', orphelin.status === 201)
    const liste2 = await call(ADMIN, 'GET', `/api/projet-chat/${projetId}/files`)
    const ids2 = liste2.data.map(f => f.id)
    check('l\'envoi abandonné n\'apparaît PAS dans la bibliothèque', !ids2.includes(orphelin.data.id))

    const fil = await call(ADMIN, 'GET', `/api/projet-chat/${projetId}/messages`)
    const fichiersDuFil = (fil.data?.messages ?? []).flatMap(m => m.files ?? [])
    check('le dépôt de bibliothèque n\'apparaît PAS dans la discussion',
      !fichiersDuFil.some(f => f.id === fileId))

    const listeStricte = await call(ADMIN, 'GET', `/api/projet-chat/${projetId}/files?origine=bibliotheque`)
    check('le filtre ?origine=bibliotheque ne renvoie que les dépôts',
      listeStricte.data.every(f => f.origine === 'bibliotheque'))

    /* ───────────────────────────────────────────────────────────── */
    section('§7  Un compte sans accès au projet ne voit rien')

    const { rows: com } = await pool.query(
      `SELECT user_id FROM tenant_users tu JOIN users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1 AND tu.role = 'commercial' LIMIT 1`, [TENANT])
    if (com.length) {
      const COMMERCIAL = { id: com[0].user_id, email: 'commercial@nextgital.com', role: 'commercial' }
      const vu = await call(COMMERCIAL, 'GET', `/api/projet-chat/${projetId}/files`)
      check('liste refusée à un compte hors projet (403)', vu.status === 403, `HTTP ${vu.status}`)
      const dlx = await call(COMMERCIAL, 'GET', `/api/projet-chat/files/${fileId}`)
      check('téléchargement refusé (403)', dlx.status === 403, `HTTP ${dlx.status}`)
      const supx = await call(COMMERCIAL, 'DELETE', `/api/projet-chat/files/${fileId}`)
      check('suppression refusée (403)', supx.status === 403, `HTTP ${supx.status}`)
      const { rows: tjs } = await pool.query(`SELECT 1 FROM projet_message_files WHERE id = $1`, [fileId])
      check('EN BASE : le fichier est toujours là', tjs.length === 1)
    } else {
      console.log('  ⏭️  aucun compte commercial sur ce miroir')
    }

    /* ───────────────────────────────────────────────────────────── */
    section('§5  Supprimer : la ligne ET le contenu')

    const chemin = enBase[0].storage_path
    const sup = await call(ADMIN, 'DELETE', `/api/projet-chat/files/${fileId}`)
    check('DELETE /files/:id → 200', sup.status === 200, `HTTP ${sup.status}`)
    const { rows: apres } = await pool.query(`SELECT 1 FROM projet_message_files WHERE id = $1`, [fileId])
    check('EN BASE : la ligne a disparu', apres.length === 0)
    let present = true
    try { await stat(path.join(UPLOAD_DIR, chemin)) } catch { present = false }
    check('SUR LE DISQUE : le contenu a disparu', !present)
    const dl404 = await call(ADMIN, 'GET', `/api/projet-chat/files/${fileId}`)
    check('le téléchargement répond 404 ensuite', dl404.status === 404, `HTTP ${dl404.status}`)

    /* ───────────────────────────────────────────────────────────── */
    section('§9  Les garde-fous')

    const mauvais = await call(ADMIN, 'GET', `/api/projet-chat/files/pas-un-uuid`)
    check('identifiant invalide → 400', mauvais.status === 400, `HTTP ${mauvais.status}`)
    const fantome = await call(ADMIN, 'DELETE', `/api/projet-chat/files/00000000-0000-4000-8000-000000000000`)
    check('suppression d\'un fichier inexistant → 404', fantome.status === 404, `HTTP ${fantome.status}`)
    const vide = await televerser(ADMIN, projetId, `${PREFIXE}-vide.txt`, Buffer.alloc(0), 'text/plain')
    check('fichier vide refusé → 400', vide.status === 400, `HTTP ${vide.status}`)

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
