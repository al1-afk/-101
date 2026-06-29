import express from 'express'
import cors    from 'cors'
import dotenv  from 'dotenv'
import cookieParser from 'cookie-parser'
import { pool } from './db/pool'
import { apiLimiter, sanitizeBody, errorHandler } from './middleware/security'
import helmet from 'helmet'

import authRoutes     from './routes/auth'
import crudRoutes     from './routes/crud'
import tenantRoutes   from './routes/tenants'
import stockRoutes    from './routes/stock'
import vehiclesRoutes from './routes/vehicles'
import financeAiRoutes from './routes/financeAi'
import publicLeadsRoutes from './routes/publicLeads'
import teamRoutes      from './routes/team'
import mySpaceRoutes   from './routes/mySpace'

dotenv.config({ path: '.env.local' })

const app  = express()
const PORT = process.env.SERVER_PORT || 4000

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

/* ── Security headers ───────────────────────────────────────── */
const isProd = process.env.NODE_ENV === 'production'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'blob:'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      connectSrc:     ["'self'"],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy:   { policy: 'same-origin-allow-popups' },
}))

app.set('trust proxy', 1)
app.use(cookieParser())

/* ── CORS — strict origin list (localhost:* in dev, *.nextgital.tech in prod).
   /api/public/* is OPEN by design: it's the embeddable widget intake, so any
   origin can POST a lead (auth is via the workspace key, not the browser session). */
const LOCALHOST_DEV_RE = /^http:\/\/localhost:\d+$/
const NEXTGITAL_RE     = /^https:\/\/[a-z0-9-]+\.nextgital\.(tech|ma)$/i
app.use(cors((req, cb) => {
  if (req.path && req.path.startsWith('/api/public/')) {
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
app.use('/api/public',    publicLeadsRoutes)
app.use('/api/team',      teamRoutes)
app.use('/api/my-space',  mySpaceRoutes)
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

/* ── 404 ─────────────────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ error: 'Route introuvable' }))

/* ── Global error handler ────────────────────────────────────── */
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`\n GestiQ API  →  http://localhost:${PORT}`)
})
