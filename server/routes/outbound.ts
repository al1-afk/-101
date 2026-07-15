/**
 * Module OUTBOUND MARKETING — routes API
 *
 * Base : /api/outbound
 *
 * Séparation stricte avec le CRM Prospects existant (/api/prospects).
 *
 * RBAC :
 *   admin       → SUPER_ADMIN     (aucune restriction)
 *   manager     → OUTBOUND_MANAGER (voit tous, peut réaffecter)
 *   commercial  → OUTBOUND_AGENT   (voit uniquement ses prospects)
 *
 * Sécurité :
 *   - tenant_id posé par SET LOCAL app.current_tenant (RLS)
 *   - owner_id / assigned_to_id filtré dans les WHERE selon le rôle
 *   - Un commercial ne peut jamais changer assigned_to_id
 *   - Un commercial ne peut jamais changer converted_to_crm
 */
import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'
import * as googlePlaces from '../lib/googlePlaces'
import * as whatsappCloud from '../lib/whatsappCloud'
import * as aiEmailGen from '../lib/aiEmailGen'
import { verifyEmail, verifyPhoneFormat } from '../lib/verifyContact'
import { sendEmail } from '../lib/email'
import { buildOutboundEmailHtml } from '../lib/outboundEmailTemplate'

const router = Router()
router.use(requireAuth)

/* Rate limit dédié aux routes qui appellent des APIs externes / payantes
   (Google, Claude, WhatsApp Cloud, SMTP). Plus strict que le global. */
const outboundExternalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite d\'appels externes atteinte (30/min). Réessayez dans une minute.' },
})

/* ─────────────────────────────────────────────────────────────────
   Helpers RBAC
───────────────────────────────────────────────────────────────── */

type OutboundRole = 'super_admin' | 'manager' | 'agent'

function roleOf(req: Request): OutboundRole {
  const r = (req.user?.role ?? '').toLowerCase()
  if (r === 'admin') return 'super_admin'
  if (r === 'manager') return 'manager'
  return 'agent' /* commercial → agent Outbound ; les autres rôles n'accèdent pas au module */
}

function canManageAll(role: OutboundRole): boolean {
  return role === 'super_admin' || role === 'manager'
}

/* Middleware — bloque explicitement viewer / comptable qui n'ont pas leur place ici */
function requireOutboundAccess(req: Request, res: Response, next: any) {
  const r = (req.user?.role ?? '').toLowerCase()
  if (!['admin', 'manager', 'commercial'].includes(r)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' })
  }
  next()
}
router.use(requireOutboundAccess)

/* Whitelist de colonnes autorisées à l'écriture — refus silencieux sinon.
   On accepte volontairement un large set, mais on interdit strictement les
   colonnes de contrôle serveur (tenant_id, converted_*, dates système). */
const PROSPECT_WRITE_COLUMNS = new Set([
  'nom_contact','prenom_contact','entreprise','fonction','taille_entreprise','description',
  'secteur_id','sous_secteur_id',
  'telephone','whatsapp','email','email_secondaire','site_web',
  'linkedin_url','instagram_url','facebook_url','google_maps_url',
  'adresse','ville','region','pays',
  'source_id','source_libre','campaign_id','statut','priorite','niveau_interet','canal_prefere',
  'nb_tentatives','valeur_potentielle','service_propose',
  'motif_perte','motif_refus','ne_plus_contacter',
  'date_dernier_contact','date_prochaine_relance',
  'notes','tags',
])
/* Colonnes que seul admin/manager peuvent modifier (agent = interdit) */
const MANAGER_ONLY_COLUMNS = new Set(['assigned_to_id','owner_id'])

function normalizeValues(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (v === '') return [k, null]
      if (v === null || v === undefined) return [k, v]
      if (Array.isArray(v) || (typeof v === 'object' && (v as object).constructor === Object)) {
        return [k, JSON.stringify(v)]
      }
      return [k, v]
    })
  )
}

/* Où qu'on soit, applique le filtre agent : uniquement les prospects
   dont assigned_to_id = user connecté. */
function ownershipWhere(role: OutboundRole, userId: string, alias = ''): { sql: string; params: any[] } {
  if (canManageAll(role)) return { sql: '', params: [] }
  const col = alias ? `${alias}.assigned_to_id` : 'assigned_to_id'
  return { sql: ` AND ${col} = $__`, params: [userId] }
}

/* Rendu final d'une clause où on ne connaît pas l'ordre des placeholders — on
   remplace $__ par $N. */
function buildWhere(base: string, extra: { sql: string; params: any[] }, startIdx: number) {
  let sql = base
  let idx = startIdx
  if (extra.sql) {
    const filled = extra.sql.replace(/\$__/g, () => `$${idx++}`)
    sql += filled
  }
  return { sql, params: extra.params, nextIdx: idx }
}

/* ─────────────────────────────────────────────────────────────────
   SECTEURS
───────────────────────────────────────────────────────────────── */
router.get('/sectors', async (req: Request, res: Response) => {
  try {
    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT * FROM outbound_sectors WHERE tenant_id = $1 ORDER BY ordre, nom`, [req.user!.tenantId])
    res.json(rows)
  } catch (e: any) {
    logger.error('[outbound/sectors GET]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/sectors', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const { nom, parent_id, couleur, icone, actif, ordre } = req.body ?? {}
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `INSERT INTO outbound_sectors (tenant_id, nom, parent_id, couleur, icone, actif, ordre)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user!.tenantId, nom.trim(), parent_id || null, couleur || '#64748B', icone || null, actif ?? true, ordre ?? 0])
    res.status(201).json(row)
  } catch (e: any) {
    logger.error('[outbound/sectors POST]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/sectors/:id', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const allowed = ['nom','parent_id','couleur','icone','actif','ordre']
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k))
  ))
  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ' })
  const sets = keys.map((k, i) => `${k} = $${i+1}`).join(', ')
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `UPDATE outbound_sectors SET ${sets} WHERE id = $${keys.length+1} AND tenant_id = $${keys.length+2} RETURNING *`,
      [...Object.values(data), req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    res.json(row)
  } catch (e: any) {
    logger.error('[outbound/sectors PATCH]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/sectors/:id', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `DELETE FROM outbound_sectors WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   SOURCES
───────────────────────────────────────────────────────────────── */
router.get('/sources', async (req: Request, res: Response) => {
  try {
    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT * FROM outbound_sources WHERE tenant_id = $1 ORDER BY ordre, nom`, [req.user!.tenantId])
    res.json(rows)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.post('/sources', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const { nom, slug, icone, actif, ordre } = req.body ?? {}
  if (!nom?.trim()) return res.status(400).json({ error: 'Nom requis' })
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `INSERT INTO outbound_sources (tenant_id, nom, slug, icone, actif, ordre)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user!.tenantId, nom.trim(), slug || null, icone || null, actif ?? true, ordre ?? 0])
    res.status(201).json(row)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.patch('/sources/:id', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const allowed = ['nom','slug','icone','actif','ordre']
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k))))
  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ' })
  const sets = keys.map((k, i) => `${k} = $${i+1}`).join(', ')
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `UPDATE outbound_sources SET ${sets} WHERE id = $${keys.length+1} AND tenant_id = $${keys.length+2} RETURNING *`,
      [...Object.values(data), req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    res.json(row)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.delete('/sources/:id', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `DELETE FROM outbound_sources WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* ─────────────────────────────────────────────────────────────────
   CAMPAGNES
───────────────────────────────────────────────────────────────── */
router.get('/campaigns', async (req: Request, res: Response) => {
  try {
    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT * FROM outbound_campaigns WHERE tenant_id = $1 ORDER BY created_at DESC`, [req.user!.tenantId])
    res.json(rows)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.post('/campaigns', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const allowed = ['nom','description','objectif','secteur_id','cible_prospects','cible_contacts','date_debut','date_fin','statut']
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k))))
  if (!data.nom) return res.status(400).json({ error: 'Nom requis' })
  const insertData = { ...data, tenant_id: req.user!.tenantId, created_by_id: req.user!.userId }
  const keys = Object.keys(insertData)
  const cols = keys.join(', ')
  const ph = keys.map((_, i) => `$${i+1}`).join(', ')
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `INSERT INTO outbound_campaigns (${cols}) VALUES (${ph}) RETURNING *`,
      Object.values(insertData))
    res.status(201).json(row)
  } catch (e: any) {
    logger.error('[outbound/campaigns POST]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const allowed = ['nom','description','objectif','secteur_id','cible_prospects','cible_contacts','date_debut','date_fin','statut']
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k))))
  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ' })
  const sets = keys.map((k, i) => `${k} = $${i+1}`).join(', ')
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `UPDATE outbound_campaigns SET ${sets} WHERE id = $${keys.length+1} AND tenant_id = $${keys.length+2} RETURNING *`,
      [...Object.values(data), req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    res.json(row)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.delete('/campaigns/:id', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `DELETE FROM outbound_campaigns WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* ─────────────────────────────────────────────────────────────────
   MODÈLES
───────────────────────────────────────────────────────────────── */
router.get('/templates', async (req: Request, res: Response) => {
  const canal = typeof req.query.canal === 'string' ? req.query.canal : null
  try {
    const rows = canal
      ? await tenantQuery(req.user!.tenantId,
          `SELECT * FROM outbound_templates WHERE tenant_id = $1 AND canal = $2 ORDER BY nom`, [req.user!.tenantId, canal])
      : await tenantQuery(req.user!.tenantId,
          `SELECT * FROM outbound_templates WHERE tenant_id = $1 ORDER BY canal, nom`, [req.user!.tenantId])
    res.json(rows)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.post('/templates', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const allowed = ['nom','canal','objet','corps','langue','variables','actif','whatsapp_template_name','whatsapp_template_language']
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k))))
  if (!data.nom || !data.canal || !data.corps) {
    return res.status(400).json({ error: 'Nom, canal et corps requis' })
  }
  const insertData = { ...data, tenant_id: req.user!.tenantId, created_by_id: req.user!.userId }
  const keys = Object.keys(insertData)
  const cols = keys.join(', ')
  const ph = keys.map((_, i) => `$${i+1}`).join(', ')
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `INSERT INTO outbound_templates (${cols}) VALUES (${ph}) RETURNING *`,
      Object.values(insertData))
    res.status(201).json(row)
  } catch (e: any) {
    logger.error('[outbound/templates POST]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/templates/:id', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const allowed = ['nom','canal','objet','corps','langue','variables','actif','whatsapp_template_name','whatsapp_template_language']
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k))))
  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ' })
  const sets = keys.map((k, i) => `${k} = $${i+1}`).join(', ')
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `UPDATE outbound_templates SET ${sets} WHERE id = $${keys.length+1} AND tenant_id = $${keys.length+2} RETURNING *`,
      [...Object.values(data), req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    res.json(row)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.delete('/templates/:id', async (req: Request, res: Response) => {
  if (!canManageAll(roleOf(req))) return res.status(403).json({ error: 'Permissions insuffisantes' })
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `DELETE FROM outbound_templates WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* ─────────────────────────────────────────────────────────────────
   PROSPECTS OUTBOUND (cœur du module)
───────────────────────────────────────────────────────────────── */

/* GET /prospects — liste filtrée selon le rôle */
router.get('/prospects', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  /* Isolation tenant explicite (defense in depth au-delà de RLS) */
  const filters: string[] = [`tenant_id = $1`]
  const params: any[] = [tenantId]
  let idx = 2

  /* Filtres query */
  if (typeof req.query.statut === 'string' && req.query.statut !== 'all') {
    filters.push(`statut = $${idx++}`)
    params.push(req.query.statut)
  }
  if (typeof req.query.owner === 'string' && req.query.owner !== 'all' && canManageAll(role)) {
    filters.push(`assigned_to_id = $${idx++}`)
    params.push(req.query.owner)
  }
  if (typeof req.query.secteur === 'string' && req.query.secteur !== 'all') {
    filters.push(`secteur_id = $${idx++}`)
    params.push(req.query.secteur)
  }
  if (typeof req.query.campaign === 'string' && req.query.campaign !== 'all') {
    filters.push(`campaign_id = $${idx++}`)
    params.push(req.query.campaign)
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const s = `%${req.query.search.trim().toLowerCase()}%`
    filters.push(`(LOWER(entreprise) LIKE $${idx} OR LOWER(COALESCE(nom_contact,'')) LIKE $${idx} OR LOWER(COALESCE(email,'')) LIKE $${idx})`)
    params.push(s); idx++
  }
  if (req.query.converted === 'false') filters.push(`converted_to_crm = FALSE`)
  if (req.query.converted === 'true') filters.push(`converted_to_crm = TRUE`)

  /* Filtre owner appliqué au niveau agent — non contournable */
  if (!canManageAll(role)) {
    filters.push(`assigned_to_id = $${idx++}`)
    params.push(userId)
  }

  const where = `WHERE ${filters.join(' AND ')}`
  try {
    const rows = await tenantQuery(tenantId,
      `SELECT * FROM outbound_prospects ${where} ORDER BY last_activity_at DESC NULLS LAST, created_at DESC LIMIT 1000`,
      params)
    res.json(rows)
  } catch (e: any) {
    logger.error('[outbound/prospects GET]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /prospects/:id */
router.get('/prospects/:id', async (req: Request, res: Response) => {
  const role = roleOf(req)
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `SELECT * FROM outbound_prospects WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })
    if (!canManageAll(role) && (row as any).assigned_to_id !== req.user!.userId) {
      return res.status(403).json({ error: 'Accès refusé' })
    }
    res.json(row)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* POST /prospects — création. owner/assigned_to = user connecté par défaut. */
router.post('/prospects', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const userId = req.user!.userId
  const tenantId = req.user!.tenantId

  const data: any = {}
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (PROSPECT_WRITE_COLUMNS.has(k)) data[k] = v
    if (MANAGER_ONLY_COLUMNS.has(k) && canManageAll(role)) data[k] = v
  }
  if (!data.entreprise?.toString().trim()) {
    return res.status(400).json({ error: 'Nom d\'entreprise requis' })
  }

  /* Défaut ownership */
  const owner = data.owner_id || userId
  const assignedTo = data.assigned_to_id || userId

  const payload = normalizeValues({
    ...data,
    tenant_id: tenantId,
    owner_id: owner,
    assigned_to_id: assignedTo,
    created_by_id: userId,
  })
  const keys = Object.keys(payload)
  const cols = keys.join(', ')
  const ph = keys.map((_, i) => `$${i+1}`).join(', ')

  try {
    const row = await tenantQueryOne<any>(tenantId,
      `INSERT INTO outbound_prospects (${cols}) VALUES (${ph}) RETURNING *`,
      Object.values(payload))
    /* Log création */
    if (row) {
      await tenantQuery(tenantId,
        `INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom)
         VALUES ($1,$2,'creation','Prospect ajouté',$3,$4)`,
        [tenantId, row.id, userId, req.user!.email ?? ''])
    }
    res.status(201).json(row)
  } catch (e: any) {
    logger.error('[outbound/prospects POST]', e?.message, e?.detail)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PATCH /prospects/:id */
router.patch('/prospects/:id', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const userId = req.user!.userId
  const tenantId = req.user!.tenantId

  /* Vérifier ownership avant écriture */
  const existing = await tenantQueryOne<any>(tenantId,
    `SELECT id, assigned_to_id, statut, converted_to_crm FROM outbound_prospects WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId])
  if (!existing) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && existing.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }
  if (existing.converted_to_crm) {
    return res.status(400).json({ error: 'Fiche convertie — modification bloquée' })
  }

  const data: any = {}
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (PROSPECT_WRITE_COLUMNS.has(k)) data[k] = v
    if (MANAGER_ONLY_COLUMNS.has(k) && canManageAll(role)) data[k] = v
  }
  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ' })
  const payload = normalizeValues(data)
  const finalKeys = Object.keys(payload)
  const sets = finalKeys.map((k, i) => `${k} = $${i+1}`).join(', ')

  try {
    const row = await tenantQueryOne<any>(tenantId,
      `UPDATE outbound_prospects SET ${sets} WHERE id = $${finalKeys.length+1} AND tenant_id = $${finalKeys.length+2} RETURNING *`,
      [...Object.values(payload), req.params.id, tenantId])
    if (!row) return res.status(404).json({ error: 'Introuvable' })

    /* Log changement de statut auto */
    if (data.statut && data.statut !== existing.statut) {
      await tenantQuery(tenantId,
        `INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom)
         VALUES ($1,$2,'statut',$3,$4,$5)`,
        [tenantId, row.id, `Statut : ${existing.statut} → ${data.statut}`, userId, req.user!.email ?? ''])
    }
    if (data.assigned_to_id && data.assigned_to_id !== existing.assigned_to_id) {
      await tenantQuery(tenantId,
        `INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom)
         VALUES ($1,$2,'assignment','Prospect réaffecté',$3,$4)`,
        [tenantId, row.id, userId, req.user!.email ?? ''])
    }
    res.json(row)
  } catch (e: any) {
    logger.error('[outbound/prospects PATCH]', e?.message, e?.detail)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* DELETE /prospects/:id */
router.delete('/prospects/:id', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const userId = req.user!.userId
  const tenantId = req.user!.tenantId

  const existing = await tenantQueryOne<any>(tenantId,
    `SELECT assigned_to_id FROM outbound_prospects WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId])
  if (!existing) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && existing.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  try {
    await tenantQueryOne(tenantId,
      `DELETE FROM outbound_prospects WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, req.user!.tenantId])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* POST /prospects/:id/convert  — Conversion vers CRM Inbound */
router.post('/prospects/:id/convert', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const userId = req.user!.userId
  const tenantId = req.user!.tenantId

  if (!canManageAll(role)) return res.status(403).json({ error: 'Seul un admin/manager peut convertir' })

  const outbound = await tenantQueryOne<any>(tenantId,
    `SELECT * FROM outbound_prospects WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId])
  if (!outbound) return res.status(404).json({ error: 'Introuvable' })
  if (outbound.converted_to_crm) {
    return res.status(400).json({ error: 'Déjà converti' })
  }

  /* Créer la fiche CRM (Inbound). On préserve les infos essentielles + source Outbound. */
  const contactName = [outbound.prenom_contact, outbound.nom_contact]
    .filter(Boolean).join(' ').trim() || outbound.entreprise
  const notesArr = [
    outbound.notes || '',
    `— Prospect trouvé via Outbound Marketing`,
    outbound.source_libre ? `Source : ${outbound.source_libre}` : '',
    outbound.service_propose ? `Service proposé : ${outbound.service_propose}` : '',
  ].filter(Boolean)

  try {
    const crm = await tenantQueryOne<any>(tenantId,
      `INSERT INTO prospects (tenant_id, nom, email, telephone, entreprise, statut, valeur_estimee,
                              source, notes, responsable, date_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        tenantId,
        contactName,
        outbound.email,
        outbound.telephone,
        outbound.entreprise,
        'qualifie',
        outbound.valeur_potentielle,
        'Outbound Marketing',
        notesArr.join('\n'),
        req.user!.email ?? null,
        outbound.date_dernier_contact ? new Date(outbound.date_dernier_contact).toISOString().slice(0,10) : null,
      ])
    if (!crm) return res.status(500).json({ error: 'Échec création CRM' })

    /* Marquer Outbound comme converti */
    const updated = await tenantQueryOne<any>(tenantId,
      `UPDATE outbound_prospects
          SET converted_to_crm = TRUE,
              converted_at     = NOW(),
              converted_by_id  = $1,
              crm_prospect_id  = $2,
              statut           = 'converti'
        WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [userId, crm.id, req.params.id, tenantId])

    /* Log conversion */
    await tenantQuery(tenantId,
      `INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom, metadata)
       VALUES ($1,$2,'conversion','Converti en prospect CRM',$3,$4,$5)`,
      [tenantId, req.params.id, userId, req.user!.email ?? '', JSON.stringify({ crm_prospect_id: crm.id })])

    res.json({ success: true, outbound: updated, crm })
  } catch (e: any) {
    logger.error('[outbound/convert]', e?.message, e?.detail)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   ACTIVITÉS
───────────────────────────────────────────────────────────────── */
router.get('/prospects/:id/activities', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  const prospect = await tenantQueryOne<any>(tenantId,
    `SELECT assigned_to_id FROM outbound_prospects WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId])
  if (!prospect) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && prospect.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  try {
    const rows = await tenantQuery(tenantId,
      `SELECT * FROM outbound_activities WHERE prospect_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 500`,
      [req.params.id, tenantId])
    res.json(rows)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.post('/prospects/:id/activities', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  const prospect = await tenantQueryOne<any>(tenantId,
    `SELECT assigned_to_id, nb_tentatives FROM outbound_prospects WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId])
  if (!prospect) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && prospect.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  const { type, message, metadata } = req.body ?? {}
  const validTypes = ['note','edit','appel','email','whatsapp','linkedin','sms','rdv','follow_up']
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Type invalide' })
  if (!message?.trim()) return res.status(400).json({ error: 'Message requis' })

  try {
    const row = await tenantQueryOne<any>(tenantId,
      `INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, metadata, auteur_id, auteur_nom)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tenantId, req.params.id, type, message.trim(), JSON.stringify(metadata ?? {}), userId, req.user!.email ?? ''])

    /* Incrémenter nb_tentatives si contact effectif */
    if (['appel','email','whatsapp','linkedin','sms'].includes(type)) {
      await tenantQuery(tenantId,
        `UPDATE outbound_prospects
            SET nb_tentatives = COALESCE(nb_tentatives, 0) + 1,
                date_dernier_contact = NOW()
          WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId])
    }
    res.status(201).json(row)
  } catch (e: any) {
    logger.error('[outbound/activities POST]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   RELANCES
───────────────────────────────────────────────────────────────── */
router.get('/follow-ups', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  /* Isolation tenant explicite */
  const filters: string[] = [`f.tenant_id = $1`]
  const params: any[] = [tenantId]
  let idx = 2

  if (typeof req.query.statut === 'string' && req.query.statut !== 'all') {
    filters.push(`f.statut = $${idx++}`)
    params.push(req.query.statut)
  }
  if (typeof req.query.owner === 'string' && req.query.owner !== 'all' && canManageAll(role)) {
    filters.push(`f.assigned_to_id = $${idx++}`)
    params.push(req.query.owner)
  }
  if (req.query.today === '1') {
    filters.push(`DATE(f.date_prevue) = CURRENT_DATE`)
  }
  if (!canManageAll(role)) {
    filters.push(`f.assigned_to_id = $${idx++}`)
    params.push(userId)
  }
  const where = `WHERE ${filters.join(' AND ')}`
  try {
    const rows = await tenantQuery(tenantId,
      `SELECT f.*, p.entreprise, p.nom_contact, p.prenom_contact
         FROM outbound_follow_ups f
         LEFT JOIN outbound_prospects p ON p.id = f.prospect_id
       ${where}
       ORDER BY f.date_prevue ASC LIMIT 1000`, params)
    res.json(rows)
  } catch (e: any) {
    logger.error('[outbound/follow-ups GET]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/follow-ups', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  const { prospect_id, titre, description, canal, date_prevue, assigned_to_id } = req.body ?? {}
  if (!prospect_id || !titre?.trim() || !date_prevue) {
    return res.status(400).json({ error: 'Prospect, titre et date requis' })
  }

  const prospect = await tenantQueryOne<any>(tenantId,
    `SELECT assigned_to_id FROM outbound_prospects WHERE id = $1 AND tenant_id = $2`,
    [prospect_id, tenantId])
  if (!prospect) return res.status(404).json({ error: 'Prospect introuvable' })
  if (!canManageAll(role) && prospect.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  const finalAssigned = canManageAll(role) && assigned_to_id ? assigned_to_id : (prospect.assigned_to_id || userId)

  try {
    const row = await tenantQueryOne<any>(tenantId,
      `INSERT INTO outbound_follow_ups
        (tenant_id, prospect_id, assigned_to_id, titre, description, canal, date_prevue, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, prospect_id, finalAssigned, titre.trim(), description || null,
       canal || null, date_prevue, userId])
    /* Sync date_prochaine_relance sur le prospect */
    await tenantQuery(tenantId,
      `UPDATE outbound_prospects
          SET date_prochaine_relance = LEAST(COALESCE(date_prochaine_relance, $2::date), $2::date)
        WHERE id = $1 AND tenant_id = $3`,
      [prospect_id, new Date(date_prevue).toISOString().slice(0,10), tenantId])
    res.status(201).json(row)
  } catch (e: any) {
    logger.error('[outbound/follow-ups POST]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/follow-ups/:id', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  const existing = await tenantQueryOne<any>(tenantId,
    `SELECT * FROM outbound_follow_ups WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId])
  if (!existing) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && existing.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  const allowed = ['titre','description','canal','date_prevue','statut','fait_a','assigned_to_id']
  const data: any = {}
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (allowed.includes(k)) {
      if (k === 'assigned_to_id' && !canManageAll(role)) continue
      data[k] = v
    }
  }
  if (data.statut === 'fait' && !data.fait_a) data.fait_a = new Date().toISOString()

  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ' })
  const payload = normalizeValues(data)
  const finalKeys = Object.keys(payload)
  const sets = finalKeys.map((k, i) => `${k} = $${i+1}`).join(', ')
  try {
    const row = await tenantQueryOne(tenantId,
      `UPDATE outbound_follow_ups SET ${sets} WHERE id = $${finalKeys.length+1} AND tenant_id = $${finalKeys.length+2} RETURNING *`,
      [...Object.values(payload), req.params.id, tenantId])
    res.json(row)
  } catch (e: any) {
    logger.error('[outbound/follow-ups PATCH]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/follow-ups/:id', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  const existing = await tenantQueryOne<any>(tenantId,
    `SELECT assigned_to_id FROM outbound_follow_ups WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId])
  if (!existing) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && existing.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }
  try {
    await tenantQueryOne(tenantId,
      `DELETE FROM outbound_follow_ups WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, req.user!.tenantId])
    res.json({ success: true })
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* ─────────────────────────────────────────────────────────────────
   ÉQUIPE OUTBOUND  — settings, objectifs, stats
───────────────────────────────────────────────────────────────── */

/* Liste tous les utilisateurs actifs du tenant + leurs settings + nb prospects */
router.get('/team', async (req: Request, res: Response) => {
  const role = roleOf(req)
  if (!canManageAll(role)) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const tenantId = req.user!.tenantId
  try {
    const members = await tenantQuery(tenantId, `
      SELECT tu.user_id, tu.role, u.email, u.name, u.avatar_url,
             s.actif AS outbound_actif,
             s.secteurs_autorises, s.villes_autorisees, s.sources_autorisees, s.campagnes_accessibles,
             s.objectif_prospects_mois, s.objectif_contacts_mois,
             s.objectif_rdv_mois,       s.objectif_conversions_mois,
             (SELECT COUNT(*) FROM outbound_prospects op WHERE op.assigned_to_id = tu.user_id AND op.tenant_id = tu.tenant_id) AS total_prospects,
             (SELECT COUNT(*) FROM outbound_prospects op WHERE op.assigned_to_id = tu.user_id AND op.tenant_id = tu.tenant_id
                              AND op.statut IN ('a_contacter')) AS a_contacter,
             (SELECT COUNT(*) FROM outbound_prospects op WHERE op.assigned_to_id = tu.user_id AND op.tenant_id = tu.tenant_id
                              AND op.converted_to_crm = TRUE) AS conversions
        FROM tenant_users tu
        JOIN users u ON u.id = tu.user_id
        LEFT JOIN outbound_agent_settings s ON s.user_id = tu.user_id AND s.tenant_id = tu.tenant_id
       WHERE tu.tenant_id = $1 AND tu.status = 'active'
       ORDER BY u.name`, [tenantId])
    res.json(members)
  } catch (e: any) {
    logger.error('[outbound/team GET]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/team/:userId/settings', async (req: Request, res: Response) => {
  const role = roleOf(req)
  if (!canManageAll(role)) return res.status(403).json({ error: 'Permissions insuffisantes' })
  const tenantId = req.user!.tenantId
  const targetId = req.params.userId
  const allowed = [
    'actif','secteurs_autorises','villes_autorisees','sources_autorisees','campagnes_accessibles',
    'objectif_prospects_mois','objectif_contacts_mois','objectif_rdv_mois','objectif_conversions_mois',
    'limite_prospects_jour','notes'
  ]
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k))))

  try {
    const existing = await tenantQueryOne(tenantId,
      `SELECT id FROM outbound_agent_settings WHERE user_id = $1 AND tenant_id = $2`,
      [targetId, tenantId])
    if (existing) {
      const keys = Object.keys(data)
      if (!keys.length) return res.status(400).json({ error: 'Aucun champ' })
      const sets = keys.map((k, i) => `${k} = $${i+1}`).join(', ')
      const row = await tenantQueryOne(tenantId,
        `UPDATE outbound_agent_settings SET ${sets} WHERE user_id = $${keys.length+1} AND tenant_id = $${keys.length+2} RETURNING *`,
        [...Object.values(data), targetId, tenantId])
      return res.json(row)
    }
    const insertData = { ...data, tenant_id: tenantId, user_id: targetId }
    const keys = Object.keys(insertData)
    const cols = keys.join(', ')
    const ph = keys.map((_, i) => `$${i+1}`).join(', ')
    const row = await tenantQueryOne(tenantId,
      `INSERT INTO outbound_agent_settings (${cols}) VALUES (${ph}) RETURNING *`,
      Object.values(insertData))
    res.status(201).json(row)
  } catch (e: any) {
    logger.error('[outbound/team settings]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /me/settings — pour l'agent, ses propres settings */
router.get('/me/settings', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId
  try {
    const row = await tenantQueryOne(tenantId,
      `SELECT * FROM outbound_agent_settings WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId])
    res.json(row ?? null)
  } catch (e: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* ─────────────────────────────────────────────────────────────────
   DASHBOARD / STATS
───────────────────────────────────────────────────────────────── */
router.get('/stats', async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  /* Toujours filtrer par tenant_id ($1). Agent ajoute assigned_to_id = $2. */
  const scope = canManageAll(role) ? '' : ' AND assigned_to_id = $2'
  const params: any[] = canManageAll(role) ? [tenantId] : [tenantId, userId]

  try {
    const [totals, byStatut, byDay, byOwner, upcoming] = await Promise.all([
      tenantQuery(tenantId, `
        SELECT
          COUNT(*)::int AS total,
          SUM(CASE WHEN converted_to_crm THEN 1 ELSE 0 END)::int AS conversions,
          SUM(CASE WHEN statut = 'a_contacter' THEN 1 ELSE 0 END)::int AS a_contacter,
          SUM(CASE WHEN statut IN ('interesse','rdv_pris','proposition_envoyee','en_conversation') THEN 1 ELSE 0 END)::int AS pipeline,
          COALESCE(SUM(valeur_potentielle) FILTER (WHERE statut NOT IN ('refuse','non_qualifie','converti')), 0)::float AS pipeline_valeur
        FROM outbound_prospects
        WHERE tenant_id = $1 ${scope}`, params),
      tenantQuery(tenantId, `
        SELECT statut, COUNT(*)::int AS count
        FROM outbound_prospects
        WHERE tenant_id = $1 ${scope}
        GROUP BY statut`, params),
      tenantQuery(tenantId, `
        SELECT DATE(created_at) AS jour, COUNT(*)::int AS count
        FROM outbound_prospects
        WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days' ${scope}
        GROUP BY jour ORDER BY jour ASC`, params),
      canManageAll(role)
        ? tenantQuery(tenantId, `
          SELECT op.assigned_to_id AS user_id,
                 COALESCE(u.name, u.email, 'Utilisateur') AS name,
                 COUNT(*)::int AS total,
                 SUM(CASE WHEN op.converted_to_crm THEN 1 ELSE 0 END)::int AS conversions
            FROM outbound_prospects op
            LEFT JOIN users u ON u.id = op.assigned_to_id
           WHERE op.tenant_id = $1
           GROUP BY op.assigned_to_id, u.name, u.email
           ORDER BY total DESC LIMIT 20`, [tenantId])
        : Promise.resolve([]),
      tenantQuery(tenantId, `
        SELECT COUNT(*)::int AS count
        FROM outbound_follow_ups
        WHERE tenant_id = $1 AND statut = 'a_faire' AND DATE(date_prevue) <= CURRENT_DATE
              ${canManageAll(role) ? '' : 'AND assigned_to_id = $2'}`,
        canManageAll(role) ? [tenantId] : [tenantId, userId]),
    ])
    res.json({
      totals: totals[0] ?? {},
      by_statut: byStatut,
      by_day: byDay,
      by_owner: byOwner,
      relances_dues: upcoming[0]?.count ?? 0,
    })
  } catch (e: any) {
    logger.error('[outbound/stats]', e?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   MARKETING AUTOMATION — enrichment, verification, AI, send
───────────────────────────────────────────────────────────────── */

router.get('/integrations/status', (_req, res) => {
  res.json({
    google_places:      googlePlaces.isConfigured(),
    anthropic:          aiEmailGen.isConfigured(),
    ai_provider:        aiEmailGen.activeProvider(),
    ai_model:           aiEmailGen.activeProvider() === 'openai'
                          ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
                          : 'claude-sonnet-4-6',
    whatsapp:           whatsappCloud.isConfigured(),
    whatsapp_provider:  whatsappCloud.activeWhatsAppProvider(),
    smtp:               !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD,
    resend:             !!process.env.RESEND_API_KEY,
  })
})

/* Test rapide du provider IA — génère un email fictif pour vérifier
   que la clé fonctionne. Réservé aux admins. */
router.post('/integrations/test-ai', outboundExternalLimiter, async (req: Request, res: Response) => {
  const role = roleOf(req)
  if (!canManageAll(role)) return res.status(403).json({ error: 'Réservé admin/manager' })
  if (!aiEmailGen.isConfigured()) return res.status(503).json({ error: 'Aucun provider IA configuré' })

  const t0 = Date.now()
  try {
    const draft = await aiEmailGen.generateEmail({
      channel: 'email', language: 'fr', tone: 'professionnel',
      sender: { company_name: 'NEXT GITAL', pitch: 'agence digitale', contact_name: 'Said' },
      prospect: {
        company: 'Café Central', contact: null, sector: 'Restauration',
        city: 'Oujda', website: null, notes: null,
      },
    })
    res.json({
      success: true,
      provider: aiEmailGen.activeProvider(),
      model: aiEmailGen.activeProvider() === 'openai'
        ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
        : 'claude-sonnet-4-6',
      duration_ms: Date.now() - t0,
      sample: draft,
    })
  } catch (e: any) {
    res.status(502).json({
      success: false,
      provider: aiEmailGen.activeProvider(),
      duration_ms: Date.now() - t0,
      error: e?.message ?? 'Erreur inconnue',
    })
  }
})

router.post('/enrich/google-places', outboundExternalLimiter, async (req: Request, res: Response) => {
  const role = roleOf(req)
  if (!canManageAll(role)) {
    return res.status(403).json({ error: 'Seul un admin/manager peut lancer un enrichissement' })
  }
  if (!googlePlaces.isConfigured()) {
    return res.status(503).json({ error: 'Google Places non configuré (GOOGLE_PLACES_API_KEY)' })
  }
  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId

  const query = String(req.body?.query ?? '').trim()
  const limit = Math.min(Math.max(1, Number(req.body?.limit ?? 10)), 20)
  const sectorId   = req.body?.sector_id   || null
  const campaignId = req.body?.campaign_id || null
  const assignedToId = (canManageAll(role) && req.body?.assigned_to_id) || userId

  if (!query) return res.status(400).json({ error: 'query requis' })

  try {
    const places = await googlePlaces.searchPlaces(query, limit)
    if (!places.length) return res.json({ imported: 0, skipped: 0, results: [] })

    const gsource = await tenantQueryOne<any>(tenantId,
      `SELECT id FROM outbound_sources WHERE slug = 'google_maps' AND tenant_id = $1 LIMIT 1`, [tenantId])
    const sourceId = gsource?.id ?? null

    let imported = 0
    let skipped = 0
    const results: any[] = []

    for (const p of places) {
      const existing = await tenantQueryOne<any>(tenantId,
        `SELECT id FROM outbound_prospects WHERE google_place_id = $1 AND tenant_id = $2 LIMIT 1`,
        [p.place_id, tenantId])
      if (existing) { skipped++; continue }

      /* Email secondaire = premier email extra (souvent info@ vs contact@) */
      const emailSecondaire = p.emails_extra?.[0] ?? null

      const row = await tenantQueryOne<any>(tenantId, `
        INSERT INTO outbound_prospects (
          tenant_id, entreprise, telephone, whatsapp, email, email_secondaire,
          site_web, adresse, ville, pays,
          google_maps_url, secteur_id, source_id, campaign_id, source_libre,
          google_place_id, enriched_from, enriched_at,
          canal_prefere,
          owner_id, assigned_to_id, created_by_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, 'google_places', NOW(),
          $17,
          $18, $19, $18
        ) RETURNING id, entreprise, telephone, whatsapp, email, ville, site_web
      `, [
        tenantId, p.name, p.phone, p.whatsapp, p.email, emailSecondaire,
        p.website, p.address, p.city, p.country ?? 'Maroc',
        p.google_maps_url, sectorId, sourceId, campaignId,
        p.category ? `Google Places: ${p.category}` : 'Google Places',
        p.place_id,
        /* Canal préféré : whatsapp si mobile détecté, sinon email si trouvé, sinon null */
        p.whatsapp ? 'whatsapp' : (p.email ? 'email' : null),
        userId, assignedToId,
      ])
      if (row) {
        const emailsFoundCount = (p.email ? 1 : 0) + (p.emails_extra?.length ?? 0)
        await tenantQuery(tenantId,
          `INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom, metadata)
           VALUES ($1,$2,'creation',$3,$4,$5,$6)`,
          [tenantId, row.id,
           `Prospect importé depuis Google Places (${emailsFoundCount} email(s) scrapé(s)${p.whatsapp ? ', WhatsApp détecté' : ''})`,
           userId, req.user!.email ?? '',
           JSON.stringify({
             google_place_id: p.place_id,
             query,
             emails_found: emailsFoundCount,
             emails_extra: p.emails_extra ?? [],
             whatsapp_detected: !!p.whatsapp,
           })])
        imported++
        results.push(row)
      }
    }
    res.json({ imported, skipped, results })
  } catch (e: any) {
    logger.error('[outbound/enrich/google-places]', e?.message)
    res.status(502).json({ error: 'Erreur Google Places : ' + (e?.message ?? 'inconnue') })
  }
})

router.post('/prospects/:id/verify', outboundExternalLimiter, async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  const prospect = await tenantQueryOne<any>(tenantId,
    `SELECT id, email, telephone, whatsapp, assigned_to_id FROM outbound_prospects WHERE id = $1`,
    [req.params.id])
  if (!prospect) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && prospect.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  try {
    const emailVerif = await verifyEmail(prospect.email)
    const phoneVerif = verifyPhoneFormat(prospect.telephone || prospect.whatsapp)

    const row = await tenantQueryOne<any>(tenantId, `
      UPDATE outbound_prospects
         SET email_verified            = $1,
             email_verified_at         = NOW(),
             email_verification_status = $2,
             phone_verified            = $3
       WHERE id = $4
       RETURNING id, email_verified, email_verification_status, phone_verified
    `, [emailVerif.status === 'valid', emailVerif.status, phoneVerif.valid, req.params.id])

    await tenantQuery(tenantId,
      `INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom, metadata)
       VALUES ($1,$2,'edit',$3,$4,$5,$6)`,
      [tenantId, req.params.id,
       `Vérification : email=${emailVerif.status} (${emailVerif.reason}), tel=${phoneVerif.valid ? 'valide' : 'invalide'}`,
       userId, req.user!.email ?? '',
       JSON.stringify({ email: emailVerif, phone: phoneVerif })])

    res.json({ prospect: row, email: emailVerif, phone: phoneVerif })
  } catch (e: any) {
    logger.error('[outbound/verify]', e?.message)
    res.status(500).json({ error: 'Erreur vérification' })
  }
})

router.post('/prospects/:id/ai-generate', outboundExternalLimiter, async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  if (!aiEmailGen.isConfigured()) {
    return res.status(503).json({ error: 'IA non configurée (ANTHROPIC_API_KEY)' })
  }

  const prospect = await tenantQueryOne<any>(tenantId, `
    SELECT p.*, s.nom AS secteur_nom
      FROM outbound_prospects p
      LEFT JOIN outbound_sectors s ON s.id = p.secteur_id
     WHERE p.id = $1
  `, [req.params.id])
  if (!prospect) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && prospect.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }

  const channel: aiEmailGen.Channel = req.body?.channel === 'whatsapp' ? 'whatsapp' : 'email'
  const language: aiEmailGen.Language =
    ['fr','ar','en'].includes(req.body?.language) ? req.body.language : 'fr'
  const tone: aiEmailGen.Tone =
    ['professionnel','chaleureux','direct'].includes(req.body?.tone) ? req.body.tone : 'professionnel'

  let templateBody: string | null = null
  if (req.body?.template_id) {
    const tpl = await tenantQueryOne<any>(tenantId,
      `SELECT corps FROM outbound_templates WHERE id = $1`, [req.body.template_id])
    templateBody = tpl?.corps ?? null
  }

  const senderPitch   = String(req.body?.sender_pitch   ?? 'agence digitale spécialisée sites web + marketing').slice(0, 2000)
  const senderCompany = String(req.body?.sender_company ?? 'NEXT GITAL')
  const senderName    = String(req.body?.sender_name    ?? (req.user!.email?.split('@')[0] ?? 'l\'équipe'))
  const serviceFocus  = req.body?.service_focus ? String(req.body.service_focus).slice(0, 200) : null

  const ctx: aiEmailGen.GenerationContext = {
    channel, language, tone,
    sender: { company_name: senderCompany, pitch: senderPitch, contact_name: senderName },
    prospect: {
      company: prospect.entreprise,
      contact: [prospect.prenom_contact, prospect.nom_contact].filter(Boolean).join(' ').trim() || null,
      sector:  prospect.secteur_nom,
      city:    prospect.ville,
      website: prospect.site_web,
      notes:   prospect.notes,
    },
    service_focus: serviceFocus,
    template_body: templateBody,
  }

  try {
    if (channel === 'email') {
      const draft = await aiEmailGen.generateEmail(ctx)
      await tenantQuery(tenantId, `
        UPDATE outbound_prospects
           SET ai_draft_email_subject = $1,
               ai_draft_email_body    = $2,
               ai_generated_at        = NOW(),
               ai_generated_lang      = $3
         WHERE id = $4
      `, [draft.subject, draft.body, language, req.params.id])
      return res.json({ channel, draft })
    } else {
      const body = await aiEmailGen.generateWhatsApp(ctx)
      await tenantQuery(tenantId, `
        UPDATE outbound_prospects
           SET ai_draft_whatsapp = $1,
               ai_generated_at   = NOW(),
               ai_generated_lang = $2
         WHERE id = $3
      `, [body, language, req.params.id])
      return res.json({ channel, draft: { body } })
    }
  } catch (e: any) {
    logger.error('[outbound/ai-generate]', e?.message)
    res.status(502).json({ error: 'Erreur IA : ' + (e?.message ?? 'inconnue') })
  }
})

router.post('/prospects/:id/send-email', outboundExternalLimiter, async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  const prospect = await tenantQueryOne<any>(tenantId,
    `SELECT * FROM outbound_prospects WHERE id = $1`, [req.params.id])
  if (!prospect) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && prospect.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }
  if (prospect.ne_plus_contacter) {
    return res.status(400).json({ error: 'Prospect marqué "ne plus contacter"' })
  }
  if (!prospect.email) return res.status(400).json({ error: 'Email prospect manquant' })

  const subject = (req.body?.subject || prospect.ai_draft_email_subject || '').trim()
  const bodyText = (req.body?.body || prospect.ai_draft_email_body || '').trim()
  if (!subject || !bodyText) {
    return res.status(400).json({ error: 'subject et body requis (ou générer un draft AI d\'abord)' })
  }

  /* Récupère les infos "sender" du tenant (nom, logo, contact) pour la signature.
     Le body req peut aussi les override (utile pour le multi-utilisateur). */
  const tenant = await tenantQueryOne<any>(tenantId,
    `SELECT name, slug, settings, logo_url FROM tenants WHERE id = $1`, [tenantId])
  const settings = tenant?.settings ?? {}

  const senderName    = String(req.body?.sender_name    ?? settings.sender_name    ?? (req.user!.email?.split('@')[0] ?? 'L\'équipe'))
  const senderRole    = String(req.body?.sender_role    ?? settings.sender_role    ?? 'Direction commerciale')
  const senderCompany = String(req.body?.sender_company ?? tenant?.name            ?? 'NEXT GITAL')
  const senderPhone   = req.body?.sender_phone   ?? settings.sender_phone   ?? process.env.OUTBOUND_SENDER_PHONE   ?? null
  const senderWebsite = req.body?.sender_website ?? settings.sender_website ?? process.env.OUTBOUND_SENDER_WEBSITE ?? null
  const senderLogo    = req.body?.sender_logo    ?? tenant?.logo_url        ?? null
  const senderEmail   = process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? 'contact@nextgital.com'

  const html = buildOutboundEmailHtml({
    bodyText,
    sender: {
      name:     senderName,
      role:     senderRole,
      company:  senderCompany,
      email:    senderEmail,
      phone:    senderPhone ?? undefined,
      website:  senderWebsite ?? undefined,
      logo_url: senderLogo ?? undefined,
    },
    prospectEmail: prospect.email,
  })

  try {
    await sendEmail({ to: prospect.email, subject, html, text: bodyText })

    const shouldFlip = prospect.statut === 'a_contacter'
    await tenantQuery(tenantId, `
      UPDATE outbound_prospects
         SET nb_tentatives        = COALESCE(nb_tentatives, 0) + 1,
             date_dernier_contact = NOW(),
             statut               = CASE WHEN $2 THEN 'contacte' ELSE statut END
       WHERE id = $1
    `, [req.params.id, shouldFlip])

    await tenantQuery(tenantId, `
      INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom, metadata)
      VALUES ($1,$2,'email',$3,$4,$5,$6)
    `, [tenantId, req.params.id, `Email envoyé : ${subject}`, userId, req.user!.email ?? '',
        JSON.stringify({ to: prospect.email, subject })])

    res.json({ success: true, to: prospect.email, subject })
  } catch (e: any) {
    logger.error('[outbound/send-email]', e?.message)
    res.status(502).json({ error: 'Envoi email échoué : ' + (e?.message ?? 'inconnue') })
  }
})

router.post('/prospects/:id/send-whatsapp', outboundExternalLimiter, async (req: Request, res: Response) => {
  const role = roleOf(req)
  const tenantId = req.user!.tenantId
  const userId = req.user!.userId

  if (!whatsappCloud.isConfigured()) {
    return res.status(503).json({ error: 'WhatsApp Cloud non configuré' })
  }

  const prospect = await tenantQueryOne<any>(tenantId,
    `SELECT * FROM outbound_prospects WHERE id = $1`, [req.params.id])
  if (!prospect) return res.status(404).json({ error: 'Introuvable' })
  if (!canManageAll(role) && prospect.assigned_to_id !== userId) {
    return res.status(403).json({ error: 'Accès refusé' })
  }
  if (prospect.ne_plus_contacter) {
    return res.status(400).json({ error: 'Prospect marqué "ne plus contacter"' })
  }

  const rawPhone = prospect.whatsapp || prospect.telephone
  const phoneCheck = verifyPhoneFormat(rawPhone)
  if (!phoneCheck.valid || !phoneCheck.e164) {
    return res.status(400).json({ error: 'Numéro WhatsApp/téléphone invalide' })
  }

  const templateId = req.body?.template_id
  if (!templateId) return res.status(400).json({ error: 'template_id requis' })

  const tpl = await tenantQueryOne<any>(tenantId,
    `SELECT * FROM outbound_templates WHERE id = $1 AND canal = 'whatsapp'`, [templateId])
  if (!tpl?.whatsapp_template_name) {
    return res.status(400).json({ error: 'Template WhatsApp introuvable ou nom Meta manquant' })
  }

  const variables: string[] = Array.isArray(req.body?.variables)
    ? req.body.variables.map((v: unknown) => String(v ?? ''))
    : []

  try {
    const result = await whatsappCloud.sendWhatsAppTemplate({
      to:            phoneCheck.e164,
      templateName:  tpl.whatsapp_template_name,
      languageCode:  (tpl.whatsapp_template_language ?? 'ar') as 'ar' | 'fr' | 'en',
      variables,
    })

    const shouldFlip = prospect.statut === 'a_contacter'
    await tenantQuery(tenantId, `
      UPDATE outbound_prospects
         SET nb_tentatives        = COALESCE(nb_tentatives, 0) + 1,
             date_dernier_contact = NOW(),
             statut               = CASE WHEN $2 THEN 'contacte' ELSE statut END
       WHERE id = $1
    `, [req.params.id, shouldFlip])

    await tenantQuery(tenantId, `
      INSERT INTO outbound_activities (tenant_id, prospect_id, type, message, auteur_id, auteur_nom, metadata)
      VALUES ($1,$2,'whatsapp',$3,$4,$5,$6)
    `, [tenantId, req.params.id, `WhatsApp envoyé (template ${tpl.whatsapp_template_name})`,
        userId, req.user!.email ?? '',
        JSON.stringify({ wamid: result.wamid, template: tpl.whatsapp_template_name, variables })])

    res.json({ success: true, wamid: result.wamid, to: phoneCheck.e164 })
  } catch (e: any) {
    logger.error('[outbound/send-whatsapp]', e?.message)
    res.status(502).json({ error: 'Envoi WhatsApp échoué : ' + (e?.message ?? 'inconnue') })
  }
})

export default router
