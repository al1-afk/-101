/* ─────────────────────────────────────────────────────────────────
   NEXT GITAL API Client — remplace Supabase
   Toutes les requêtes sont envoyées à Express + PostgreSQL
───────────────────────────────────────────────────────────────── */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

/* ── Token storage ───────────────────────────────────────────── */
export const tokenStore = {
  get:    ()        => localStorage.getItem('gestiq_token') ?? '',
  set:    (t: string) => localStorage.setItem('gestiq_token', t),
  clear:  ()        => localStorage.removeItem('gestiq_token'),
}

/* Distinct slot for team_member JWT (separate session on same browser) */
export const memberTokenStore = {
  get:    ()        => localStorage.getItem('gestiq_member_token') ?? '',
  set:    (t: string) => localStorage.setItem('gestiq_member_token', t),
  clear:  ()        => localStorage.removeItem('gestiq_member_token'),
}

/* ── Token refresh (singleton promise — prevents parallel refreshes)
   Distinction critique entre :
     - AUTH_INVALID  → refresh token vraiment révoqué/expiré → logout légitime
     - TRANSIENT     → network, 5xx, timeout, JSON invalide → NE PAS déconnecter
   Historique : avant, toute erreur (network incluse) déclenchait purgeClientSession()
   ce qui provoquait des déconnexions injustifiées à chaque hoquet réseau. */
export class AuthInvalidError extends Error {
  code: string
  constructor(code = 'AUTH_INVALID') { super(code); this.code = code }
}
export class TransientRefreshError extends Error {
  constructor(msg = 'transient') { super(msg) }
}

let _refreshPromise: Promise<string> | null = null
let _memberRefreshPromise: Promise<string> | null = null

/* Refresh dédié aux team_members : mêmes règles transient/AUTH_INVALID
   que côté admin, mais via /api/team/auth/refresh et memberTokenStore. */
async function refreshMemberToken(): Promise<string> {
  if (_memberRefreshPromise) return _memberRefreshPromise
  _memberRefreshPromise = (async () => {
    let res: Response
    try {
      res = await fetch(`${BASE_URL}/api/team/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (netErr: any) {
      throw new TransientRefreshError(netErr?.message ?? 'network')
    }
    if (res.status >= 500) throw new TransientRefreshError(`http_${res.status}`)
    if (res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}))
      throw new AuthInvalidError(data?.code ?? 'AUTH_INVALID')
    }
    if (!res.ok) throw new TransientRefreshError(`http_${res.status}`)
    const data = await res.json().catch(() => null as any)
    if (!data?.token) throw new TransientRefreshError('empty_response')
    memberTokenStore.set(data.token)
    return data.token as string
  })().finally(() => { _memberRefreshPromise = null })
  return _memberRefreshPromise
}

async function refreshAccessToken(): Promise<string> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    let res: Response
    try {
      res = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (netErr: any) {
      /* Erreur réseau (offline, DNS, CORS avant réponse) → transient */
      throw new TransientRefreshError(netErr?.message ?? 'network')
    }
    /* 5xx = serveur en rade → transient, on ne déconnecte pas */
    if (res.status >= 500) throw new TransientRefreshError(`http_${res.status}`)
    /* 401/403 avec code auth = refresh vraiment invalide → logout légitime */
    if (res.status === 401 || res.status === 403) {
      const data = await res.json().catch(() => ({}))
      throw new AuthInvalidError(data?.code ?? 'AUTH_INVALID')
    }
    /* Autres statuts non-OK : on considère transient (safer default) */
    if (!res.ok) throw new TransientRefreshError(`http_${res.status}`)

    const data = await res.json().catch(() => null as any)
    if (!data?.token) throw new TransientRefreshError('empty_response')
    tokenStore.set(data.token)
    return data.token as string
  })().finally(() => { _refreshPromise = null })
  return _refreshPromise
}

/* ── Base fetch ──────────────────────────────────────────────── */
type TokenSource = 'admin' | 'member' | 'none'

async function request<T>(
  method:  string,
  path:    string,
  body?:   unknown,
  auth:    boolean | TokenSource = true,
  _retry   = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const source: TokenSource =
    auth === true ? 'admin'
    : auth === false ? 'none'
    : auth
  if (source === 'admin')  headers['Authorization'] = `Bearer ${tokenStore.get()}`
  if (source === 'member') headers['Authorization'] = `Bearer ${memberTokenStore.get()}`

  /* Fetch avec capture explicite des erreurs réseau — jamais de logout ici */
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (netErr: any) {
    /* Erreur réseau (offline, timeout, DNS) → on lance une erreur claire
       SANS toucher à la session. L'utilisateur reste connecté. */
    throw new Error('Erreur réseau — vérifiez votre connexion')
  }

  /* Auto-refresh on 401 (member-side) — logique miroir de l'admin.
     Sans ce refresh, un employé était déconnecté dès l'expiration du
     access token (bug rapporté : "il me connecte puis me vire vite"). */
  if (res.status === 401 && source === 'member' && _retry) {
    const data = await res.json().catch(() => ({}))
    if (data.code === 'TOKEN_REUSE' || data.code === 'NO_REFRESH' || data.code === 'INVALID_REFRESH') {
      memberTokenStore.clear()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/team-login')) {
        window.location.href = '/team-login'
      }
      throw new Error(data.error ?? 'Session expirée')
    }
    try {
      await refreshMemberToken()
      return request<T>(method, path, body, auth, false)
    } catch (err: any) {
      if (err instanceof AuthInvalidError) {
        memberTokenStore.clear()
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/team-login')) {
          window.location.href = '/team-login'
        }
        throw new Error('Session expirée')
      }
      throw new Error('Serveur temporairement indisponible')
    }
  }

  /* Auto-refresh on 401 (admin-side) — tente un refresh silencieux
     sur TOUT 401 (avec ou sans code), pour couvrir aussi les tokens
     corrompus/mal signés/expirés côté client sans code explicite. */
  if (res.status === 401 && source === 'admin' && _retry) {
    const data = await res.json().catch(() => ({}))

    /* Codes explicites d'auth invalide → purge légitime, pas de retry.

       SESSION_REVOKED en fait partie : un administrateur vient de couper
       cette session depuis le Centre de sécurité. Sans ce code ici, le
       client tombait dans la branche « refresh + retry » ci-dessous ;
       le serveur ne trouvait alors aucune ligne non révoquée, en
       concluait à un REJEU de jeton, révoquait TOUTES les sessions de la
       personne et levait une alerte critique de session compromise.
       Couper un appareil déconnectait donc les autres, en criant au vol. */
    if (data.code === 'TOKEN_REUSE' || data.code === 'NO_REFRESH'
     || data.code === 'INVALID_REFRESH' || data.code === 'SESSION_REVOKED') {
      const { purgeClientSession } = await import('./session')
      await purgeClientSession()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth'
      }
      throw new Error(data.error ?? 'Session expirée')
    }

    /* Tout autre 401 (TOKEN_EXPIRED, token corrompu, sans code) → refresh + retry.
       Si le refresh échoue avec AUTH_INVALID → logout. Si transient → on
       propage l'erreur SANS déconnecter. */
    try {
      await refreshAccessToken()
      return request<T>(method, path, body, auth, false)
    } catch (err: any) {
      if (err instanceof AuthInvalidError) {
        const { purgeClientSession } = await import('./session')
        await purgeClientSession()
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
          window.location.href = '/auth'
        }
        throw new Error('Session expirée')
      }
      /* Transient : NE PAS déconnecter. On propage. */
      throw new Error('Serveur temporairement indisponible')
    }
  }

  /* 5xx server error : on ne touche PAS à la session, juste on remonte l'erreur */
  if (res.status >= 500) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `Serveur temporairement indisponible (${res.status})`)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as T
}

/* ── Shorthand helpers ───────────────────────────────────────── */
export const api = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown)   => request<T>('POST',   path, body),
  patch:  <T>(path: string, body: unknown)   => request<T>('PATCH',  path, body),
  put:    <T>(path: string, body: unknown)   => request<T>('PUT',    path, body),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
  publicGet: <T>(path: string)               => request<T>('GET',    path, undefined, false),
  publicPost:<T>(path: string, body: unknown)=> request<T>('POST',   path, body, false),
}

/* Same helpers but authenticated with the member token slot */
export const memberApi = {
  get:    <T>(path: string)                  => request<T>('GET',    path, undefined, 'member'),
  post:   <T>(path: string, body: unknown)   => request<T>('POST',   path, body, 'member'),
  patch:  <T>(path: string, body: unknown)   => request<T>('PATCH',  path, body, 'member'),
  put:    <T>(path: string, body: unknown)   => request<T>('PUT',    path, body, 'member'),
  delete: <T>(path: string)                  => request<T>('DELETE', path, undefined, 'member'),
}

/* ── Auth API ────────────────────────────────────────────────── */
/* Réponse possible de /login :
   - trusted device valide → { token, tenantSlug, tenantId, role, trustedDevice: true }
   - 2FA requis            → { needsVerification: true, challengeId, method, email }
*/
export type LoginResult =
  | { token: string; tenantSlug: string; tenantId: string; role: string; trustedDevice?: boolean }
  | { needsVerification: true; challengeId: string; method: 'email' | 'admin_manual' | 'admin_approval'; email: string }

export const authApi = {
  login: (email: string, password: string, tenantSlug?: string) =>
    api.publicPost<LoginResult>('/api/auth/login', { email, password, tenantSlug }),

  /* Verify : code obligatoire pour email + admin_manual, ignoré pour admin_approval.
     Serveur pose un cookie httpOnly "gestiq_device" pour skipper le 2FA la prochaine fois. */
  verifyLogin: (params: { email?: string; challengeId?: string; code?: string; tenantSlug?: string; rememberDevice?: boolean }) =>
    api.publicPost<
      | { token: string; tenantSlug: string; tenantId: string; role: string }
      | { waitingForApproval: true; message: string; status: string }
    >('/api/auth/verify-login', params),

  /* Polling utilisé en mode admin_approval : renvoie {status, method}. */
  twoFactorStatus: (challengeId: string) =>
    api.publicGet<{ status: 'pending' | 'approved' | 'rejected' | 'consumed' | 'expired'; method: string; expiresAt: string }>(
      `/api/auth/2fa/status?challengeId=${encodeURIComponent(challengeId)}`
    ),

  resendLoginCode: (email: string) =>
    api.publicPost<{ success: boolean; adminMode?: boolean }>('/api/auth/resend-login-code', { email }),

  register: (data: { email: string; password: string; name: string; tenantSlug: string; tenantName: string }) =>
    api.publicPost<{ token: string; tenantSlug: string; tenantId: string }>(
      '/api/auth/register', data
    ),

  me: () => api.get<{
    id: string; email: string; name: string; role: string;
    slug: string; tenant_name: string; plan: string;
    allowed_modules: string[] | null;
  }>('/api/auth/me'),

  forgotPassword: (email: string) =>
    api.publicPost<{ success: boolean }>('/api/auth/forgot-password', { email }),

  resetPassword: (email: string, code: string, newPassword: string) =>
    api.publicPost<{ success: boolean }>('/api/auth/reset-password', { email, code, newPassword }),

  /* Best-effort server-side logout: revokes refresh token + clears cookie */
  /* La sessionKey de présence part avec la déconnexion : le serveur
     retire immédiatement l'utilisateur du « qui est en ligne » au lieu
     d'attendre l'expiration du heartbeat. */
  logout: (sessionKey?: string) =>
    api.post<{ success: boolean }>('/api/auth/logout', { sessionKey })
       .catch(() => ({ success: false })),
}

/* ── Admin 2FA API ──────────────────────────────────────────── */
export type Pending2FA = {
  id: string; email: string; method: 'email' | 'admin_manual' | 'admin_approval'
  status: string; ip_address: string; user_agent: string
  created_at: string; expires_at: string; has_code: boolean
  user_id: string; user_name: string
}
export type LoginHistoryRow = {
  id: string; email: string; method: string; event: string; success: boolean
  ip_address: string; user_agent: string; created_at: string
  metadata: Record<string, any>; user_name: string | null
}
export type AdminUser = {
  id: string; email: string; name: string; role: string
  twofa_mode: 'email' | 'admin_manual' | 'admin_approval'
  is_active: boolean; trusted_devices_count: number
}

export const admin2faApi = {
  pending:   () => api.get<Pending2FA[]>('/api/admin/2fa/pending'),
  history:   (limit = 100) => api.get<LoginHistoryRow[]>(`/api/admin/2fa/history?limit=${limit}`),
  approve:   (id: string) => api.post<{ success: true; method: string }>(`/api/admin/2fa/${id}/approve`, {}),
  reject:    (id: string) => api.post<{ success: true }>(`/api/admin/2fa/${id}/reject`, {}),
  generateCode: (id: string) => api.post<{ code: string; expiresInMinutes: number }>(`/api/admin/2fa/${id}/generate-code`, {}),
  users:     () => api.get<AdminUser[]>('/api/admin/2fa/users'),
  setMode:   (userId: string, mode: 'email' | 'admin_manual' | 'admin_approval') =>
    api.patch<{ success: true; mode: string }>(`/api/admin/2fa/users/${userId}/twofa-mode`, { mode }),
  revokeAllDevices: (userId: string) =>
    api.delete<{ success: true; revoked: number }>(`/api/admin/2fa/users/${userId}/devices`),
}

/* ═══════════════════════════════════════════════════════════════
   CENTRE DE SÉCURITÉ (Administration → Centre de sécurité)

   Rappel : ce client n'est qu'une commodité. Le contrôle d'accès réel
   est fait par le backend (requireSecurityMonitoring) — masquer le
   menu côté React ne protège rien.
   ═══════════════════════════════════════════════════════════════ */

export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type SecurityStatus   = 'normal' | 'suspicious' | 'blocked' | 'confirmed'
export type PresenceState    = 'online' | 'idle' | 'offline'

export interface OnlineUser {
  user_id:       string
  name:          string
  email:         string
  role:          string
  login_at:      string
  last_seen_at:  string
  sessions:      number
  ip_address:    string | null
  user_agent:    string | null
  active_tokens: number
  state:         PresenceState
}

export interface SecurityOverview {
  periodHours: number
  cards: {
    online_users:  number
    failed_logins: number
    suspicious:    number
    blocked:       number
    severe:        number
    open_alerts:   number
  }
  loginSeries: Array<{ bucket: string; success: number; failed: number }>
  eventSeries: Array<{ bucket: string; total: number; severe: number }>
  topIps:      Array<{ ip_address: string; events: number; severe: number; last_seen: string }>
  topEvents:   Array<{ event_type: string; count: number }>
  proxy:       { hops: number; resolvedIp: string | null; forwardedDepth: number; expressTrustProxy: unknown }
}

export interface SecurityEventRow {
  id:          string
  created_at:  string
  event_type:  string
  severity:    SecuritySeverity
  status:      SecurityStatus
  ip_address:  string | null
  user_agent:  string | null
  http_method: string | null
  endpoint:    string | null
  http_status: number | null
  reason:      string | null
  email:       string | null
  user_id:     string | null
  user_name:   string | null
  metadata:    Record<string, unknown>
}

export interface LoginRow {
  created_at: string
  event:      string
  success:    boolean
  email:      string | null
  user_id:    string | null
  user_name:  string | null
  ip_address: string | null
  user_agent: string | null
  method:     string | null
  reason:     string | null
}

export interface SecurityAlertRow {
  id:                   string
  alert_type:           string
  title:                string
  severity:             SecuritySeverity
  status:               'open' | 'acknowledged' | 'resolved'
  ip_address:           string | null
  user_id:              string | null
  user_name:            string | null
  occurrences:          number
  first_seen_at:        string
  last_seen_at:         string
  cooldown_until:       string | null
  channel_state:        'pending' | 'sent' | 'skipped'
  metadata:             Record<string, unknown>
  acknowledged_at:      string | null
  acknowledged_by_name: string | null
}

export interface IpDetail {
  ip:          string
  periodHours: number
  summary:  { events: number; suspicious: number; blocked: number; severe: number
              first_seen: string | null; last_seen: string | null } | null
  logins:   { success: number; failed: number; first_seen: string | null; last_seen: string | null } | null
  users:    Array<{ user_id: string; name: string; email: string; events: number; last_seen: string }>
  endpoints: Array<{ endpoint: string; http_method: string; count: number }>
  events:   Array<Pick<SecurityEventRow, 'id' | 'created_at' | 'event_type' | 'severity' | 'status'
                       | 'endpoint' | 'http_status' | 'reason' | 'email' | 'user_name'>>
}

export type SecurityPeriod = 'today' | '24h' | '7d' | '30d'

interface EventFilters {
  period?:   SecurityPeriod
  severity?: SecuritySeverity
  status?:   SecurityStatus
  type?:     string
  ip?:       string
  userId?:   string
  limit?:    number
  offset?:   number
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export interface SessionRow {
  id: string; user_id: string; user_name: string; user_email: string
  ip_address: string | null; user_agent: string | null
  created_at: string; expires_at: string; revoked: boolean
  statut: 'active' | 'expiree' | 'revoquee'
  appareils_confiance: number
}

export interface DeviceRow {
  id: string; user_id: string; user_name: string; user_email: string
  label: string | null; user_agent: string | null; ip_address: string | null
  last_used_at: string | null; created_at: string
  expires_at: string; revoked_at: string | null
  statut: 'actif' | 'expire' | 'revoque'
}

export interface AuditRow {
  id: string; user_id: string | null; user_name: string | null
  action: string; table_name: string; record_id: string | null
  ip_address: string | null; user_agent: string | null; created_at: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

export interface AuditFilters {
  q?: string; user_id?: string; table?: string; action?: string
  ip?: string; period?: SecurityPeriod; limit?: number; offset?: number
}

export interface SecuritySettings {
  tenant_id: string
  session_max_days: number; idle_timeout_minutes: number
  max_login_attempts: number; lockout_minutes: number
  require_2fa_admins: boolean; require_2fa_all: boolean
  trusted_devices_enabled: boolean; trusted_device_days: number
  password_min_length: number
  password_require_upper: boolean
  password_require_digit: boolean
  password_require_symbol: boolean
}

export const securityApi = {
  /* Présence — appelé par tout utilisateur connecté, pas seulement l'admin */
  heartbeat:    (sessionKey: string) =>
    api.post<{ ok: true; intervalMs: number }>('/api/security/heartbeat', { sessionKey }),
  endHeartbeat: (sessionKey: string) =>
    api.post<{ ok: true }>('/api/security/heartbeat/end', { sessionKey }),

  /* Lecture — réservé admin / SECURITY_MONITORING_READ */
  overview: (period: SecurityPeriod = '24h') =>
    api.get<SecurityOverview>(`/api/security/overview${qs({ period })}`),
  online:   () =>
    api.get<{ onlineCount: number; idleCount: number
              thresholds: { onlineSeconds: number; idleSeconds: number }
              users: OnlineUser[] }>('/api/security/online'),
  events:   (f: EventFilters = {}) =>
    api.get<{ rows: SecurityEventRow[]; limit: number; offset: number; hasMore: boolean
              filters: { types: string[]; severities: string[]; statuses: string[] } }>(
      `/api/security/events${qs(f as Record<string, unknown>)}`
    ),
  logins:   (f: { period?: SecurityPeriod; email?: string; ip?: string
                  outcome?: 'success' | 'failed'; limit?: number; offset?: number } = {}) =>
    api.get<{ rows: LoginRow[]; limit: number; offset: number; hasMore: boolean }>(
      `/api/security/logins${qs(f as Record<string, unknown>)}`
    ),
  ipDetail: (ip: string, period: SecurityPeriod = '30d') =>
    api.get<IpDetail>(`/api/security/ip/${encodeURIComponent(ip)}${qs({ period })}`),
  alerts:   (f: { status?: 'open' | 'acknowledged' | 'resolved'; limit?: number; offset?: number } = {}) =>
    api.get<{ rows: SecurityAlertRow[]; limit: number; offset: number; hasMore: boolean }>(
      `/api/security/alerts${qs(f as Record<string, unknown>)}`
    ),
  /* ── Sessions & appareils ───────────────────────────────────────
     Révoquer coupe RÉELLEMENT : le jeton d'accès porte l'identifiant de
     sa session et chaque requête le vérifie (server/lib/sessionRevocation). */
  sessions: (f: { user_id?: string; all?: '1'; limit?: number; offset?: number } = {}) =>
    api.get<{ rows: SessionRow[]; limit: number; offset: number; hasMore: boolean }>(
      `/api/security/sessions${qs(f as Record<string, unknown>)}`),
  revokeSession: (id: string) =>
    api.post<{ ok: true }>(`/api/security/sessions/${id}/revoke`, {}),
  revokeAllSessions: (userId: string) =>
    api.post<{ ok: true; revoked: number }>(`/api/security/users/${userId}/sessions/revoke-all`, {}),

  devices: (f: { limit?: number; offset?: number } = {}) =>
    api.get<{ rows: DeviceRow[]; limit: number; offset: number; hasMore: boolean }>(
      `/api/security/devices${qs(f as Record<string, unknown>)}`),
  revokeDevice: (id: string) =>
    api.post<{ ok: true }>(`/api/security/devices/${id}/revoke`, {}),

  /* ── Journal d'audit ────────────────────────────────────────────
     Paginé et filtré CÔTÉ SERVEUR : la table grossit sans fin. */
  audit: (f: AuditFilters = {}) =>
    api.get<{ rows: AuditRow[]; limit: number; offset: number; hasMore: boolean }>(
      `/api/security/audit${qs(f as Record<string, unknown>)}`),
  auditFacets: () =>
    api.get<{ tables: string[]; actions: string[]
              utilisateurs: { id: string; nom: string }[] }>('/api/security/audit/facets'),

  /* ── Rôles : la matrice RÉELLEMENT appliquée par le serveur ─────── */
  roles: () =>
    api.get<{ effectifs: { role: string; n: number }[]
              matrice: Record<string, Record<'view'|'create'|'edit'|'delete', string[]>> }>(
      '/api/security/roles'),

  /* ── Réglages : appliqués côté serveur, l'écran ne fait que régler ── */
  settings: () =>
    api.get<{ settings: SecuritySettings; defini: boolean }>('/api/security/settings'),
  saveSettings: (patch: Partial<SecuritySettings>) =>
    api.patch<{ settings: SecuritySettings; defini: boolean }>('/api/security/settings', patch),

  acknowledgeAlert: (id: string) =>
    api.post<{ ok: true }>(`/api/security/alerts/${id}/acknowledge`, {}),
}

/* ── Tenant API ──────────────────────────────────────────────── */
export const tenantApi = {
  resolve: (slug: string) =>
    api.publicGet<{ id: string; slug: string; name: string; plan: string; logo_url: string | null; primary_color: string }>(
      `/api/tenants/resolve/${slug}`
    ),
  members:      ()            => api.get<Array<{ user_id: string; email: string; name: string; role: string; status: string }>>('/api/tenants/members'),
  update:       (data: any)   => api.patch('/api/tenants', data),
  invite:       (email: string, role: string) => api.post('/api/tenants/invite', { email, role }),
  revokeMember: (id: string)  => api.delete(`/api/tenants/members/${id}`),
  getAccess:    (userId: string) =>
    api.get<{ allowed_modules: string[] | null; role: string }>(`/api/tenants/members/${userId}/access`),
  setAccess:    (userId: string, allowed_modules: string[] | null) =>
    api.patch<{ allowed_modules: string[] | null; role: string }>(
      `/api/tenants/members/${userId}/access`, { allowed_modules }
    ),
}

/* ── Team management (admin) ─────────────────────────────────── */
export interface TeamMemberAccess {
  category: string
  level:    'read' | 'complete' | 'edit'
}

export interface TeamMemberRow {
  id:                 string
  first_name:         string
  last_name:          string
  email:              string
  telephone:          string | null
  job_title:          string | null
  member_type:        'employee' | 'trainer' | 'freelance'
  account_status:     'invited' | 'active' | 'suspended' | 'archived'
  avatar_url:         string | null
  last_login_at:      string | null
  invitation_sent_at: string | null
  invitation_accepted_at: string | null
  created_at:         string
  access:             TeamMemberAccess[]
  open_tasks_count:   number
}

export interface TeamTaskInput {
  title:       string
  description?: string
  priority?:   'low' | 'normal' | 'high' | 'urgent'
  due_date?:   string | null
}

export interface TeamInviteInput {
  first_name:     string
  last_name:      string
  email:          string
  phone?:         string
  member_type?:   'employee' | 'trainer' | 'freelance'
  job_title?:     string
  sop_categories?: TeamMemberAccess[]
  tasks?:         TeamTaskInput[]
}

export interface InviteIssuedResponse {
  id?:          string
  success?:     true
  status?:      string
  expires_at:   string
  /** Aperçu du token pour audit (ex. "08e0…e970") — jamais le lien complet. */
  masked_token: string
}

export const teamMgmtApi = {
  list:    () => api.get<TeamMemberRow[]>('/api/team/members'),
  get:     (id: string) => api.get<any>(`/api/team/members/${id}`),
  invite:  (data: TeamInviteInput) => api.post<InviteIssuedResponse>('/api/team/invite', data),
  update:  (id: string, data: Partial<TeamInviteInput>) =>
    api.patch<{ success: true }>(`/api/team/members/${id}`, data),
  setAccess: (id: string, access: TeamMemberAccess[]) =>
    request<{ success: true }>('PUT', `/api/team/members/${id}/access`, { access }),
  suspend: (id: string) => api.post<{ success: true }>(`/api/team/members/${id}/suspend`, {}),
  activate:(id: string) => api.post<{ success: true }>(`/api/team/members/${id}/activate`, {}),
  resend:  (id: string) => api.post<InviteIssuedResponse>(`/api/team/members/${id}/resend`, {}),
  shareLink: (id: string) => api.post<{ success: true; invite_url: string; expires_at: string }>(`/api/team/members/${id}/share-link`, {}),
  shareResetLink: (id: string) => api.post<{ success: true; invite_url: string; expires_at: string }>(`/api/team/members/${id}/share-reset-link`, {}),
  resetPwd:(id: string) => api.post<InviteIssuedResponse>(`/api/team/members/${id}/reset-password`, {}),
  archive: (id: string) => api.delete<{ success: true }>(`/api/team/members/${id}`),
  listArchived:    () => api.get<TeamMemberRow[]>('/api/team/members?archived=true'),
  restore:         (id: string) => api.post<{ success: true }>(`/api/team/members/${id}/restore`, {}),
  permanentDelete: (id: string) => api.delete<{ success: true }>(`/api/team/members/${id}/permanent`),

  tasks:        (memberId: string) => api.get<any[]>(`/api/team/members/${memberId}/tasks`),
  addTask:      (memberId: string, t: TeamTaskInput) => api.post<any>(`/api/team/members/${memberId}/tasks`, t),
  updateTask:   (taskId: string, t: Partial<TeamTaskInput> & { status?: string }) =>
    api.patch<any>(`/api/team/tasks/${taskId}`, t),
  deleteTask:   (taskId: string) => api.delete<{ success: true }>(`/api/team/tasks/${taskId}`),

  activity:     (memberId: string, limit = 100) =>
    api.get<any[]>(`/api/team/members/${memberId}/activity?limit=${limit}`),

  finance:      (memberId: string) => api.get<{ payroll: any[]; advances: any[]; payments: any[] }>(
                  `/api/team/members/${memberId}/finance`),
  leaves:       (memberId: string) => api.get<any[]>(`/api/team/members/${memberId}/leaves`),
  projects:     (memberId: string) => api.get<any[]>(`/api/team/members/${memberId}/projects`),
  performance:  (memberId: string) => api.get<any[]>(`/api/team/members/${memberId}/performance`),
}

/* ── Team-member (employee/trainer) auth ─────────────────────── */
export const memberAuthApi = {
  /* Public — verify invitation token */
  verifyInvite: (token: string) =>
    api.publicGet<{
      first_name: string; last_name: string; email: string;
      job_title: string | null; tenant_name: string; expires_at: string | null;
    }>(`/api/team/invite/${token}`),

  /* Public — accept invite + set password → returns auth token */
  acceptInvite: (token: string, password: string) =>
    api.publicPost<{ token: string; member: any }>(`/api/team/invite/${token}/accept`, { password }),

  login: (email: string, password: string) =>
    api.publicPost<{ token: string; member: { id: string; first_name: string; last_name: string; tenant_slug: string } }>(
      '/api/team/auth/login', { email, password }
    ),

  me: () => memberApi.get<{
    id: string; tenant_id: string; tenant_slug: string; tenant_name: string;
    first_name: string; last_name: string; email: string; job_title: string | null;
    member_type: string; avatar_url: string | null; account_status: string;
    access: { category: string; level: string }[];
  }>('/api/team/auth/me'),

  logout: () => memberApi.post<{ success: true }>('/api/team/auth/logout', {}).catch(() => ({ success: false })),
}

/* ── My-space (member) — uses memberApi (separate token slot) ── */
export const mySpaceApi = {
  dashboard: () => memberApi.get<{
    profile: any
    access: Array<{ category: string; level: string; total_sops: number }>
    tasks:   { total: number; done: number; in_progress: number; todo: number; overdue: number }
    recent_activity: any[]
  }>('/api/my-space/dashboard'),

  profile:    () => memberApi.get<any>('/api/my-space/profile'),
  updateProfile: (data: { telephone?: string; avatar_url?: string }) =>
    memberApi.put<{ success: true }>('/api/my-space/profile', data),
  changePassword: (current_password: string, new_password: string) =>
    memberApi.put<{ success: true }>('/api/my-space/password', { current_password, new_password }),

  tasks:    () => memberApi.get<any[]>('/api/my-space/tasks'),
  updateTaskStatus: (id: string, status: string) =>
    memberApi.patch<{ success: true }>(`/api/my-space/tasks/${id}`, { status }),
  updateTaskElapsed: (id: string, elapsed_seconds: number, status?: string) =>
    memberApi.patch<{ success: true }>(`/api/my-space/tasks/${id}`, { elapsed_seconds, ...(status && { status }) }),
  updateTaskDescription: (id: string, description: string) =>
    memberApi.patch<{ success: true }>(`/api/my-space/tasks/${id}`, { description }),

  projets:    () => memberApi.get<any[]>('/api/my-space/projets'),
  projet:     (id: string) => memberApi.get<any>(`/api/my-space/projets/${id}`),
  projetMessages:     (id: string) => memberApi.get<any[]>(`/api/my-space/projets/${id}/messages`),
  postProjetMessage:  (id: string, text: string) => memberApi.post<any>(`/api/my-space/projets/${id}/messages`, { text }),

  sops:     (category?: string) => memberApi.get<any[]>(`/api/my-space/sops${category ? `?category=${category}` : ''}`),
  sop:      (id: string) => memberApi.get<any>(`/api/my-space/sops/${id}`),
  logSop:   (sop_id: string, action_type: string, details?: any) =>
    memberApi.post<{ success: true }>('/api/my-space/sops/activity', { sop_id, action_type, details }),
}

/* ── Generic table API ───────────────────────────────────────── */
export function tableApi<T>(table: string) {
  return {
    /* Toute clé hors orderBy/order/limit/offset est traitée par le
       serveur comme un filtre d'égalité `colonne = valeur`
       (server/routes/crud.ts) — d'où la signature ouverte. */
    list:   (params?: {
      orderBy?: string; order?: 'asc'|'desc'; limit?: number; offset?: number
      [filtre: string]: string | number | null | undefined
    }) => {
      const qs = params ? '?' + new URLSearchParams(params as any).toString() : ''
      return api.get<T[]>(`/api/${table}${qs}`)
    },
    get:    (id: string)          => api.get<T>(`/api/${table}/${id}`),
    create: (data: Omit<T, 'id' | 'created_at' | 'tenant_id'>) =>
                                     api.post<T>(`/api/${table}`, data),
    update: (id: string, data: Partial<T>) =>
                                     api.patch<T>(`/api/${table}/${id}`, data),
    remove: (id: string)          => api.delete<{ success: boolean }>(`/api/${table}/${id}`),
  }
}

/* ── Pre-built table APIs ────────────────────────────────────── */
export const clientsApi       = tableApi('clients')
export const prospectsApi     = tableApi('prospects')
export const devisApi         = tableApi('devis')
export const facturesApi      = tableApi('factures')
export const paiementsApi     = tableApi('paiements')
export const depensesApi      = tableApi('depenses')
export const contratsApi      = tableApi('contrats')
export const produitsApi      = tableApi('produits')
export const fournisseursApi  = tableApi('fournisseurs')
export const contactsApi      = tableApi('contacts')
export const teamApi          = tableApi('team_members')
export const domainesApi      = tableApi('domaines')
export const hebergementsApi  = tableApi('hebergements')
export const chequesRecusApi  = tableApi('cheques_recus')
export const chequesEmisApi   = tableApi('cheques_emis')
export const abonnementsApi   = tableApi('abonnements')
export const clientSubsApi    = tableApi('client_subscriptions')
export const tachesApi        = tableApi('taches')
export const autoRulesApi     = tableApi('automation_rules')
export const autoLogsApi      = tableApi('automation_logs')
export const alertsApi        = tableApi('alerts')
export const calendrierApi       = tableApi('calendrier_events')
export const bankAccountsApi     = tableApi('bank_accounts')
export const creditsDettesApi    = tableApi('credits_dettes')
export const bonsCommandeApi     = tableApi('bons_commande')
/* ── Congés et salaires ───────────────────────────────────────────
   L'écran Équipe a toujours parlé de `conges` et `salaires_paiements`.
   Ces tables n'ont jamais existé : aucune migration ne les crée, et la
   production répondait « relation "conges" does not exist » à chaque
   ouverture de l'onglet — les deux onglets étaient morts depuis le
   premier jour.

   Les tables équivalentes, elles, existent bien et servent déjà la fiche
   employé : `employee_leaves` et `employee_payroll`, avec RLS forcé et
   leurs politiques. On les réutilise plutôt que d'en créer des doubles.

   Seul le vocabulaire diffère. Plutôt que de renommer partout dans
   l'écran, la traduction tient ici, en un seul endroit. */

interface LigneConge {
  id: string; employee_id: string; type_conge: string
  date_debut: string; date_fin: string; nb_jours: number
  statut: string; motif: string | null; created_at: string
}

/** Ce que l'écran Équipe manipule pour un congé. */
export interface Conge {
  id: string; member_id: string; type: string
  date_debut: string; date_fin: string; jours: number
  statut: string; notes: string; created_at: string
}

const versConge = (r: LigneConge): Conge => ({
  id:         r.id,
  member_id:  r.employee_id,
  type:       r.type_conge,
  date_debut: r.date_debut,
  date_fin:   r.date_fin,
  jours:      r.nb_jours,
  statut:     r.statut,
  notes:      r.motif ?? '',
  created_at: r.created_at,
})

type EcritureConge = Partial<Omit<Conge, 'id' | 'created_at'>>

const depuisConge = (d: EcritureConge): Partial<LigneConge> => {
  const out: Partial<LigneConge> = {}
  if (d.member_id  !== undefined) out.employee_id = d.member_id
  if (d.type       !== undefined) out.type_conge  = d.type
  if (d.date_debut !== undefined) out.date_debut  = d.date_debut
  if (d.date_fin   !== undefined) out.date_fin    = d.date_fin
  if (d.jours      !== undefined) out.nb_jours    = d.jours
  if (d.statut     !== undefined) out.statut      = d.statut
  if (d.notes      !== undefined) out.motif       = d.notes
  return out
}

const congesTable = tableApi<LigneConge>('employee_leaves')

export const congesApi = {
  list: async (params?: Parameters<typeof congesTable.list>[0]): Promise<Conge[]> =>
    (await congesTable.list(params)).map(versConge),
  create: async (data: EcritureConge): Promise<Conge> =>
    versConge(await congesTable.create(depuisConge(data) as Omit<LigneConge, 'id' | 'created_at'>)),
  update: async (id: string, data: EcritureConge): Promise<Conge> =>
    versConge(await congesTable.update(id, depuisConge(data))),
  remove: (id: string) => congesTable.remove(id),
}

interface LignePaie {
  id: string; employee_id: string; month: string
  primes: number | null; avances: number | null
  jours_absents: number | null; note: string | null
}

/** Ce que l'écran Équipe manipule pour une paie mensuelle. */
export interface Paie {
  id: string; member_id: string; year: number; month: number
  prime: number; avance: number; absent_jours: number; note: string
}

/* `employee_payroll.month` est une DATE (premier jour du mois) ; l'écran
   raisonne en année + mois. La conversion se fait sur la chaîne brute :
   passer par `new Date()` ramènerait le mois précédent à l'ouest de
   Greenwich. */
const versPaie = (r: LignePaie): Paie => {
  const [y, m] = String(r.month ?? '').split('-')
  return {
    id:           r.id,
    member_id:    r.employee_id,
    year:         Number(y) || 0,
    month:        Number(m) || 0,
    prime:        Number(r.primes ?? 0),
    avance:       Number(r.avances ?? 0),
    absent_jours: Number(r.jours_absents ?? 0),
    note:         r.note ?? '',
  }
}

type EcriturePaie = Partial<Omit<Paie, 'id'>>

const depuisPaie = (d: EcriturePaie): Partial<LignePaie> => {
  const out: Partial<LignePaie> = {}
  if (d.member_id    !== undefined) out.employee_id   = d.member_id
  if (d.prime        !== undefined) out.primes        = d.prime
  if (d.avance       !== undefined) out.avances       = d.avance
  if (d.absent_jours !== undefined) out.jours_absents = d.absent_jours
  if (d.note         !== undefined) out.note          = d.note
  if (d.year !== undefined && d.month !== undefined) {
    out.month = `${d.year}-${String(d.month).padStart(2, '0')}-01`
  }
  return out
}

const paieTable = tableApi<LignePaie>('employee_payroll')

export const salairesPaiementsApi = {
  list: async (params?: Parameters<typeof paieTable.list>[0]): Promise<Paie[]> =>
    (await paieTable.list(params)).map(versPaie),
  create: async (data: EcriturePaie): Promise<Paie> =>
    versPaie(await paieTable.create(depuisPaie(data) as Omit<LignePaie, 'id'>)),
  update: async (id: string, data: EcriturePaie): Promise<Paie> =>
    versPaie(await paieTable.update(id, depuisPaie(data))),
  remove: (id: string) => paieTable.remove(id),
}
export const tacheActionsApi     = tableApi('tache_actions')

/* ── Module Guides (playbook onboarding client) ──────────────── */
export const guideStepsApi              = tableApi('guide_steps')
export const guideTemplatesApi          = tableApi('guide_templates')
export const guideChecklistsApi         = tableApi('guide_checklists')
export const guideChecklistStateApi     = tableApi('guide_checklist_state')
export const guideTemplateRendersApi    = tableApi('guide_template_renders')
export const guideDiscoveryQuestionsApi = tableApi('guide_discovery_questions')
export const tenantVisionApi            = tableApi('tenant_vision')

/* ── SOPs personnalisés ─────────────────────────────────────── */
export const sopsApi                    = tableApi('sops')
export const sopSharesApi               = tableApi('sop_shares')
export const sopTrainingApi             = tableApi('sop_training_progress')

/* ── Stagiaires (onglet Équipe) ─────────────────────────────── */
export const stagiairesApi              = tableApi('stagiaires')

/* ── Projets (gestion de projets clients & internes) ─────────── */
export const projetsApi                 = tableApi('projets')
export const projetAssigneesApi         = tableApi('projet_assignees')
export const projetMessagesApi          = tableApi('projet_messages')
export const projetTemplatesApi         = tableApi('projet_templates')
export const teamMemberTasksApi         = tableApi('team_member_tasks')

/* ── Bons de livraison (handover client + mots de passe + liens) ── */
export const bonsLivraisonApi           = tableApi('bons_livraison')

/* ── Bibliothèque de modèles de prestations (devis) ─────────────── */
export const prestationModelsApi        = tableApi('prestation_models')

/* ── Module financier ───────────────────────────────────────────
   Lecture (et édition simple des prévisions) via le CRUD générique ;
   tout mouvement d'argent passe par `financeApi` ci-dessous, où le
   serveur garantit l'atomicité et refuse les doublons. */
export const revenusApi                 = tableApi('revenus')
export const previsionsApi              = tableApi('previsions_financieres')
export const transfertsApi              = tableApi('transferts_comptes')
export const ajustementsApi             = tableApi('bank_account_adjustments')

/* Identifiant d'opération : un double-clic (ou un retry réseau) réutilise
   le même `op_id`, le serveur ne l'écrit donc qu'une seule fois. */
export function newOpId(): string {
  return (globalThis.crypto?.randomUUID?.()
    ?? `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
}

export const financeApi = {
  createRevenu:  (data: Record<string, unknown>) => api.post<any>('/api/finance/revenus', data),
  deleteRevenu:  (id: string) => api.delete<{ success: boolean }>(`/api/finance/revenus/${id}`),
  deleteDepense: (id: string) => api.delete<{ success: boolean }>(`/api/finance/depenses/${id}`),

  createTransfert: (data: Record<string, unknown>) => api.post<any>('/api/finance/transferts', data),
  deleteTransfert: (id: string) => api.delete<{ success: boolean }>(`/api/finance/transferts/${id}`),

  createAjustement: (data: Record<string, unknown>) => api.post<any>('/api/finance/ajustements', data),

  settlePrevision: (id: string, data: Record<string, unknown>) =>
    api.post<{ prevision: any; transaction: any; sens: 'revenu' | 'depense' }>(
      `/api/finance/previsions/${id}/settle`, data),
  cancelPrevision: (id: string) => api.post<any>(`/api/finance/previsions/${id}/cancel`, {}),
  reopenPrevision: (id: string) => api.post<any>(`/api/finance/previsions/${id}/reopen`, {}),

  /* Soldes recalculés par la base — sert de contrôle face au calcul client. */
  soldes: () => api.get<{
    comptes: any[]
    disponible: number
    revenus_prevus: number
    depenses_prevues: number
    solde_previsionnel: number
  }>('/api/finance/soldes'),
}

/* ── Journal d'activité unifié (CRUD + membres + sécurité) ─────── */
export interface ActivityEntry {
  id:           string
  source:       'crud' | 'member' | 'security'
  module:       string
  action:       string
  title:        string
  detail:       string | null
  actor:        string | null
  actor_email:  string | null
  record_id:    string | null
  ip:           string | null
  created_at:   string
}
export const activityApi = {
  list: (limit = 500) => api.get<ActivityEntry[]>(`/api/activity?limit=${limit}`),
}

/* ── Notifications & rapports automatiques ───────────────────── */
export type ReportKind = 'tasks_overdue' | 'clients_to_contact' | 'daily_report' | 'weekly_report'

export interface ServerNotification {
  id:        string
  kind:      string
  severity:  'info' | 'success' | 'warning' | 'critical'
  title:     string
  message:   string | null
  link:      string | null
  icon:      string | null
  data:      Record<string, number>
  is_read:   boolean
  read_at:   string | null
  created_at:string
}

export interface NotificationSettings {
  tenant_id:  string
  enabled:    boolean
  timezone:   string
  recipients: string[]
  email_enabled: boolean
  inapp_enabled: boolean
  tasks_alert_enabled: boolean
  tasks_alert_hour:    number
  tasks_stale_days:    number
  contacts_alert_enabled: boolean
  contacts_alert_hour:    number
  contact_delay_days:     number
  new_lead_grace_days:    number
  daily_report_enabled: boolean
  daily_report_hour:    number
  weekly_report_enabled: boolean
  weekly_report_hour:    number
  weekly_report_weekday: number
  updated_at: string
}

export interface NotificationRun {
  id:            string
  kind:          ReportKind
  run_date:      string
  scheduled_hour: number | null
  trigger:       'auto' | 'manual'
  status:        'running' | 'ok' | 'empty' | 'error'
  attempt:       number
  recipients:    number
  emails_sent:   number
  emails_failed: number
  summary:       Record<string, number>
  error:         string | null
  started_at:    string
  finished_at:   string | null
}

export const notificationsApi = {
  /* Cloche */
  list:     (limit = 50) => api.get<{ notifications: ServerNotification[]; unread: number }>(`/api/notifications?limit=${limit}`),
  markRead: (id: string) => api.patch<{ success: true }>(`/api/notifications/${id}/read`, {}),
  markAllRead: ()        => api.post<{ success: true; updated: number }>('/api/notifications/read-all', {}),
  remove:   (id: string) => api.delete<{ success: true }>(`/api/notifications/${id}`),
  clear:    ()           => api.post<{ success: true }>('/api/notifications/clear', {}),

  /* Configuration (admin) */
  settings: () => api.get<{
    settings: NotificationSettings
    clock:    { local_time: string; local_date: string; local_dow: number }
    kinds:    Record<ReportKind, string>
  }>('/api/notifications/settings'),
  saveSettings: (patch: Partial<NotificationSettings>) =>
    api.put<{ success: true; settings: NotificationSettings }>('/api/notifications/settings', patch),

  runs: () => api.get<{ runs: NotificationRun[]; last: Array<Pick<NotificationRun, 'kind' | 'status' | 'emails_sent' | 'started_at' | 'finished_at' | 'summary'>> }>('/api/notifications/runs'),

  /* Envoi immédiat + aperçu */
  runNow:  (kind: ReportKind) => api.post<{ ok: boolean; empty: boolean; subject?: string }>(`/api/notifications/run/${kind}`, {}),
  preview: (kind: ReportKind) => api.get<{
    subject: string; empty: boolean; summary: Record<string, number>; html: string; text: string
  }>(`/api/notifications/preview/${kind}`),
}

/* ── 7aty — suivi du temps & des distractions ─────────────────────
   Route dédiée (et non tableApi) parce que ces lignes sont PERSONNELLES :
   le serveur scope chaque requête à req.user.userId, jamais au seul
   tenant. Aucun paramètre d'identité ne transite donc par le client. */
export const timeApi = {
  entries: (from?: Date, to?: Date) => {
    const qs = new URLSearchParams()
    if (from) qs.set('from', from.toISOString())
    if (to)   qs.set('to',   to.toISOString())
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return api.get<TimeEntryDTO[]>(`/api/time/entries${suffix}`)
  },
  create: (data: Partial<TimeEntryDTO>) => api.post<TimeEntryDTO>('/api/time/entries', data),
  update: (id: string, data: Partial<TimeEntryDTO>) => api.patch<TimeEntryDTO>(`/api/time/entries/${id}`, data),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/time/entries/${id}`),

  running: () => api.get<TimeEntryDTO | null>('/api/time/running'),
  start:   (data: Partial<TimeEntryDTO>) =>
    api.post<{ running: TimeEntryDTO; stopped: TimeEntryDTO | null }>('/api/time/start', data),
  stop:    (data: Partial<TimeEntryDTO> = {}) => api.post<TimeEntryDTO>('/api/time/stop', data),
  cancelRunning: () => api.delete<{ success: boolean }>('/api/time/running'),

  goals:     () => api.get<TimeGoalDTO[]>('/api/time/goals'),
  saveGoals: (goals: { category_key: string; max_minutes_week: number }[]) =>
    api.put<TimeGoalDTO[]>('/api/time/goals', { goals }),

  settings:     () => api.get<TimeSettingsDTO>('/api/time/settings'),
  saveSettings: (patch: Partial<TimeSettingsDTO>) => api.put<TimeSettingsDTO>('/api/time/settings', patch),
}

export interface TimeEntryDTO {
  id:            string
  tenant_id:     string
  user_id:       string
  label:         string
  category_key:  string
  kind:          'valeur' | 'neutre' | 'repos' | 'perdu'
  control_level: 'controle' | 'necessaire' | 'non_planifie' | 'perte_controle' | null
  started_at:    string
  ended_at:      string | null
  duration_min:  number | null
  notes:         string | null
  source:        'manual' | 'timer' | 'quick'
  created_at:    string
  updated_at:    string
}

export interface TimeGoalDTO {
  id:               string
  category_key:     string
  max_minutes_week: number
}

export interface TimeSettingsDTO {
  work_start_hour:         number
  work_end_hour:           number
  work_days:               number[]
  alert_threshold_min:     number
  alerts_enabled:          boolean
  weekly_high_value_hours: number
  reminder_enabled:        boolean
  reminder_hour:           number
}

/* ── Rappels de tâches (5 min / 30 min / 1 jour avant l'échéance) ──
   Réglages personnels : le serveur scope à req.user.userId. */
export interface TaskReminderPrefs {
  /** Minutes avant l'échéance, du plus lointain au plus proche. */
  default_offsets:  number[]
  /** Heure supposée d'une tâche datée sans heure (« 09:00:00 »). */
  default_due_time: string
  email_enabled: boolean
  push_enabled:  boolean
  inapp_enabled: boolean
}

export interface PushDevice {
  id:           string
  label:        string | null
  user_agent:   string | null
  created_at:   string
  last_seen_at: string
}

export const taskRemindersApi = {
  prefs:     () => api.get<TaskReminderPrefs>('/api/task-reminders/prefs'),
  savePrefs: (patch: Partial<TaskReminderPrefs>) =>
    api.put<TaskReminderPrefs>('/api/task-reminders/prefs', patch),
  devices:   () => api.get<PushDevice[]>('/api/push/devices'),
}
