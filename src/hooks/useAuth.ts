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

  /* On mount: verify existing token.
     RÈGLE : ne JAMAIS wipe le token sur simple erreur — seul un 401 explicite
     du serveur (via api.ts qui a déjà tenté le refresh) doit déconnecter.
     Une erreur réseau, un 502, un 503 au démarrage doivent laisser la session
     intacte pour que l'utilisateur reste connecté dès que le réseau revient. */
  useEffect(() => {
    const token = tokenStore.get()
    if (!token) {
      setState({ ...INITIAL, loading: false })
      return
    }
    const payload = parseJwt(token)
    /* JWT expiré côté client : on ne clear PAS le token — on va laisser
       api.ts déclencher un refresh automatique au premier call authApi.me().
       Si le refresh réussit, la session est restaurée. Si le refresh échoue
       avec un vrai AUTH_INVALID, api.ts appellera purgeClientSession. */
    if (!payload) {
      /* Token corrompu (pas un JWT) : là on nettoie car aucun refresh possible */
      tokenStore.clear()
      setState({ ...INITIAL, loading: false })
      return
    }
    /* Hydratation optimiste immédiate depuis le JWT — l'utilisateur voit
       l'app connectée pendant que /me se confirme en arrière-plan. */
    setState(prev => ({
      ...prev,
      loading:        true,
      isAuthorized:   true,
      tenantId:       payload.tenantId ?? null,
      userId:         payload.userId ?? payload.sub ?? null,
      email:          payload.email ?? null,
      role:           payload.role ?? null,
    }))
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
      .catch(err => {
        /* /me a échoué APRÈS une tentative de refresh (gérée par api.ts).
           Deux cas :
           - api.ts a déjà purgé + redirect (AUTH_INVALID) → on ne fait rien
           - erreur transient (réseau, 5xx) → on garde la session hydratée
             depuis le JWT et on marque juste loading=false. */
        const msg = String(err?.message ?? '')
        if (msg === 'Session expirée') {
          /* purgeClientSession() a déjà été appelée par api.ts */
          setState({ ...INITIAL, loading: false })
          return
        }
        /* Transient : garder la session hydratée depuis le JWT */
        setState(prev => ({ ...prev, loading: false }))
      })
  }, [])

  const signIn = useCallback(async (
    email:       string,
    password:    string,
    tenantSlug?: string,
  ) => {
    await purgeClientSession()
    const data: any = await authApi.login(email, password, tenantSlug)
    /* 2FA : si le serveur exige une vérification, on renvoie tous les
       éléments utiles au composant Auth pour piloter la bonne UI selon
       le mode (email / admin_manual / admin_approval). */
    if (data?.needsVerification) {
      return {
        needsVerification: true as const,
        challengeId: data.challengeId as string,
        method:      data.method as 'email' | 'admin_manual' | 'admin_approval',
        email,
      }
    }
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

  /* Step 2 — submit the emailed/manual code (ou juste le challengeId pour
     admin_approval), receive tokens, finalise. */
  const verifyLogin = useCallback(async (params: {
    email?:       string
    code?:        string
    challengeId?: string
    tenantSlug?:  string
    rememberDevice?: boolean
  }) => {
    const data: any = await authApi.verifyLogin(params)
    /* Mode admin_approval : le serveur peut renvoyer 202 waitingForApproval.
       Dans ce cas, on remonte l'info sans écrire de token. */
    if (data?.waitingForApproval) {
      return { waitingForApproval: true as const, status: data.status as string }
    }
    tokenStore.set(data.token)
    const email = params.email ?? ''
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
