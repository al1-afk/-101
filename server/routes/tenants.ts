import { Router } from 'express'
import { query, queryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { invalidateRole } from '../lib/effectiveRole'

const router = Router()

/* ── GET /api/tenants/resolve/:slug — public (no auth) ──────── */
router.get('/resolve/:slug', async (req, res) => {
  const { slug } = req.params
  const tenant = await queryOne(
    `SELECT id, slug, name, plan, logo_url, primary_color, is_active
     FROM tenants WHERE slug = $1 AND is_active = TRUE`,
    [slug.toLowerCase()]
  )
  if (!tenant) return res.status(404).json({ error: 'Workspace introuvable' })
  res.json(tenant)
})

/* ── GET /api/tenants/members — liste membres du tenant ──────── */
router.get('/members', requireAuth, async (req, res) => {
  const { tenantId } = req.user!
  try {
    const members = await query(
      `SELECT tu.user_id, tu.role, tu.status, tu.invited_at,
              u.email, u.name
       FROM tenant_users tu
       LEFT JOIN users u ON u.id = tu.user_id
       WHERE tu.tenant_id = $1
       ORDER BY tu.invited_at DESC`,
      [tenantId]
    )
    res.json(members)
  } catch (err: any) {
    console.error('[tenants/members]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── PATCH /api/tenants — mettre à jour le tenant (admin) ───── */
router.patch('/', requireAuth, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Admin requis' })
  const { name, logo_url, primary_color, settings } = req.body
  const tenant = await queryOne(
    `UPDATE tenants SET name = COALESCE($1, name),
      logo_url = COALESCE($2, logo_url),
      primary_color = COALESCE($3, primary_color),
      settings = COALESCE($4, settings),
      updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [name, logo_url, primary_color, settings, req.user!.tenantId]
  )
  res.json(tenant)
})

/* ── POST /api/tenants/invite ────────────────────────────────── */
router.post('/invite', requireAuth, async (req, res) => {
  if (!['admin', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Permission insuffisante' })
  }
  const { email, role = 'viewer' } = req.body
  const { tenantId, userId } = req.user!

  const invitee = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`, [email]
  )

  const member = await queryOne(
    `INSERT INTO tenant_users (tenant_id, user_id, role, invited_by, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'
     RETURNING *`,
    [tenantId, invitee?.id ?? null, role, userId, invitee ? 'active' : 'pending']
  )
  /* Le rôle vient de changer : on purge le cache pour que la nouvelle
     valeur s'applique à la requête suivante, sans attendre la TTL. */
  if (invitee?.id) invalidateRole(invitee.id, tenantId)
  res.status(201).json(member)
})

/* ── DELETE /api/tenants/members/:userId ─────────────────────── */
router.delete('/members/:userId', requireAuth, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Admin requis' })
  await query(
    `UPDATE tenant_users SET status = 'revoked'
     WHERE user_id = $1 AND tenant_id = $2`,
    [req.params.userId, req.user!.tenantId]
  )
  /* Révocation immédiate : sans cette purge, l'utilisateur garderait
     ses droits jusqu'à 30 s (TTL du cache). */
  invalidateRole(String(req.params.userId), req.user!.tenantId)
  res.json({ success: true })
})

/* ── GET /api/tenants/members/:userId/access ─────────────────── */
router.get('/members/:userId/access', requireAuth, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Admin requis' })
  const row = await queryOne<{ allowed_modules: string[] | null; role: string }>(
    `SELECT allowed_modules, role FROM tenant_users
      WHERE user_id = $1 AND tenant_id = $2`,
    [req.params.userId, req.user!.tenantId]
  )
  if (!row) return res.status(404).json({ error: 'Membre introuvable' })
  res.json(row)
})

/* ── PATCH /api/tenants/members/:userId/access ───────────────── */
router.patch('/members/:userId/access', requireAuth, async (req, res) => {
  if (req.user!.role !== 'admin') return res.status(403).json({ error: 'Admin requis' })
  const { allowed_modules } = req.body ?? {}
  /* Refuse self-edit so an admin can't lock themselves out */
  if (req.params.userId === req.user!.userId) {
    return res.status(400).json({ error: 'Vous ne pouvez pas restreindre vos propres accès' })
  }
  /* `null` resets to role-default; array stores explicit list */
  let value: string[] | null
  if (allowed_modules === null || allowed_modules === undefined) {
    value = null
  } else if (Array.isArray(allowed_modules)) {
    /* Whitelist module identifiers — letters, digits, underscore, dash */
    value = allowed_modules
      .filter(m => typeof m === 'string' && /^[a-z0-9_-]{1,40}$/i.test(m))
      .slice(0, 80)
  } else {
    return res.status(400).json({ error: 'allowed_modules doit être un tableau ou null' })
  }
  const row = await queryOne(
    `UPDATE tenant_users SET allowed_modules = $1
      WHERE user_id = $2 AND tenant_id = $3
      RETURNING allowed_modules, role`,
    [value, req.params.userId, req.user!.tenantId]
  )
  if (!row) return res.status(404).json({ error: 'Membre introuvable' })
  res.json(row)
})

export default router
