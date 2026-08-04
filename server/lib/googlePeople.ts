/**
 *  Client Google People API (Contacts) — sans SDK, uniquement `fetch`.
 *
 *  Le refresh_token de l'utilisateur (obtenu via OAuth) permet d'obtenir un
 *  access_token court, puis de créer/mettre à jour/supprimer SES contacts.
 *  Aucun secret n'est loggé.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
]

const TOKEN_URL   = 'https://oauth2.googleapis.com/token'
const REVOKE_URL  = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const PEOPLE_BASE = 'https://people.googleapis.com/v1'
const READ_MASK   = 'names,phoneNumbers'
const UPDATE_MASK = 'names,phoneNumbers,organizations,biographies,memberships'

/** Erreur d'auth Google : le refresh_token est révoqué/expiré → re-consentement requis. */
export class GoogleAuthError extends Error {
  constructor(msg = 'google_auth') { super(msg); this.name = 'GoogleAuthError' }
}

export interface GPerson {
  etag?: string
  names?: { givenName?: string; familyName?: string; unstructuredName?: string }[]
  phoneNumbers?: { value: string; type?: string }[]
  organizations?: { name?: string; title?: string }[]
  biographies?: { value: string; contentType?: string }[]
  memberships?: { contactGroupMembership: { contactGroupResourceName: string } }[]
}

export interface PeopleRef { resourceName: string; etag: string }

/** Interface consommée par le moteur de sync — permet un faux client en test. */
export interface PeopleClient {
  batchCreate(persons: GPerson[]): Promise<PeopleRef[]>
  batchUpdate(items: { resourceName: string; person: GPerson }[]): Promise<PeopleRef[]>
  batchDelete(resourceNames: string[]): Promise<void>
}

function oauthCfg() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID || ''
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
  return { clientId, clientSecret }
}

export function googleConfigured(): boolean {
  const { clientId, clientSecret } = oauthCfg()
  return !!clientId && !!clientSecret && !!redirectUri()
}

export function redirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || ''
}

/** URL de consentement Google (ouverte dans une popup côté frontend). */
export function buildConsentUrl(state: string): string {
  const { clientId } = oauthCfg()
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',          // → refresh_token
    prompt: 'consent',               // force un refresh_token même si déjà consenti
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

interface GErrorBody { error?: { message?: string } | string; error_description?: string }

// Timeout par appel HTTP Google : sans lui, une connexion suspendue bloquerait
// le sync (et donc le scheduler qui enchaîne les liens) indéfiniment.
const HTTP_TIMEOUT_MS = Number(process.env.GOOGLE_HTTP_TIMEOUT_MS) || 20_000

async function fetchJson<T = unknown>(url: string, init: RequestInit, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let r: Response
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
    try {
      r = await fetch(url, { ...init, signal: ctrl.signal })
    } catch (e) {
      clearTimeout(timer)
      if (attempt < retries) { await sleep(400 * (attempt + 1)); continue }
      throw e
    }
    clearTimeout(timer)
    if (r.status === 401) throw new GoogleAuthError('unauthorized')
    if ((r.status === 429 || r.status >= 500) && attempt < retries) {
      await sleep(500 * (attempt + 1)); continue
    }
    const text = await r.text()
    const data: unknown = text ? safeJson(text) : {}
    if (!r.ok) {
      const er = (data ?? {}) as GErrorBody
      const errStr = typeof er.error === 'string' ? er.error : (er.error?.message ?? '')
      const msg = errStr || er.error_description || `http_${r.status}`
      if (r.status === 400 && /invalid_grant/i.test(errStr)) throw new GoogleAuthError('invalid_grant')
      throw new Error(`google:${r.status}:${msg}`)
    }
    return data as T
  }
}
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
const safeJson = (t: string): unknown => { try { return JSON.parse(t) } catch { return {} } }

/** Échange le code OAuth contre { access_token, refresh_token, scope }. */
export async function exchangeCode(code: string): Promise<{ access_token: string; refresh_token?: string; scope?: string }> {
  const { clientId, clientSecret } = oauthCfg()
  const body = new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri(), grant_type: 'authorization_code',
  })
  return fetchJson<{ access_token: string; refresh_token?: string; scope?: string }>(
    TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
}

/** access_token frais à partir du refresh_token. Jette GoogleAuthError si révoqué. */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = oauthCfg()
  const body = new URLSearchParams({
    refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret,
    grant_type: 'refresh_token',
  })
  const data = await fetchJson<{ access_token?: string }>(
    TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!data.access_token) throw new GoogleAuthError('no_access_token')
  return data.access_token
}

export async function getUserEmail(accessToken: string): Promise<string | null> {
  try {
    const data = await fetchJson<{ email?: string }>(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    return data.email ?? null
  } catch { return null }
}

/** Récupère (ou crée) le groupe de contacts qui isole les prospects CRM. */
export async function ensureContactGroup(accessToken: string, name: string): Promise<string> {
  const H = { Authorization: `Bearer ${accessToken}` }
  const list = await fetchJson<{ contactGroups?: { resourceName?: string; name?: string; formattedName?: string }[] }>(
    `${PEOPLE_BASE}/contactGroups?pageSize=200`, { headers: H })
  const found = (list.contactGroups || []).find(g => g?.formattedName === name || g?.name === name)
  if (found?.resourceName) return found.resourceName
  const created = await fetchJson<{ resourceName?: string }>(`${PEOPLE_BASE}/contactGroups`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactGroup: { name } }),
  })
  return created.resourceName ?? ''
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    })
  } catch { /* best effort */ }
}

/** Client People concret lié à un access_token. */
export function makePeopleClient(accessToken: string): PeopleClient {
  const H = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  return {
    async batchCreate(persons) {
      if (!persons.length) return []
      const data = await fetchJson<{ createdPeople?: { person?: { resourceName?: string; etag?: string } }[] }>(
        `${PEOPLE_BASE}/people:batchCreateContacts`, {
          method: 'POST', headers: H,
          body: JSON.stringify({ contacts: persons.map(p => ({ contactPerson: p })), readMask: READ_MASK }),
        })
      return (data.createdPeople || [])
        .map(c => ({ resourceName: c?.person?.resourceName ?? '', etag: c?.person?.etag ?? '' }))
        .filter(r => r.resourceName)
    },
    async batchUpdate(items) {
      if (!items.length) return []
      const contacts: Record<string, GPerson> = {}
      for (const it of items) contacts[it.resourceName] = it.person
      const data = await fetchJson<{ updateResult?: Record<string, { person?: { resourceName?: string; etag?: string } }> }>(
        `${PEOPLE_BASE}/people:batchUpdateContacts`, {
          method: 'POST', headers: H,
          body: JSON.stringify({ contacts, updateMask: UPDATE_MASK, readMask: READ_MASK }),
        })
      const out: PeopleRef[] = []
      const results = data.updateResult || {}
      for (const key of Object.keys(results)) {
        const p = results[key]?.person
        if (p?.resourceName) out.push({ resourceName: p.resourceName, etag: p.etag ?? '' })
      }
      return out
    },
    async batchDelete(resourceNames) {
      if (!resourceNames.length) return
      await fetchJson(`${PEOPLE_BASE}/people:batchDeleteContacts`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ resourceNames }),
      })
    },
  }
}
