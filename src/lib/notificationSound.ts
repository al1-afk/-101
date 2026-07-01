/**
 * Petit son de notification (Web Audio API — pas de fichier mp3 nécessaire).
 * Un bip court "ding" en deux tons. Respecte la préférence utilisateur
 * stockée dans localStorage (gestiq_notif_sound = 'on' | 'off').
 */

const STORAGE_KEY = 'gestiq_notif_sound'

export type SoundPref = 'on' | 'off'

export function getSoundPref(): SoundPref {
  try {
    return (localStorage.getItem(STORAGE_KEY) as SoundPref) ?? 'on'
  } catch { return 'on' }
}

export function setSoundPref(v: SoundPref) {
  try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ }
}

let ctx: AudioContext | null = null

/** Lecture d'un bip court (durée ~300ms). No-op si désactivé. */
export function playNotificationSound() {
  if (getSoundPref() !== 'on') return
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = ctx.currentTime
    /* Deux notes successives — A5 puis E6 (octave supérieure) */
    ;[
      { freq: 880, start: 0,    dur: 0.12 },
      { freq: 1318, start: 0.10, dur: 0.18 },
    ].forEach(({ freq, start, dur }) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      /* Attack + release rapides pour un son "ding" doux */
      gain.gain.setValueAtTime(0, now + start)
      gain.gain.linearRampToValueAtTime(0.15, now + start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(now + start)
      osc.stop(now + start + dur)
    })
  } catch { /* audio context blocked */ }
}
