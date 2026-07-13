/**
 * Authentication hook for team_member tokens.
 * Distinct from useAuth — admins and members are stored in separate
 * localStorage slots so logging in as a member doesn't kick out an admin
 * (or vice-versa) on the same browser.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { memberAuthApi, memberTokenStore } from '@/lib/api'

export interface MemberProfile {
  id:           string
  tenant_id:    string
  tenant_slug:  string
  tenant_name:  string
  first_name:   string
  last_name:    string
  email:        string
  job_title:    string | null
  member_type:  string
  avatar_url:   string | null
  account_status: string
  access:       { category: string; level: string }[]
}

interface MemberState {
  loading:  boolean
  isAuth:   boolean
  member:   MemberProfile | null
}

const INITIAL: MemberState = { loading: true, isAuth: false, member: null }

function parseJwt(token: string): any {
  try { return JSON.parse(atob(token.split('.')[1])) } catch { return null }
}

export function useMember() {
  const navigate = useNavigate()
  const [state, setState] = useState<MemberState>(INITIAL)

  useEffect(() => {
    const token = memberTokenStore.get()
    if (!token) { setState({ ...INITIAL, loading: false }); return }
    const payload = parseJwt(token)
    /* JWT corrompu (non parsable) → clear. JWT expiré côté client → on
       laisse api.ts déclencher un refresh silencieux au premier /me. */
    if (!payload) {
      memberTokenStore.clear()
      setState({ ...INITIAL, loading: false })
      return
    }
    /* Hydratation optimiste immédiate — l'UI s'affiche connectée tout de
       suite pendant que /me confirme en arrière-plan. */
    setState(prev => ({ ...prev, loading: true, isAuth: true }))
    memberAuthApi.me()
      .then(member => setState({ loading: false, isAuth: true, member }))
      .catch(err => {
        /* api.ts a déjà purgé si AUTH_INVALID (message 'Session expirée')
           OU si erreur transient (5xx, network) → on garde la session
           hydratée pour ne pas déconnecter injustement. */
        const msg = String(err?.message ?? '')
        if (msg === 'Session expirée') {
          setState({ ...INITIAL, loading: false })
        } else {
          setState(prev => ({ ...prev, loading: false }))
        }
      })
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await memberAuthApi.login(email, password)
    memberTokenStore.set(data.token)
    const member = await memberAuthApi.me()
    setState({ loading: false, isAuth: true, member })
    navigate('/my-space', { replace: true })
    return data
  }, [navigate])

  const acceptInvite = useCallback(async (token: string, password: string) => {
    const data = await memberAuthApi.acceptInvite(token, password)
    memberTokenStore.set(data.token)
    const member = await memberAuthApi.me()
    setState({ loading: false, isAuth: true, member })
    navigate('/my-space', { replace: true })
    return data
  }, [navigate])

  const signOut = useCallback(async () => {
    await memberAuthApi.logout()
    memberTokenStore.clear()
    setState({ ...INITIAL, loading: false })
    navigate('/team-login', { replace: true })
  }, [navigate])

  return { ...state, signIn, acceptInvite, signOut }
}
