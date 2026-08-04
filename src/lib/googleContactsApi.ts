/**
 * Client frontend « Google Contacts — Caller ID ».
 * Tout passe par le backend `/api/google-contacts/*` : le refresh_token Google
 * n'est jamais exposé au navigateur.
 */
import { api } from './api'

export interface GoogleContactsLink {
  connected: boolean
  googleEmail?: string | null
  status?: 'active' | 'needs_reauth' | 'error'
  autoSync?: boolean
  nameSuffix?: string
  includeCompany?: boolean
  lastSyncedAt?: string | null
  contactsCount?: number
  lastError?: string | null
}

export interface GoogleContactsStatus {
  enabled: boolean
  configured: boolean
  link: GoogleContactsLink
}

export interface SyncCounts { created: number; updated: number; deleted: number; skipped: number }

export const googleContactsApi = {
  status: () => api.get<GoogleContactsStatus>('/api/google-contacts/status'),
  oauthUrl: () => api.post<{ url: string }>('/api/google-contacts/oauth/url', {}),
  sync: () => api.post<{ success: boolean; counts?: SyncCounts; contactsCount?: number }>('/api/google-contacts/sync', {}),
  settings: (s: { autoSync?: boolean; includeCompany?: boolean; nameSuffix?: string }) =>
    api.post<{ success: boolean }>('/api/google-contacts/settings', s),
  disconnect: () => api.post<{ success: boolean }>('/api/google-contacts/disconnect', {}),
}
