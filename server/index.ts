import express from 'express'
import cors    from 'cors'
import dotenv  from 'dotenv'
import cookieParser from 'cookie-parser'
import { pool, probeRlsRole } from './db/pool'
import { apiLimiter, sanitizeBody, errorHandler, requestId } from './middleware/security'
import helmet from 'helmet'

import authRoutes     from './routes/auth'
import { requireAuth, requireRole } from './middleware/auth'
import crudRoutes     from './routes/crud'
import tenantRoutes   from './routes/tenants'
import stockRoutes    from './routes/stock'
import vehiclesRoutes from './routes/vehicles'
import financeAiRoutes from './routes/financeAi'
import financeRoutes from './routes/finance'
import aiRoutes from './routes/ai'
import aiQuoteRoutes from './routes/aiQuote'
import publicLeadsRoutes from './routes/publicLeads'
import emailTrackingPublicRoutes from './routes/emailTrackingPublic'
import teamRoutes      from './routes/team'
import { startExpiryReminderScheduler, checkAndSendExpiryReminders } from './lib/expiryReminderScheduler'
import { startAutopilotScheduler } from './lib/outboundAutopilot'
import mySpaceRoutes   from './routes/mySpace'
import sendDocumentRoutes from './routes/sendDocument'
import activityRoutes  from './routes/activity'
import outboundRoutes  from './routes/outbound'
import paiementsRecoveryRoutes from './routes/paiementsRecovery'
import admin2faRoutes from './routes/admin2fa'
import securityRoutes from './routes/security'
import { securityResponseMonitor } from './middleware/securityMonitor'
import { startSecurityRetentionScheduler } from './lib/securityEvents'
import { trustedProxyHops } from './lib/clientIp'
import { reportUnscopedTables } from './db/tenantColumns'

dotenv.config({ path: '.env.local' })

const app  = express()
const PORT = process.env.SERVER_PORT || 4000

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

/* ── Security headers ───────────────────────────────────────── */
const isProd = process.env.NODE_ENV === 'production'

/* ── Refuse to boot with weak/known-default secrets in production ─
   Un secret placeholder en prod = compromis dès la première release.
   On échoue-vite plutôt que de fournir une fausse sécurité. */
function validateProdSecrets() {
  if (!isProd) return
  const errs: string[] = []
  const KNOWN_PLACEHOLDERS = [
    'change-me', 'changeme', 'placeholder', 'local-dev', 'dev-fallback',
    'secret', 'password',
  ]
  const requiredSecrets: Array<[string, number]> = [
    ['JWT_SECRET',         32],
    ['JWT_REFRESH_SECRET', 32],
  ]
  for (const [key, minLen] of requiredSecrets) {
    const v = process.env[key] ?? ''
    if (v.length < minLen) errs.push(`${key} manquant ou trop court (>= ${minLen} chars)`)
    if (KNOWN_PLACEHOLDERS.some(p => v.toLowerCase().includes(p))) {
      errs.push(`${key} contient un placeholder connu — rotation obligatoire`)
    }
  }
  /* En prod, ces variables NE DOIVENT PAS être présentes sous forme VITE_
   * (VITE_ = bundle client). */
  const forbiddenViteBackendSecrets = ['VITE_JWT_SECRET', 'VITE_RESEND_API_KEY', 'VITE_OPENAI_API_KEY', 'VITE_PG_PASSWORD']
  for (const key of forbiddenViteBackendSecrets) {
    if (process.env[key]) errs.push(`${key} présent dans l'env — secret backend exposé au frontend`)
  }
  if (errs.length) {
    console.error('\n🛑 FATAL — configuration production invalide :\n' + errs.map(e => '  - ' + e).join('\n') + '\n')
    process.exit(1)
  }
}
validateProdSecrets()

app.disable('x-powered-by')

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com', 'data:'],
      connectSrc:     ["'self'", 'https://api.resend.com', 'https://api.openai.com'],
      frameSrc:       ["'none'"],
      frameAncestors: ["'none'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy:   { policy: 'same-origin-allow-popups' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}))

/* Permissions-Policy explicite — désactive par défaut les APIs sensibles */
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), autoplay=(), camera=(), clipboard-read=(self), clipboard-write=(self), display-capture=(), fullscreen=(self), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(self), usb=(), xr-spatial-tracking=()'
  )
  next()
})

/* Nombre de proxys de confiance devant l'app (Traefik/Dokploy = 1).
   Cette valeur décide de l'IP retenue dans X-Forwarded-For : la
   sur-déclarer permettrait à un client de forger son IP (rate limiting
   contournable, journal de sécurité pollué). Voir lib/clientIp.ts. */
app.set('trust proxy', trustedProxyHops())
app.use(cookieParser())
app.use(requestId)

/* Observateur des refus HTTP (401/403/429) — journalise APRÈS la
   réponse, n'écrit rien sur une requête normale. */
app.use(securityResponseMonitor)

/* ── CORS — strict origin list (localhost:* in dev, *.nextgital.tech in prod).
   /api/public/* is OPEN by design: it's the embeddable widget intake, so any
   origin can POST a lead (auth is via the workspace key, not the browser session). */
const LOCALHOST_DEV_RE = /^http:\/\/localhost:\d+$/
const NEXTGITAL_RE     = /^https:\/\/[a-z0-9-]+\.nextgital\.(tech|ma)$/i
app.use(cors((req, cb) => {
  /* Routes publiques cross-origin (intake widget, pixel de tracking) : CORS grand
     ouvert. On EXCLUT /api/public/widget-key qui est authentifié (requireAuth) et
     appelé depuis l'app elle-même : il a besoin de l'en-tête Authorization + du
     contrôle d'origine, donc il passe par la branche standard ci-dessous. */
  if (req.path && req.path.startsWith('/api/public/') && req.path !== '/api/public/widget-key') {
    return cb(null, {
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Workspace-Key'],
    })
  }
  const origin = req.headers.origin
  const allowed =
    !origin ||
    ALLOWED_ORIGINS.includes(origin) ||
    NEXTGITAL_RE.test(origin) ||
    (!isProd && LOCALHOST_DEV_RE.test(origin))
  cb(null, {
    origin: allowed,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}))

/* ── Body parsing + sanitization ────────────────────────────── */
/* Limite spéciale 100 MB pour la restauration de backup paiements (pg_dump
   peut faire plusieurs dizaines de MB). Le reste des routes reste à 12 MB. */
app.use('/api/paiements-recovery', express.json({ limit: '100mb' }))
/* 12 MB pour accepter les images base64 stockées inline dans les blocs
   SOP (limite max 10 MB côté éditeur + marge de sérialisation JSON). */
app.use(express.json({ limit: '12mb' }))
app.use(sanitizeBody)

/* ── Global rate limit ───────────────────────────────────────── */
app.use('/api', apiLimiter)

/* ── Routes ─────────────────────────────────────────────────── */
app.use('/api/auth',     authRoutes)
app.use('/api/tenants',  tenantRoutes)
app.use('/api/stock',    stockRoutes)
app.use('/api/vehicles', vehiclesRoutes)
app.use('/api/finance-ai', financeAiRoutes)
app.use('/api/finance',   financeRoutes)
app.use('/api/ai',        aiRoutes)
app.use('/api/ai-quote',  aiQuoteRoutes)
app.use('/api/public',    publicLeadsRoutes)
app.use('/api/public',    emailTrackingPublicRoutes)
app.use('/api/team',      teamRoutes)
app.use('/api/my-space',  mySpaceRoutes)
app.use('/api/send-document', sendDocumentRoutes)
app.use('/api/activity',  activityRoutes)
app.use('/api/outbound',  outboundRoutes)
app.use('/api/paiements-recovery', paiementsRecoveryRoutes)
app.use('/api/admin/2fa', admin2faRoutes)
app.use('/api/security',  securityRoutes)
app.use('/api',          crudRoutes)

/* ── Health check (no DB details in prod) ───────────────────── */
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', time: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'error' })
  }
})

/* ── Services diagnostic (public — only reports configured/not, no secrets) ─ */
app.get('/health/services', (_req, res) => {
  res.json({
    nodeEnv:    process.env.NODE_ENV ?? 'unknown',
    email: {
      configured: !!process.env.RESEND_API_KEY,
      from:       process.env.RESEND_FROM ? 'set' : 'missing',
    },
    auth: {
      jwt:        !!process.env.JWT_SECRET,
      jwtRefresh: !!process.env.JWT_REFRESH_SECRET,
    },
  })
})

/* Endpoint manuel : déclenche immédiatement le check rappels d'expiration.
   Réservé aux admins authentifiés — l'action fanoute des mails à tous les
   admins de tous les tenants et consomme le quota Resend. */
app.post('/api/admin/run-expiry-reminders', requireAuth, requireRole('admin'), async (_req, res) => {
  await checkAndSendExpiryReminders(pool)
  res.json({ ok: true })
})

/* ── 404 ─────────────────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ error: 'Route introuvable' }))

/* ── Global error handler ────────────────────────────────────── */
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`\n NEXT GITAL API  →  http://localhost:${PORT}`)
  /* Démarre le scheduler de rappels d'expiration (domaines/hébergements) */
  startExpiryReminderScheduler(pool)
  /* Démarre l'autopilot Outbound (check chaque heure les tenants dont run_hour = maintenant) */
  startAutopilotScheduler(pool)
  /* Purge quotidienne du Centre de sécurité — le monitoring ne doit pas
     faire grossir la base indéfiniment (rétention par sévérité). */
  startSecurityRetentionScheduler()
  /* Diagnostic de cloisonnement : signale au démarrage toute table
     exposée par l'API CRUD qui n'a pas de colonne tenant_id (donc
     protégée par la seule RLS). Mieux vaut le savoir au boot que lors
     d'un incident. */
  void import('./routes/crud').then(m => reportUnscopedTables(m.EXPOSED_TABLES)).catch(() => {})
  /* Vérifie au démarrage que les requêtes tenant s'exécuteront bien
     sous un rôle soumis à la RLS (migration 082). Avertit sinon. */
  void probeRlsRole().then(ok => {
    console.log(ok
      ? '[rls] requêtes tenant exécutées sous le rôle gestiq_rls (RLS garantie)'
      : '[rls] ATTENTION — rôle RLS indisponible, cloisonnement dépendant du compte de connexion')
  })
})
