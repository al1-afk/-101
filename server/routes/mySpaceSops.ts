/**
 * Module SOP de l'espace membre — monté sur /api/my-space/sops.
 *
 *   GET    /                       liste filtrée par mes accès
 *   GET    /editable-categories    catégories où je peux écrire
 *   GET    /categories             catalogue complet (fixes + créées)
 *   POST   /images                 téléverser une image
 *   GET    /images/:imageId        servir une image
 *   PATCH  /images/:imageId        légende / position
 *   DELETE /images/:imageId        supprimer une image
 *   POST   /activity               journaliser une consultation
 *   POST   /                       créer
 *   GET    /:id                    consulter
 *   PUT    /:id                    modifier (versionne l'état précédent)
 *   DELETE /:id                    supprimer définitivement
 *   PATCH  /:id/status             brouillon / actif / archivé
 *   PATCH  /:id/favorite           étoile
 *   POST   /:id/duplicate          dupliquer (contenu + images)
 *   GET    /:id/versions           historique
 *   POST   /:id/versions/:vid/restore   restaurer une version
 *
 * ── Droits ────────────────────────────────────────────────────────
 * team_member_sop_access accorde une catégorie à un membre avec un
 * niveau : read, complete, ou edit. Seul 'edit' autorise à créer,
 * modifier, archiver, dupliquer ou supprimer — et uniquement dans les
 * catégories concernées. Le contrôle est refait à chaque appel : le
 * client masque les boutons, le serveur refuse les actions.
 *
 * ── Images ────────────────────────────────────────────────────────
 * Les images vivent sur le volume Docker (UPLOAD_DIR), pas en base :
 * une capture de 4 Mo encodée en base64 dans le champ blocks pesait
 * 5,3 Mo de JSON rechargés à chaque ouverture de la liste, et se
 * retrouvait dans chaque sauvegarde PostgreSQL. Même patron que les
 * pièces jointes de discussion (server/routes/projetChat.ts).
 */
import { Router, type Request, type Response } from 'express'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdir, stat, unlink, copyFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { query, tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'
import { resolveMember, logActivity } from './mySpace'

const router = Router()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* Réservé aux membres, comme le reste de /api/my-space. */
router.use(requireAuth)
router.use((req: Request, res: Response, next) => {
  if (req.user?.role !== 'team_member') {
    return res.status(403).json({ error: 'Espace réservé aux membres' })
  }
  next()
})

const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production' ? '/app/uploads' : path.resolve(process.cwd(), 'uploads'))

const MAX_IMAGE_BYTES = Number(process.env.SOP_MAX_IMAGE_MB || 15) * 1024 * 1024
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

/* ── Aides ────────────────────────────────────────────────────────── */

/** Catégories accordées au membre, et sous-ensemble éditable. */
async function sopAccess(tenantId: string, memberId: string): Promise<{
  categories: string[]
  editable:   Set<string>
}> {
  const rows = await tenantQuery<{ sop_category: string; access_level: string }>(
    tenantId,
    `SELECT sop_category, access_level FROM public.team_member_sop_access WHERE team_member_id = $1`,
    [memberId],
  )
  return {
    categories: rows.map(r => r.sop_category),
    editable:   new Set(rows.filter(r => r.access_level === 'edit').map(r => r.sop_category)),
  }
}

/** Nom affichable du membre — « Prénom NOM », repli sur l'email. */
async function memberDisplayName(tenantId: string, memberId: string): Promise<string> {
  const me = await tenantQueryOne<{ prenom: string | null; nom: string | null; email: string }>(
    tenantId,
    `SELECT prenom, nom, email FROM public.team_members WHERE id = $1`,
    [memberId],
  )
  if (!me) return 'Membre'
  return [me.prenom, me.nom].filter(Boolean).join(' ').trim() || me.email
}

const SOP_COLUMNS = [
  'id', 'slug', 'title', 'description', 'category', 'tags', 'author', 'author_bg',
  'read_min', 'views', 'popular', 'status', 'difficulty', 'blocks',
  'created_by_name', 'updated_by_name', 'created_at', 'updated_at',
]
/** Sans alias — pour les RETURNING, où le préfixe n'a pas cours. */
const SOP_SELECT = SOP_COLUMNS.join(', ')
/** Préfixé — dès qu'une jointure entre en jeu : sop_favorites porte lui
 *  aussi un created_at, et PostgreSQL refuse la référence ambiguë. */
const SOP_SELECT_S = SOP_COLUMNS.map(c => `s.${c}`).join(', ')

/**
 * Valide et normalise le corps d'un SOP envoyé par un membre.
 *
 * blocks est borné explicitement : le body parser accepte 12 Mo, ce qui
 * suffirait à enregistrer un SOP illisible et à faire ramer la liste,
 * qui renvoie tous les blocs. 400 blocs couvrent très largement le plus
 * long SOP du catalogue (≈ 150 blocs).
 */
function parseSopBody(body: any): { error: string } | {
  title: string; description: string | null; category: string
  tags: string[]; read_min: number; blocks: any[]
  difficulty: string | null; diffProvided: boolean
  status: string; statusProvided: boolean
} {
  const title = String(body?.title ?? '').trim()
  if (title.length < 3)   return { error: 'Titre trop court (3 caractères minimum)' }
  if (title.length > 200) return { error: 'Titre trop long (200 caractères maximum)' }

  const category = String(body?.category ?? '').trim()
  if (!category)            return { error: 'Catégorie manquante' }
  if (category.length > 60) return { error: 'Nom de catégorie trop long (60 caractères maximum)' }

  const rawDesc = body?.description == null ? '' : String(body.description).trim()
  if (rawDesc.length > 500) return { error: 'Description trop longue (500 caractères maximum)' }

  if (body?.tags != null && !Array.isArray(body.tags)) return { error: 'tags invalide' }
  const tags = (Array.isArray(body?.tags) ? body.tags : [])
    .map((t: unknown) => String(t).trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((t: string) => t.slice(0, 40))

  const readMin = Number(body?.read_min)
  const read_min = Number.isFinite(readMin) ? Math.min(120, Math.max(1, Math.round(readMin))) : 2

  /* undefined ≠ null : une clé absente veut dire « ne touche pas »,
     une clé à null veut dire « efface ». Sans cette distinction, un
     client qui n'envoie pas le champ republiait un SOP archivé et
     effaçait sa difficulté au passage. */
  const diffProvided = body?.difficulty !== undefined
  const rawDiff = body?.difficulty == null ? '' : String(body.difficulty).trim()
  if (rawDiff && !['facile', 'moyen', 'difficile'].includes(rawDiff)) {
    return { error: 'Niveau de difficulté invalide' }
  }

  const statusProvided = body?.status !== undefined
  const status = String(body?.status ?? 'active').trim()
  if (!['draft', 'active', 'archived'].includes(status)) {
    return { error: 'Statut invalide' }
  }

  if (!Array.isArray(body?.blocks)) return { error: 'blocks doit être un tableau' }
  if (body.blocks.length > 400)     return { error: 'SOP trop long (400 blocs maximum)' }
  if (JSON.stringify(body.blocks).length > 400_000) {
    return { error: 'SOP trop volumineux (400 Ko maximum)' }
  }

  return {
    title, description: rawDesc || null, category, tags, read_min,
    blocks: body.blocks,
    difficulty: rawDiff || null, diffProvided,
    status, statusProvided,
  }
}

/** Slug stable dérivé du titre, suffixé tant qu'il est pris dans l'espace. */
async function uniqueSopSlug(tenantId: string, title: string, excludeId?: string): Promise<string> {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sop'

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const taken = await tenantQueryOne(
      tenantId,
      `SELECT 1 FROM public.sops WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`,
      [candidate, excludeId ?? null],
    )
    if (!taken) return candidate
  }
  return `${base}-${excludeId ?? 'x'}`.slice(0, 80)
}

/**
 * Autorise la catégorie demandée, en la créant au besoin.
 *
 * Créer une catégorie n'est pas une opération d'administration : c'est
 * simplement écrire un SOP dans une catégorie qui n'existait pas encore.
 * On s'accorde alors l'accès en édition, sinon la personne perdrait de
 * vue le SOP qu'elle vient d'écrire — team_member_sop_access étant ce
 * qui gouverne l'affichage.
 *
 * Garde-fou : réservé à qui possède déjà au moins une catégorie en
 * édition. Un membre en lecture seule ne peut pas se fabriquer un droit
 * d'écriture en inventant un nom de catégorie.
 */
async function ensureCategoryWritable(
  tenantId: string, memberId: string, category: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { editable } = await sopAccess(tenantId, memberId)
  if (editable.has(category)) return { ok: true }
  if (editable.size === 0) {
    return { ok: false, error: "Vous n'avez pas le droit d'écrire un SOP" }
  }

  /* La catégorie existe-t-elle déjà quelque part dans l'espace ? Si oui,
     c'est une catégorie d'autrui : on ne s'y invite pas tout seul. */
  const exists = await tenantQueryOne(
    tenantId,
    `SELECT 1 FROM public.sops WHERE category = $1
      UNION ALL
     SELECT 1 FROM public.team_member_sop_access WHERE sop_category = $1
     LIMIT 1`,
    [category],
  )
  if (exists) {
    return { ok: false, error: "Vous n'avez pas le droit d'écrire dans cette catégorie" }
  }

  await tenantQuery(
    tenantId,
    `INSERT INTO public.team_member_sop_access (tenant_id, team_member_id, sop_category, access_level)
     VALUES ($1, $2, $3, 'edit')
     ON CONFLICT (team_member_id, sop_category) DO NOTHING`,
    [tenantId, memberId, category],
  )
  return { ok: true }
}

/** Le membre peut-il modifier ce SOP ? Renvoie le SOP, ou null. */
async function loadEditableSop(tenantId: string, memberId: string, id: string) {
  const sop = await tenantQueryOne<{ id: string; category: string; title: string }>(
    tenantId, `SELECT id, category, title FROM public.sops WHERE id = $1`, [id],
  )
  if (!sop) return { sop: null, allowed: false }
  const { editable } = await sopAccess(tenantId, memberId)
  return { sop, allowed: editable.has(sop.category) }
}

/**
 * Fige l'état courant d'un SOP dans l'historique.
 *
 * Appelé AVANT chaque écriture : une version représente ce qui existait
 * avant la modification, sinon « restaurer cette version » restaurerait
 * l'état qu'on vient tout juste de remplacer.
 */
async function snapshotVersion(tenantId: string, sopId: string, authorName: string): Promise<void> {
  try {
    await tenantQuery(
      tenantId,
      `INSERT INTO public.sop_versions
         (tenant_id, sop_id, version_number, title, description, category, tags,
          read_min, difficulty, blocks, author_name)
       SELECT s.tenant_id, s.id,
              COALESCE((SELECT MAX(version_number) FROM public.sop_versions WHERE sop_id = s.id), 0) + 1,
              s.title, s.description, s.category, s.tags, s.read_min, s.difficulty, s.blocks, $2
         FROM public.sops s WHERE s.id = $1`,
      [sopId, authorName],
    )
  } catch (e: any) {
    /* Un historique qui échoue ne doit pas empêcher d'enregistrer. */
    logger.error('[my-space:sop-version]', e.message)
  }
}

/* ══ ROUTES STATIQUES — avant /:id, sinon Express les avale ══════════ */

/**
 * GET / — la liste, strictement filtrée par mes accès.
 *
 * Les archivés sortent des listes par défaut : c'est le sens même de
 * l'archivage. `?status=archived` les affiche, `?status=all` montre tout.
 * Les brouillons ne s'affichent que dans les catégories où l'on écrit —
 * un lecteur n'a pas à voir le travail en cours des autres.
 */
router.get('/', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  try {
    const { categories, editable } = await sopAccess(m.tenantId, m.id)
    if (!categories.length) return res.json([])

    const filterByCat = typeof req.query.category === 'string' ? req.query.category : null
    if (filterByCat && !categories.includes(filterByCat)) {
      return res.status(403).json({ error: 'Catégorie non autorisée' })
    }
    const cats = filterByCat ? [filterByCat] : categories

    const wanted = typeof req.query.status === 'string' ? req.query.status : 'active'
    const statusFilter =
      wanted === 'archived' ? `status = 'archived'`
      : wanted === 'all'    ? `TRUE`
      : `status <> 'archived'`

    const sops = await tenantQuery<{ category: string; status: string }>(
      m.tenantId,
      `SELECT ${SOP_SELECT_S},
              (SELECT COUNT(*)::int FROM public.sop_images i WHERE i.sop_id = s.id) AS image_count,
              (f.sop_id IS NOT NULL) AS is_favorite
         FROM public.sops s
         LEFT JOIN public.sop_favorites f
                ON f.sop_id = s.id AND f.team_member_id = $2
        WHERE s.category = ANY($1::text[]) AND ${statusFilter.replace(/\bstatus\b/g, 's.status')}
        ORDER BY (f.sop_id IS NOT NULL) DESC, s.updated_at DESC`,
      [cats, m.id],
    )

    res.json(
      sops
        .filter(s => s.status !== 'draft' || editable.has(s.category))
        .map(s => ({ ...s, can_edit: editable.has(s.category) })),
    )
  } catch (err: any) {
    logger.error('[my-space:sops]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /editable-categories — où j'ai le droit d'écrire */
router.get('/editable-categories', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  try {
    const { editable } = await sopAccess(m.tenantId, m.id)
    res.json(Array.from(editable))
  } catch (err: any) {
    logger.error('[my-space:sop-editable]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * GET /categories — le catalogue tel qu'il existe réellement.
 *
 * Les 16 catégories du référentiel ne sont pas la vérité : une catégorie
 * créée à la volée existe dès qu'un SOP l'utilise. On renvoie donc ce
 * qui est réellement accordé au membre, avec le compte par catégorie.
 */
router.get('/categories', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  try {
    const { categories, editable } = await sopAccess(m.tenantId, m.id)
    if (!categories.length) return res.json([])
    const counts = await tenantQuery<{ category: string; total: number }>(
      m.tenantId,
      `SELECT category, COUNT(*)::int AS total
         FROM public.sops
        WHERE category = ANY($1::text[]) AND status <> 'archived'
        GROUP BY category`,
      [categories],
    )
    const byCat = new Map(counts.map(c => [c.category, c.total]))
    res.json(categories.map(c => ({
      key:      c,
      total:    byCat.get(c) ?? 0,
      can_edit: editable.has(c),
    })))
  } catch (err: any) {
    logger.error('[my-space:sop-categories]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * POST /images — le corps de la requête EST l'image.
 *
 * En-têtes : x-filename (encodé) et content-type. Le flux est écrit au
 * fil de l'eau : rien n'est bufferisé en mémoire, et le compteur coupe
 * dès le dépassement plutôt que de remplir le disque avant de refuser.
 *
 * L'image est créée orpheline (sop_id NULL) : elle est téléversée avant
 * que le SOP existe. Le rattachement se fait à l'enregistrement.
 */
router.post('/images', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const { editable } = await sopAccess(m.tenantId, m.id)
  if (editable.size === 0) {
    return res.status(403).json({ error: "Vous n'avez pas le droit d'ajouter une image" })
  }

  const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return res.status(415).json({ error: 'Format non accepté — JPG, PNG ou WEBP uniquement' })
  }

  const rawName = String(req.headers['x-filename'] ?? '')
  let filename = 'image'
  try { filename = decodeURIComponent(rawName) || 'image' } catch { filename = rawName || 'image' }
  filename = filename.replace(/[\r\n]/g, '').slice(0, 255)

  const declared = Number(req.headers['content-length'] ?? 0)
  const maxMo = Math.round(MAX_IMAGE_BYTES / 1024 / 1024)
  if (declared && declared > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: `Image trop volumineuse (${maxMo} Mo maximum)` })
  }

  /* Le nom d'origine reste une étiquette : il ne participe jamais au
     chemin sur le disque, donc aucune traversée possible via « ../ ». */
  const ext = ({ 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' } as const)[mime as 'image/png']
  const relPath = path.join('sop-images', m.tenantId, `${randomUUID()}${ext ?? '.img'}`)
  const absPath = path.join(UPLOAD_DIR, relPath)

  try {
    await mkdir(path.dirname(absPath), { recursive: true })
  } catch (e: any) {
    logger.error('[my-space:sop-image-mkdir]', e.message)
    return res.status(500).json({ error: 'Stockage indisponible' })
  }

  let written = 0
  let aborted = false
  const out = createWriteStream(absPath)
  const cleanup = async () => { try { await unlink(absPath) } catch { /* déjà absent */ } }

  req.on('data', (chunk: Buffer) => {
    written += chunk.length
    if (written > MAX_IMAGE_BYTES && !aborted) {
      aborted = true
      out.destroy(); req.destroy(); void cleanup()
      if (!res.headersSent) res.status(413).json({ error: `Image trop volumineuse (${maxMo} Mo maximum)` })
    }
  })
  req.on('error', () => { aborted = true; out.destroy(); void cleanup() })
  out.on('error', (e) => {
    logger.error('[my-space:sop-image-write]', e.message)
    aborted = true; void cleanup()
    if (!res.headersSent) res.status(500).json({ error: 'Écriture impossible' })
  })

  out.on('finish', async () => {
    if (aborted) return
    try {
      const st = await stat(absPath)
      if (st.size === 0) { await cleanup(); return res.status(400).json({ error: 'Image vide' }) }
      const who = await memberDisplayName(m.tenantId, m.id)
      const row = await tenantQueryOne(
        m.tenantId,
        `INSERT INTO public.sop_images
           (tenant_id, filename, mime, size_bytes, storage_path, uploader_name, uploader_member_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, filename, mime, size_bytes, caption, position, created_at`,
        [m.tenantId, filename, mime, st.size, relPath, who, m.id],
      )
      res.status(201).json(row)
    } catch (e: any) {
      logger.error('[my-space:sop-image-row]', e.message)
      await cleanup()
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
    }
  })

  req.pipe(out)
})

/**
 * GET /images/:imageId — servir une image.
 *
 * Rattachée à un SOP : il faut avoir accès à sa catégorie. Encore
 * orpheline : seul son téléverseur peut la voir, sinon un identifiant
 * deviné donnerait accès au brouillon d'autrui.
 */
router.get('/images/:imageId', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const imageId = String(req.params.imageId)
  if (!UUID_RE.test(imageId)) return res.status(400).json({ error: 'Image invalide' })

  try {
    const img = await tenantQueryOne<{
      sop_id: string | null; filename: string; mime: string
      storage_path: string; size_bytes: string; uploader_member_id: string | null
    }>(
      m.tenantId,
      `SELECT sop_id, filename, mime, storage_path, size_bytes, uploader_member_id
         FROM public.sop_images WHERE id = $1`,
      [imageId],
    )
    if (!img) return res.status(404).json({ error: 'Image introuvable' })

    if (img.sop_id) {
      const sop = await tenantQueryOne<{ category: string }>(
        m.tenantId, `SELECT category FROM public.sops WHERE id = $1`, [img.sop_id],
      )
      const { categories } = await sopAccess(m.tenantId, m.id)
      if (!sop || !categories.includes(sop.category)) {
        return res.status(403).json({ error: 'Accès refusé' })
      }
    } else if (img.uploader_member_id !== m.id) {
      return res.status(403).json({ error: 'Accès refusé' })
    }

    const absPath = path.join(UPLOAD_DIR, img.storage_path)
    if (!absPath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
      return res.status(400).json({ error: 'Chemin invalide' })
    }

    res.setHeader('Content-Type', img.mime)
    res.setHeader('Content-Length', img.size_bytes)
    res.setHeader('Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(img.filename)}`)
    res.setHeader('Cache-Control', 'private, max-age=86400')

    const stream = createReadStream(absPath)
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Fichier absent du stockage' })
      else res.end()
    })
    stream.pipe(res)
  } catch (err: any) {
    logger.error('[my-space:sop-image-get]', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PATCH /images/:imageId — légende et position (réorganisation) */
router.patch('/images/:imageId', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const imageId = String(req.params.imageId)
  if (!UUID_RE.test(imageId)) return res.status(400).json({ error: 'Image invalide' })

  const caption  = req.body?.caption == null ? null : String(req.body.caption).slice(0, 300)
  const rawPos   = Number(req.body?.position)
  const position = Number.isFinite(rawPos) ? Math.max(0, Math.round(rawPos)) : null

  try {
    const img = await tenantQueryOne<{ sop_id: string | null; uploader_member_id: string | null }>(
      m.tenantId, `SELECT sop_id, uploader_member_id FROM public.sop_images WHERE id = $1`, [imageId],
    )
    if (!img) return res.status(404).json({ error: 'Image introuvable' })

    if (img.sop_id) {
      const { allowed } = await loadEditableSop(m.tenantId, m.id, img.sop_id)
      if (!allowed) return res.status(403).json({ error: 'Modification non autorisée' })
    } else if (img.uploader_member_id !== m.id) {
      return res.status(403).json({ error: 'Modification non autorisée' })
    }

    const row = await tenantQueryOne(
      m.tenantId,
      `UPDATE public.sop_images
          SET caption  = COALESCE($2, caption),
              position = COALESCE($3, position)
        WHERE id = $1
        RETURNING id, filename, mime, size_bytes, caption, position, created_at`,
      [imageId, caption, position],
    )
    res.json(row)
  } catch (err: any) {
    logger.error('[my-space:sop-image-patch]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* DELETE /images/:imageId — retire la ligne ET le fichier */
router.delete('/images/:imageId', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const imageId = String(req.params.imageId)
  if (!UUID_RE.test(imageId)) return res.status(400).json({ error: 'Image invalide' })

  try {
    const img = await tenantQueryOne<{ sop_id: string | null; storage_path: string; uploader_member_id: string | null }>(
      m.tenantId,
      `SELECT sop_id, storage_path, uploader_member_id FROM public.sop_images WHERE id = $1`,
      [imageId],
    )
    if (!img) return res.status(404).json({ error: 'Image introuvable' })

    if (img.sop_id) {
      const { allowed } = await loadEditableSop(m.tenantId, m.id, img.sop_id)
      if (!allowed) return res.status(403).json({ error: 'Suppression non autorisée' })
    } else if (img.uploader_member_id !== m.id) {
      return res.status(403).json({ error: 'Suppression non autorisée' })
    }

    await tenantQuery(m.tenantId, `DELETE FROM public.sop_images WHERE id = $1`, [imageId])
    /* Le fichier part après la ligne : si l'unlink échoue on laisse un
       orphelin sur le disque, ce qui est préférable à une ligne qui
       pointe vers un fichier disparu. */
    try { await unlink(path.join(UPLOAD_DIR, img.storage_path)) } catch { /* déjà absent */ }
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[my-space:sop-image-delete]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /activity — journaliser une consultation ou une checklist */
router.post('/activity', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const { sop_id, action_type, details } = req.body
  if (!sop_id || !UUID_RE.test(sop_id)) return res.status(400).json({ error: 'sop_id invalide' })
  const validTypes = new Set(['sop_viewed', 'sop_checklist_completed', 'sop_marked_read', 'sop_note_added'])
  if (!validTypes.has(action_type)) return res.status(400).json({ error: 'action_type invalide' })

  try {
    const sop = await tenantQueryOne<{ category: string; title: string }>(
      m.tenantId, `SELECT category, title FROM public.sops WHERE id = $1`, [sop_id],
    )
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })
    const { categories } = await sopAccess(m.tenantId, m.id)
    if (!categories.includes(sop.category)) return res.status(403).json({ error: 'Accès non autorisé' })

    await logActivity(
      m.tenantId, m.id, action_type,
      { sop_id, sop_title: sop.title, category: sop.category, ...(typeof details === 'object' && details ? details : {}) },
      req.ip, req.headers['user-agent'] as string,
    )
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[my-space:sop-activity]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * POST / — créer un SOP.
 * `image_ids` rattache les images déjà téléversées ; le filtre sur
 * sop_id IS NULL empêche de s'approprier l'image d'un autre SOP.
 */
router.post('/', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })

  const parsed = parseSopBody(req.body)
  if ('error' in parsed) return res.status(400).json({ error: parsed.error })

  const imageIds: string[] = Array.isArray(req.body?.image_ids)
    ? req.body.image_ids.filter((x: unknown) => typeof x === 'string' && UUID_RE.test(x)).slice(0, 100)
    : []

  try {
    const perm = await ensureCategoryWritable(m.tenantId, m.id, parsed.category)
    if (!perm.ok) return res.status(403).json({ error: perm.error })

    const author = await memberDisplayName(m.tenantId, m.id)
    const slug   = await uniqueSopSlug(m.tenantId, parsed.title)

    const created = await tenantQueryOne<{ id: string }>(
      m.tenantId,
      `INSERT INTO public.sops
         (tenant_id, slug, title, description, category, tags, author, read_min,
          difficulty, status, blocks, created_by_name, updated_by_name)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $7, $7)
       RETURNING ${SOP_SELECT}`,
      [m.tenantId, slug, parsed.title, parsed.description, parsed.category,
       JSON.stringify(parsed.tags), author, parsed.read_min, parsed.difficulty,
       parsed.status, JSON.stringify(parsed.blocks)],
    )

    if (imageIds.length) {
      await tenantQuery(
        m.tenantId,
        `UPDATE public.sop_images SET sop_id = $1
          WHERE id = ANY($2::uuid[]) AND sop_id IS NULL AND uploader_member_id = $3`,
        [created!.id, imageIds, m.id],
      )
    }

    res.status(201).json({ ...(created as any), can_edit: true })
  } catch (err: any) {
    logger.error('[my-space:sop-create]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ══ ROUTES SUR UN SOP ══════════════════════════════════════════════ */

/* GET /:id/versions — historique, du plus récent au plus ancien */
router.get('/:id/versions', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const sop = await tenantQueryOne<{ category: string }>(
      m.tenantId, `SELECT category FROM public.sops WHERE id = $1`, [id],
    )
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })
    const { categories, editable } = await sopAccess(m.tenantId, m.id)
    if (!categories.includes(sop.category)) return res.status(403).json({ error: 'Accès refusé' })

    const versions = await tenantQuery(
      m.tenantId,
      `SELECT id, version_number, title, description, category, read_min, difficulty,
              author_name, created_at,
              jsonb_array_length(blocks) AS block_count
         FROM public.sop_versions WHERE sop_id = $1
        ORDER BY version_number DESC LIMIT 50`,
      [id],
    )
    res.json({ versions, can_restore: editable.has(sop.category) })
  } catch (err: any) {
    logger.error('[my-space:sop-versions]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * POST /:id/versions/:versionId/restore
 * L'état courant est lui-même versionné avant d'être remplacé : une
 * restauration reste annulable.
 */
router.post('/:id/versions/:versionId/restore', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const id  = String(req.params.id)
  const vid = String(req.params.versionId)
  if (!UUID_RE.test(id) || !UUID_RE.test(vid)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const { sop, allowed } = await loadEditableSop(m.tenantId, m.id, id)
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })
    if (!allowed) return res.status(403).json({ error: 'Restauration non autorisée' })

    const v = await tenantQueryOne<any>(
      m.tenantId,
      `SELECT title, description, category, tags, read_min, difficulty, blocks, version_number
         FROM public.sop_versions WHERE id = $1 AND sop_id = $2`,
      [vid, id],
    )
    if (!v) return res.status(404).json({ error: 'Version introuvable' })

    const who = await memberDisplayName(m.tenantId, m.id)
    await snapshotVersion(m.tenantId, id, who)

    const row = await tenantQueryOne(
      m.tenantId,
      `UPDATE public.sops
          SET title = $2, description = $3, tags = $4::jsonb, read_min = $5,
              difficulty = $6, blocks = $7::jsonb, updated_by_name = $8, updated_at = NOW()
        WHERE id = $1
        RETURNING ${SOP_SELECT}`,
      [id, v.title, v.description, JSON.stringify(v.tags ?? []), v.read_min,
       v.difficulty, JSON.stringify(v.blocks ?? []), who],
    )
    res.json({ ...(row as any), can_edit: true, restored_from: v.version_number })
  } catch (err: any) {
    logger.error('[my-space:sop-restore]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * POST /:id/duplicate — copie complète, images comprises.
 * Les fichiers sont recopiés sur le disque : deux lignes qui pointent
 * le même fichier feraient qu'en supprimant l'une, l'autre afficherait
 * une image manquante.
 */
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const src = await tenantQueryOne<any>(
      m.tenantId,
      `SELECT title, description, category, tags, read_min, difficulty, blocks
         FROM public.sops WHERE id = $1`,
      [id],
    )
    if (!src) return res.status(404).json({ error: 'SOP introuvable' })

    const { editable } = await sopAccess(m.tenantId, m.id)
    if (!editable.has(src.category)) {
      return res.status(403).json({ error: 'Duplication non autorisée dans cette catégorie' })
    }

    const who   = await memberDisplayName(m.tenantId, m.id)
    const title = `Copie de ${src.title}`.slice(0, 200)
    const slug  = await uniqueSopSlug(m.tenantId, title)

    const copy = await tenantQueryOne<{ id: string }>(
      m.tenantId,
      `INSERT INTO public.sops
         (tenant_id, slug, title, description, category, tags, author, read_min,
          difficulty, status, blocks, created_by_name, updated_by_name)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, 'draft', $10::jsonb, $7, $7)
       RETURNING ${SOP_SELECT}`,
      [m.tenantId, slug, title, src.description, src.category, JSON.stringify(src.tags ?? []),
       who, src.read_min, src.difficulty, JSON.stringify(src.blocks ?? [])],
    )

    /* Copie des images : nouveau fichier, nouvelle ligne, et le bloc du
       contenu qui pointait l'ancienne image est réécrit vers la copie. */
    const images = await tenantQuery<any>(
      m.tenantId,
      `SELECT id, filename, mime, size_bytes, storage_path, caption, position
         FROM public.sop_images WHERE sop_id = $1 ORDER BY position`,
      [id],
    )
    const idMap = new Map<string, string>()
    for (const img of images) {
      const ext     = path.extname(img.storage_path)
      const relPath = path.join('sop-images', m.tenantId, `${randomUUID()}${ext}`)
      const absDest = path.join(UPLOAD_DIR, relPath)
      try {
        await mkdir(path.dirname(absDest), { recursive: true })
        await copyFile(path.join(UPLOAD_DIR, img.storage_path), absDest)
      } catch (e: any) {
        /* Échec de copie : la copie référencerait le fichier de
           l'original, et supprimer l'original casserait la copie.
           On annule plutôt que de livrer un duplicata piégé. */
        logger.error('[my-space:sop-duplicate-file]', e.message)
        await tenantQuery(m.tenantId, `DELETE FROM public.sops WHERE id = $1`, [copy!.id])
        return res.status(500).json({ error: "Copie des images impossible — duplication annulée" })
      }
      const newImg = await tenantQueryOne<{ id: string }>(
        m.tenantId,
        `INSERT INTO public.sop_images
           (tenant_id, sop_id, filename, mime, size_bytes, storage_path, caption, position,
            uploader_name, uploader_member_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [m.tenantId, copy!.id, img.filename, img.mime, img.size_bytes, relPath,
         img.caption, img.position, who, m.id],
      )
      if (newImg) idMap.set(img.id, newImg.id)
    }

    if (idMap.size) {
      let json = JSON.stringify(src.blocks ?? [])
      for (const [oldId, newId] of idMap) json = json.split(oldId).join(newId)
      await tenantQuery(
        m.tenantId, `UPDATE public.sops SET blocks = $2::jsonb WHERE id = $1`, [copy!.id, json],
      )
    }

    const fresh = await tenantQueryOne(
      m.tenantId, `SELECT ${SOP_SELECT} FROM public.sops WHERE id = $1`, [copy!.id],
    )
    res.status(201).json({ ...(fresh as any), can_edit: true })
  } catch (err: any) {
    logger.error('[my-space:sop-duplicate]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PATCH /:id/status — brouillon / actif / archivé */
router.patch('/:id/status', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  const status = String(req.body?.status ?? '')
  if (!['draft', 'active', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' })
  }

  try {
    const { sop, allowed } = await loadEditableSop(m.tenantId, m.id, id)
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })
    if (!allowed) return res.status(403).json({ error: 'Action non autorisée' })

    const who = await memberDisplayName(m.tenantId, m.id)
    const row = await tenantQueryOne(
      m.tenantId,
      `UPDATE public.sops SET status = $2, updated_by_name = $3, updated_at = NOW()
        WHERE id = $1 RETURNING ${SOP_SELECT}`,
      [id, status, who],
    )
    res.json({ ...(row as any), can_edit: true })
  } catch (err: any) {
    logger.error('[my-space:sop-status]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * PATCH /:id/favorite — l'étoile, personnelle.
 *
 * Volontairement ouverte à qui a simplement accès au SOP : marquer une
 * procédure comme utile est un geste de lecteur, pas de rédacteur.
 * Rien n'est visible des autres — sops.popular, qui pilote la mise en
 * avant commune et le compteur « Populaires » de /sop, n'est pas touché.
 */
router.patch('/:id/favorite', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  const favorite = req.body?.favorite
  if (typeof favorite !== 'boolean') return res.status(400).json({ error: 'favorite doit être un booléen' })

  try {
    const sop = await tenantQueryOne<{ category: string }>(
      m.tenantId, `SELECT category FROM public.sops WHERE id = $1`, [id],
    )
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })
    const { categories } = await sopAccess(m.tenantId, m.id)
    if (!categories.includes(sop.category)) return res.status(403).json({ error: 'Accès refusé' })

    if (favorite) {
      await tenantQuery(
        m.tenantId,
        `INSERT INTO public.sop_favorites (tenant_id, team_member_id, sop_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [m.tenantId, m.id, id],
      )
    } else {
      await tenantQuery(
        m.tenantId,
        `DELETE FROM public.sop_favorites WHERE team_member_id = $1 AND sop_id = $2`,
        [m.id, id],
      )
    }
    res.json({ id, is_favorite: favorite })
  } catch (err: any) {
    logger.error('[my-space:sop-favorite]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PUT /:id — modifier. L'état précédent part dans l'historique. */
router.put('/:id', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  const parsed = parseSopBody(req.body)
  if ('error' in parsed) return res.status(400).json({ error: parsed.error })

  const imageIds: string[] = Array.isArray(req.body?.image_ids)
    ? req.body.image_ids.filter((x: unknown) => typeof x === 'string' && UUID_RE.test(x)).slice(0, 100)
    : []

  try {
    const existing = await tenantQueryOne<{ category: string; title: string }>(
      m.tenantId, `SELECT category, title FROM public.sops WHERE id = $1`, [id],
    )
    if (!existing) return res.status(404).json({ error: 'SOP introuvable' })

    /* Droit sur la catégorie de départ ET d'arrivée : sans quoi on
       sortirait un SOP de son périmètre, ou on en ferait entrer un
       qu'on n'a pas le droit de toucher. */
    const { editable } = await sopAccess(m.tenantId, m.id)
    if (!editable.has(existing.category)) {
      return res.status(403).json({ error: "Vous n'avez pas le droit de modifier ce SOP" })
    }
    const perm = await ensureCategoryWritable(m.tenantId, m.id, parsed.category)
    if (!perm.ok) return res.status(403).json({ error: perm.error })

    const who  = await memberDisplayName(m.tenantId, m.id)
    await snapshotVersion(m.tenantId, id, who)

    const slug = await uniqueSopSlug(m.tenantId, parsed.title, id)
    /* COALESCE sur un paramètre laissé à NULL quand la clé était absente :
       modifier le texte d'un SOP archivé ne doit pas le republier. */
    const row  = await tenantQueryOne(
      m.tenantId,
      `UPDATE public.sops
          SET title = $2, description = $3, category = $4, tags = $5::jsonb,
              read_min = $6,
              difficulty = CASE WHEN $7::boolean THEN $8 ELSE difficulty END,
              status     = CASE WHEN $9::boolean THEN $10 ELSE status END,
              blocks = $11::jsonb,
              slug = $12, updated_by_name = $13, updated_at = NOW()
        WHERE id = $1
        RETURNING ${SOP_SELECT}`,
      [id, parsed.title, parsed.description, parsed.category, JSON.stringify(parsed.tags),
       parsed.read_min,
       parsed.diffProvided, parsed.difficulty,
       parsed.statusProvided, parsed.status,
       JSON.stringify(parsed.blocks), slug, who],
    )

    if (imageIds.length) {
      await tenantQuery(
        m.tenantId,
        `UPDATE public.sop_images SET sop_id = $1
          WHERE id = ANY($2::uuid[]) AND sop_id IS NULL AND uploader_member_id = $3`,
        [id, imageIds, m.id],
      )
    }

    res.json({ ...(row as any), can_edit: true })
  } catch (err: any) {
    logger.error('[my-space:sop-update]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* DELETE /:id — suppression définitive, fichiers d'images compris */
router.delete('/:id', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const { sop, allowed } = await loadEditableSop(m.tenantId, m.id, id)
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })
    if (!allowed) return res.status(403).json({ error: 'Suppression non autorisée' })

    /* Les chemins sont relevés AVANT le DELETE : la cascade emporte les
       lignes sop_images, et on ne saurait plus quoi effacer sur disque. */
    const images = await tenantQuery<{ storage_path: string }>(
      m.tenantId, `SELECT storage_path FROM public.sop_images WHERE sop_id = $1`, [id],
    )

    await tenantQuery(m.tenantId, `DELETE FROM public.sops WHERE id = $1`, [id])

    for (const img of images) {
      try { await unlink(path.join(UPLOAD_DIR, img.storage_path)) } catch { /* déjà absent */ }
    }

    await logActivity(m.tenantId, m.id, 'sop_deleted', { sop_id: id, sop_title: sop.title },
      req.ip, req.headers['user-agent'] as string)
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[my-space:sop-delete]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /:id — la fiche complète, avec ses images */
router.get('/:id', async (req: Request, res: Response) => {
  const m = await resolveMember(req)
  if (!m) return res.status(403).json({ error: 'Compte inactif' })
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const sop = await tenantQueryOne<{ category: string }>(
      m.tenantId,
      `SELECT ${SOP_SELECT_S},
              EXISTS (SELECT 1 FROM public.sop_favorites f
                       WHERE f.sop_id = s.id AND f.team_member_id = $2) AS is_favorite
         FROM public.sops s WHERE s.id = $1`,
      [id, m.id],
    )
    if (!sop) return res.status(404).json({ error: 'SOP introuvable' })

    const { categories, editable } = await sopAccess(m.tenantId, m.id)
    if (!categories.includes(sop.category)) {
      return res.status(403).json({ error: 'Accès non autorisé à ce SOP' })
    }

    const images = await tenantQuery(
      m.tenantId,
      `SELECT id, filename, mime, size_bytes, caption, position, created_at
         FROM public.sop_images WHERE sop_id = $1 ORDER BY position, created_at`,
      [id],
    )

    /* Compteur de consultations — au mieux, sans bloquer la réponse. */
    tenantQuery(m.tenantId, `UPDATE public.sops SET views = views + 1 WHERE id = $1`, [id]).catch(() => {})

    res.json({ ...(sop as any), images, can_edit: editable.has(sop.category) })
  } catch (err: any) {
    logger.error('[my-space:sop-get]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * Purge des images orphelines.
 *
 * Une image est téléversée AVANT que le SOP existe. Si la personne
 * abandonne son brouillon, la ligne reste avec sop_id NULL et le fichier
 * reste sur le volume — définitivement, sans ce ménage. On laisse 24 h :
 * largement de quoi finir la rédaction commencée la veille.
 */
export async function purgeOrphanSopImages(): Promise<number> {
  try {
    const rows = await query<{ id: string; tenant_id: string; storage_path: string }>(
      `SELECT id, tenant_id, storage_path FROM public.sop_images
        WHERE sop_id IS NULL AND created_at < NOW() - INTERVAL '24 hours'
        LIMIT 500`,
    )
    for (const r of rows) {
      await query(`DELETE FROM public.sop_images WHERE id = $1`, [r.id])
      try { await unlink(path.join(UPLOAD_DIR, r.storage_path)) } catch { /* déjà absent */ }
    }
    if (rows.length) logger.info(`[sop-images] ${rows.length} image(s) orpheline(s) purgée(s)`)
    return rows.length
  } catch (e: any) {
    logger.error('[sop-images:purge]', e.message)
    return 0
  }
}

/** Ménage au démarrage (après 60 s), puis une fois par jour. */
export function startSopImageCleanup(): void {
  setTimeout(() => { void purgeOrphanSopImages() }, 60_000)
  setInterval(() => { void purgeOrphanSopImages() }, 24 * 60 * 60 * 1000)
  logger.info('[sop-images] purge des orphelines planifiée (1er passage dans 60s)')
}

export default router
