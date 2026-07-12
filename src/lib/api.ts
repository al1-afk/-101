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

/* ── Token refresh (singleton promise — prevents parallel refreshes) */
let _refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(r => r.json())
    .then(d => {
      if (!d.token) throw new Error('refresh_failed')
      tokenStore.set(d.token)
      return d.token as string
    })
    .finally(() => { _refreshPromise = null })
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

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  /* Auto-refresh on 401 TOKEN_EXPIRED (admin-side only) */
  if (res.status === 401 && source === 'admin' && _retry) {
    const data = await res.json().catch(() => ({}))
    if (data.code === 'TOKEN_EXPIRED') {
      try {
        await refreshAccessToken()
        return request<T>(method, path, body, auth, false)
      } catch {
        /* Refresh failed — purge every client-side cache so the
           next user on this browser cannot see stale data. */
        const { purgeClientSession } = await import('./session')
        await purgeClientSession()
        window.location.href = '/auth'
        throw new Error('Session expirée')
      }
    }
    /* TOKEN_REUSE (session hijack detected) or other hard 401 —
       same cleanup, the user is being force-logged-out. */
    if (data.code === 'TOKEN_REUSE' || data.code === 'NO_REFRESH' || data.code === 'INVALID_REFRESH') {
      const { purgeClientSession } = await import('./session')
      await purgeClientSession()
      window.location.href = '/auth'
    }
    throw new Error(data.error ?? 'Non authentifié')
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
export const authApi = {
  /* Step 1: validate password — server emails a 6-digit code and returns
     { needsVerification: true, email }. Tokens are NOT issued here. */
  login: (email: string, password: string, tenantSlug?: string) =>
    api.publicPost<{ needsVerification: true; email: string }>(
      '/api/auth/login', { email, password, tenantSlug }
    ),

  /* Step 2: submit the emailed code → tokens issued. */
  verifyLogin: (email: string, code: string, tenantSlug?: string) =>
    api.publicPost<{ token: string; tenantSlug: string; tenantId: string; role: string }>(
      '/api/auth/verify-login', { email, code, tenantSlug }
    ),

  resendLoginCode: (email: string) =>
    api.publicPost<{ success: boolean }>('/api/auth/resend-login-code', { email }),

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
  logout: () => api.post<{ success: boolean }>('/api/auth/logout', {}).catch(() => ({ success: false })),
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
    list:   (params?: { orderBy?: string; order?: 'asc'|'desc'; limit?: number; offset?: number }) => {
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
export const congesApi           = tableApi('conges')
export const salairesPaiementsApi = tableApi('salaires_paiements')
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
