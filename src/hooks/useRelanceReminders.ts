/**
 * useRelanceReminders — rappels des relances prospects.
 * Programme, tant que l'app est ouverte, un rappel :
 *   • 5 minutes AVANT l'heure de relance (relance_at),
 *   • puis à l'heure exacte (« c'est le moment d'appeler »),
 * afin de ne jamais rater / retarder un appel.
 *
 * Chaque rappel déclenche : un toast in-app (temps réel), une notification
 * navigateur si l'app est en arrière-plan, et un petit bip. Chaque échéance
 * n'est jouée qu'une seule fois (mémorisé dans localStorage, ré-armé si la
 * relance est reprogrammée à une nouvelle heure).
 */
import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { tokenStore } from '@/lib/api'
import { useProspects } from '@/hooks/useProspects'
import { showBrowserNotification } from '@/lib/browserNotifications'

const LEAD_MINUTES = 5
const FIRED_KEY    = 'gestiq_relance_reminders_fired'
const HORIZON_MS   = 24 * 60 * 60 * 1000

function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch { return new Set() }
}
function saveFired(fired: Set<string>) {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(Array.from(fired).slice(-300))) } catch { /* ignore */ }
}

/* Petit bip (Web Audio) — best-effort, silencieux si bloqué par le navigateur. */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'; o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32)
    o.start(); o.stop(ctx.currentTime + 0.34)
    setTimeout(() => { try { ctx.close() } catch { /* ignore */ } }, 600)
  } catch { /* ignore */ }
}

export function useRelanceReminders() {
  const isAuthed = !!tokenStore.get()
  const navigate = useNavigate()
  const location = useLocation()

  const { data: prospects = [] } = useProspects()

  const timeoutsRef = useRef<number[]>([])
  const firedRef    = useRef<Set<string>>(loadFired())

  useEffect(() => {
    timeoutsRef.current.forEach(id => clearTimeout(id))
    timeoutsRef.current = []
    if (!isAuthed || prospects.length === 0) return

    const now     = Date.now()
    const leadMs  = LEAD_MINUTES * 60 * 1000
    const tenant  = location.pathname.split('/').filter(Boolean)[0] || ''

    const fire = (
      key: string,
      p: { id: string; nom: string; entreprise: string | null; telephone: string | null },
      kind: 'lead' | 'now',
    ) => {
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)
      saveFired(firedRef.current)

      const who   = p.entreprise ? `${p.nom} · ${p.entreprise}` : p.nom
      const url   = tenant ? `/${tenant}/prospects/${p.id}` : `/prospects/${p.id}`
      const title = kind === 'lead' ? `⏰ Relance dans ${LEAD_MINUTES} min` : '📞 C’est le moment d’appeler'
      const body  = p.telephone ? `${who} · ${p.telephone}` : who

      beep()
      toast(title, {
        description: body,
        duration: kind === 'now' ? 20000 : 12000,
        action: { label: 'Voir', onClick: () => navigate(url) },
      })
      showBrowserNotification({ title: `${title} — NEXT GITAL`, body, url, tag: `relance-${p.id}`, icon: '/icon-192.png' })
    }

    for (const p of prospects) {
      if (p.statut === 'gagne' || p.statut === 'perdu') continue
      const iso = p.relance_at
      if (!iso) continue
      const relanceMs = new Date(iso).getTime()
      if (Number.isNaN(relanceMs)) continue

      const stamp = String(relanceMs)   // ré-arme si l'heure change
      const points: Array<{ at: number; kind: 'lead' | 'now'; key: string }> = [
        { at: relanceMs - leadMs, kind: 'lead', key: `${p.id}-${stamp}-lead` },
        { at: relanceMs,          kind: 'now',  key: `${p.id}-${stamp}-now`  },
      ]

      for (const pt of points) {
        if (firedRef.current.has(pt.key)) continue
        if (pt.at < now - 30 * 1000) continue      // trop ancien
        if (pt.at > now + HORIZON_MS) continue      // au-delà de 24 h
        const delay = Math.max(0, pt.at - now)
        const id = window.setTimeout(() => fire(pt.key, p, pt.kind), delay)
        timeoutsRef.current.push(id)
      }
    }

    return () => {
      timeoutsRef.current.forEach(id => clearTimeout(id))
      timeoutsRef.current = []
    }
  }, [prospects, isAuthed, navigate, location.pathname])
}
