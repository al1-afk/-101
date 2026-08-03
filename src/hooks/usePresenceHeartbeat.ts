import { useEffect, useRef } from 'react'
import { securityApi } from '@/lib/api'

/* ─────────────────────────────────────────────────────────────────
   Présence utilisateur — heartbeat.

   Pourquoi un battement plutôt que « le JWT est valide » : un access
   token vit 1 h. Sans signal périodique, un onglet fermé, un poste
   verrouillé ou un utilisateur parti déjeuner resteraient affichés
   « en ligne » pendant une heure — la réponse à « combien de personnes
   utilisent la plateforme ? » serait fausse par construction.

   Coût maîtrisé : une écriture par minute et par onglet ACTIF. Quand
   l'onglet passe en arrière-plan, le battement s'arrête (le serveur
   fera basculer la session en « inactif » après 2 min, puis hors ligne
   après 15 min) ; il reprend au retour au premier plan.
───────────────────────────────────────────────────────────────── */

const SESSION_KEY_STORAGE = 'gestiq_presence_session'
const HEARTBEAT_MS = 60_000

/** Identifiant d'onglet, 32 hex. Aucun privilège : le serveur rattache
    toujours la présence au user/tenant du JWT, jamais à cette clé. */
function getSessionKey(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY_STORAGE)
    if (existing && /^[0-9a-f]{32}$/i.test(existing)) return existing
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    const key = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    sessionStorage.setItem(SESSION_KEY_STORAGE, key)
    return key
  } catch {
    /* sessionStorage indisponible (mode privé strict) : clé éphémère. */
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  }
}

export function getPresenceSessionKey(): string {
  return getSessionKey()
}

export function usePresenceHeartbeat(enabled: boolean): void {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!enabled) return
    const sessionKey = getSessionKey()

    /* Un échec de heartbeat n'a aucune conséquence fonctionnelle : le
       monitoring est une couche d'observation, il ne doit jamais
       remonter d'erreur à l'utilisateur ni casser un écran. */
    const beat = () => { void securityApi.heartbeat(sessionKey).catch(() => {}) }

    const start = () => {
      if (timer.current) return
      beat()
      timer.current = setInterval(beat, HEARTBEAT_MS)
    }
    const stop = () => {
      if (!timer.current) return
      clearInterval(timer.current)
      timer.current = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [enabled])
}
