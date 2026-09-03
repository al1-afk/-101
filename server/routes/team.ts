/**
 * Team management (admin endpoints) + Member auth + invitation flow.
 *
 *  /api/team/invite                     POST   (admin)   — create + email invite
 *  /api/team/invite/:token              GET    (public)  — verify invite token
 *  /api/team/invite/:token/accept       POST   (public)  — set password, link user
 *  /api/team/auth/login                 POST   (public)  — member login (no 2FA)
 *  /api/team/auth/logout                POST   (member)  — logout
 *  /api/team/auth/me                    GET    (member)  — current profile
 *
 *  /api/team/members                    GET    (admin)   — list members + access
 *  /api/team/members/:id                GET    (admin)   — full detail
 *  /api/team/members/:id                PATCH  (admin)   — update profile
 *  /api/team/members/:id/access         PUT    (admin)   — replace access list
 *  /api/team/members/:id/suspend        POST   (admin)
 *  /api/team/members/:id/activate       POST   (admin)
 *  /api/team/members/:id/resend         POST   (admin)
 *  /api/team/members/:id/reset-password POST   (admin)
 *  /api/team/members/:id                DELETE (admin)   — archive
 *
 *  /api/team/members/:id/tasks          GET / POST       (admin)
 *  /api/team/tasks/:taskId              PATCH / DELETE   (admin)
 *  /api/team/members/:id/activity       GET              (admin)
 */
import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query, queryOne, tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth, signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth'
import { NextFunction } from 'express'
import { authLimiter, inviteLimiter } from '../middleware/security'
import { sendEmail } from '../lib/email'
import { teamInvitationEmail, teamPasswordResetEmail } from '../lib/email-team'
import { randomToken, hashToken, maskToken, tokenPrefix } from '../lib/tokenSecurity'
import { logger } from '../lib/logger'

const router = Router()

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* Référentiel de base. Il n'est PAS exhaustif : un membre peut créer une
   catégorie à la volée en écrivant un SOP (mySpaceSops.ensureCategoryWritable).
   Filtrer sur cette seule liste effaçait la catégorie maison au premier
   enregistrement des accès depuis /equipe — les SOPs restaient en base,
   invisibles pour leur auteur. */
const BASE_CATEGORIES = new Set([
  'whatsapp','quick','sales','onboarding','delivery','support','marketing',
  'faq','ai','projets','dev','media_buyer','prospection','designer',
  'commercial','community_manager',
])

/** Catégories réellement existantes dans l'espace : référentiel + celles
 *  déjà portées par un SOP ou par un accès accordé. */
async function knownCategories(tenantId: string): Promise<Set<string>> {
  const known = new Set(BASE_CATEGORIES)
  try {
    const rows = await tenantQuery<{ category: string }>(
      tenantId,
      `SELECT DISTINCT category FROM public.sops
        UNION
       SELECT DISTINCT sop_category AS category FROM public.team_member_sop_access`,
      [],
    )
    for (const r of rows) if (r.category) known.add(r.category)
  } catch { /* repli sur le référentiel de base */ }
  return known
}
const VALID_LEVELS = new Set(['read','complete','edit'])

function frontendOrigin(req: Request): string {
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin.length > 0) return origin
  if (process.env.NODE_ENV === 'production') return 'https://gestnext.nextgital.tech'
  return 'http://localhost:5173'
}

async function logActivity(
  tenantId: string,
  teamMemberId: string,
  actionType: string,
  details: Record<string, unknown> = {},
  ip?: string,
  ua?: string,
) {
  try {
    await tenantQuery(
      tenantId,
      `INSERT INTO public.team_member_activity (tenant_id, team_member_id, action_type, action_details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4::jsonb, $5::inet, $6)`,
      [tenantId, teamMemberId, actionType, JSON.stringify(details), ip ?? null, ua ?? null],
    )
  } catch (e: any) {
    logger.error('[team:activity]', e.message)
  }
}

/* Insert a row in security_audit_log. Never store a raw token, only a
 * short prefix that can help admins correlate events. */
async function recordSecurityAudit(
  tenantId: string,
  opts: {
    actorUserId?: string | null
    targetType:   string
    targetId?:    string | null
    action:       string
    tokenPrefix?: string
    ip?:          string
    ua?:          string
    metadata?:    Record<string, unknown>
  },
) {
  try {
    await tenantQuery(
      tenantId,
      `INSERT INTO public.security_audit_log
         (tenant_id, actor_user_id, target_type, target_id, action,
          token_prefix, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9::jsonb)`,
      [
        tenantId,
        opts.actorUserId ?? null,
        opts.targetType,
        opts.targetId ?? null,
        opts.action,
        opts.tokenPrefix ?? null,
        opts.ip ?? null,
        opts.ua ?? null,
        JSON.stringify(opts.metadata ?? {}),
      ],
    )
  } catch (e: any) {
    logger.error('[security-audit]', e.message)
  }
}

/* ════════════════════════════════════════════════════════════════════
   INVITATION FLOW (public — no auth)
   ════════════════════════════════════════════════════════════════════ */

/**
 * GET /api/team/invite/:token
 *   Public — verify the invitation token, return safe member info.
 */
router.get('/invite/:token', async (req: Request, res: Response) => {
  const { token } = req.params
  if (!token || !/^[a-f0-9]{40,128}$/i.test(token)) {
    return res.status(404).json({ error: 'Lien invalide' })
  }
  const tokenHash = hashToken(token)
  try {
    const row = await queryOne<{
      id: string; tenant_id: string; first_name: string | null; last_name: string | null;
      email: string; job_title: string | null; invitation_expires_at: string | null;
      account_status: string; tenant_name: string;
    }>(
      `SELECT m.id, m.tenant_id, m.prenom AS first_name, m.nom AS last_name, m.email,
              m.job_title, m.invitation_expires_at, m.account_status, t.name AS tenant_name
         FROM public.team_members m
         JOIN public.tenants t ON t.id = m.tenant_id
        WHERE m.invitation_token_hash = $1
          AND m.invitation_used_at IS NULL`,
      [tokenHash],
    )
    if (!row) return res.status(404).json({ error: 'Lien invalide ou déjà utilisé' })

    if (row.account_status === 'active') {
      return res.status(410).json({ error: 'Invitation déjà acceptée. Connectez-vous.' })
    }
    if (row.invitation_expires_at && new Date(row.invitation_expires_at) < new Date()) {
      return res.status(410).json({ error: 'Lien expiré. Demandez une nouvelle invitation.' })
    }

    res.json({
      first_name: row.first_name,
      last_name:  row.last_name,
      email:      row.email,
      job_title:  row.job_title,
      tenant_name: row.tenant_name,
      expires_at:  row.invitation_expires_at,
    })
  } catch (err: any) {
    logger.error('[team:invite-get]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/**
 * POST /api/team/invite/:token/accept
 *   Public — set password, create users row, link to team_members.
 *   Returns access + refresh tokens so the member is auto-logged-in.
 */
router.post('/invite/:token/accept', authLimiter, async (req: Request, res: Response) => {
  const { token } = req.params
  const { password } = req.body
  if (!token || !/^[a-f0-9]{40,128}$/i.test(token)) {
    return res.status(400).json({ error: 'Token invalide' })
  }
  if (!password || typeof password !== 'string' || password.length < 10) {
    return res.status(400).json({ error: 'Mot de passe : minimum 10 caractères' })
  }
  if (!/[0-9]/.test(password) || !/[A-Za-z]/.test(password)) {
    return res.status(400).json({ error: 'Mot de passe : doit contenir au moins un chiffre et une lettre' })
  }

  try {
    const tokenHash = hashToken(token)
    /* Verify + atomically consume the token in a single UPDATE.
       If invitation_used_at is already set, the RETURNING row is empty
       → we reject any replay. */
    const member = await queryOne<{
      id: string; tenant_id: string; email: string; prenom: string; nom: string;
      invitation_expires_at: string | null; account_status: string;
    }>(
      `UPDATE public.team_members
          SET invitation_used_at = NOW()
        WHERE invitation_token_hash = $1
          AND invitation_used_at IS NULL
          AND (invitation_expires_at IS NULL OR invitation_expires_at > NOW())
        RETURNING id, tenant_id, email, prenom, nom, invitation_expires_at, account_status`,
      [tokenHash],
    )
    if (!member) return res.status(404).json({ error: 'Lien invalide, expiré ou déjà utilisé' })
    if (member.account_status === 'active') {
      return res.status(410).json({ error: 'Invitation déjà acceptée' })
    }

    const hash = await bcrypt.hash(password, 12)

    /* Reuse existing users row if one exists for that email (e.g. user
       is also a workspace admin elsewhere). Otherwise create fresh. */
    let user = await queryOne<{ id: string }>(
      `SELECT id FROM public.users WHERE email = $1`, [member.email],
    )
    if (user) {
      await query(
        `UPDATE public.users SET password_hash = $1, is_active = true, updated_at = NOW() WHERE id = $2`,
        [hash, user.id],
      )
    } else {
      user = await queryOne<{ id: string }>(
        `INSERT INTO public.users (email, password_hash, name, is_active)
         VALUES ($1, $2, $3, true) RETURNING id`,
        [member.email, hash, `${member.prenom ?? ''} ${member.nom ?? ''}`.trim() || member.email],
      )
    }

    await tenantQuery(
      member.tenant_id,
      `UPDATE public.team_members
          SET user_id = $1,
              account_status = 'active',
              invitation_accepted_at = NOW(),
              invitation_token = NULL,
              invitation_token_hash = NULL,
              invitation_expires_at = NULL,
              invitation_purpose = NULL,
              last_login_at = NOW(),
              updated_at = NOW()
        WHERE id = $2`,
      [user!.id, member.id],
    )

    await logActivity(member.tenant_id, member.id, 'invitation_accepted', {}, req.ip, req.headers['user-agent'] as string)
    await logActivity(member.tenant_id, member.id, 'login', { method: 'invitation' }, req.ip, req.headers['user-agent'] as string)

    /* Issue tokens — role 'team_member' is intentionally NOT in TABLE_ACL,
       so it gets blocked from /api/:table CRUD by default. */
    const accessToken = signAccessToken({
      userId:   user!.id,
      email:    member.email,
      tenantId: member.tenant_id,
      role:     'team_member',
    })
    await issueMemberRefreshToken(res, user!.id, member.tenant_id, req.ip ?? '', req.headers['user-agent'] ?? '')

    res.json({
      token: accessToken,
      member: {
        id:         member.id,
        first_name: member.prenom,
        last_name:  member.nom,
        email:      member.email,
      },
    })
  } catch (err: any) {
    logger.error('[team:invite-accept]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* Helper — signe + stocke le hash du refresh token en DB + pose le cookie.
   Table refresh_tokens partagée avec les admins (revocation unifiée). */
async function issueMemberRefreshToken(
  res: Response, userId: string, tenantId: string, ip: string, ua: string,
) {
  const refreshToken = signRefreshToken({ userId, tenantId })
  const tokenHash    = hashToken(refreshToken)
  await query(
    `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '90 days')`,
    [userId, tenantId, tokenHash, ip || null, ua || null],
  )
  res.cookie('gestiq_team_refresh', refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   90 * 24 * 60 * 60 * 1000,
    path:     '/api/team/auth',
  })
}

/* ════════════════════════════════════════════════════════════════════
   MEMBER AUTH
   ════════════════════════════════════════════════════════════════════ */

router.post('/auth/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' })

  try {
    /* Brute-force protection */
    const recentFails = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM login_attempts
        WHERE (email = $1 OR ip_address = $2::inet)
          AND success = false
          AND attempted_at > NOW() - INTERVAL '15 minutes'`,
      [email, req.ip ?? '0.0.0.0'],
    )
    if (Number(recentFails?.count ?? 0) >= 10) {
      return res.status(429).json({ error: 'Compte temporairement verrouillé. Réessayez dans 15 minutes.' })
    }

    const user = await queryOne<{ id: string; password_hash: string; is_active: boolean }>(
      `SELECT id, password_hash, is_active FROM public.users WHERE email = $1`, [email],
    )

    const valid = user ? await bcrypt.compare(password, user.password_hash) : false

    await query(
      `INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2::inet, $3)`,
      [email, req.ip ?? '0.0.0.0', valid],
    )

    if (!user || !valid) {
      return res.status(401).json({ error: 'Identifiants incorrects' })
    }
    if (!user.is_active) return res.status(403).json({ error: 'Compte désactivé' })

    const member = await queryOne<{ id: string; tenant_id: string; account_status: string; prenom: string; nom: string; tenant_slug: string }>(
      `SELECT m.id, m.tenant_id, m.account_status, m.prenom, m.nom, t.slug AS tenant_slug
         FROM public.team_members m
         JOIN public.tenants t ON t.id = m.tenant_id
        WHERE m.user_id = $1
        LIMIT 1`,
      [user.id],
    )
    if (!member) return res.status(403).json({ error: 'Aucun espace membre lié à ce compte' })
    if (member.account_status === 'suspended') {
      return res.status(403).json({ error: 'Votre accès est temporairement suspendu. Contactez votre administrateur.' })
    }
    if (member.account_status === 'archived') {
      return res.status(403).json({ error: 'Ce compte est archivé.' })
    }

    await tenantQuery(
      member.tenant_id,
      `UPDATE public.team_members SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [member.id],
    )
    await logActivity(member.tenant_id, member.id, 'login', { method: 'password' }, req.ip, req.headers['user-agent'] as string)

    const accessToken = signAccessToken({
      userId:   user.id,
      email,
      tenantId: member.tenant_id,
      role:     'team_member',
    })
    await issueMemberRefreshToken(res, user.id, member.tenant_id, req.ip ?? '', req.headers['user-agent'] ?? '')

    res.json({
      token: accessToken,
      member: {
        id:         member.id,
        first_name: member.prenom,
        last_name:  member.nom,
        tenant_slug: member.tenant_slug,
      },
    })
  } catch (err: any) {
    logger.error('[team:login]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/team/auth/refresh — rotation refresh token pour team members.
   Miroir de /api/auth/refresh (admin). Distingue transient (5xx géré par le
   client) de la vraie invalidation (401 avec code explicite). */
router.post('/auth/refresh', authLimiter, async (req: Request, res: Response) => {
  const rawToken = req.cookies?.gestiq_team_refresh
  if (!rawToken) return res.status(401).json({ error: 'Session expirée', code: 'NO_REFRESH' })

  const payload = verifyRefreshToken(rawToken)
  if (!payload) {
    res.clearCookie('gestiq_team_refresh', { path: '/api/team/auth' })
    return res.status(401).json({ error: 'Session invalide', code: 'INVALID_REFRESH' })
  }

  const tokenHash = hashToken(rawToken)
  try {
    /* Trouve + révoque atomiquement l'ancien token (rotation) */
    const stored = await queryOne<{ id: string }>(
      `UPDATE refresh_tokens
          SET revoked = true
        WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()
        RETURNING id`,
      [tokenHash],
    )
    if (!stored) {
      /* Token déjà utilisé ou révoqué → détection de réutilisation :
         on révoque TOUTES les sessions de cet utilisateur par sécurité. */
      await query(`UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`, [payload.userId])
      res.clearCookie('gestiq_team_refresh', { path: '/api/team/auth' })
      return res.status(401).json({ error: 'Session compromise détectée', code: 'TOKEN_REUSE' })
    }

    /* Charge le membre pour émettre un nouveau access token */
    const member = await queryOne<{ email: string; account_status: string }>(
      `SELECT m.email, m.account_status
         FROM public.team_members m
        WHERE m.user_id = $1 AND m.tenant_id = $2 LIMIT 1`,
      [payload.userId, payload.tenantId],
    )
    if (!member || member.account_status !== 'active') {
      res.clearCookie('gestiq_team_refresh', { path: '/api/team/auth' })
      return res.status(401).json({ error: 'Compte inactif', code: 'INVALID_REFRESH' })
    }

    const accessToken = signAccessToken({
      userId:   payload.userId,
      email:    member.email,
      tenantId: payload.tenantId,
      role:     'team_member',
    })
    await issueMemberRefreshToken(res, payload.userId, payload.tenantId, req.ip ?? '', req.headers['user-agent'] ?? '')

    res.json({ token: accessToken })
  } catch (err: any) {
    logger.error('[team:refresh]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/auth/me', requireAuth, async (req: Request, res: Response) => {
  if (req.user?.role !== 'team_member') {
    return res.status(403).json({ error: 'Réservé aux membres' })
  }
  try {
    const member = await tenantQueryOne<{
      id: string; tenant_id: string; tenant_slug: string; tenant_name: string;
      first_name: string; last_name: string; email: string; job_title: string | null;
      member_type: string; avatar_url: string | null; account_status: string;
    }>(
      req.user.tenantId,
      `SELECT m.id, m.tenant_id, t.slug AS tenant_slug, t.name AS tenant_name,
              m.prenom AS first_name, m.nom AS last_name, m.email, m.job_title,
              m.member_type, m.avatar_url, m.account_status
         FROM public.team_members m
         JOIN public.tenants t ON t.id = m.tenant_id
        WHERE m.user_id = $1 AND m.tenant_id = $2`,
      [req.user.userId, req.user.tenantId],
    )
    if (!member) return res.status(404).json({ error: 'Espace introuvable' })
    if (member.account_status !== 'active') {
      return res.status(403).json({ error: 'Compte inactif' })
    }
    const access = await tenantQuery<{ sop_category: string; access_level: string }>(
      member.tenant_id,
      `SELECT sop_category, access_level FROM public.team_member_sop_access WHERE team_member_id = $1`,
      [member.id],
    )
    res.json({ ...member, access: access.map(a => ({ category: a.sop_category, level: a.access_level })) })
  } catch (err: any) {
    logger.error('[team:me]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/auth/logout', requireAuth, async (req: Request, res: Response) => {
  /* Révoque le refresh token courant (si présent) — jamais tous les autres,
     pour ne pas déconnecter le membre de ses autres appareils. */
  const rawToken = req.cookies?.gestiq_team_refresh
  if (rawToken) {
    const tokenHash = hashToken(rawToken)
    await query(
      `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
      [tokenHash],
    ).catch(() => {})
  }
  res.clearCookie('gestiq_team_refresh', { path: '/api/team/auth' })
  if (req.user?.role === 'team_member') {
    const member = await tenantQueryOne<{ id: string }>(
      req.user.tenantId,
      `SELECT id FROM public.team_members WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.user.userId, req.user.tenantId],
    )
    if (member) await logActivity(req.user.tenantId, member.id, 'logout')
  }
  res.json({ success: true })
})

/* ════════════════════════════════════════════════════════════════════
   ADMIN — MEMBER MANAGEMENT (requires admin/manager role)
   ════════════════════════════════════════════════════════════════════ */

/* Custom guard: allow admin/manager OR the tenant owner.
 * Falls back to checking tenant_users.role + tenants.owner_id so the
 * founder is never locked out even if their JWT was issued with a
 * lower role somehow. */
async function requireTenantManager(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.role ?? ''
  if (role === 'admin' || role === 'manager') return next()
  if (role === 'team_member') {
    return res.status(403).json({ error: 'Espace réservé aux administrateurs' })
  }
  /* Last resort: check if user is owner of this tenant */
  try {
    const owner = await queryOne<{ id: string }>(
      `SELECT 1 AS id FROM public.tenants WHERE id = $1 AND owner_id = $2`,
      [req.user?.tenantId, req.user?.userId],
    )
    if (owner) return next()
    const tu = await queryOne<{ role: string }>(
      `SELECT role FROM public.tenant_users WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
      [req.user?.tenantId, req.user?.userId],
    )
    if (tu?.role === 'admin' || tu?.role === 'manager') return next()
    return res.status(403).json({ error: 'Permissions insuffisantes (admin ou manager requis)' })
  } catch {
    return res.status(403).json({ error: 'Permissions insuffisantes' })
  }
}
const requireAdminMgr = [requireAuth, requireTenantManager]

/* POST /api/team/invite — create member + send invitation email */
router.post('/invite', inviteLimiter, ...requireAdminMgr, async (req: Request, res: Response) => {
  const {
    first_name, last_name, email, phone, member_type, job_title,
    description, sop_categories, tasks,
  } = req.body

  if (!first_name || !last_name || !email) {
    return res.status(400).json({ error: 'Prénom, nom et email sont requis' })
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email invalide' })

  const memberType = ['employee','trainer','freelance'].includes(member_type) ? member_type : 'employee'
  const tenantId   = req.user!.tenantId
  const creatorId  = req.user!.userId

  try {
    /* Check email uniqueness within tenant.
       Si le membre existe et est archivé → on le restaure automatiquement
       (met à jour ses infos + réémet une invitation). Sinon → 409. */
    const existing = await tenantQueryOne<{ id: string; account_status: string }>(
      tenantId,
      `SELECT id, account_status FROM public.team_members WHERE email = $1`, [email],
    )
    if (existing && existing.account_status !== 'archived') {
      return res.status(409).json({ error: 'Un membre avec cet email existe déjà' })
    }

    const token = randomToken()
    const tokenHash = hashToken(token)

    const member = existing
      ? await tenantQueryOne<{ id: string }>(
          tenantId,
          `UPDATE public.team_members SET
             prenom = $2, nom = $3, telephone = $4, poste = $5, job_title = $5,
             member_type = $6, account_status = 'invited',
             invitation_token = NULL,
             invitation_token_hash = $7,
             invitation_purpose = 'invite',
             invitation_created_by = $10,
             invitation_created_ip = $11::inet,
             invitation_used_at = NULL,
             invitation_sent_at = NOW(),
             invitation_expires_at = NOW() + INTERVAL '48 hours',
             statut = 'actif', updated_at = NOW()
           WHERE id = $1
           RETURNING id`,
          [existing.id, first_name, last_name, phone ?? null, job_title ?? null, memberType, tokenHash,
           /* $8, $9 unused historically */ null, null,
           creatorId, req.ip ?? '0.0.0.0'],
        )
      : await tenantQueryOne<{ id: string }>(
          tenantId,
          `INSERT INTO public.team_members
             (tenant_id, prenom, nom, email, telephone, poste, job_title,
              member_type, account_status, invitation_token_hash, invitation_purpose,
              invitation_sent_at, invitation_expires_at,
              invitation_created_by, invitation_created_ip,
              created_by, statut, role)
           VALUES ($1, $2, $3, $4, $5, $6, $6, $7, 'invited', $8, 'invite',
                   NOW(), NOW() + INTERVAL '48 hours',
                   $9, $10::inet,
                   $9, 'actif', 'viewer')
           RETURNING id`,
          [tenantId, first_name, last_name, email, phone ?? null, job_title ?? null,
           memberType, tokenHash, creatorId, req.ip ?? '0.0.0.0'],
        )

    if (existing) {
      await logActivity(tenantId, member!.id, 'restored_from_archive', { by: creatorId })
    }

    /* Insert SOP access */
    const allowedCats = await knownCategories(tenantId)
    const validAccess = Array.isArray(sop_categories)
      ? sop_categories.filter(a => allowedCats.has(a?.category) && VALID_LEVELS.has(a?.level ?? 'read'))
      : []
    for (const a of validAccess) {
      await tenantQuery(
        tenantId,
        `INSERT INTO public.team_member_sop_access (tenant_id, team_member_id, sop_category, access_level, granted_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (team_member_id, sop_category) DO UPDATE SET access_level = EXCLUDED.access_level, updated_at = NOW()`,
        [tenantId, member!.id, a.category, a.level ?? 'read', creatorId],
      )
    }

    /* Insert initial tasks */
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        if (!t?.title) continue
        await tenantQuery(
          tenantId,
          `INSERT INTO public.team_member_tasks
             (tenant_id, team_member_id, title, description, priority, due_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, member!.id, t.title, t.description ?? null,
           ['low','normal','high','urgent'].includes(t.priority) ? t.priority : 'normal',
           t.due_date ?? null, creatorId],
        )
      }
    }

    /* Send email — the raw token leaves the server ONLY here, one time.
       We never return it to the caller and never log it. */
    const inviteUrl = `${frontendOrigin(req)}/invite/${token}`
    const tenant = await queryOne<{ name: string }>(`SELECT name FROM public.tenants WHERE id = $1`, [tenantId])
    const inviter = await queryOne<{ name: string }>(`SELECT name FROM public.users WHERE id = $1`, [creatorId])
    try {
      const tpl = teamInvitationEmail({
        firstName:   first_name,
        inviterName: inviter?.name ?? 'L\'équipe',
        tenantName:  tenant?.name ?? 'Next Gital',
        jobTitle:    job_title ?? '',
        inviteUrl,
        sopCategories: validAccess.map((a: any) => a.category),
      })
      await sendEmail({ to: email, ...tpl })
    } catch (e: any) {
      logger.error('[team:invite-email]', e.message)
    }

    await logActivity(tenantId, member!.id, 'invitation_sent',
      { by: creatorId, token_prefix: tokenPrefix(token) },
      req.ip, req.headers['user-agent'] as string,
    )
    await recordSecurityAudit(tenantId, {
      actorUserId: creatorId,
      targetType:  'team_member',
      targetId:    member!.id,
      action:      'invite_issued',
      tokenPrefix: tokenPrefix(token),
      ip:          req.ip,
      ua:          req.headers['user-agent'] as string,
    })

    /* SAFE RESPONSE — masked token only. Never the raw URL. */
    res.status(201).json({
      id:            member!.id,
      status:        'invited',
      expires_at:    new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      masked_token:  maskToken(token),
    })
  } catch (err: any) {
    logger.error('[team:invite]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/team/members — list with access summary.
   ?archived=true → retourne UNIQUEMENT les membres archivés (corbeille). */
router.get('/members', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const onlyArchived = req.query.archived === 'true'
  try {
    const members = await tenantQuery(
      tenantId,
      `SELECT m.id, m.prenom AS first_name, m.nom AS last_name, m.email, m.telephone,
              m.job_title, m.member_type, m.account_status, m.last_login_at,
              m.invitation_sent_at, m.invitation_accepted_at, m.avatar_url,
              m.created_at, m.updated_at,
              COALESCE(
                (SELECT json_agg(json_build_object('category', sop_category, 'level', access_level))
                   FROM public.team_member_sop_access WHERE team_member_id = m.id), '[]'::json
              ) AS access,
              COALESCE(
                (SELECT COUNT(*)::int FROM public.team_member_tasks WHERE team_member_id = m.id AND status = 'todo'), 0
              ) AS open_tasks_count
         FROM public.team_members m
        WHERE m.account_status ${onlyArchived ? '=' : '!='} 'archived'
        ORDER BY ${onlyArchived ? 'm.updated_at' : 'm.created_at'} DESC`,
    )
    res.json(members)
  } catch (err: any) {
    logger.error('[team:members]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/team/members/:id — detail */
router.get('/members/:id', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const member = await tenantQueryOne(
      tenantId,
      `SELECT m.id, m.prenom AS first_name, m.nom AS last_name, m.email, m.telephone,
              m.job_title, m.poste, m.departement, m.role, m.statut,
              m.salaire_base, m.date_embauche,
              m.member_type, m.account_status, m.last_login_at,
              m.invitation_sent_at, m.invitation_accepted_at, m.invitation_expires_at,
              m.avatar_url, m.created_at, m.created_by
         FROM public.team_members m WHERE m.id = $1`,
      [id],
    )
    if (!member) return res.status(404).json({ error: 'Membre introuvable' })

    const [access, tasks, activity, timeStats, dailyHours] = await Promise.all([
      tenantQuery(tenantId,
        `SELECT sop_category, access_level, granted_at FROM public.team_member_sop_access WHERE team_member_id = $1`, [id]),
      tenantQuery(tenantId,
        `SELECT id, title, description, priority, status, due_date, created_at, completed_at, elapsed_seconds
           FROM public.team_member_tasks WHERE team_member_id = $1 ORDER BY created_at DESC LIMIT 50`, [id]),
      tenantQuery(tenantId,
        `SELECT id, action_type, action_details, created_at, ip_address
           FROM public.team_member_activity WHERE team_member_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]),
      /* Agrégats de temps travaillé (sur TOUTES les tâches, pas le LIMIT 50) */
      tenantQueryOne(tenantId, `
        SELECT
          COALESCE(SUM(elapsed_seconds), 0)::bigint AS total_seconds,
          COALESCE(SUM(elapsed_seconds) FILTER (WHERE COALESCE(completed_at, updated_at) >= CURRENT_DATE), 0)::bigint AS today_seconds,
          COALESCE(SUM(elapsed_seconds) FILTER (WHERE COALESCE(completed_at, updated_at) >= DATE_TRUNC('week', NOW())), 0)::bigint AS week_seconds,
          COALESCE(SUM(elapsed_seconds) FILTER (WHERE COALESCE(completed_at, updated_at) >= DATE_TRUNC('month', NOW())), 0)::bigint AS month_seconds,
          COUNT(DISTINCT DATE(COALESCE(completed_at, updated_at))) FILTER (WHERE elapsed_seconds > 0) AS active_days
        FROM public.team_member_tasks
        WHERE team_member_id = $1
      `, [id]),
      /* 14 derniers jours d'activité — pour graphique mini-sparkline */
      tenantQuery(tenantId, `
        SELECT DATE(COALESCE(completed_at, updated_at)) AS day,
               COALESCE(SUM(elapsed_seconds), 0)::bigint AS seconds
        FROM public.team_member_tasks
        WHERE team_member_id = $1
          AND elapsed_seconds > 0
          AND COALESCE(completed_at, updated_at) >= CURRENT_DATE - INTERVAL '13 days'
        GROUP BY day
        ORDER BY day ASC
      `, [id]),
    ])

    res.json({ ...member, access, tasks, activity, time_stats: timeStats, daily_hours: dailyHours })
  } catch (err: any) {
    logger.error('[team:member-detail]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PATCH /api/team/members/:id — update profile (no password, no email change) */
router.patch('/members/:id', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  const allowed = ['prenom','nom','telephone','job_title','member_type','avatar_url']
  const data: Record<string, any> = {}
  if (req.body.first_name !== undefined) data.prenom = req.body.first_name
  if (req.body.last_name  !== undefined) data.nom    = req.body.last_name
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k]

  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const vals = [...keys.map(k => data[k]), id]

  try {
    const row = await tenantQueryOne(
      tenantId,
      `UPDATE public.team_members SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING id`,
      vals,
    )
    if (!row) return res.status(404).json({ error: 'Membre introuvable' })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[team:patch]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PUT /api/team/members/:id/access — replace access list */
router.put('/members/:id/access', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const grantor  = req.user!.userId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  const access = Array.isArray(req.body.access) ? req.body.access : []
  const allowedCats = await knownCategories(req.user!.tenantId)
  const validAccess = access.filter((a: any) => allowedCats.has(a?.category) && VALID_LEVELS.has(a?.level ?? 'read'))

  try {
    /* Wipe + reinsert is simplest and matches "replace" semantics */
    await tenantQuery(tenantId, `DELETE FROM public.team_member_sop_access WHERE team_member_id = $1`, [id])
    for (const a of validAccess) {
      await tenantQuery(
        tenantId,
        `INSERT INTO public.team_member_sop_access (tenant_id, team_member_id, sop_category, access_level, granted_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, id, a.category, a.level ?? 'read', grantor],
      )
    }
    await logActivity(tenantId, id, 'access_updated', { count: validAccess.length, by: grantor })
    res.json({ success: true, access: validAccess })
  } catch (err: any) {
    logger.error('[team:put-access]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/team/members/:id/suspend */
router.post('/members/:id/suspend', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    await tenantQuery(
      tenantId,
      `UPDATE public.team_members SET account_status = 'suspended', updated_at = NOW() WHERE id = $1`,
      [id],
    )
    await logActivity(tenantId, id, 'suspended', { by: req.user!.userId })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[team:suspend]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/team/members/:id/activate */
router.post('/members/:id/activate', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    await tenantQuery(
      tenantId,
      `UPDATE public.team_members SET account_status = 'active', updated_at = NOW() WHERE id = $1`,
      [id],
    )
    await logActivity(tenantId, id, 'reactivated', { by: req.user!.userId })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[team:activate]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/team/members/:id/resend — re-send invitation email (new token).
   Invalide tous les liens précédents et n'expose JAMAIS le token en clair
   à l'administrateur (le lien part uniquement par email). */
router.post('/members/:id/resend', inviteLimiter, ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const member = await tenantQueryOne<{
      email: string; prenom: string; job_title: string | null;
    }>(
      tenantId,
      `SELECT email, prenom, job_title FROM public.team_members WHERE id = $1`,
      [id],
    )
    if (!member) return res.status(404).json({ error: 'Membre introuvable' })

    const token = randomToken()
    const tokenHash = hashToken(token)
    await tenantQuery(
      tenantId,
      `UPDATE public.team_members
          SET invitation_token = NULL,
              invitation_token_hash = $1,
              invitation_purpose = 'invite',
              invitation_used_at = NULL,
              invitation_created_by = $3,
              invitation_created_ip = $4::inet,
              invitation_sent_at = NOW(),
              invitation_expires_at = NOW() + INTERVAL '48 hours',
              account_status = 'invited', updated_at = NOW()
        WHERE id = $2`,
      [tokenHash, id, req.user!.userId, req.ip ?? '0.0.0.0'],
    )
    const inviteUrl = `${frontendOrigin(req)}/invite/${token}`
    const tenant = await queryOne<{ name: string }>(`SELECT name FROM public.tenants WHERE id = $1`, [tenantId])
    const inviter = await queryOne<{ name: string }>(`SELECT name FROM public.users WHERE id = $1`, [req.user!.userId])
    try {
      const tpl = teamInvitationEmail({
        firstName:   member.prenom,
        inviterName: inviter?.name ?? 'L\'équipe',
        tenantName:  tenant?.name ?? 'Next Gital',
        jobTitle:    member.job_title ?? '',
        inviteUrl,
        sopCategories: [],
      })
      await sendEmail({ to: member.email, ...tpl })
    } catch (e: any) {
      logger.error('[team:resend-email]', e.message)
    }
    await logActivity(tenantId, id, 'invitation_resent',
      { by: req.user!.userId, token_prefix: tokenPrefix(token) },
      req.ip, req.headers['user-agent'] as string,
    )
    await recordSecurityAudit(tenantId, {
      actorUserId: req.user!.userId,
      targetType:  'team_member', targetId: id,
      action:      'invite_resent',
      tokenPrefix: tokenPrefix(token),
      ip:          req.ip, ua: req.headers['user-agent'] as string,
    })
    /* RESPONSE avec le lien brut : l'admin peut le copier / le partager
       (WhatsApp, SMS, chat…) sans avoir à passer par un second endpoint.
       Motif : le canal email n'est pas toujours fiable (RESEND_API_KEY
       manquant, spam, etc.) → l'admin doit toujours pouvoir récupérer le
       lien après un resend. Action tracée dans l'audit. */
    res.json({
      success:      true,
      status:       'invited',
      invite_url:   inviteUrl,
      expires_at:   new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      masked_token: maskToken(token),
    })
  } catch (err: any) {
    logger.error('[team:resend]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/team/members/:id/share-link — generate a fresh invite token and
   RETURN the raw URL so admin can copy/paste it (WhatsApp, SMS…).
   Action tracée dans l'audit. Le lien remplace tous les précédents. */
router.post('/members/:id/share-link', inviteLimiter, ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const member = await tenantQueryOne<{ email: string; prenom: string }>(
      tenantId,
      `SELECT email, prenom FROM public.team_members WHERE id = $1`, [id])
    if (!member) return res.status(404).json({ error: 'Membre introuvable' })

    const token = randomToken()
    const tokenHash = hashToken(token)
    await tenantQuery(
      tenantId,
      `UPDATE public.team_members
          SET invitation_token = NULL,
              invitation_token_hash = $1,
              invitation_purpose = 'invite',
              invitation_used_at = NULL,
              invitation_created_by = $3,
              invitation_created_ip = $4::inet,
              invitation_sent_at = NOW(),
              invitation_expires_at = NOW() + INTERVAL '48 hours',
              account_status = 'invited', updated_at = NOW()
        WHERE id = $2`,
      [tokenHash, id, req.user!.userId, req.ip ?? '0.0.0.0'],
    )
    const inviteUrl = `${frontendOrigin(req)}/invite/${token}`
    await logActivity(tenantId, id, 'invite_link_shared',
      { by: req.user!.userId, token_prefix: tokenPrefix(token) },
      req.ip, req.headers['user-agent'] as string,
    )
    await recordSecurityAudit(tenantId, {
      actorUserId: req.user!.userId,
      targetType:  'team_member', targetId: id,
      action:      'invite_link_shared',
      tokenPrefix: tokenPrefix(token),
      ip:          req.ip, ua: req.headers['user-agent'] as string,
    })
    res.json({
      success:    true,
      invite_url: inviteUrl,
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    })
  } catch (err: any) {
    logger.error('[team:share-link]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/team/members/:id/share-reset-link — generate a fresh reset token
   and RETURN the raw URL so admin can send it via WhatsApp/SMS.
   Comme reset-password, invalide le mot de passe actuel + révoque les sessions.
   Action tracée dans l'audit. */
router.post('/members/:id/share-reset-link', inviteLimiter, ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const member = await tenantQueryOne<{ email: string; prenom: string; user_id: string | null }>(
      tenantId,
      `SELECT email, prenom, user_id FROM public.team_members WHERE id = $1`, [id],
    )
    if (!member) return res.status(404).json({ error: 'Membre introuvable' })

    const token = randomToken()
    const tokenHash = hashToken(token)
    await tenantQuery(
      tenantId,
      `UPDATE public.team_members
          SET invitation_token = NULL,
              invitation_token_hash = $1,
              invitation_purpose = 'reset',
              invitation_used_at = NULL,
              invitation_created_by = $3,
              invitation_created_ip = $4::inet,
              invitation_sent_at = NOW(),
              invitation_expires_at = NOW() + INTERVAL '30 minutes',
              account_status = CASE WHEN account_status = 'archived' THEN account_status ELSE 'invited' END,
              updated_at = NOW()
        WHERE id = $2`,
      [tokenHash, id, req.user!.userId, req.ip ?? '0.0.0.0'],
    )
    if (member.user_id) {
      await query(`UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
        await bcrypt.hash(randomToken(), 12),
        member.user_id,
      ])
      await query(
        `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
        [member.user_id],
      ).catch(() => {})
    }
    const resetUrl = `${frontendOrigin(req)}/invite/${token}`
    await logActivity(tenantId, id, 'reset_link_shared',
      { by: req.user!.userId, token_prefix: tokenPrefix(token) },
      req.ip, req.headers['user-agent'] as string,
    )
    await recordSecurityAudit(tenantId, {
      actorUserId: req.user!.userId,
      targetType:  'team_member', targetId: id,
      action:      'reset_link_shared',
      tokenPrefix: tokenPrefix(token),
      ip:          req.ip, ua: req.headers['user-agent'] as string,
    })
    res.json({
      success:    true,
      invite_url: resetUrl,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
  } catch (err: any) {
    logger.error('[team:share-reset-link]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/team/members/:id/reset-password — generate reset token.
   Expiration courte (30 min). Token stocké hashé, jamais retourné en clair. */
router.post('/members/:id/reset-password', inviteLimiter, ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })

  try {
    const member = await tenantQueryOne<{ email: string; prenom: string; user_id: string | null }>(
      tenantId,
      `SELECT email, prenom, user_id FROM public.team_members WHERE id = $1`, [id],
    )
    if (!member) return res.status(404).json({ error: 'Membre introuvable' })

    const token = randomToken()
    const tokenHash = hashToken(token)
    await tenantQuery(
      tenantId,
      `UPDATE public.team_members
          SET invitation_token = NULL,
              invitation_token_hash = $1,
              invitation_purpose = 'reset',
              invitation_used_at = NULL,
              invitation_created_by = $3,
              invitation_created_ip = $4::inet,
              invitation_sent_at = NOW(),
              invitation_expires_at = NOW() + INTERVAL '30 minutes',
              account_status = CASE WHEN account_status = 'archived' THEN account_status ELSE 'invited' END,
              updated_at = NOW()
        WHERE id = $2`,
      [tokenHash, id, req.user!.userId, req.ip ?? '0.0.0.0'],
    )
    /* Invalidate the old password + révoquer toutes les sessions */
    if (member.user_id) {
      await query(`UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
        await bcrypt.hash(randomToken(), 12),
        member.user_id,
      ])
      await query(
        `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
        [member.user_id],
      ).catch(() => {})
    }
    const resetUrl = `${frontendOrigin(req)}/invite/${token}`
    try {
      const tpl = teamPasswordResetEmail({ firstName: member.prenom, resetUrl })
      await sendEmail({ to: member.email, ...tpl })
    } catch (e: any) { logger.error('[team:reset-email]', e.message) }
    await logActivity(tenantId, id, 'password_reset_requested',
      { by: req.user!.userId, token_prefix: tokenPrefix(token) },
      req.ip, req.headers['user-agent'] as string,
    )
    await recordSecurityAudit(tenantId, {
      actorUserId: req.user!.userId,
      targetType:  'team_member', targetId: id,
      action:      'reset_issued',
      tokenPrefix: tokenPrefix(token),
      ip:          req.ip, ua: req.headers['user-agent'] as string,
    })
    /* SAFE RESPONSE — no raw URL, masked token for audit correlation only. */
    res.json({
      success:      true,
      expires_at:   new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      masked_token: maskToken(token),
    })
  } catch (err: any) {
    logger.error('[team:reset-password]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* DELETE /api/team/members/:id — archive (soft-delete) */
router.delete('/members/:id', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    await tenantQuery(
      tenantId,
      `UPDATE public.team_members SET account_status = 'archived', updated_at = NOW() WHERE id = $1`,
      [id],
    )
    await logActivity(tenantId, id, 'archived', { by: req.user!.userId })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[team:archive]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/team/members/:id/restore — désarchive et repasse en 'invited'. */
router.post('/members/:id/restore', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    const m = await tenantQueryOne<{ account_status: string }>(
      tenantId,
      `SELECT account_status FROM public.team_members WHERE id = $1`, [id],
    )
    if (!m) return res.status(404).json({ error: 'Membre introuvable' })
    if (m.account_status !== 'archived') {
      return res.status(400).json({ error: 'Ce membre n\'est pas archivé' })
    }
    await tenantQuery(
      tenantId,
      `UPDATE public.team_members
          SET account_status = 'invited', statut = 'actif', updated_at = NOW()
        WHERE id = $1`,
      [id],
    )
    await logActivity(tenantId, id, 'restored', { by: req.user!.userId })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[team:restore]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* DELETE /api/team/members/:id/permanent — suppression définitive (uniquement pour les archivés).
   Nettoie SOP access, tasks et activity du membre avant de supprimer la ligne. */
router.delete('/members/:id/permanent', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    const m = await tenantQueryOne<{ account_status: string; email: string }>(
      tenantId,
      `SELECT account_status, email FROM public.team_members WHERE id = $1`, [id],
    )
    if (!m) return res.status(404).json({ error: 'Membre introuvable' })
    if (m.account_status !== 'archived') {
      return res.status(400).json({ error: 'Seul un membre archivé peut être supprimé définitivement' })
    }
    await tenantQuery(tenantId, `DELETE FROM public.team_member_sop_access WHERE team_member_id = $1`, [id])
    await tenantQuery(tenantId, `DELETE FROM public.team_member_tasks WHERE team_member_id = $1`, [id])
    await tenantQuery(tenantId, `DELETE FROM public.team_member_activity WHERE team_member_id = $1`, [id])
    await tenantQuery(tenantId, `DELETE FROM public.team_members WHERE id = $1`, [id])
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[team:permanent-delete]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ════════════════════════════════════════════════════════════════════
   ADMIN — TASKS MANAGEMENT
   ════════════════════════════════════════════════════════════════════ */

router.get('/members/:id/tasks', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    const tasks = await tenantQuery(
      tenantId,
      `SELECT id, title, description, priority, status, due_date, project_id, created_at, completed_at
         FROM public.team_member_tasks WHERE team_member_id = $1 ORDER BY created_at DESC`,
      [id],
    )
    res.json(tasks)
  } catch (err: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

router.post('/members/:id/tasks', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  const { title, description, priority, due_date, project_id } = req.body
  if (!title) return res.status(400).json({ error: 'Titre requis' })

  try {
    const task = await tenantQueryOne(
      tenantId,
      `INSERT INTO public.team_member_tasks
         (tenant_id, team_member_id, title, description, priority, due_date, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, id, title, description ?? null,
       ['low','normal','high','urgent'].includes(priority) ? priority : 'normal',
       due_date ?? null, project_id ?? null, req.user!.userId],
    )
    await logActivity(tenantId, id, 'task_assigned', { taskId: (task as any).id, title })
    res.status(201).json(task)
  } catch (err: any) {
    logger.error('[team:task-create]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/tasks/:taskId', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { taskId } = req.params
  if (!UUID_RE.test(taskId)) return res.status(400).json({ error: 'ID invalide' })

  const allowed = ['title','description','priority','status','due_date','project_id']
  const data: Record<string, any> = {}
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k]
  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })

  /* Auto-set completed_at when status flips to 'done' */
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const completedClause = data.status === 'done' ? `, completed_at = NOW()` : data.status ? `, completed_at = NULL` : ''
  try {
    const row = await tenantQueryOne(
      tenantId,
      `UPDATE public.team_member_tasks SET ${sets}, updated_at = NOW() ${completedClause}
        WHERE id = $${keys.length + 1} RETURNING *`,
      [...keys.map(k => data[k]), taskId],
    )
    if (!row) return res.status(404).json({ error: 'Tâche introuvable' })
    res.json(row)
  } catch (err: any) {
    logger.error('[team:task-patch]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.delete('/tasks/:taskId', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { taskId } = req.params
  if (!UUID_RE.test(taskId)) return res.status(400).json({ error: 'ID invalide' })
  try {
    await tenantQuery(tenantId, `DELETE FROM public.team_member_tasks WHERE id = $1`, [taskId])
    res.json({ success: true })
  } catch (err: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* GET /api/team/members/:id/activity */
router.get('/members/:id/activity', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  const limit = Math.min(Number(req.query.limit ?? 200), 500)
  try {
    const rows = await tenantQuery(
      tenantId,
      `SELECT id, action_type, action_details, ip_address, user_agent, created_at
         FROM public.team_member_activity WHERE team_member_id = $1
         ORDER BY created_at DESC LIMIT $2`,
      [id, limit],
    )
    res.json(rows)
  } catch (err: any) { res.status(500).json({ error: 'Erreur serveur' }) }
})

/* GET /api/team/members/:id/finance
   Compte comptable : fusionne payroll + advances + team_payments en un journal chronologique */
router.get('/members/:id/finance', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    const [payroll, advances, payments] = await Promise.all([
      tenantQuery(tenantId,
        `SELECT id, month, salaire_base, primes, deductions, avances, net_a_payer,
                statut_paiement, date_paiement, mode_paiement, note,
                jours_travailles, jours_absents, jours_conge, created_at
           FROM public.employee_payroll WHERE employee_id = $1 ORDER BY month DESC`, [id]),
      tenantQuery(tenantId,
        `SELECT id, montant, date_demande, date_remboursement, statut, note, created_at
           FROM public.employee_advances WHERE employee_id = $1 ORDER BY date_demande DESC`, [id]),
      tenantQuery(tenantId,
        `SELECT id, montant, date, type, projet, notes, is_paid, created_at
           FROM public.team_payments WHERE member_id = $1 ORDER BY date DESC`, [id]),
    ])
    res.json({ payroll, advances, payments })
  } catch (err: any) {
    logger.error('[team:finance]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/team/members/:id/leaves — congés */
router.get('/members/:id/leaves', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    const rows = await tenantQuery(tenantId,
      `SELECT id, type_conge, date_debut, date_fin, nb_jours, statut, motif,
              justificatif_url, approuve_par, created_at
         FROM public.employee_leaves WHERE employee_id = $1 ORDER BY date_debut DESC`, [id])
    res.json(rows)
  } catch (err: any) {
    logger.error('[team:leaves]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/team/members/:id/projects — projets où le membre est assigné */
router.get('/members/:id/projects', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    const rows = await tenantQuery(tenantId,
      `SELECT p.id, p.nom, p.statut, p.priorite, p.date_debut, p.date_fin_prevue,
              p.date_fin_reelle, p.budget, p.cout_reel, p.progression,
              c.nom AS client_nom, a.role, a.assigned_at
         FROM public.projet_assignees a
         JOIN public.projets p ON p.id = a.projet_id
         LEFT JOIN public.clients c ON c.id = p.client_id
         WHERE a.team_member_id = $1
         ORDER BY a.assigned_at DESC`, [id])
    res.json(rows)
  } catch (err: any) {
    logger.error('[team:projects]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/team/members/:id/performance — perf mensuelle */
router.get('/members/:id/performance', ...requireAdminMgr, async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const { id } = req.params
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID invalide' })
  try {
    const rows = await tenantQuery(tenantId,
      `SELECT id, mois, taches_assignees, taches_completees, taches_en_retard,
              deals_assignes, deals_gagnes, chiffre_affaires, note_performance, commentaire
         FROM public.employee_performance WHERE employee_id = $1 ORDER BY mois DESC`, [id])
    res.json(rows)
  } catch (err: any) {
    logger.error('[team:performance]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
