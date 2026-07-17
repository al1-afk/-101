/**
 * Routes publiques de tracking — sans auth (accessibles depuis les emails).
 *
 * - GET /api/public/track/open/:token.gif → 1×1 GIF + enregistre l'open
 * - GET /api/public/track/click/:token?u=X → redirige + enregistre le clic
 *
 * Sécurité :
 *   - Token HMAC obligatoire → impossible de forger
 *   - Rate-limit (100/min par IP) → protection contre le flood
 *   - Ne renvoie JAMAIS d'erreur applicative (retourne le pixel/redirect quoi
 *     qu'il arrive — l'ouvreur ne doit pas voir de trace de tracking cassé)
 */
import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { ipKeyGenerator } from 'express-rate-limit'
import { pool } from '../db/pool'
import { verifyToken, recordOpen, recordClick } from '../lib/emailTracking'
import { logger } from '../lib/logger'

const router = Router()

/* Pixel 1×1 GIF transparent — 43 bytes, cachable. */
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,               /* Un même client peut charger le pixel plusieurs fois (preview + open réel). */
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(String(req.ip ?? '')),
  handler: (_req, res) => {
    res.setHeader('Content-Type', 'image/gif')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).end(PIXEL_GIF)      /* On répond OK quand même — on ne veut pas leak le rate-limit */
  },
})

router.use(trackingLimiter)

async function handleOpen(req: Request, res: Response, token: string) {
  res.setHeader('Content-Type', 'image/gif')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  const prospectId = verifyToken(token)
  if (!prospectId) return res.status(200).end(PIXEL_GIF)

  try {
    const tenantId = await resolveTenantIdFromProspect(prospectId)
    if (tenantId) {
      await recordOpen({
        pool,
        tenantId,
        prospectId,
        userAgent: req.get('user-agent') ?? null,
        ip:        String(req.ip ?? ''),
      })
    }
  } catch (e: any) {
    logger.warn('[tracking:open] ' + (e?.message ?? 'error'))
  }
  return res.status(200).end(PIXEL_GIF)
}

async function resolveTenantIdFromProspect(prospectId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT tenant_id FROM outbound_prospects WHERE id = $1`, [prospectId])
  return rows[0]?.tenant_id ?? null
}

/* ─── OPEN pixel — extension .gif optionnelle ─────────────────── */
router.get('/track/open/:token', async (req: Request, res: Response) => {
  const raw = String(req.params.token ?? '').replace(/\.gif$/i, '')
  return handleOpen(req, res, raw)
})

/* ─── CLICK redirect ─────────────────────────────────────────── */
router.get('/track/click/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token ?? '')
  const rawUrl = String(req.query.u ?? '')
  const prospectId = verifyToken(token)

  /* Si target manquant ou dangereux → fallback vers la page d'accueil. */
  let target = 'https://nextgital.com'
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      target = parsed.toString()
    }
  } catch { /* garde le fallback */ }

  if (prospectId) {
    try {
      const tenantId = await resolveTenantIdFromProspect(prospectId)
      if (tenantId) {
        await recordClick({
          pool,
          tenantId,
          prospectId,
          targetUrl: target,
          userAgent: req.get('user-agent') ?? null,
          ip:        String(req.ip ?? ''),
        })
      }
    } catch (e: any) {
      logger.warn('[tracking:click] ' + (e?.message ?? 'error'))
    }
  }
  res.redirect(302, target)
})

export default router
