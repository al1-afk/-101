/**
 * Routes admin 2FA — permettent à un administrateur de :
 *   • lister les demandes de connexion en attente (pending)
 *   • APPROUVER une demande (mode admin_approval) → le user reçoit le token
 *   • REJETER une demande (tous modes) → le user est bloqué
 *   • GÉNÉRER un code (mode admin_manual) → code montré 1 seule fois à l'admin,
 *     qui le communique à l'utilisateur (téléphone, WhatsApp, en personne…)
 *   • VOIR l'historique des connexions (log)
 *   • CHANGER le mode 2FA d'un utilisateur (email | admin_manual | admin_approval)
 *
 * Sécurité :
 *   - RBAC : réservé aux rôles 'admin' (owner du tenant).
 *   - Scope tenant strict : un admin ne voit que les demandes de SON tenant.
 *   - Les codes générés sont bcrypt-hashés en DB, la version en clair est
 *     retournée UNE SEULE FOIS dans la réponse HTTP (jamais loguée).
 */
import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query, queryOne } from '../db/pool'
import { requireAuth, requireRole } from '../middleware/auth'
import { logger } from '../lib/logger'

const router = Router()
router.use(requireAuth)
router.use(requireRole('admin'))

/* ── GET /api/admin/2fa/pending ───────────────────────────────── */
router.get('/pending', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const rows = await query<{
      id: string; email: string; method: string; status: string;
      ip_address: string; user_agent: string; created_at: string;
      expires_at: string; has_code: boolean;
      user_id: string; user_name: string;
    }>(
      `SELECT lvc.id, lvc.email, lvc.method, lvc.status,
              lvc.ip_address::text AS ip_address, lvc.user_agent,
              lvc.created_at, lvc.expires_at,
              (lvc.code_hash IS NOT NULL) AS has_code,
              lvc.user_id, u.name AS user_name
         FROM login_verification_codes lvc
         JOIN users u ON u.id = lvc.user_id
        WHERE lvc.tenant_id = $1
          AND lvc.status = 'pending'
          AND lvc.expires_at > NOW()
        ORDER BY lvc.created_at DESC
        LIMIT 100`,
      [tenantId]
    )
    res.json(rows)
  } catch (err: any) {
    logger.error('[admin/2fa/pending]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/admin/2fa/history — audit log (100 derniers) ───── */
router.get('/history', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  try {
    const rows = await query(
      `SELECT lh.id, lh.email, lh.method, lh.event, lh.success,
              lh.ip_address::text AS ip_address, lh.user_agent,
              lh.created_at, lh.metadata,
              u.name AS user_name
         FROM login_history lh
         LEFT JOIN users u ON u.id = lh.user_id
        WHERE lh.tenant_id = $1
        ORDER BY lh.created_at DESC
        LIMIT $2`,
      [tenantId, limit]
    )
    res.json(rows)
  } catch (err: any) {
    logger.error('[admin/2fa/history]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/admin/2fa/:id/approve ─────────────────────────── */
router.post('/:id/approve', async (req: Request, res: Response) => {
  const { id } = req.params
  const tenantId = req.user!.tenantId
  const adminId  = req.user!.userId
  try {
    const row = await queryOne<{ id: string; status: string; method: string }>(
      `UPDATE login_verification_codes
          SET status = 'approved', approved_by = $2, approved_at = NOW()
        WHERE id = $1 AND tenant_id = $3 AND status = 'pending'
        RETURNING id, status, method`,
      [id, adminId, tenantId]
    )
    if (!row) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée' })
    /* Ping le journal */
    await query(
      `INSERT INTO login_history
         (user_id, tenant_id, email, method, event, success, challenge_id, metadata)
       SELECT lvc.user_id, $2, lvc.email, lvc.method, 'approved', true, lvc.id,
              jsonb_build_object('by', $3::uuid)
         FROM login_verification_codes lvc
        WHERE lvc.id = $1`,
      [id, tenantId, adminId]
    )
    res.json({ success: true, method: row.method })
  } catch (err: any) {
    logger.error('[admin/2fa/approve]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/admin/2fa/:id/reject ──────────────────────────── */
router.post('/:id/reject', async (req: Request, res: Response) => {
  const { id } = req.params
  const tenantId = req.user!.tenantId
  const adminId  = req.user!.userId
  try {
    const row = await queryOne<{ id: string }>(
      `UPDATE login_verification_codes
          SET status = 'rejected', rejected_at = NOW(), approved_by = $2
        WHERE id = $1 AND tenant_id = $3 AND status = 'pending'
        RETURNING id`,
      [id, adminId, tenantId]
    )
    if (!row) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée' })
    await query(
      `INSERT INTO login_history
         (user_id, tenant_id, email, method, event, success, challenge_id, metadata)
       SELECT lvc.user_id, $2, lvc.email, lvc.method, 'rejected', false, lvc.id,
              jsonb_build_object('by', $3::uuid)
         FROM login_verification_codes lvc
        WHERE lvc.id = $1`,
      [id, tenantId, adminId]
    )
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[admin/2fa/reject]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/admin/2fa/:id/generate-code ─────────────────────
   Pour mode admin_manual : génère un code 6 chiffres, le hash, le
   sauvegarde en DB, et le renvoie EN CLAIR UNE SEULE FOIS à l'admin
   pour qu'il le communique à l'utilisateur (téléphone, présence…). */
router.post('/:id/generate-code', async (req: Request, res: Response) => {
  const { id } = req.params
  const tenantId = req.user!.tenantId
  try {
    const row = await queryOne<{ id: string; method: string; status: string }>(
      `SELECT id, method, status FROM login_verification_codes
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    )
    if (!row) return res.status(404).json({ error: 'Demande introuvable' })
    if (row.status !== 'pending') return res.status(400).json({ error: 'Demande déjà traitée' })
    if (row.method !== 'admin_manual') {
      return res.status(400).json({ error: 'Ce mode ne permet pas la génération manuelle de code' })
    }

    const code     = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = await bcrypt.hash(code, 10)
    await query(
      `UPDATE login_verification_codes
          SET code_hash = $2, attempts = 0,
              expires_at = GREATEST(expires_at, NOW() + INTERVAL '10 minutes')
        WHERE id = $1`,
      [id, codeHash]
    )
    /* Ne jamais logger le code en clair. */
    logger.info(`[admin/2fa] code manual issued for challenge=${id} by admin=${req.user!.userId}`)
    res.json({ code, expiresInMinutes: 10 })
  } catch (err: any) {
    logger.error('[admin/2fa/generate-code]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── PATCH /api/admin/users/:userId/twofa-mode ─────────────────
   Change le mode 2FA d'un utilisateur du tenant. */
router.patch('/users/:userId/twofa-mode', async (req: Request, res: Response) => {
  const { userId } = req.params
  const { mode }   = req.body
  const tenantId   = req.user!.tenantId

  if (!['email', 'admin_manual', 'admin_approval'].includes(mode)) {
    return res.status(400).json({ error: 'Mode invalide' })
  }
  try {
    /* Vérifie que ce user appartient bien à ce tenant. */
    const belongs = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM tenant_users WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [userId, tenantId]
    )
    if (!belongs) return res.status(404).json({ error: 'Utilisateur introuvable' })

    await query(`UPDATE users SET twofa_mode = $2, updated_at = NOW() WHERE id = $1`, [userId, mode])
    res.json({ success: true, mode })
  } catch (err: any) {
    logger.error('[admin/2fa/users/twofa-mode]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/admin/users — liste des users du tenant avec mode 2FA ─ */
router.get('/users', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const rows = await query(
      `SELECT u.id, u.email, u.name, u.twofa_mode, u.is_active,
              tu.role,
              (SELECT COUNT(*)::int FROM trusted_devices td
                WHERE td.user_id = u.id AND td.revoked_at IS NULL AND td.expires_at > NOW()
              ) AS trusted_devices_count
         FROM users u
         JOIN tenant_users tu ON tu.user_id = u.id
        WHERE tu.tenant_id = $1 AND tu.status = 'active'
        ORDER BY u.name`,
      [tenantId]
    )
    res.json(rows)
  } catch (err: any) {
    logger.error('[admin/2fa/users]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── DELETE /api/admin/users/:userId/devices — révoque tous les trusted
   devices d'un utilisateur (force ré-2FA à sa prochaine connexion). */
router.delete('/users/:userId/devices', async (req: Request, res: Response) => {
  const { userId } = req.params
  const tenantId   = req.user!.tenantId
  try {
    const belongs = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM tenant_users WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [userId, tenantId]
    )
    if (!belongs) return res.status(404).json({ error: 'Utilisateur introuvable' })
    const result = await query<{ id: string }>(
      `UPDATE trusted_devices SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
      [userId]
    )
    res.json({ success: true, revoked: result.length })
  } catch (err: any) {
    logger.error('[admin/2fa/users/devices/revoke]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
