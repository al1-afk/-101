/**
 * Security Center — noyau PUR (aucune I/O, aucune dépendance Express/pg).
 *
 * Tout ce qui décide « quoi journaliser, avec quelle sévérité, sous quelle
 * forme » vit ici pour être testable sans base ni serveur
 * (server/lib/securityCore.test.ts).
 *
 * Règle non négociable (§9) : aucune de ces fonctions ne doit laisser
 * passer un secret. `sanitizeMetadata` est le dernier rempart avant
 * l'écriture en base — elle s'appuie sur la redaction déjà utilisée par
 * le logger applicatif, plutôt que de dupliquer une liste de clés.
 */
import { redact } from './logger'

/* ── Vocabulaire ─────────────────────────────────────────────────── */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type EventStatus = 'normal' | 'suspicious' | 'blocked' | 'confirmed'

export const SEVERITIES: Severity[] = ['info', 'low', 'medium', 'high', 'critical']
export const EVENT_STATUSES: EventStatus[] = ['normal', 'suspicious', 'blocked', 'confirmed']

/**
 * Catalogue fermé des types d'événements. Un type inconnu est refusé à
 * l'écriture — ça évite qu'un appelant improvise un type et pollue les
 * filtres du dashboard.
 */
export const SECURITY_EVENT_TYPES = [
  /* Authentification */
  'login_failed',
  'login_failed_burst',
  'login_blocked_lockout',
  'account_disabled_login',
  'password_changed',
  'password_reset_completed',
  'logout',
  /* Sessions / tokens */
  'unauthorized',
  'refresh_rejected',
  'token_reuse_detected',
  /* Contrôle d'accès */
  'permission_denied',
  'tenant_scope_denied',
  'security_center_access_denied',
  /* Abus / volumétrie */
  'rate_limit',
  /* Fichiers */
  'upload_rejected',
  'forbidden_file_type',
  'path_traversal_blocked',
  /* Divers */
  'invalid_input',
  'admin_sensitive_action',
] as const

export type SecurityEventType = typeof SECURITY_EVENT_TYPES[number]

const EVENT_TYPE_SET = new Set<string>(SECURITY_EVENT_TYPES)

export function isSecurityEventType(v: unknown): v is SecurityEventType {
  return typeof v === 'string' && EVENT_TYPE_SET.has(v)
}

/**
 * Classification par défaut.
 *
 * Principe directeur (§3) : une simple erreur n'est JAMAIS étiquetée
 * « tentative de piratage ». Un 401 isolé ou un 403 isolé, c'est du bruit
 * quotidien (token expiré, utilisateur qui clique sur un module interdit).
 * Seule l'accumulation — traitée par les alertes — fait monter le niveau.
 *
 * 'confirmed' n'est utilisé QUE là où la preuve technique est
 * déterministe : la réutilisation d'un refresh token déjà révoqué ne peut
 * pas arriver par accident (rotation atomique côté serveur), et un
 * `../` décodé dans un chemin de fichier n'est pas une faute de frappe.
 */
const DEFAULT_CLASSIFICATION: Record<SecurityEventType, { severity: Severity; status: EventStatus }> = {
  login_failed:                  { severity: 'low',      status: 'normal'     },
  login_failed_burst:            { severity: 'high',     status: 'suspicious' },
  login_blocked_lockout:         { severity: 'high',     status: 'blocked'    },
  account_disabled_login:        { severity: 'medium',   status: 'blocked'    },
  password_changed:              { severity: 'info',     status: 'normal'     },
  password_reset_completed:      { severity: 'medium',   status: 'normal'     },
  logout:                        { severity: 'info',     status: 'normal'     },
  unauthorized:                  { severity: 'low',      status: 'normal'     },
  refresh_rejected:              { severity: 'medium',   status: 'blocked'    },
  token_reuse_detected:          { severity: 'critical', status: 'confirmed'  },
  permission_denied:             { severity: 'medium',   status: 'blocked'    },
  tenant_scope_denied:           { severity: 'high',     status: 'blocked'    },
  security_center_access_denied: { severity: 'high',     status: 'blocked'    },
  rate_limit:                    { severity: 'medium',   status: 'blocked'    },
  upload_rejected:               { severity: 'medium',   status: 'blocked'    },
  forbidden_file_type:           { severity: 'medium',   status: 'blocked'    },
  path_traversal_blocked:        { severity: 'critical', status: 'confirmed'  },
  invalid_input:                 { severity: 'low',      status: 'normal'     },
  admin_sensitive_action:        { severity: 'info',     status: 'normal'     },
}

export function classifyEvent(type: SecurityEventType): { severity: Severity; status: EventStatus } {
  return DEFAULT_CLASSIFICATION[type] ?? { severity: 'info', status: 'normal' }
}

export function severityRank(s: Severity): number {
  return SEVERITIES.indexOf(s)
}

/* ── Normalisation IP ────────────────────────────────────────────── */

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
/* IPv6 : formes complètes et abrégées (::), avec éventuel suffixe IPv4 */
const IPV6_RE = /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:))$/i

/**
 * Normalise une IP pour la colonne INET.
 *  - `::ffff:1.2.3.4` (IPv4 mappée IPv6, forme renvoyée par Node quand le
 *    socket écoute en dual-stack) → `1.2.3.4`
 *  - retire un éventuel `%zone` et un port résiduel `ip:port` (IPv4)
 *  - renvoie null si ce n'est pas une IP valide.
 *
 * Renvoyer null plutôt qu'une valeur bidon est important : une chaîne
 * arbitraire castée en INET fait échouer l'INSERT, ce qui ferait perdre
 * l'événement de sécurité. Ici on préfère un événement sans IP.
 */
export function normalizeIp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let ip = raw.trim()
  if (!ip) return null
  /* IPv4 mappée en IPv6 */
  if (/^::ffff:/i.test(ip)) ip = ip.slice(7)
  /* Zone-id IPv6 (fe80::1%eth0) */
  const pct = ip.indexOf('%')
  if (pct !== -1) ip = ip.slice(0, pct)
  /* ip:port en IPv4 uniquement (un ':' unique et pas d'IPv6) */
  if (ip.includes(':') && ip.split(':').length === 2 && IPV4_RE.test(ip.split(':')[0])) {
    ip = ip.split(':')[0]
  }
  if (IPV4_RE.test(ip)) return ip
  if (IPV6_RE.test(ip)) return ip.toLowerCase()
  return null
}

/* ── Normalisation des chaînes journalisées ──────────────────────── */

export function truncate(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  return v.length > max ? v.slice(0, max) : v
}

/** User-Agent : borné à 300 caractères, caractères de contrôle retirés. */
export function sanitizeUserAgent(ua: unknown): string | null {
  const t = truncate(ua, 300)
  if (!t) return null
  // eslint-disable-next-line no-control-regex
  return t.replace(/[\x00-\x1f\x7f]/g, '')
}

/**
 * Normalise un endpoint pour l'agrégation ET la confidentialité :
 *  - la query string est SUPPRIMÉE (elle peut contenir un token de reset,
 *    une clé widget, un email…) ;
 *  - les identifiants (UUID, entiers longs, hex longs) deviennent `:id`
 *    pour que `/api/prospects/<uuid>` s'agrège en une seule ligne ;
 *  - longueur bornée.
 */
export function normalizeEndpoint(path: unknown): string | null {
  let p = truncate(path, 300)
  if (!p) return null
  const q = p.indexOf('?')
  if (q !== -1) p = p.slice(0, q)
  const h = p.indexOf('#')
  if (h !== -1) p = p.slice(0, h)
  p = p
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
    .replace(/\/\d{4,}(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f]{24,}(?=\/|$)/gi, '/:id')
  return p.length > 120 ? p.slice(0, 120) : p
}

/** Raison normalisée : snake_case, ASCII, bornée. */
export function normalizeReason(reason: unknown): string | null {
  const r = truncate(reason, 80)
  if (!r) return null
  return r
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || null
}

/** Email journalisé : minuscule, borné. Jamais de mot de passe à côté. */
export function normalizeEmail(email: unknown): string | null {
  const e = truncate(email, 160)
  return e ? e.toLowerCase() : null
}

/* ── Sanitisation des métadonnées ────────────────────────────────── */

const MAX_METADATA_CHARS = 2000

/**
 * Dernier rempart avant écriture : on passe par `redact()` (mêmes règles
 * que les logs applicatifs : password, token, authorization, cookie,
 * secret, code, api_key… → [REDACTED], et masquage des chaînes qui
 * ressemblent à un token), puis on borne la taille.
 *
 * Une valeur non sérialisable ou trop grosse est remplacée par un
 * marqueur : mieux vaut un événement pauvre qu'un événement perdu.
 */
export function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  let safe: unknown
  try {
    safe = redact(input)
  } catch {
    return { sanitize_error: true }
  }
  let json: string
  try {
    json = JSON.stringify(safe)
  } catch {
    return { serialize_error: true }
  }
  if (json.length > MAX_METADATA_CHARS) {
    return { truncated: true, size: json.length }
  }
  return (safe ?? {}) as Record<string, unknown>
}

/**
 * Garde-fou indépendant, utilisé par les tests : détecte la présence
 * d'un secret en clair dans un objet destiné à la base.
 * Sert de filet si un appelant contourne sanitizeMetadata.
 */
const SECRET_HINT_RE = /(password|passwd|secret|bearer\s|authorization|refresh_token|access_token|eyJ[A-Za-z0-9_-]{10,})/i

export function containsSecretLike(value: unknown, depth = 0): boolean {
  if (depth > 6 || value == null) return false
  if (typeof value === 'string') return SECRET_HINT_RE.test(value)
  if (Array.isArray(value)) return value.some(v => containsSecretLike(v, depth + 1))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) => SECRET_HINT_RE.test(k) || containsSecretLike(v, depth + 1)
    )
  }
  return false
}

/* ── Présence ────────────────────────────────────────────────────── */

export type PresenceState = 'online' | 'idle' | 'offline'

/** Un onglet actif envoie un heartbeat toutes les 60 s. */
export const PRESENCE_ONLINE_SECONDS = 120        // 2 heartbeats manqués → idle
export const PRESENCE_IDLE_SECONDS   = 15 * 60    // au-delà → hors ligne
/** Plafond de sessions simultanées conservées par utilisateur. */
export const PRESENCE_MAX_SESSIONS_PER_USER = 20

/**
 * État de présence dérivé du dernier heartbeat. C'est ce calcul — et non
 * « le JWT est encore valide » — qui répond à « qui est connecté ? ».
 */
export function presenceState(lastSeenAt: Date | string, now: Date = new Date()): PresenceState {
  const seen = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt)
  const ms = now.getTime() - seen.getTime()
  if (Number.isNaN(ms)) return 'offline'
  const seconds = ms / 1000
  if (seconds <= PRESENCE_ONLINE_SECONDS) return 'online'
  if (seconds <= PRESENCE_IDLE_SECONDS)   return 'idle'
  return 'offline'
}

/** Clé de session : 32 hex générés côté client, sans aucun privilège. */
export function isValidSessionKey(key: unknown): key is string {
  return typeof key === 'string' && /^[0-9a-f]{32}$/i.test(key)
}

/* ── Alertes : déduplication + cooldown ──────────────────────────── */

/**
 * Clé de déduplication. Deux occurrences du même motif sur la même cible
 * partagent la clé → une seule alerte ouverte, avec un compteur.
 * On ne met QUE des valeurs déjà normalisées (jamais d'UA brut).
 */
export function alertKey(parts: {
  tenantId?: string | null
  type: string
  ip?: string | null
  userId?: string | null
  email?: string | null
}): string {
  return [
    parts.tenantId ?? 'global',
    parts.type,
    parts.ip ?? '-',
    parts.userId ?? '-',
    parts.email ? parts.email.toLowerCase() : '-',
  ].join('|')
}

/** Cooldown par sévérité — plus c'est grave, plus on re-notifie vite. */
export function cooldownMinutes(severity: Severity): number {
  switch (severity) {
    case 'critical': return 5
    case 'high':     return 15
    case 'medium':   return 60
    default:         return 180
  }
}

/**
 * Décide si une alerte doit (re)notifier. Une alerte déjà ouverte dont le
 * cooldown court n'entraîne AUCUNE nouvelle notification — on se contente
 * d'incrémenter le compteur d'occurrences (§6 : éviter le flood).
 */
export function shouldNotify(
  existing: { cooldown_until: string | Date | null } | null,
  now: Date = new Date(),
): boolean {
  if (!existing) return true
  if (!existing.cooldown_until) return true
  const until = existing.cooldown_until instanceof Date
    ? existing.cooldown_until
    : new Date(existing.cooldown_until)
  if (Number.isNaN(until.getTime())) return true
  return now.getTime() >= until.getTime()
}

/* ── Seuils de détection ─────────────────────────────────────────── */

/**
 * Seuils volontairement conservateurs : au-dessous, on journalise sans
 * qualifier. Le verrouillage applicatif du login se déclenche déjà à 10
 * échecs / 15 min (routes/auth.ts) — on aligne la détection dessus pour ne
 * pas crier avant que le système ne bloque.
 */
export const THRESHOLDS = {
  /** Échecs de connexion sur une même IP avant « brute-force probable ». */
  loginFailuresPerIp:    10,
  /** Échecs sur un même compte (toutes IP) avant alerte ciblée. */
  loginFailuresPerEmail: 8,
  /** Fenêtre d'observation, en minutes. */
  windowMinutes:         15,
  /** Refus d'accès (403) répétés avant alerte « exploration ». */
  deniedAccessPerUser:   15,
  /** Déclenchements de rate-limit avant alerte. */
  rateLimitPerIp:        5,
} as const

/* ── Filtres / pagination des routes de lecture ──────────────────── */

export const MAX_PAGE_SIZE = 200

export function clampLimit(raw: unknown, fallback = 50): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), MAX_PAGE_SIZE)
}

export function clampOffset(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  /* Borne haute : évite un OFFSET 10^9 qui ferait ramer Postgres */
  return Math.min(Math.floor(n), 100_000)
}

export type Period = 'today' | '24h' | '7d' | '30d'

/** Fenêtre de filtrage → heures. Toute valeur inconnue retombe sur 24h. */
export function periodToHours(period: unknown): number {
  switch (period) {
    case 'today':
    case '24h': return 24
    case '7d':  return 24 * 7
    case '30d': return 24 * 30
    default:    return 24
  }
}
