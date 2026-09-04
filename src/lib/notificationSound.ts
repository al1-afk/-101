/**
 * Petit son de notification (Web Audio API — pas de fichier mp3 nécessaire).
 * Un bip court "ding" en deux tons. Respecte la préférence utilisateur
 * stockée dans localStorage (gestiq_notif_sound = 'on' | 'off').
 */

const STORAGE_KEY = 'gestiq_notif_sound'

export type SoundPref = 'on' | 'off'

/** Signature sonore demandée. 'default' = le bip historique de la cloche. */
export type SoundVariant = 'default' | 'message' | 'urgent'

export function getSoundPref(): SoundPref {
  try {
    return (localStorage.getItem(STORAGE_KEY) as SoundPref) ?? 'on'
  } catch { return 'on' }
}

export function setSoundPref(v: SoundPref) {
  try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
}

let ctx: AudioContext | null = null

/* ── Pourquoi un « déverrouillage » est indispensable ────────────────
   Les navigateurs interdisent à une page de faire du bruit tant que la
   personne n'a rien fait dessus : un AudioContext créé sans geste naît
   « suspended », et un resume() qui ne suit pas un geste est REFUSÉ.
   Concrètement, sans ce qui suit, la première notification de la session
   — celle qui arrive pendant qu'on lit une autre page — était toujours
   muette, et elle le restait tant que l'onglet n'avait pas été cliqué.

   On profite donc du tout premier geste (clic, touche, contact tactile)
   pour créer ET réveiller le contexte, une fois pour toutes. Les
   écouteurs se retirent d'eux-mêmes : ils ne servent qu'une fois. */
let unlockInstalled = false

function ensureContext(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    return ctx
  } catch {
    return null
  }
}

export function unlockNotificationSound(): void {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true

  const unlock = () => {
    const ac = ensureContext()
    if (!ac) return remove()
    /* Ici on est DANS un geste : le navigateur accepte le réveil. */
    void ac.resume().catch(() => {})
    if (ac.state === 'running') remove()
  }
  const remove = () => {
    for (const evt of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.removeEventListener(evt, unlock)
    }
  }
  for (const evt of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(evt, unlock, { passive: true })
  }
}

/** Programme les notes d'une variante sur un contexte DÉJÀ réveillé. */
function schedule(ac: AudioContext, variant: SoundVariant): void {
  /* `currentTime` n'avance pas tant que le contexte dort : lire l'horloge
     avant le réveil placerait toutes les notes dans le passé, et elles
     seraient jouées toutes en même temps — ou pas du tout. */
  const now = ac.currentTime
  for (const { freq, start, dur, gain: peak, type } of VARIANTS[variant] ?? VARIANTS.default) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type ?? 'sine'
    osc.frequency.value = freq
    /* Attaque et extinction rapides : un « ding » doux, pas un bip d'alarme. */
    gain.gain.setValueAtTime(0, now + start)
    gain.gain.linearRampToValueAtTime(peak, now + start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(now + start)
    osc.stop(now + start + dur)
  }
}

interface Note {
  freq:  number
  start: number
  dur:   number
  gain:  number
  type?: OscillatorType
}

/* Trois timbres distincts : la messagerie interne peut sonner plusieurs
   fois par heure, et un message urgent doit s'entendre comme urgent sans
   que l'utilisateur ait à regarder l'écran. Le timbre 'default' est repris
   à l'identique de l'ancien bip pour ne rien changer aux appels existants. */
const VARIANTS: Record<SoundVariant, Note[]> = {
  /* Deux notes successives — A5 puis E6 (octave supérieure) */
  default: [
    { freq: 880,  start: 0,    dur: 0.12, gain: 0.15 },
    { freq: 1318, start: 0.10, dur: 0.18, gain: 0.15 },
  ],
  /* Message reçu : même montée, mais plus courte et deux fois moins forte —
     c'est le son qui revient le plus souvent, il doit rester discret. */
  message: [
    { freq: 1046, start: 0,    dur: 0.08, gain: 0.09 },
    { freq: 1396, start: 0.06, dur: 0.11, gain: 0.07 },
  ],
  /* Urgent : trois notes DESCENDANTES en triangle. Aucun autre signal de
     l'application ne descend — c'est ce qui le rend reconnaissable. */
  urgent: [
    { freq: 1318, start: 0,    dur: 0.16, gain: 0.20, type: 'triangle' },
    { freq: 1046, start: 0.15, dur: 0.16, gain: 0.20, type: 'triangle' },
    { freq: 784,  start: 0.30, dur: 0.28, gain: 0.22, type: 'triangle' },
  ],
}

/**
 * Joue la signature sonore demandée. Sans effet si la personne a coupé
 * le son.
 *
 * `force` ignore la préférence : réservé au bouton « Tester le son » des
 * réglages, où l'on veut entendre ce qu'on est en train de régler.
 */
export function playNotificationSound(variant: SoundVariant = 'default', force = false) {
  if (!force && getSoundPref() !== 'on') return
  const ac = ensureContext()
  if (!ac) return
  try {
    if (ac.state === 'suspended') {
      /* On programme APRÈS le réveil, jamais avant. Si le navigateur
         refuse (aucun geste depuis le chargement), la promesse échoue et
         le son est simplement perdu — le toast, lui, reste visible. */
      void ac.resume().then(() => schedule(ac, variant)).catch(() => {})
      return
    }
    schedule(ac, variant)
  } catch { /* contexte audio indisponible */ }
}
