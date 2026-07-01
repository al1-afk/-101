import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { tokenStore, authApi } from '@/lib/api'
import { logoutAndPurge, purgeClientSession } from '@/lib/session'

interface AuthState {
  loading:         boolean
  isAuthorized:    boolean
  tenantSlug:      string | null
  tenantId:        string | null
  userId:          string | null
  email:           string | null
  name:            string | null
  role:            string | null
  allowedModules:  string[] | null  /* null = use role default; [] = empty access */
}

const INITIAL: AuthState = {
  loading:        true,
  isAuthorized:   false,
  tenantSlug:     null,
  tenantId:       null,
  userId:         null,
  email:          null,
  name:           null,
  role:           null,
  allowedModules: null,
}

function parseJwt(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

export function useAuth() {
  const navigate = useNavigate()
  const [state, setState] = useState<AuthState>(INITIAL)

  /* On mount: verify existing token */
  useEffect(() => {
    const token = tokenStore.get()
    if (!token) {
      setState({ ...INITIAL, loading: false })
      return
    }
    const payload = parseJwt(token)
    if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
      tokenStore.clear()
      setState({ ...INITIAL, loading: false })
      return
    }
    /* Token looks valid — try to confirm with server */
    authApi.me()
      .then(me => {
        setState({
          loading:        false,
          isAuthorized:   true,
          tenantSlug:     me.slug,
          tenantId:       payload.tenantId ?? null,
          userId:         me.id,
          email:          me.email,
          name:           me.name,
          role:           me.role,
          allowedModules: (me as any).allowed_modules ?? null,
        })
      })
      .catch(() => {
        tokenStore.clear()
        setState({ ...INITIAL, loading: false })
      })
  }, [])

  const signIn = useCallback(async (
    email:       string,
    password:    string,
    tenantSlug?: string,
  ) => {
    await purgeClientSession()
    const data: any = await authApi.login(email, password, tenantSlug)
    /* 1ʳᵉ connexion : le serveur exige la vérif email avant les tokens.
       Retourne l'info à Auth.tsx pour basculer sur l'étape "code". */
    if (data?.needsVerification) return { needsVerification: true as const, email }
    tokenStore.set(data.token)
    const payload = parseJwt(data.token)
    let allowedModules: string[] | null = null
    try {
      const me = await authApi.me()
      allowedModules = (me as any).allowed_modules ?? null
    } catch { /* ignore */ }
    setState({
      loading:        false,
      isAuthorized:   true,
      tenantSlug:     data.tenantSlug,
      tenantId:       data.tenantId,
      userId:         payload?.userId ?? payload?.sub ?? null,
      email,
      name:           null,
      role:           data.role,
      allowedModules,
    })
    navigate(`/${data.tenantSlug}`, { replace: true })
    return data
  }, [navigate])

  /* Step 2 — submit the emailed code, receive tokens, finalise. */
  const verifyLogin = useCallback(async (
    email:       string,
    code:        string,
    tenantSlug?: string,
  ) => {
    const data = await authApi.verifyLogin(email, code, tenantSlug)
    tokenStore.set(data.token)
    const payload = parseJwt(data.token)
    let allowedModules: string[] | null = null
    try {
      const me = await authApi.me()
      allowedModules = (me as any).allowed_modules ?? null
    } catch { /* ignore — token still works */ }
    setState({
      loading:        false,
      isAuthorized:   true,
      tenantSlug:     data.tenantSlug,
      tenantId:       data.tenantId,
      userId:         payload?.userId ?? payload?.sub ?? null,
      email,
      name:           null,
      role:           data.role,
      allowedModules,
    })
    navigate(`/${data.tenantSlug}`, { replace: true })
    return data
  }, [navigate])

  const resendLoginCode = useCallback((email: string) =>
    authApi.resendLoginCode(email)
  , [])

  const signOut = useCallback(async () => {
    await logoutAndPurge()
    setState({ ...INITIAL, loading: false })
    navigate('/auth', { replace: true })
  }, [navigate])

  return { ...state, signIn, verifyLogin, resendLoginCode, signOut }
}
