/**
 * Module « Google Contacts — Caller ID ».
 *
 * Pousse les prospects (nom + téléphone) vers les Google Contacts de
 * l'utilisateur : quand un prospect appelle, son nom s'affiche sur le
 * téléphone (le dialer lit les contacts synchronisés par le compte Google).
 *
 * OAuth : le refresh_token n'est JAMAIS exposé au frontend ni loggé ; il est
 * stocké CHIFFRÉ (server/lib/secretBox.ts). Le state est un JWT court signé.
 *
 * Endpoints :
 *   GET  /api/google-contacts/status          (auth+rôle)
 *   POST /api/google-contacts/oauth/url        (auth+rôle) → URL de consentement
 *   GET  /api/google-contacts/oauth/callback   (public, vérifié par le state)
 *   POST /api/google-contacts/sync             (auth+rôle) → sync immédiat
 *   POST /api/google-contacts/settings         (auth+rôle) → auto_sync / options
 *   POST /api/google-contacts/disconnect       (auth+rôle)
 */
import { Router, Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { requireAuth } from '../middleware/auth'
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { logger } from '../lib/logger'
import { encryptSecret, decryptSecret } from '../lib/secretBox'
import {
  googleConfigured, buildConsentUrl, exchangeCode, getUserEmail,
  ensureContactGroup, revokeToken, GoogleAuthError,
} from '../lib/googlePeople'
import { syncLink, type GoogleLinkRow } from '../lib/googleContactsService'

const router = Router()

/* ── Feature flag + secret d'état ──────────────────────────────────── */
function featureEnabled(): boolean {
  return (process.env.GOOGLE_CONTACTS_ENABLED ?? 'true').toLowerCase() !== 'false'
}
function stateSecret(): string {
  const v = process.env.JWT_SECRET
  if (v && v.length >= 32) return v
  if (process.env.NODE_ENV === 'production') throw new Error('FATAL: JWT_SECRET requis')
  return `dev-JWT_SECRET-fallback-${'x'.repeat(40)}`
}
const CONTACT_GROUP_NAME = 'NEXT GITAL – Prospects'
const DEFAULT_NAME = 'NEXT GITAL'
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

interface LinkStatusRow {
  google_email: string | null; status: string; auto_sync: boolean
  name_suffix: string | null; include_company: boolean
  last_synced_at: string | null; contacts_count: number; last_error: string | null
}

/* ── Garde de rôle : mêmes rôles que ceux qui voient les prospects ─── */
const CONTACTS_ROLES = new Set(['admin', 'manager', 'commercial'])
function requireContactsRole(req: Request, res: Response, next: NextFunction) {
  if (!CONTACTS_ROLES.has(req.user?.role ?? '')) {
    return res.status(403).json({ error: 'Permissions insuffisantes' })
  }
  next()
}

/* ── Rate limit sur le sync (People API) ───────────────────────────── */
const syncLimiter = rateLimit({
  windowMs: 60_000, max: 6, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId ? `u:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`,
  message: { error: 'Trop de synchronisations. Réessayez dans une minute.' },
})

async function getLink(tenantId: string, userId: string): Promise<GoogleLinkRow | null> {
  return tenantQueryOne<GoogleLinkRow>(tenantId,
    `SELECT id, tenant_id, user_id, google_email, refresh_token_enc,
            contact_group_resource, name_suffix, include_company, auto_sync, status
       FROM google_contacts_links WHERE user_id = $1`, [userId])
}

/* ═══════════════════════════════════════════════════════════════════
   GET /status
═══════════════════════════════════════════════════════════════════ */
router.get('/status', requireAuth, requireContactsRole, async (req: Request, res: Response) => {
  const configured = googleConfigured()
  const enabled = featureEnabled()
  try {
    const link = await tenantQueryOne<LinkStatusRow>(req.user!.tenantId,
      `SELECT google_email, status, auto_sync, name_suffix, include_company,
              last_synced_at, contacts_count, last_error
         FROM google_contacts_links WHERE user_id = $1`, [req.user!.userId])
    res.json({
      enabled, configured,
      link: link ? {
        connected: true,
        googleEmail: link.google_email,
        status: link.status,
        autoSync: link.auto_sync,
        nameSuffix: link.name_suffix ?? '',
        includeCompany: link.include_company,
        lastSyncedAt: link.last_synced_at,
        contactsCount: link.contacts_count,
        lastError: link.last_error,
      } : { connected: false },
    })
  } catch (e: unknown) {
    logger.error('[google-contacts:status]', errMsg(e))
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════════
   POST /oauth/url — URL de consentement (ouverte en popup côté client)
═══════════════════════════════════════════════════════════════════ */
router.post('/oauth/url', requireAuth, requireContactsRole, (req: Request, res: Response) => {
  if (!featureEnabled()) return res.status(503).json({ error: 'Fonctionnalité désactivée' })
  if (!googleConfigured()) return res.status(503).json({ error: 'Google OAuth non configuré côté serveur' })
  const state = jwt.sign(
    { userId: req.user!.userId, tenantId: req.user!.tenantId, kind: 'gcontacts' },
    stateSecret(), { expiresIn: '10m' })
  res.json({ url: buildConsentUrl(state) })
})

/* ═══════════════════════════════════════════════════════════════════
   GET /oauth/callback — cible de redirection Google (PUBLIC, vérifié par state)
═══════════════════════════════════════════════════════════════════ */
router.get('/oauth/callback', async (req: Request, res: Response) => {
  const code = String(req.query.code ?? '')
  const stateRaw = String(req.query.state ?? '')
  const errParam = req.query.error ? String(req.query.error) : ''

  const done = (ok: boolean, message: string) =>
    res.status(ok ? 200 : 400).type('html').send(popupHtml(ok, message))

  if (errParam) return done(false, 'Autorisation refusée sur Google.')
  if (!code || !stateRaw) return done(false, 'Requête invalide.')

  let claims: { userId: string; tenantId: string; kind?: string }
  try {
    claims = jwt.verify(stateRaw, stateSecret()) as { userId: string; tenantId: string; kind?: string }
    if (claims.kind !== 'gcontacts') throw new Error('bad_kind')
  } catch {
    return done(false, 'Session expirée. Relancez la connexion.')
  }

  try {
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) {
      // Google ne renvoie un refresh_token qu'au 1er consentement : on force
      // prompt=consent côté URL, donc ce cas signale un compte déjà relié.
      return done(false, "Aucun refresh_token reçu. Révoquez l'accès dans votre compte Google puis reconnectez-vous.")
    }
    const accessToken = tokens.access_token
    const email = await getUserEmail(accessToken)
    let group: string | null = null
    try { group = await ensureContactGroup(accessToken, CONTACT_GROUP_NAME) } catch { group = null }

    const enc = encryptSecret(tokens.refresh_token)
    await tenantQuery(claims.tenantId,
      `INSERT INTO google_contacts_links
         (tenant_id, user_id, google_email, refresh_token_enc, scope, contact_group_resource, contact_group_name, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
       ON CONFLICT (tenant_id, user_id) DO UPDATE
         SET google_email=EXCLUDED.google_email, refresh_token_enc=EXCLUDED.refresh_token_enc,
             scope=EXCLUDED.scope, contact_group_resource=EXCLUDED.contact_group_resource,
             status='active', last_error=NULL`,
      [claims.tenantId, claims.userId, email, enc, tokens.scope ?? null, group, CONTACT_GROUP_NAME])

    // Premier sync en arrière-plan (ne bloque pas la fermeture de la popup).
    void (async () => {
      const link = await getLink(claims.tenantId, claims.userId)
      if (link) await syncLink(link).catch(() => {})
    })()

    logger.info('[google-contacts:oauth] lié', claims.tenantId.slice(0, 8), email ?? '')
    return done(true, `Compte Google connecté${email ? ` (${email})` : ''}. La synchronisation démarre…`)
  } catch (e: unknown) {
    const msg = e instanceof GoogleAuthError ? 'Autorisation Google invalide.' : 'Échec de la connexion Google.'
    logger.error('[google-contacts:oauth] échec', errMsg(e))
    return done(false, msg)
  }
})

/* ═══════════════════════════════════════════════════════════════════
   POST /sync — synchronisation immédiate
═══════════════════════════════════════════════════════════════════ */
router.post('/sync', requireAuth, requireContactsRole, syncLimiter, async (req: Request, res: Response) => {
  try {
    const link = await getLink(req.user!.tenantId, req.user!.userId)
    if (!link) return res.status(404).json({ error: 'Aucun compte Google connecté' })
    const summary = await syncLink(link)
    if (!summary.ok && summary.status === 'needs_reauth') {
      return res.status(409).json({ error: 'Reconnexion Google requise', status: 'needs_reauth' })
    }
    if (!summary.ok) return res.status(502).json({ error: summary.error || 'Échec de la synchronisation' })
    res.json({ success: true, ...summary })
  } catch (e: unknown) {
    logger.error('[google-contacts:sync-route]', errMsg(e))
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════════
   POST /settings — auto_sync / suffixe / société
═══════════════════════════════════════════════════════════════════ */
router.post('/settings', requireAuth, requireContactsRole, async (req: Request, res: Response) => {
  const autoSync = typeof req.body?.autoSync === 'boolean' ? req.body.autoSync : undefined
  const includeCompany = typeof req.body?.includeCompany === 'boolean' ? req.body.includeCompany : undefined
  const nameSuffix = typeof req.body?.nameSuffix === 'string' ? String(req.body.nameSuffix).slice(0, 40) : undefined
  try {
    const link = await getLink(req.user!.tenantId, req.user!.userId)
    if (!link) return res.status(404).json({ error: 'Aucun compte Google connecté' })
    await tenantQuery(req.user!.tenantId,
      `UPDATE google_contacts_links SET
          auto_sync       = COALESCE($2, auto_sync),
          include_company = COALESCE($3, include_company),
          name_suffix     = COALESCE($4, name_suffix)
        WHERE id = $1`,
      [link.id, autoSync ?? null, includeCompany ?? null, nameSuffix ?? null])
    res.json({ success: true })
  } catch (e: unknown) {
    logger.error('[google-contacts:settings]', errMsg(e))
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════════
   POST /disconnect — révoque + supprime le lien (garde les contacts Google)
═══════════════════════════════════════════════════════════════════ */
router.post('/disconnect', requireAuth, requireContactsRole, async (req: Request, res: Response) => {
  try {
    const link = await getLink(req.user!.tenantId, req.user!.userId)
    if (!link) return res.json({ success: true })
    try { await revokeToken(decryptSecret(link.refresh_token_enc)) } catch { /* best effort */ }
    // Cascade supprime google_contact_map. Les contacts déjà créés restent
    // dans Google Contacts (l'utilisateur peut les supprimer via le groupe).
    await tenantQuery(req.user!.tenantId, `DELETE FROM google_contacts_links WHERE id = $1`, [link.id])
    logger.info('[google-contacts:disconnect]', link.id.slice(0, 8))
    res.json({ success: true })
  } catch (e: unknown) {
    logger.error('[google-contacts:disconnect]', errMsg(e))
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* Page HTML minimale renvoyée dans la popup OAuth : informe l'opener et se ferme. */
function popupHtml(ok: boolean, message: string): string {
  const safe = String(message).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
  const color = ok ? '#10b981' : '#ef4444'
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${DEFAULT_NAME} — Google Contacts</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b1020;color:#e5e7eb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="text-align:center;max-width:420px;padding:32px">
  <div style="font-size:44px;line-height:1;margin-bottom:16px">${ok ? '✅' : '⚠️'}</div>
  <h1 style="font-size:18px;margin:0 0 8px;color:${color}">${ok ? 'Connexion réussie' : 'Connexion échouée'}</h1>
  <p style="font-size:14px;color:#9ca3af;margin:0 0 20px">${safe}</p>
  <p style="font-size:12px;color:#6b7280">Cette fenêtre se ferme automatiquement…</p>
</div>
<script>
  try { if (window.opener) window.opener.postMessage({ source: 'gcontacts-oauth', ok: ${ok ? 'true' : 'false'} }, '*'); } catch (e) {}
  setTimeout(function(){ window.close(); }, 2200);
</script>
</body></html>`
}

export default router
