/**
 * Vérification email (format + DNS MX) et téléphone (format E.164 souple).
 * Zéro dépendance externe payante — MVP.
 *
 * Phase 2 : brancher ZeroBounce / NeverBounce pour détecter les
 * boîtes catch-all, spam-trap, disposable, etc.
 */
import { promises as dns } from 'dns'

export type EmailVerification = {
  status: 'valid' | 'invalid' | 'risky' | 'unknown'
  reason: string
}

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','yopmail.com','tempmail.com','10minutemail.com',
  'guerrillamail.com','throwaway.email','trashmail.com','fakemail.net',
])
/* Domaines grand-public — email pro attendu en B2B → "risky" (correct mais moins qualifié). */
const FREE_DOMAINS = new Set([
  'gmail.com','yahoo.com','yahoo.fr','hotmail.com','hotmail.fr','outlook.com','outlook.fr',
  'live.com','live.fr','msn.com','free.fr','orange.fr','sfr.fr','laposte.net',
])

export async function verifyEmail(email: string | null): Promise<EmailVerification> {
  if (!email?.trim()) return { status: 'unknown', reason: 'Email vide' }
  const clean = email.trim().toLowerCase()

  const match = clean.match(EMAIL_RE)
  if (!match) return { status: 'invalid', reason: 'Format invalide' }

  const domain = match[1]
  if (DISPOSABLE_DOMAINS.has(domain)) return { status: 'invalid', reason: 'Domaine jetable' }

  /* Résolution MX — timeout court, si le DNS traîne on ne bloque pas la requête. */
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 3000)
    if (!mx?.length) return { status: 'invalid', reason: 'Aucun MX record' }
  } catch (e: any) {
    /* NOTFOUND, NODATA → invalide. ETIMEOUT → unknown. */
    const code = e?.code ?? ''
    if (['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(code)) {
      return { status: 'invalid', reason: `DNS: ${code}` }
    }
    return { status: 'unknown', reason: `DNS timeout: ${code || 'error'}` }
  }

  if (FREE_DOMAINS.has(domain)) {
    return { status: 'risky', reason: 'Domaine grand public (non pro)' }
  }
  return { status: 'valid', reason: 'MX résolu, domaine pro' }
}

/* Marocain / international — accepte +212, 06/07 (MA local), +33, etc.
   Ne fait PAS d'appel HLR (Twilio Lookup en Phase 2 si besoin). */
export function verifyPhoneFormat(phone: string | null): { valid: boolean; e164: string | null } {
  if (!phone?.trim()) return { valid: false, e164: null }
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return { valid: false, e164: null }

  /* MA : 0X XX XX XX XX → +212 X XX XX XX XX */
  if (digits.length === 10 && digits.startsWith('0')) {
    return { valid: true, e164: '212' + digits.slice(1) }
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return { valid: true, e164: digits }
  }
  return { valid: false, e164: null }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms)),
  ])
}
