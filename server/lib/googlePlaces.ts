/**
 * Google Places API (New) — Text Search wrapper.
 *
 * Doc : https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * Coût par requête (2026) : ~$0.017 avec un fieldMask minimal.
 * On demande UNIQUEMENT les champs stockés dans outbound_prospects
 * pour ne pas payer pour du surplus.
 *
 * Requires env : GOOGLE_PLACES_API_KEY
 */

export interface GooglePlace {
  place_id:    string
  name:        string
  phone:       string | null
  /** WhatsApp = phone si mobile marocain (06/07), sinon null */
  whatsapp:    string | null
  /** Email principal extrait du site web (ou null si scraping échoue) */
  email:       string | null
  /** Emails secondaires trouvés sur le site */
  emails_extra: string[]
  website:     string | null
  address:     string | null
  city:        string | null
  country:     string | null
  category:    string | null
  rating:      number | null
  google_maps_url: string | null
}

interface RawPlace {
  id:                       string
  displayName?:             { text?: string }
  formattedAddress?:        string
  internationalPhoneNumber?: string
  websiteUri?:              string
  primaryType?:             string
  rating?:                  number
  googleMapsUri?:           string
  addressComponents?:       Array<{ types?: string[]; longText?: string }>
}

export function isConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY
}

/**
 * Recherche full-text Google Places.
 *   query : "boulangerie Oujda", "restaurants Casablanca centre-ville", etc.
 *   limit : 1-20 (max Google)
 */
export async function searchPlaces(query: string, limit = 10): Promise<GooglePlace[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY manquant')
  if (!query.trim()) return []

  const url = 'https://places.googleapis.com/v1/places:searchText'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Goog-Api-Key':    key,
      /* Sans FieldMask → réponse gigantesque + facture "Enterprise". Avec → ~$0.017. */
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,' +
        'places.websiteUri,places.primaryType,places.rating,places.googleMapsUri,places.addressComponents',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      textQuery:        query.trim(),
      maxResultCount:   Math.min(Math.max(1, limit), 20),
      languageCode:     'fr',
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Google Places ${res.status}: ${detail.slice(0, 200)}`)
  }

  const data = await res.json() as { places?: RawPlace[] }
  const raw = data.places ?? []
  const basic = raw.map(normalizePlace)

  /* Enrichissement email/whatsapp en parallèle (max 5 concurrents pour éviter
     de saturer le réseau — un rush de 20 scrapings simultanés = timeouts). */
  const enriched: GooglePlace[] = []
  const CONCURRENCY = 5
  for (let i = 0; i < basic.length; i += CONCURRENCY) {
    const batch = basic.slice(i, i + CONCURRENCY)
    const done  = await Promise.all(batch.map(enrichPlaceContact))
    enriched.push(...done)
  }
  return enriched
}

function normalizePlace(p: RawPlace): GooglePlace {
  const city    = pickComponent(p.addressComponents, 'locality')
              ?? pickComponent(p.addressComponents, 'administrative_area_level_2')
  const country = pickComponent(p.addressComponents, 'country')

  const phone = p.internationalPhoneNumber ?? null

  return {
    place_id: p.id,
    name:     p.displayName?.text ?? 'Sans nom',
    phone,
    whatsapp: isMoroccanMobile(phone) ? phone : null,
    email:    null,        /* rempli plus tard via scraping */
    emails_extra: [],
    website:  p.websiteUri ?? null,
    address:  p.formattedAddress ?? null,
    city,
    country,
    category: p.primaryType ?? null,
    rating:   typeof p.rating === 'number' ? p.rating : null,
    google_maps_url: p.googleMapsUri ?? null,
  }
}

function pickComponent(components: RawPlace['addressComponents'], type: string): string | null {
  if (!components) return null
  const found = components.find(c => c.types?.includes(type))
  return found?.longText ?? null
}

/* ─────────────────────────────────────────────────────────────────
   Détection numéro mobile marocain
   Format international : +212 6X XX XX XX XX ou +212 7X XX XX XX XX
   Format national      : 06XXXXXXXX ou 07XXXXXXXX
   Les fixes commencent par +212 5 ou 05 → PAS WhatsApp.
───────────────────────────────────────────────────────────────── */
export function isMoroccanMobile(phone: string | null): boolean {
  if (!phone) return false
  const digits = phone.replace(/[^\d]/g, '')
  /* +212 6 → "2126..." */
  if (digits.startsWith('2126') || digits.startsWith('2127')) return true
  /* 06XXX / 07XXX */
  if (/^0[67]\d{8}$/.test(digits)) return true
  return false
}

/* ─────────────────────────────────────────────────────────────────
   Extraction d'emails depuis un site web
   - fetch homepage (5s timeout)
   - si /contact ou /contactez-nous existe → fetch aussi
   - regex email + filtrage (pas de wixpress, cdn, sentry, etc.)
───────────────────────────────────────────────────────────────── */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

const EMAIL_BLACKLIST_DOMAINS = [
  'wixpress.com', 'sentry.io', 'sentry-next.wixpress.com',
  'godaddy.com', 'domain.com', 'example.com', 'noreply.com',
  'wordpress.com', 'automattic.com', 'gravatar.com',
  'cdn', 'analytics', 'googletagmanager', 'facebook.com',
  'sentry.wixpress.com',
]

const EMAIL_BLACKLIST_LOCAL = ['noreply', 'no-reply', 'donotreply', 'do-not-reply']

function isRealEmail(email: string): boolean {
  const lower = email.toLowerCase()
  const [local, domain] = lower.split('@')
  if (!local || !domain) return false
  if (EMAIL_BLACKLIST_LOCAL.some(b => local.startsWith(b))) return false
  if (EMAIL_BLACKLIST_DOMAINS.some(b => domain.includes(b))) return false
  /* Filtre email techniques type "abc123.jpg@..." (souvent des images inline) */
  if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|css|js)$/i.test(local)) return false
  return true
}

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        /* User-Agent d'un vrai navigateur — certains sites bloquent les bots */
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html') && !ct.includes('text')) return null
    const text = await res.text()
    /* Limite à 500 KB — les mega pages (SPA) contiennent rarement l'email en clair */
    return text.slice(0, 500_000)
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function extractEmailsFromHtml(html: string): string[] {
  const found = new Set<string>()
  /* 1. Recherche brute */
  const matches = html.match(EMAIL_RE) ?? []
  for (const m of matches) {
    if (isRealEmail(m)) found.add(m.toLowerCase())
  }
  /* 2. mailto: (souvent plus fiable, moins de bruit) */
  const mailtoRe = /mailto:([^"'<>\s?]+)/gi
  let mm: RegExpExecArray | null
  while ((mm = mailtoRe.exec(html)) !== null) {
    const e = mm[1].toLowerCase()
    if (isRealEmail(e)) found.add(e)
  }
  return [...found]
}

export async function extractEmailsFromWebsite(website: string | null): Promise<string[]> {
  if (!website) return []
  let base: URL
  try {
    base = new URL(website.startsWith('http') ? website : `https://${website}`)
  } catch { return [] }

  /* Pages candidates — dans l'ordre de probabilité */
  const paths = ['', '/contact', '/contactez-nous', '/contact-us', '/nous-contacter', '/about']
  const found = new Set<string>()
  for (const p of paths) {
    const url = new URL(p, base.origin).href
    const html = await fetchWithTimeout(url, 4000)
    if (!html) continue
    for (const e of extractEmailsFromHtml(html)) found.add(e)
    /* On s'arrête dès qu'on a 3 emails — inutile de scraper plus */
    if (found.size >= 3) break
  }
  return [...found]
}

async function enrichPlaceContact(p: GooglePlace): Promise<GooglePlace> {
  if (!p.website) return p
  const emails = await extractEmailsFromWebsite(p.website)
  if (!emails.length) return p
  /* Priorité : email au domaine du site > gmail/yahoo/... */
  let host = ''
  try { host = new URL(p.website).hostname.replace(/^www\./, '') } catch {}
  const domainMatch = emails.find(e => host && e.endsWith('@' + host))
  const email = domainMatch ?? emails[0]
  return {
    ...p,
    email,
    emails_extra: emails.filter(e => e !== email),
  }
}
