import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react'
import { useParams } from 'react-router-dom'
import { tenantApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'

/* ─── Types ──────────────────────────────────────────────────────── */
export type TenantPlan = 'starter' | 'pro' | 'enterprise'

export interface Tenant {
  id:            string
  slug:          string
  name:          string
  plan:          TenantPlan
  logo_url:      string | null
  primary_color: string
  is_active?:    boolean
}

interface TenantState {
  tenant:  Tenant | null
  loading: boolean
  error:   string | null
}

interface TenantCtx extends TenantState {
  setTenantBySlug: (slug: string) => Promise<void>
  clearTenant:     () => void
}

/* ─── Context ────────────────────────────────────────────────────── */
const TenantContext = createContext<TenantCtx | null>(null)

export function TenantProvider({ children }: { children: ReactNode }) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()

  const [state, setState] = useState<TenantState>({
    tenant:  null,
    loading: true,
    error:   null,
  })

  const setTenantBySlug = useCallback(async (slug: string) => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const data = await tenantApi.resolve(slug)
      setState({
        tenant:  { ...data, plan: data.plan as TenantPlan, is_active: true },
        loading: false,
        error:   null,
      })
      sessionStorage.setItem('gestiq_tenant_slug', slug)
    } catch (e: any) {
      /* No silent demo fallback — an unknown slug is an error state.
         The UI layer (`ProtectedRoute` + the `/` → `/auth` redirect) is
         responsible for redirecting; rendering app chrome with a fake
         tenant_id was masking the multi-tenancy bug in production. */
      setState({
        tenant:  null,
        loading: false,
        error:   e?.message ?? 'Workspace introuvable',
      })
    }
  }, [])

  const clearTenant = useCallback(() => {
    setState({ tenant: null, loading: false, error: null })
    sessionStorage.removeItem('gestiq_tenant_slug')
  }, [])

  useEffect(() => {
    if (tenantSlug) setTenantBySlug(tenantSlug)
  }, [tenantSlug, setTenantBySlug])

  return (
    <TenantContext.Provider value={{ ...state, setTenantBySlug, clearTenant }}>
      {children}
    </TenantContext.Provider>
  )
}

/* ─── Hooks ──────────────────────────────────────────────────────── */
export function useTenant(): TenantCtx {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>')
  return ctx
}

/** Returns the authoritative tenant UUID from the JWT. The context's
 *  `tenant.id` is kept in sync by the resolve call, but we always
 *  fall back to the token so this can't silently return the demo id. */
export function useTenantId(): string | null {
  const { tenant } = useTenant()
  if (tenant?.id) return tenant.id
  const fromToken = currentTenantIdForCache()
  return fromToken === '__anon__' ? null : fromToken
}
