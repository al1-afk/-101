import { Router, Request, Response } from 'express'
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { clausePerimetre } from '../lib/crmScope'

const router = Router()
router.use(requireAuth)

/* ── Helpers ─────────────────────────────────────────────────── */

const SAFE_COL = /^[a-z_][a-z0-9_]{0,63}$/

function pickFields<T extends Record<string, unknown>>(
  body: T,
  allowed: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) {
      const v = (body as Record<string, unknown>)[k]
      out[k] = v === '' ? null : v
    }
  }
  return out
}

function generateSku(): string {
  const ts   = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PRD-${ts}-${rand}`
}

async function insertRow(
  tenantId: string,
  table: string,
  data: Record<string, unknown>,
) {
  const withTenant = { tenant_id: tenantId, ...data }
  const keys = Object.keys(withTenant).filter(k => SAFE_COL.test(k))
  const vals = keys.map(k => withTenant[k])
  const ph   = keys.map((_, i) => `$${i + 1}`).join(', ')
  const cols = keys.join(', ')
  return tenantQueryOne(
    tenantId,
    `INSERT INTO ${table} (${cols}) VALUES (${ph}) RETURNING *`,
    vals,
  )
}

async function updateRow(
  tenantId: string,
  table: string,
  id: string,
  data: Record<string, unknown>,
) {
  const keys = Object.keys(data).filter(k => SAFE_COL.test(k) && k !== 'tenant_id' && k !== 'id')
  if (!keys.length) {
    return tenantQueryOne(tenantId, `SELECT * FROM ${table} WHERE id = $1`, [id])
  }
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
  const vals = keys.map(k => data[k])
  return tenantQueryOne(
    tenantId,
    `UPDATE ${table} SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...vals],
  )
}

/* ═══════════════════════════════════════════════════════════════
   CATEGORIES
═══════════════════════════════════════════════════════════════ */

const CATEGORY_FIELDS = ['nom', 'description', 'color'] as const

router.get('/categories', async (req: Request, res: Response) => {
  try {
    const rows = await tenantQuery(
      req.user!.tenantId,
      `SELECT * FROM stock_categories ORDER BY nom ASC`,
    )
    res.json(rows)
  } catch (err: any) {
    console.error('[stock/categories GET]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/categories', async (req: Request, res: Response) => {
  try {
    const data = pickFields(req.body, CATEGORY_FIELDS)
    if (!data.nom) return res.status(400).json({ error: 'Nom requis' })
    const row = await insertRow(req.user!.tenantId, 'stock_categories', data)
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Catégorie déjà existante' })
    console.error('[stock/categories POST]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/categories/:id', async (req: Request, res: Response) => {
  try {
    const row = await updateRow(req.user!.tenantId, 'stock_categories', req.params.id,
      pickFields(req.body, CATEGORY_FIELDS))
    if (!row) return res.status(404).json({ error: 'Non trouvé' })
    res.json(row)
  } catch (err: any) {
    console.error('[stock/categories PATCH]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    await tenantQuery(req.user!.tenantId,
      `DELETE FROM stock_categories WHERE id = $1`, [req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[stock/categories DELETE]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════
   SUPPLIERS
═══════════════════════════════════════════════════════════════ */

const SUPPLIER_FIELDS = ['nom', 'email', 'telephone', 'adresse', 'notes'] as const

router.get('/suppliers', async (req: Request, res: Response) => {
  try {
    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT * FROM stock_suppliers ORDER BY nom ASC`)
    res.json(rows)
  } catch (err: any) {
    console.error('[stock/suppliers GET]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/suppliers', async (req: Request, res: Response) => {
  try {
    const data = pickFields(req.body, SUPPLIER_FIELDS)
    if (!data.nom) return res.status(400).json({ error: 'Nom requis' })
    const row = await insertRow(req.user!.tenantId, 'stock_suppliers', data)
    res.status(201).json(row)
  } catch (err: any) {
    console.error('[stock/suppliers POST]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    const row = await updateRow(req.user!.tenantId, 'stock_suppliers', req.params.id,
      pickFields(req.body, SUPPLIER_FIELDS))
    if (!row) return res.status(404).json({ error: 'Non trouvé' })
    res.json(row)
  } catch (err: any) {
    console.error('[stock/suppliers PATCH]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/suppliers/:id', async (req: Request, res: Response) => {
  try {
    await tenantQuery(req.user!.tenantId,
      `DELETE FROM stock_suppliers WHERE id = $1`, [req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[stock/suppliers DELETE]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════
   PRODUCTS
═══════════════════════════════════════════════════════════════ */

const PRODUCT_FIELDS = [
  'sku', 'nom', 'description', 'category_id', 'supplier_id',
  'prix_achat', 'prix_vente', 'tva',
  'stock_actuel', 'stock_minimum',
  'image_url', 'is_active',
] as const

router.get('/products', async (req: Request, res: Response) => {
  const limit  = Math.min(Number(req.query.limit)  || 200, 1000)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const search = String(req.query.search || '').trim()

  try {
    const where:  string[] = []
    const params: any[]    = []

    if (search) {
      params.push(`%${search.toLowerCase()}%`)
      where.push(`(LOWER(p.nom) LIKE $${params.length} OR LOWER(p.sku) LIKE $${params.length})`)
    }
    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : ''

    params.push(limit)
    params.push(offset)

    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT p.*,
              c.nom   AS category_nom,
              c.color AS category_color,
              s.nom   AS supplier_nom
       FROM stock_products p
       LEFT JOIN stock_categories c ON c.id = p.category_id
       LEFT JOIN stock_suppliers  s ON s.id = p.supplier_id
       ${whereSQL}
       ORDER BY p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    res.json(rows)
  } catch (err: any) {
    console.error('[stock/products GET]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `SELECT * FROM stock_products WHERE id = $1`, [req.params.id])
    if (!row) return res.status(404).json({ error: 'Non trouvé' })
    res.json(row)
  } catch (err: any) {
    console.error('[stock/products GET:id]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/products', async (req: Request, res: Response) => {
  try {
    const data = pickFields(req.body, PRODUCT_FIELDS) as Record<string, unknown>
    if (!data.nom) return res.status(400).json({ error: 'Nom requis' })
    if (!data.sku || String(data.sku).trim() === '') data.sku = generateSku()

    const row = await insertRow(req.user!.tenantId, 'stock_products', data)
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'SKU déjà utilisé' })
    console.error('[stock/products POST]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/products/:id', async (req: Request, res: Response) => {
  try {
    const data = pickFields(req.body, PRODUCT_FIELDS)
    const row = await updateRow(req.user!.tenantId, 'stock_products', req.params.id, data)
    if (!row) return res.status(404).json({ error: 'Non trouvé' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'SKU déjà utilisé' })
    console.error('[stock/products PATCH]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    await tenantQuery(req.user!.tenantId,
      `DELETE FROM stock_products WHERE id = $1`, [req.params.id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[stock/products DELETE]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════
   MOVEMENTS  (trigger updates stock_actuel)
═══════════════════════════════════════════════════════════════ */

const MOVEMENT_FIELDS = [
  'product_id', 'type', 'quantite', 'reference', 'note', 'source', 'source_id',
] as const

router.get('/movements', async (req: Request, res: Response) => {
  const limit  = Math.min(Number(req.query.limit)  || 200, 1000)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const productId = String(req.query.product_id || '')

  try {
    const where:  string[] = []
    const params: any[]    = []
    if (productId) {
      params.push(productId)
      where.push(`m.product_id = $${params.length}`)
    }
    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : ''

    params.push(limit)
    params.push(offset)

    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT m.*, p.nom AS product_nom, p.sku AS product_sku
       FROM stock_movements m
       LEFT JOIN stock_products p ON p.id = m.product_id
       ${whereSQL}
       ORDER BY m.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    res.json(rows)
  } catch (err: any) {
    console.error('[stock/movements GET]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/movements', async (req: Request, res: Response) => {
  try {
    const data = pickFields(req.body, MOVEMENT_FIELDS) as Record<string, unknown>
    if (!data.product_id) return res.status(400).json({ error: 'Produit requis' })
    if (!data.type)       return res.status(400).json({ error: 'Type requis' })
    const qty = Number(data.quantite ?? 0)
    if (!Number.isFinite(qty) || qty < 0) {
      return res.status(400).json({ error: 'Quantité invalide' })
    }
    data.quantite = qty

    const row = await insertRow(req.user!.tenantId, 'stock_movements', data)
    res.status(201).json(row)
  } catch (err: any) {
    console.error('[stock/movements POST]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════
   ALERTS  — products below or at their minimum stock level
═══════════════════════════════════════════════════════════════ */

router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT id, sku, nom, stock_actuel, stock_minimum,
              CASE WHEN stock_actuel <= 0 THEN 'rupture' ELSE 'faible' END AS level
       FROM stock_products
       WHERE is_active = true AND stock_actuel <= stock_minimum
       ORDER BY stock_actuel ASC, nom ASC`,
    )
    res.json(rows)
  } catch (err: any) {
    console.error('[stock/alerts GET]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════
   INVOICE LINKS  (optional, keeps facture_lines untouched)
═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   TICKETS  (point-of-sale) — auto-decrement stock via trigger
═══════════════════════════════════════════════════════════════ */

function generateTicketNumber(): string {
  const d    = new Date()
  const ymd  = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `TKT-${ymd}-${rand}`
}

interface TicketLineInput {
  product_id:    string
  quantite:      number
  prix_unitaire: number
  tva?:          number
}

router.get('/tickets', async (req: Request, res: Response) => {
  const limit  = Math.min(Number(req.query.limit)  || 100, 500)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  try {
    /* Le point de vente lit la table `clients` par jointure, donc hors du
       CRUD générique et hors de son filtrage. Un commercial y retrouvait
       le nom de N'IMPORTE QUEL client de l'espace, ticket par ticket.

       On restreint la JOINTURE, pas la liste : les tickets restent tous
       visibles (ils appartiennent à la caisse, pas au portefeuille), mais
       le nom du client sort NULL quand il est hors périmètre. Filtrer les
       tickets eux-mêmes aurait faussé la caisse — c'est le contraire du
       « ne rien casser ».

       Placeholders : $1/$2 sont pris par limit/offset, le périmètre
       commence donc à $3. Postgres se moque de l'ordre d'apparition. */
    const perimetre = await clausePerimetre(
      { tenantId: req.user!.tenantId, userId: req.user!.userId, role: req.user!.role ?? '' },
      'client', 'c', 3,
    )
    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT t.*,
              c.nom AS client_full_nom,
              (SELECT COUNT(*) FROM stock_ticket_lines l WHERE l.ticket_id = t.id) AS lines_count
       FROM stock_tickets t
       LEFT JOIN clients c ON c.id = t.client_id${perimetre ? ` AND ${perimetre.sql}` : ''}
       ORDER BY t.date DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, ...(perimetre?.params ?? [])],
    )
    res.json(rows)
  } catch (err: any) {
    console.error('[stock/tickets GET]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/tickets/stats', async (req: Request, res: Response) => {
  try {
    const stats = await tenantQueryOne(req.user!.tenantId,
      `SELECT
         COUNT(*) FILTER (WHERE date::date = CURRENT_DATE)          AS today_count,
         COALESCE(SUM(total_ttc) FILTER (WHERE date::date = CURRENT_DATE AND statut = 'valide'), 0) AS today_revenue,
         COUNT(*) FILTER (WHERE date >= date_trunc('week', CURRENT_DATE))  AS week_count,
         COALESCE(SUM(total_ttc) FILTER (WHERE date >= date_trunc('week', CURRENT_DATE) AND statut = 'valide'), 0) AS week_revenue,
         COUNT(*) FILTER (WHERE date >= date_trunc('month', CURRENT_DATE)) AS month_count,
         COALESCE(SUM(total_ttc) FILTER (WHERE date >= date_trunc('month', CURRENT_DATE) AND statut = 'valide'), 0) AS month_revenue,
         COUNT(*)                                                    AS total_count,
         COALESCE(SUM(total_ttc) FILTER (WHERE statut = 'valide'), 0) AS total_revenue
       FROM stock_tickets`,
    )
    res.json(stats ?? {})
  } catch (err: any) {
    console.error('[stock/tickets/stats]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const ticket = await tenantQueryOne(req.user!.tenantId,
      `SELECT * FROM stock_tickets WHERE id = $1`, [req.params.id])
    if (!ticket) return res.status(404).json({ error: 'Non trouvé' })
    const lines = await tenantQuery(req.user!.tenantId,
      `SELECT * FROM stock_ticket_lines WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [req.params.id])
    res.json({ ...ticket, lines })
  } catch (err: any) {
    console.error('[stock/tickets/:id]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/tickets', async (req: Request, res: Response) => {
  const { client_id, client_nom, methode_paiement, notes, lines, numero } = req.body || {}

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Au moins une ligne est requise' })
  }
  for (const l of lines) {
    if (!l?.product_id || !(Number(l.quantite) > 0) || !(Number(l.prix_unitaire) >= 0)) {
      return res.status(400).json({ error: 'Ligne invalide (produit, quantité, prix)' })
    }
  }

  const tenantId = req.user!.tenantId

  try {
    /* Look up product info inline so we can store nom/sku snapshots */
    const productIds = (lines as TicketLineInput[]).map(l => l.product_id)
    const products = await tenantQuery<{ id: string; nom: string; sku: string; tva: number; stock_actuel: number }>(
      tenantId,
      `SELECT id, nom, sku, tva, stock_actuel FROM stock_products WHERE id = ANY($1::uuid[])`,
      [productIds],
    )
    const byId = new Map(products.map(p => [p.id, p]))

    /* Validate every product exists in this tenant */
    for (const l of lines as TicketLineInput[]) {
      if (!byId.has(l.product_id)) {
        return res.status(400).json({ error: `Produit introuvable: ${l.product_id}` })
      }
    }

    /* Compute totals — TTC = sum of (qty * prix_unitaire), HT/TVA derived per-line tva */
    let totalHt  = 0
    let totalTva = 0
    const enriched = (lines as TicketLineInput[]).map(l => {
      const p   = byId.get(l.product_id)!
      const tva = Number(l.tva ?? p.tva ?? 20)
      const qty = Number(l.quantite)
      const pu  = Number(l.prix_unitaire)
      const ht  = pu * qty / (1 + tva / 100)
      const ttc = pu * qty
      totalHt  += ht
      totalTva += ttc - ht
      return { ...l, tva, total_ht: ht, total_ttc: ttc, product_nom: p.nom, product_sku: p.sku }
    })
    const totalTtc = totalHt + totalTva

    const ticketNumero = String(numero || '').trim() || generateTicketNumber()

    const ticket = await tenantQueryOne<{ id: string }>(
      tenantId,
      `INSERT INTO stock_tickets
         (tenant_id, numero, client_id, client_nom, methode_paiement, statut, notes,
          total_ht, total_tva, total_ttc)
       VALUES ($1, $2, $3, $4, $5, 'valide', $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId,
        ticketNumero,
        client_id || null,
        client_nom || null,
        methode_paiement || 'especes',
        notes || null,
        totalHt.toFixed(2),
        totalTva.toFixed(2),
        totalTtc.toFixed(2),
      ],
    )
    if (!ticket) return res.status(500).json({ error: 'Création ticket échouée' })

    /* Insert lines — trigger creates `sortie` movements automatically */
    for (const l of enriched) {
      await tenantQuery(
        tenantId,
        `INSERT INTO stock_ticket_lines
           (tenant_id, ticket_id, product_id, product_nom, product_sku,
            quantite, prix_unitaire, tva, total_ht, total_ttc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId, ticket.id, l.product_id, l.product_nom, l.product_sku,
          l.quantite, l.prix_unitaire, l.tva,
          l.total_ht.toFixed(2), l.total_ttc.toFixed(2),
        ],
      )
    }

    res.status(201).json(ticket)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Numéro déjà utilisé' })
    console.error('[stock/tickets POST]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/tickets/:id/cancel', async (req: Request, res: Response) => {
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `UPDATE stock_tickets SET statut = 'annule' WHERE id = $1 AND statut = 'valide' RETURNING *`,
      [req.params.id])
    if (!row) return res.status(404).json({ error: 'Ticket introuvable ou déjà annulé' })
    res.json(row)
  } catch (err: any) {
    console.error('[stock/tickets cancel]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/invoice-links', async (req: Request, res: Response) => {
  const { facture_line_id, product_id, quantite } = req.body || {}
  if (!facture_line_id || !product_id) {
    return res.status(400).json({ error: 'facture_line_id et product_id requis' })
  }
  const qty = Number(quantite ?? 1)
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantité invalide' })
  }
  try {
    const row = await tenantQueryOne(req.user!.tenantId,
      `INSERT INTO stock_invoice_links (tenant_id, facture_line_id, product_id, quantite)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (facture_line_id) DO UPDATE
         SET product_id = EXCLUDED.product_id,
             quantite   = EXCLUDED.quantite
       RETURNING *`,
      [req.user!.tenantId, facture_line_id, product_id, qty],
    )
    res.status(201).json(row)
  } catch (err: any) {
    console.error('[stock/invoice-links POST]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
