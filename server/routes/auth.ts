import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { query, queryOne } from '../db/pool'
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
  requireAuth,
} from '../middleware/auth'
import { authLimiter, passwordLimiter } from '../middleware/security'
import { sendEmail, loginCodeEmail, passwordResetEmail } from '../lib/email'
import { teamInvitationEmail } from '../lib/email-team'

const router = Router()

/* ── Helpers ─────────────────────────────────────────────────── */

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function issueTokenPair(
  res: Response,
  user: { id: string; email: string; role: string; tenant_id: string; slug: string },
  ip: string,
  ua: string,
) {
  const accessToken  = signAccessToken({
    userId: user.id, email: user.email, tenantId: user.tenant_id, role: user.role,
  })
  const refreshToken = signRefreshToken({ userId: user.id, tenantId: user.tenant_id })
  const tokenHash    = hashToken(refreshToken)

  /* Store hashed refresh token — raw token NEVER written to DB */
  await query(
    `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')`,
    [user.id, user.tenant_id, tokenHash, ip, ua]
  )

  /* httpOnly cookie — not readable by JS */
  res.cookie('gestiq_refresh', refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     '/api/auth',
  })

  return { accessToken, tenantSlug: user.slug }
}

/* ── POST /api/auth/register ─────────────────────────────────── */
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const { email, password, name, tenantSlug, tenantName } = req.body

  if (!email || !password || !tenantSlug || !tenantName) {
    return res.status(400).json({ error: 'Tous les champs sont requis' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe: minimum 8 caractères' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' })
  }

  const slug = tenantSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 63)

  try {
    const [existing, existingTenant] = await Promise.all([
      queryOne('SELECT id FROM users WHERE email = $1', [email]),
      queryOne('SELECT id FROM tenants WHERE slug = $1', [slug]),
    ])
    if (existing)       return res.status(409).json({ error: 'Email déjà utilisé' })
    if (existingTenant) return res.status(409).json({ error: 'Slug déjà pris' })

    const hash = await bcrypt.hash(password, 12)

    const user = await queryOne<{ id: string }>(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      [email, hash, name ?? email]
    )
    const tenant = await queryOne<{ id: string }>(
      `INSERT INTO tenants (slug, name, owner_id) VALUES ($1, $2, $3) RETURNING id`,
      [slug, tenantName, user!.id]
    )
    await query(
      `INSERT INTO tenant_users (tenant_id, user_id, role, status) VALUES ($1, $2, 'admin', 'active')`,
      [tenant!.id, user!.id]
    )

    const { accessToken, tenantSlug: s } = await issueTokenPair(
      res,
      { id: user!.id, email, role: 'admin', tenant_id: tenant!.id, slug },
      req.ip ?? '',
      req.headers['user-agent'] ?? '',
    )

    res.status(201).json({ token: accessToken, tenantSlug: s, tenantId: tenant!.id })
  } catch (err: any) {
    console.error('[register]', err.message)
    res.status(500).json({ error: 'Erreur lors de l\'inscription' })
  }
})

/* ── POST /api/auth/login ────────────────────────────────────── */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password, tenantSlug } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' })
  }

  try {
    /* Brute-force: count recent failures from this IP + email */
    const recentFails = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::int as count FROM login_attempts
       WHERE (email = $1 OR ip_address = $2::inet)
         AND success = false
         AND attempted_at > NOW() - INTERVAL '15 minutes'`,
      [email, req.ip ?? '0.0.0.0']
    )
    if (Number(recentFails?.count ?? 0) >= 10) {
      return res.status(429).json({
        error: 'Compte temporairement verrouillé. Réessayez dans 15 minutes.',
      })
    }

    const user = await queryOne<{ id: string; password_hash: string; name: string; is_active: boolean; email_verified_at: string | null }>(
      `SELECT id, password_hash, name, is_active, email_verified_at FROM users WHERE email = $1`, [email]
    )

    const valid = user ? await bcrypt.compare(password, user.password_hash) : false

    /* Always log attempt */
    await query(
      `INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2::inet, $3)`,
      [email, req.ip ?? '0.0.0.0', valid]
    )

    if (!user || !valid) {
      return res.status(401).json({ error: 'Identifiants incorrects' })
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Compte désactivé' })
    }

    let memberRow: any
    if (tenantSlug) {
      memberRow = await queryOne(
        `SELECT tu.tenant_id, tu.role, t.slug
         FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id
         WHERE tu.user_id = $1 AND t.slug = $2 AND tu.status = 'active'`,
        [user.id, tenantSlug]
      )
    } else {
      memberRow = await queryOne(
        `SELECT tu.tenant_id, tu.role, t.slug
         FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id
         WHERE tu.user_id = $1 AND tu.status = 'active'
         ORDER BY tu.invited_at LIMIT 1`,
        [user.id]
      )
    }

    if (!memberRow) return res.status(403).json({ error: 'Accès refusé' })

    /* 1ʳᵉ connexion (email jamais vérifié) → émet un code par email
       et exige /verify-login avant d'émettre les tokens. */
    if (!user.email_verified_at) {
      /* Invalide tout code non consommé pour cet utilisateur */
      await query(
        `UPDATE login_verification_codes SET used = true
         WHERE user_id = $1 AND used = false`,
        [user.id]
      )
      const code     = String(Math.floor(100000 + Math.random() * 900000))
      const codeHash = await bcrypt.hash(code, 10)
      await query(
        `INSERT INTO login_verification_codes
           (user_id, tenant_id, email, code_hash, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes', $5::inet, $6)`,
        [user.id, memberRow.tenant_id, email, codeHash, req.ip ?? '0.0.0.0', req.headers['user-agent'] ?? '']
      )
      try {
        const tpl = loginCodeEmail(code)
        await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text })
      } catch (e: any) {
        console.error('[login:first-verify-email]', e?.message ?? e)
      }
      return res.json({ needsVerification: true, email })
    }

    const { accessToken, tenantSlug: s } = await issueTokenPair(
      res,
      { id: user.id, email, role: memberRow.role, tenant_id: memberRow.tenant_id, slug: memberRow.slug },
      req.ip ?? '',
      req.headers['user-agent'] ?? '',
    )

    res.json({ token: accessToken, tenantSlug: s, tenantId: memberRow.tenant_id, role: memberRow.role })
  } catch (err: any) {
    console.error('[login]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/verify-login — Finalise sign-in with the code ─ */
router.post('/verify-login', authLimiter, async (req: Request, res: Response) => {
  const { email, code, tenantSlug } = req.body
  if (!email || !code) {
    return res.status(400).json({ error: 'Email et code requis' })
  }

  try {
    const row = await queryOne<{ id: string; user_id: string; tenant_id: string; code_hash: string; attempts: number }>(
      `SELECT id, user_id, tenant_id, code_hash, attempts FROM login_verification_codes
       WHERE email = $1 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    )

    if (!row) {
      return res.status(400).json({ error: 'Code invalide ou expiré' })
    }

    if (row.attempts >= 5) {
      await query(`UPDATE login_verification_codes SET used = true WHERE id = $1`, [row.id])
      return res.status(429).json({ error: 'Trop de tentatives. Reconnectez-vous pour recevoir un nouveau code.' })
    }

    const valid = await bcrypt.compare(String(code), row.code_hash)
    if (!valid) {
      await query(
        `UPDATE login_verification_codes SET attempts = attempts + 1 WHERE id = $1`,
        [row.id]
      )
      return res.status(400).json({ error: 'Code incorrect' })
    }

    /* Mark code consumed + user email vérifié (idempotent). */
    await query(`UPDATE login_verification_codes SET used = true WHERE id = $1`, [row.id])
    await query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1`,
      [row.user_id]
    )

    /* Resolve the user + (optional) requested tenant — same logic as /login */
    const memberRow = tenantSlug
      ? await queryOne<{ tenant_id: string; role: string; slug: string }>(
          `SELECT tu.tenant_id, tu.role, t.slug
           FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id
           WHERE tu.user_id = $1 AND t.slug = $2 AND tu.status = 'active'`,
          [row.user_id, tenantSlug]
        )
      : await queryOne<{ tenant_id: string; role: string; slug: string }>(
          `SELECT tu.tenant_id, tu.role, t.slug
           FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id
           WHERE tu.user_id = $1 AND tu.tenant_id = $2 AND tu.status = 'active'
           LIMIT 1`,
          [row.user_id, row.tenant_id]
        )

    if (!memberRow) return res.status(403).json({ error: 'Accès refusé' })

    const { accessToken, tenantSlug: s } = await issueTokenPair(
      res,
      { id: row.user_id, email, role: memberRow.role, tenant_id: memberRow.tenant_id, slug: memberRow.slug },
      req.ip ?? '',
      req.headers['user-agent'] ?? '',
    )

    res.json({ token: accessToken, tenantSlug: s, tenantId: memberRow.tenant_id, role: memberRow.role })
  } catch (err: any) {
    console.error('[verify-login]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/resend-login-code — Re-issue a code ─────────── */
router.post('/resend-login-code', authLimiter, async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email requis' })

  try {
    /* Must have a recent (within 30 min) pending code — prevents
       cold-start abuse of this endpoint without a real login attempt. */
    const recent = await queryOne<{ user_id: string; tenant_id: string }>(
      `SELECT user_id, tenant_id FROM login_verification_codes
       WHERE email = $1 AND created_at > NOW() - INTERVAL '30 minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    )
    if (!recent) {
      /* Same opaque success as forgot-password to avoid enumeration */
      return res.json({ success: true })
    }

    await query(
      `UPDATE login_verification_codes SET used = true
       WHERE user_id = $1 AND used = false`,
      [recent.user_id]
    )

    const code     = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = await bcrypt.hash(code, 10)

    await query(
      `INSERT INTO login_verification_codes
         (user_id, tenant_id, email, code_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes', $5::inet, $6)`,
      [recent.user_id, recent.tenant_id, email, codeHash, req.ip ?? '0.0.0.0', req.headers['user-agent'] ?? '']
    )

    try {
      const tpl = loginCodeEmail(code)
      await sendEmail({ to: email, ...tpl })
    } catch (e: any) {
      console.error('[resend-login-code:email]', e?.message ?? e)
    }

    res.json({ success: true })
  } catch (err: any) {
    console.error('[resend-login-code]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/forgot-password — Generate 6-digit code ───── */
router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' })
  }

  try {
    const user = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND is_active = true`, [email]
    )

    /* Pas de compte users. Peut-être un team_member invité qui n'a jamais
       accepté son invitation ? Dans ce cas, on lui renvoie une nouvelle
       invitation pour qu'il crée son mot de passe. */
    if (!user) {
      const member = await queryOne<{
        id: string; tenant_id: string; prenom: string | null;
        job_title: string | null; email: string;
      }>(
        `SELECT id, tenant_id, prenom, job_title, email FROM public.team_members
          WHERE email = $1 AND user_id IS NULL AND account_status != 'archived'
          LIMIT 1`,
        [email]
      )
      if (member) {
        const inviteToken = crypto.randomBytes(32).toString('hex')
        await query(
          `UPDATE public.team_members
              SET invitation_token = $1, invitation_sent_at = NOW(),
                  invitation_expires_at = NOW() + INTERVAL '7 days',
                  account_status = 'invited', updated_at = NOW()
            WHERE id = $2`,
          [inviteToken, member.id]
        )
        const originHeader = req.headers.origin
        const inviteBase = typeof originHeader === 'string' && originHeader.length > 0
          ? originHeader
          : (process.env.NODE_ENV === 'production' ? 'https://101.nextgital.tech' : 'http://localhost:5173')
        const inviteUrl = `${inviteBase}/invite/${inviteToken}`
        const tenant = await queryOne<{ name: string }>(
          `SELECT name FROM public.tenants WHERE id = $1`, [member.tenant_id]
        )
        try {
          const tpl = teamInvitationEmail({
            firstName:   member.prenom ?? '',
            inviterName: 'L\'équipe',
            tenantName:  tenant?.name ?? 'Next Gital',
            jobTitle:    member.job_title ?? '',
            inviteUrl,
            sopCategories: [],
          })
          await sendEmail({ to: member.email, ...tpl })
        } catch (e: any) {
          console.error('[forgot-password:reinvite]', e?.message ?? e)
        }
      }
      /* Always respond success to avoid email enumeration */
      return res.json({ success: true })
    }

    /* Invalidate any prior unused codes for this user */
    await query(
      `UPDATE password_reset_codes SET used = true
       WHERE user_id = $1 AND used = false`,
      [user.id]
    )

    const code      = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash  = await bcrypt.hash(code, 10)

    await query(
      `INSERT INTO password_reset_codes (user_id, email, code_hash, expires_at, ip_address)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', $4::inet)`,
      [user.id, email, codeHash, req.ip ?? '0.0.0.0']
    )

    try {
      const tpl = passwordResetEmail(code)
      await sendEmail({ to: email, ...tpl })
    } catch (e: any) {
      console.error('[forgot-password:email]', e?.message ?? e)
    }

    res.json({ success: true })
  } catch (err: any) {
    console.error('[forgot-password]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/reset-password — Verify code + update hash ── */
router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Tous les champs sont requis' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Mot de passe: minimum 8 caractères' })
  }

  try {
    const row = await queryOne<{ id: string; user_id: string; code_hash: string; attempts: number }>(
      `SELECT id, user_id, code_hash, attempts FROM password_reset_codes
       WHERE email = $1 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    )

    if (!row) {
      return res.status(400).json({ error: 'Code invalide ou expiré' })
    }

    if (row.attempts >= 5) {
      await query(`UPDATE password_reset_codes SET used = true WHERE id = $1`, [row.id])
      return res.status(429).json({ error: 'Trop de tentatives. Demandez un nouveau code.' })
    }

    const valid = await bcrypt.compare(String(code), row.code_hash)
    if (!valid) {
      await query(
        `UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = $1`,
        [row.id]
      )
      return res.status(400).json({ error: 'Code incorrect' })
    }

    const newHash = await bcrypt.hash(newPassword, 12)
    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, row.user_id]
    )
    await query(`UPDATE password_reset_codes SET used = true WHERE id = $1`, [row.id])

    /* Revoke all refresh tokens — force re-login everywhere */
    await query(
      `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`,
      [row.user_id]
    )

    res.json({ success: true })
  } catch (err: any) {
    console.error('[reset-password]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/refresh — Rotation: old token revoked ─────── */
router.post('/refresh', authLimiter, async (req: Request, res: Response) => {
  const rawToken = req.cookies?.gestiq_refresh
  if (!rawToken) return res.status(401).json({ error: 'Session expirée', code: 'NO_REFRESH' })

  const payload = verifyRefreshToken(rawToken)
  if (!payload) {
    res.clearCookie('gestiq_refresh', { path: '/api/auth' })
    return res.status(401).json({ error: 'Session invalide', code: 'INVALID_REFRESH' })
  }

  const tokenHash = hashToken(rawToken)

  try {
    /* Find + atomically revoke the token in one query */
    const stored = await queryOne<{ id: string; revoked: boolean; expires_at: string }>(
      `UPDATE refresh_tokens
       SET revoked = true
       WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()
       RETURNING id, revoked, expires_at`,
      [tokenHash]
    )

    if (!stored) {
      /* Token reuse detected — revoke ALL tokens for this user (session hijack attempt) */
      await query(
        `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`,
        [payload.userId]
      )
      res.clearCookie('gestiq_refresh', { path: '/api/auth' })
      return res.status(401).json({ error: 'Session compromise détectée', code: 'TOKEN_REUSE' })
    }

    const row = await queryOne<{ id: string; email: string; role: string; tenant_id: string; slug: string }>(
      `SELECT u.id, u.email, tu.role, tu.tenant_id, t.slug
       FROM users u
       JOIN tenant_users tu ON tu.user_id = u.id
       JOIN tenants t ON t.id = tu.tenant_id
       WHERE u.id = $1 AND tu.tenant_id = $2 AND tu.status = 'active' AND u.is_active = true`,
      [payload.userId, payload.tenantId]
    )
    if (!row) {
      res.clearCookie('gestiq_refresh', { path: '/api/auth' })
      return res.status(401).json({ error: 'Utilisateur introuvable' })
    }

    const { accessToken } = await issueTokenPair(
      res, row, req.ip ?? '', req.headers['user-agent'] ?? ''
    )

    res.json({ token: accessToken })
  } catch (err: any) {
    console.error('[refresh]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/logout ───────────────────────────────────── */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const rawToken = req.cookies?.gestiq_refresh
  if (rawToken) {
    const tokenHash = hashToken(rawToken)
    await query(
      `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
      [tokenHash]
    ).catch(() => {})
  }
  res.clearCookie('gestiq_refresh', { path: '/api/auth' })
  res.json({ success: true })
})

/* ── POST /api/auth/change-password ─────────────────────────── */
router.post('/change-password', requireAuth, passwordLimiter, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Les deux mots de passe sont requis' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Minimum 8 caractères requis' })
  }

  try {
    const user = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1', [req.user!.userId]
    )
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    const valid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!valid) return res.status(400).json({ error: 'Mot de passe actuel incorrect' })

    const hash = await bcrypt.hash(newPassword, 12)
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user!.userId])

    /* Revoke ALL refresh tokens — force re-login on all devices */
    await query(
      `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`,
      [req.user!.userId]
    )
    res.clearCookie('gestiq_refresh', { path: '/api/auth' })

    res.json({ success: true })
  } catch (err: any) {
    console.error('[change-password]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/auth/me ────────────────────────────────────────── */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { userId, tenantId } = req.user!
  try {
    const user = await queryOne(
      `SELECT u.id, u.email, u.name, tu.role, tu.allowed_modules,
              t.slug, t.name as tenant_name, t.plan
       FROM users u
       JOIN tenant_users tu ON tu.user_id = u.id
       JOIN tenants t ON t.id = tu.tenant_id
       WHERE u.id = $1 AND tu.tenant_id = $2 AND u.is_active = true`,
      [userId, tenantId]
    )
    if (!user) return res.status(401).json({ error: 'Session invalide' })
    res.json(user)
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
