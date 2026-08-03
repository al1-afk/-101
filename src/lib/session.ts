import { tokenStore, authApi } from './api'
import { queryClient } from './queryClient'
import { deleteAllTenantDatabases } from './offline/db'
import { getPresenceSessionKey } from '@/hooks/usePresenceHeartbeat'

/* ─────────────────────────────────────────────────────────────────
   Tenant-scoped session helpers.

   Multi-tenancy depends on never serving cached data from a previous
   user. We therefore treat *every* client-side cache as tenant-scoped:

     - React Query cache (in-memory, survives tab)
     - Dexie / IndexedDB (per-origin, survives browser restart)
     - localStorage / sessionStorage (per-origin, survives browser restart)

   Any auth transition (login of a different user, logout, token
   revoked, tenant mismatch) MUST call `purgeClientSession()` before
   the new user's data loads — otherwise User-A rows can be rendered
   for User B until refetches complete, which is exactly the symptom
   the audit flagged.
───────────────────────────────────────────────────────────────── */

const LOCAL_STORAGE_TENANT_PREFIXES = [
  'gestiq_',           // tokens, tenant slug, feature flags
  'alerts_read_',      // read state for in-app alerts
  'automation_',       // automation rules storage
]

/* Exact keys that are tenant-scoped but don't match the prefixes above.
   Must stay in sync with any new per-workspace localStorage write. */
const LOCAL_STORAGE_TENANT_KEYS = [
  'workspace_members', // team invitations (Equipe page)
  'ng_signature',      // saved devis/facture signature
]

function clearLocalStorageScoped() {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (
        LOCAL_STORAGE_TENANT_PREFIXES.some(p => k.startsWith(p)) ||
        LOCAL_STORAGE_TENANT_KEYS.includes(k)
      ) toRemove.push(k)
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  } catch { /* localStorage may be disabled */ }
}

function clearSessionStorage() {
  try { sessionStorage.clear() } catch { /* ignore */ }
}

async function clearIndexedDB() {
  try {
    await deleteAllTenantDatabases()
  } catch {
    /* deleteAllTenantDatabases already swallows errors; this is a
       defence-in-depth try/catch in case the import itself fails. */
  }
}

/* Full wipe — call on logout, on token-reuse detection, and on
   tenant mismatch between URL and JWT. */
export async function purgeClientSession(): Promise<void> {
  tokenStore.clear()
  queryClient.removeQueries()
  queryClient.clear()
  clearLocalStorageScoped()
  clearSessionStorage()
  await clearIndexedDB()
}

/* Complete logout: revoke refresh token server-side THEN purge. */
export async function logoutAndPurge(): Promise<void> {
  /* La clé est lue AVANT la purge (elle vit dans sessionStorage, que
     purgeClientSession efface). */
  let sessionKey: string | undefined
  try { sessionKey = getPresenceSessionKey() } catch { /* stockage indispo */ }
  await authApi.logout(sessionKey)
  await purgeClientSession()
}
