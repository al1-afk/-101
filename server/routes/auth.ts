import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query, queryOne } from '../db/pool'
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
  requireAuth,
} from '../middleware/auth'
import { authLimiter, passwordLimiter } from '../middleware/security'
import { sendEmail, loginCodeEmail, passwordResetEmail } from '../lib/email'
import { teamInvitationEmail } from '../lib/email-team'
import { randomToken, hashToken, tokenPrefix } from '../lib/tokenSecurity'
import { logger } from '../lib/logger'
import { trackSecurityEvent, endPresence } from '../lib/securityEvents'
import { markSecurityLogged } from '../middleware/securityMonitor'
import { getClientIpOrUnknown } from '../lib/clientIp'

const router = Router()

/* ── Trusted device (skip 2FA on already-verified browsers) ─────
   Cookie httpOnly qui contient un secret random 32 octets. Seul le
   SHA-256 est stocké en DB — même en cas de fuite DB, aucun cookie
   ne peut être forgé. Durée 90 jours (alignée sur refresh_token). */
const DEVICE_COOKIE = 'gestiq_device'
const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000
const cookieBaseOpts = () => ({
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path:     '/',
})

function getDeviceHash(req: Request): string | null {
  const raw = req.cookies?.[DEVICE_COOKIE]
  if (!raw || typeof raw !== 'string' || raw.length < 32) return null
  return hashToken(raw)
}

async function findTrustedDevice(deviceHash: string, userId: string) {
  return queryOne<{ id: string }>(
    `SELECT id FROM trusted_devices
      WHERE user_id = $1 AND device_hash = $2
        AND revoked_at IS NULL AND expires_at > NOW()`,
    [userId, deviceHash]
  )
}

async function issueTrustedDevice(
  res: Response, userId: string, tenantId: string,
  ip: string, ua: string, label?: string,
): Promise<string> {
  const raw  = randomToken()
  const hash = hashToken(raw)
  await query(
    `INSERT INTO trusted_devices (user_id, tenant_id, device_hash, label, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6::inet)
     ON CONFLICT (user_id, device_hash) WHERE revoked_at IS NULL
     DO UPDATE SET last_used_at = NOW(), expires_at = NOW() + INTERVAL '90 days'`,
    [userId, tenantId, hash, label ?? null, ua, ip || '0.0.0.0']
  )
  res.cookie(DEVICE_COOKIE, raw, { ...cookieBaseOpts(), maxAge: DEVICE_TTL_MS })
  return hash
}

async function touchTrustedDevice(deviceHash: string, userId: string, ip: string, ua: string) {
  await query(
    `UPDATE trusted_devices
        SET last_used_at = NOW(),
            ip_address   = $3::inet,
            user_agent   = COALESCE($4, user_agent)
      WHERE user_id = $1 AND device_hash = $2 AND revoked_at IS NULL`,
    [userId, deviceHash, ip || '0.0.0.0', ua]
  )
}

/* ── Audit login history — jamais de code en clair ─────────────── */
async function logLogin(row: {
  userId:      string | null
  tenantId:    string | null
  email:       string
  ip:          string
  ua:          string
  deviceHash?: string | null
  method:      'password' | 'email' | 'admin_manual' | 'admin_approval' | 'trusted_device'
  event:       'password_ok' | 'challenge_sent' | 'verify_success' | 'verify_failed' | 'approved' | 'rejected' | 'trusted_skip'
  success:     boolean
  challengeId?: string | null
  metadata?:   Record<string, any>
}) {
  try {
    await query(
      `INSERT INTO login_history
         (user_id, tenant_id, email, ip_address, user_agent, device_hash,
          method, event, success, challenge_id, metadata)
       VALUES ($1, $2, $3, $4::inet, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        row.userId, row.tenantId, row.email, row.ip || '0.0.0.0', row.ua,
        row.deviceHash ?? null, row.method, row.event, row.success,
        row.challengeId ?? null, JSON.stringify(row.metadata ?? {}),
      ]
    )
  } catch (e: any) {
    logger.error('[login_history]', e?.message)
  }
}

/* Rattache un échec de connexion au tenant du compte visé.

   Sans ça, tous les échecs partiraient en `tenant_id = NULL` et
   seraient visibles par TOUS les administrateurs — fuite d'information
   entre espaces (savoir que l'email d'un concurrent est attaqué).
   Avec ça, seuls les échecs sur un email INEXISTANT restent non
   attribués : ils ne révèlent rien de personne. */
async function tenantOfUser(userId: string): Promise<string | null> {
  const row = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM tenant_users
      WHERE user_id = $1 AND status = 'active'
      ORDER BY invited_at LIMIT 1`,
    [userId]
  ).catch(() => null)
  return row?.tenant_id ?? null
}

function labelFromUA(ua: string): string {
  if (!ua) return 'Appareil inconnu'
  let browser = 'Navigateur'
  if (/Edg\//.test(ua))      browser = 'Edge'
  else if (/Chrome/.test(ua)) browser = 'Chrome'
  else if (/Safari/.test(ua)) browser = 'Safari'
  else if (/Firefox/.test(ua)) browser = 'Firefox'
  let os = 'Ordinateur'
  if (/iPhone|iPad|iOS/.test(ua))         os = 'iOS'
  else if (/Android/.test(ua))             os = 'Android'
  else if (/Windows/.test(ua))             os = 'Windows'
  else if (/Mac OS X|Macintosh/.test(ua))  os = 'macOS'
  else if (/Linux/.test(ua))               os = 'Linux'
  return `${browser} · ${os}`
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

  /* Store hashed refresh token — raw token NEVER written to DB.
     Durée alignée sur signRefreshToken() = 90 jours (session persistante). */
  await query(
    `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '90 days')`,
    [user.id, user.tenant_id, tokenHash, ip, ua]
  )

  /* httpOnly cookie — pas lisible par JS. maxAge doit être aligné avec
     l'expiration en DB pour éviter que le cookie disparaisse alors que
     le refresh token est encore valide côté serveur. */
  res.cookie('gestiq_refresh', refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   90 * 24 * 60 * 60 * 1000,
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
  if (typeof password !== 'string' || password.length < 10) {
    return res.status(400).json({ error: 'Mot de passe: minimum 10 caractères' })
  }
  if (!/[0-9]/.test(password) || !/[A-Za-z]/.test(password)) {
    return res.status(400).json({ error: 'Mot de passe: doit contenir au moins un chiffre et une lettre' })
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
    logger.error('[register]', err.message)
    res.status(500).json({ error: 'Erreur lors de l\'inscription' })
  }
})

/* ── POST /api/auth/login ────────────────────────────────────── */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password, tenantSlug } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' })
  }

  /* IP résolue selon la config proxy réelle (Traefik) — jamais un
     en-tête brut fourni par le client. Voir lib/clientIp.ts. */
  const ip = getClientIpOrUnknown(req)
  const ua = String(req.headers['user-agent'] ?? '')

  try {
    /* Brute-force : compte les échecs récents (IP OU email). */
    const recentFails = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::int as count FROM login_attempts
       WHERE (email = $1 OR ip_address = $2::inet)
         AND success = false
         AND attempted_at > NOW() - INTERVAL '15 minutes'`,
      [email, ip]
    )
    if (Number(recentFails?.count ?? 0) >= 10) {
      /* Rattachement au tenant du compte visé quand il existe : sans ça,
         l'événement (qui contient l'email) partirait en « non attribué »
         et serait donc visible par les administrateurs de TOUS les
         espaces — fuite d'information entre tenants. */
      const target = await queryOne<{ id: string }>(
        `SELECT id FROM users WHERE email = $1`, [email]
      ).catch(() => null)
      markSecurityLogged(req)
      trackSecurityEvent({
        type: 'login_blocked_lockout', req,
        email, httpStatus: 429,
        userId:   target?.id ?? null,
        tenantId: target ? await tenantOfUser(target.id) : null,
        reason: 'too_many_failed_attempts',
        metadata: { failures: Number(recentFails?.count ?? 0), window_minutes: 15 },
      })
      return res.status(429).json({
        error: 'Compte temporairement verrouillé. Réessayez dans 15 minutes.',
      })
    }

    const user = await queryOne<{
      id: string; password_hash: string; name: string;
      is_active: boolean; twofa_mode: string;
    }>(
      `SELECT id, password_hash, name, is_active, twofa_mode
         FROM users WHERE email = $1`,
      [email]
    )

    const valid = user ? await bcrypt.compare(password, user.password_hash) : false

    await query(
      `INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2::inet, $3)`,
      [email, ip, valid]
    )

    if (!user || !valid) {
      markSecurityLogged(req)
      trackSecurityEvent({
        type: 'login_failed', req,
        email, httpStatus: 401,
        tenantId: user ? await tenantOfUser(user.id) : null,
        userId:   user?.id ?? null,
        /* On distingue « compte inconnu » de « mot de passe faux » dans le
           journal interne, jamais dans la réponse HTTP (anti-énumération). */
        reason: user ? 'invalid_password' : 'unknown_account',
      })
      return res.status(401).json({ error: 'Identifiants incorrects' })
    }
    if (!user.is_active) {
      markSecurityLogged(req)
      trackSecurityEvent({
        type: 'account_disabled_login', req,
        email, userId: user.id,
        tenantId: await tenantOfUser(user.id),
        httpStatus: 403, reason: 'account_disabled',
      })
      return res.status(403).json({ error: 'Compte désactivé' })
    }

    const memberRow = tenantSlug
      ? await queryOne<{ tenant_id: string; role: string; slug: string }>(
          `SELECT tu.tenant_id, tu.role, t.slug
             FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id
            WHERE tu.user_id = $1 AND t.slug = $2 AND tu.status = 'active'`,
          [user.id, tenantSlug]
        )
      : await queryOne<{ tenant_id: string; role: string; slug: string }>(
          `SELECT tu.tenant_id, tu.role, t.slug
             FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id
            WHERE tu.user_id = $1 AND tu.status = 'active'
            ORDER BY tu.invited_at LIMIT 1`,
          [user.id]
        )

    if (!memberRow) return res.status(403).json({ error: 'Accès refusé' })

    await logLogin({
      userId: user.id, tenantId: memberRow.tenant_id, email,
      ip, ua, method: 'password', event: 'password_ok', success: true,
    })

    /* ── SHORT-CIRCUIT 2FA sur appareil déjà validé ─────────────
       Si le cookie `gestiq_device` correspond à un trusted_devices
       actif pour ce user → session ouverte directement. */
    const deviceHash = getDeviceHash(req)
    if (deviceHash) {
      const trusted = await findTrustedDevice(deviceHash, user.id)
      if (trusted) {
        await touchTrustedDevice(deviceHash, user.id, ip, ua)
        const { accessToken, tenantSlug: s } = await issueTokenPair(
          res,
          { id: user.id, email, role: memberRow.role, tenant_id: memberRow.tenant_id, slug: memberRow.slug },
          ip, ua,
        )
        await logLogin({
          userId: user.id, tenantId: memberRow.tenant_id, email,
          ip, ua, deviceHash, method: 'trusted_device',
          event: 'trusted_skip', success: true,
        })
        return res.json({
          token: accessToken, tenantSlug: s,
          tenantId: memberRow.tenant_id, role: memberRow.role,
          trustedDevice: true,
        })
      }
    }

    /* ── 2FA obligatoire ──────────────────────────────────────── */
    /* Invalide les challenges pending pour ce user (un seul actif). */
    await query(
      `UPDATE login_verification_codes
          SET status = 'expired'
        WHERE user_id = $1 AND status = 'pending'`,
      [user.id]
    )

    const method = (['email','admin_manual','admin_approval'] as const)
      .includes(user.twofa_mode as any) ? user.twofa_mode : 'email'

    let codeHash: string | null = null
    let clearCode: string | null = null
    if (method === 'email' || method === 'admin_manual') {
      /* admin_manual : le code est généré maintenant mais NE SORT PAS
         du serveur — l'admin le retirera via /admin/2fa/:id/reveal-code
         (une seule fois). Ici on le pré-calcule pour email uniquement. */
      if (method === 'email') {
        clearCode = String(Math.floor(100000 + Math.random() * 900000))
        codeHash  = await bcrypt.hash(clearCode, 10)
      }
    }

    const challenge = await queryOne<{ id: string }>(
      `INSERT INTO login_verification_codes
         (user_id, tenant_id, email, code_hash, method, status,
          expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, 'pending',
               NOW() + INTERVAL '10 minutes', $6::inet, $7)
       RETURNING id`,
      [user.id, memberRow.tenant_id, email, codeHash, method, ip, ua]
    )

    if (method === 'email' && clearCode) {
      try {
        const tpl = loginCodeEmail(clearCode)
        await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text })
      } catch (e: any) {
        logger.error('[login:2fa-email]', e?.message ?? e)
      }
    }

    await logLogin({
      userId: user.id, tenantId: memberRow.tenant_id, email,
      ip, ua, method, event: 'challenge_sent', success: true,
      challengeId: challenge?.id ?? null,
    })

    return res.json({
      needsVerification: true,
      challengeId: challenge?.id ?? null,
      method,
      email,
    })
  } catch (err: any) {
    logger.error('[login]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/verify-login — Finalise sign-in with the code ─
   Fonctionne pour les 3 modes :
     • email          : body.code obligatoire, bcrypt.compare(code, code_hash)
     • admin_manual   : idem — admin a communiqué le code hors-ligne
     • admin_approval : body.code ignoré, on vérifie status='approved'
*/
router.post('/verify-login', authLimiter, async (req: Request, res: Response) => {
  const { email, code, challengeId, tenantSlug, rememberDevice } = req.body
  if (!email && !challengeId) {
    return res.status(400).json({ error: 'Email ou challengeId requis' })
  }

  const ip = req.ip ?? '0.0.0.0'
  const ua = String(req.headers['user-agent'] ?? '')

  try {
    const row = await queryOne<{
      id: string; user_id: string; tenant_id: string;
      code_hash: string | null; attempts: number;
      method: string; status: string; expires_at: string;
    }>(
      challengeId
        ? `SELECT id, user_id, tenant_id, code_hash, attempts, method, status, expires_at
             FROM login_verification_codes
            WHERE id = $1 LIMIT 1`
        : `SELECT id, user_id, tenant_id, code_hash, attempts, method, status, expires_at
             FROM login_verification_codes
            WHERE email = $1 AND status = 'pending' AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1`,
      [challengeId ?? email]
    )

    if (!row) return res.status(400).json({ error: 'Demande introuvable ou expirée' })
    if (row.status === 'rejected') return res.status(403).json({ error: 'Connexion refusée par l\'administrateur' })
    if (row.status === 'consumed') return res.status(400).json({ error: 'Code déjà utilisé' })
    if (row.status === 'expired' || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Code expiré, redemandez-en un' })
    }

    if (row.attempts >= 5) {
      await query(`UPDATE login_verification_codes SET status = 'expired' WHERE id = $1`, [row.id])
      await logLogin({
        userId: row.user_id, tenantId: row.tenant_id, email,
        ip, ua, method: row.method as any, event: 'verify_failed',
        success: false, challengeId: row.id,
        metadata: { reason: 'too_many_attempts' },
      })
      markSecurityLogged(req)
      trackSecurityEvent({
        type: 'login_failed_burst', req,
        email, userId: row.user_id, tenantId: row.tenant_id,
        httpStatus: 429, reason: 'too_many_2fa_attempts',
        metadata: { attempts: row.attempts, method: row.method },
      })
      return res.status(429).json({ error: 'Trop de tentatives. Reconnectez-vous.' })
    }

    /* Selon le mode, la vérification diffère. */
    if (row.method === 'admin_approval') {
      if (row.status !== 'approved') {
        return res.status(202).json({
          waitingForApproval: true,
          message: 'En attente d\'approbation par l\'administrateur.',
          status:  row.status,
        })
      }
    } else {
      /* email OU admin_manual : code obligatoire, comparé au hash. */
      if (!code) return res.status(400).json({ error: 'Code requis' })
      if (!row.code_hash) {
        return res.status(400).json({ error: 'Aucun code n\'a encore été généré. Contactez l\'administrateur.' })
      }
      const valid = await bcrypt.compare(String(code), row.code_hash)
      if (!valid) {
        await query(
          `UPDATE login_verification_codes SET attempts = attempts + 1 WHERE id = $1`,
          [row.id]
        )
        await logLogin({
          userId: row.user_id, tenantId: row.tenant_id, email,
          ip, ua, method: row.method as any, event: 'verify_failed',
          success: false, challengeId: row.id,
        })
        trackSecurityEvent({
          type: 'login_failed', req,
          email, userId: row.user_id, tenantId: row.tenant_id,
          httpStatus: 400, reason: 'invalid_verification_code',
          metadata: { method: row.method },
        })
        return res.status(400).json({ error: 'Code incorrect' })
      }
    }

    await query(`UPDATE login_verification_codes SET status = 'consumed' WHERE id = $1`, [row.id])
    await query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1`,
      [row.user_id]
    )

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

    /* Marque l'appareil comme trusted sauf si le client demande explicitement
       le contraire (rememberDevice === false). Par défaut → oui. */
    let deviceHash: string | null = null
    if (rememberDevice !== false) {
      deviceHash = await issueTrustedDevice(
        res, row.user_id, memberRow.tenant_id, ip, ua, labelFromUA(ua)
      )
    }

    const emailForToken = email || (await queryOne<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`, [row.user_id]
    ))?.email || ''

    const { accessToken, tenantSlug: s } = await issueTokenPair(
      res,
      { id: row.user_id, email: emailForToken, role: memberRow.role, tenant_id: memberRow.tenant_id, slug: memberRow.slug },
      ip, ua,
    )

    await logLogin({
      userId: row.user_id, tenantId: memberRow.tenant_id, email: emailForToken,
      ip, ua, deviceHash, method: row.method as any,
      event: 'verify_success', success: true, challengeId: row.id,
    })

    res.json({
      token: accessToken, tenantSlug: s,
      tenantId: memberRow.tenant_id, role: memberRow.role,
    })
  } catch (err: any) {
    logger.error('[verify-login]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/auth/2fa/status — polling pour admin_approval ─────
   Le client ping cette route toutes les 3-5s pendant qu'il attend
   l'admin. On renvoie {status, method} et rien d'autre. */
router.get('/2fa/status', authLimiter, async (req: Request, res: Response) => {
  const challengeId = String(req.query.challengeId || '')
  if (!challengeId) return res.status(400).json({ error: 'challengeId requis' })
  const row = await queryOne<{ status: string; method: string; expires_at: string }>(
    `SELECT status, method, expires_at FROM login_verification_codes WHERE id = $1`,
    [challengeId]
  )
  if (!row) return res.status(404).json({ error: 'Introuvable' })
  const expired = new Date(row.expires_at) < new Date()
  res.json({
    status: expired && row.status === 'pending' ? 'expired' : row.status,
    method: row.method,
    expiresAt: row.expires_at,
  })
})

/* ── POST /api/auth/resend-login-code — Ré-émet un code (mode email
   uniquement — pour admin_manual/admin_approval, il faut passer par
   l'admin). Rate limit implicite : impossible sans challenge récent. */
router.post('/resend-login-code', authLimiter, async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email requis' })

  try {
    /* Doit y avoir un challenge récent (30 min) pour ce mail — sinon
       endpoint inutilisable en cold-start (anti-abuse). */
    const recent = await queryOne<{ user_id: string; tenant_id: string; method: string }>(
      `SELECT user_id, tenant_id, method FROM login_verification_codes
        WHERE email = $1 AND created_at > NOW() - INTERVAL '30 minutes'
        ORDER BY created_at DESC LIMIT 1`,
      [email]
    )
    if (!recent) {
      /* Réponse opaque pour éviter l'énumération */
      return res.json({ success: true })
    }
    if (recent.method !== 'email') {
      /* Sur admin_manual/admin_approval, l'utilisateur ne peut PAS
         forcer l'envoi d'un nouveau code — c'est l'admin qui décide. */
      return res.json({ success: true, adminMode: true })
    }

    await query(
      `UPDATE login_verification_codes SET status = 'expired'
        WHERE user_id = $1 AND status = 'pending'`,
      [recent.user_id]
    )

    const code     = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = await bcrypt.hash(code, 10)

    await query(
      `INSERT INTO login_verification_codes
         (user_id, tenant_id, email, code_hash, method, status,
          expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, 'email', 'pending',
               NOW() + INTERVAL '10 minutes', $5::inet, $6)`,
      [recent.user_id, recent.tenant_id, email, codeHash,
       req.ip ?? '0.0.0.0', req.headers['user-agent'] ?? '']
    )

    try {
      const tpl = loginCodeEmail(code)
      await sendEmail({ to: email, ...tpl })
    } catch (e: any) {
      logger.error('[resend-login-code:email]', e?.message ?? e)
    }

    res.json({ success: true })
  } catch (err: any) {
    logger.error('[resend-login-code]', err.message)
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
        const inviteToken     = randomToken()
        const inviteTokenHash = hashToken(inviteToken)
        await query(
          `UPDATE public.team_members
              SET invitation_token = NULL,
                  invitation_token_hash = $1,
                  invitation_purpose = 'invite',
                  invitation_used_at = NULL,
                  invitation_created_ip = $3::inet,
                  invitation_sent_at = NOW(),
                  invitation_expires_at = NOW() + INTERVAL '48 hours',
                  account_status = 'invited', updated_at = NOW()
            WHERE id = $2`,
          [inviteTokenHash, member.id, req.ip ?? '0.0.0.0']
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
          logger.debug('[forgot-password] reinvited team_member', { id: member.id, token_prefix: tokenPrefix(inviteToken) })
        } catch (e: any) {
          logger.error('[forgot-password:reinvite]', e?.message ?? e)
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
      logger.error('[forgot-password:email]', e?.message ?? e)
    }

    res.json({ success: true })
  } catch (err: any) {
    logger.error('[forgot-password]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/reset-password — Verify code + update hash ── */
router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Tous les champs sont requis' })
  }
  if (typeof newPassword !== 'string' || newPassword.length < 10) {
    return res.status(400).json({ error: 'Mot de passe: minimum 10 caractères' })
  }
  if (!/[0-9]/.test(newPassword) || !/[A-Za-z]/.test(newPassword)) {
    return res.status(400).json({ error: 'Mot de passe: doit contenir au moins un chiffre et une lettre' })
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

    trackSecurityEvent({
      type: 'password_reset_completed', req,
      email, userId: row.user_id,
      tenantId: await tenantOfUser(row.user_id),
      reason: 'reset_code_verified',
      metadata: { all_sessions_revoked: true },
    })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[reset-password]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/refresh — Rotation: old token revoked ─────── */
router.post('/refresh', authLimiter, async (req: Request, res: Response) => {
  const rawToken = req.cookies?.gestiq_refresh
  if (!rawToken) return res.status(401).json({ error: 'Session expirée', code: 'NO_REFRESH' })

  const payload = verifyRefreshToken(rawToken)
  if (!payload) {
    /* Cookie présent mais signature/expiration invalides. On ne
       journalise PAS l'absence de cookie : un visiteur déconnecté
       déclenche ce cas en permanence, ce serait du bruit pur. */
    markSecurityLogged(req)
    trackSecurityEvent({
      type: 'refresh_rejected', req,
      httpStatus: 401, reason: 'invalid_refresh_signature',
    })
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
      /* CRITICAL/CONFIRMED assumé : la rotation est atomique côté serveur,
         un refresh token déjà révoqué ne peut pas être rejoué par accident.
         C'est l'un des rares cas où la preuve technique est déterministe. */
      markSecurityLogged(req)
      trackSecurityEvent({
        type: 'token_reuse_detected', req,
        userId: payload.userId, tenantId: payload.tenantId,
        httpStatus: 401, reason: 'refresh_token_replayed',
        metadata: { all_sessions_revoked: true },
      })
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
    logger.error('[refresh]', err.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/auth/logout ───────────────────────────────────── */
/* Le logout doit invalider :
   1. Le refresh token (empêche le prolongement de session)
   2. Le trusted_device COURANT (force la 2FA à la prochaine connexion — spec produit)

   Point critique : la fermeture du navigateur NE doit PAS déclencher de re-2FA
   — le cookie gestiq_device reste (HttpOnly, 90j) et la ligne trusted_devices
   reste active. Ce n'est QUE le clic explicite sur "Se déconnecter" qui
   révoque le trusted_device. */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const rawToken = req.cookies?.gestiq_refresh
  if (rawToken) {
    const tokenHash = hashToken(rawToken)
    await query(
      `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
      [tokenHash]
    ).catch(() => {})
  }

  /* Révocation du device de confiance courant : la prochaine connexion
     réclamera le code email. On révoque UNIQUEMENT ce device — les autres
     appareils (bureau, tablette…) restent trusted. */
  const deviceHash = getDeviceHash(req)
  if (deviceHash) {
    await query(
      `UPDATE trusted_devices
          SET revoked_at = NOW()
        WHERE user_id = $1 AND device_hash = $2 AND revoked_at IS NULL`,
      [req.user!.userId, deviceHash]
    ).catch(() => {})
  }

  /* La présence disparaît immédiatement du « qui est en ligne » — sans
     ça, l'utilisateur y resterait jusqu'à expiration du heartbeat. */
  void endPresence(req.user!.userId, String(req.body?.sessionKey ?? '') || null)
  trackSecurityEvent({ type: 'logout', req, reason: 'user_logout' })
  res.clearCookie('gestiq_refresh', { path: '/api/auth' })
  res.clearCookie(DEVICE_COOKIE,   { ...cookieBaseOpts() })
  res.json({ success: true })
})

/* ── POST /api/auth/change-password ─────────────────────────── */
router.post('/change-password', requireAuth, passwordLimiter, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Les deux mots de passe sont requis' })
  }
  if (typeof newPassword !== 'string' || newPassword.length < 10) {
    return res.status(400).json({ error: 'Minimum 10 caractères requis' })
  }
  if (!/[0-9]/.test(newPassword) || !/[A-Za-z]/.test(newPassword)) {
    return res.status(400).json({ error: 'Doit contenir au moins un chiffre et une lettre' })
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

    trackSecurityEvent({
      type: 'password_changed', req,
      reason: 'self_service_change',
      metadata: { all_sessions_revoked: true },
    })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[change-password]', err.message)
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
