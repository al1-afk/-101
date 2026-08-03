import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 *  Mémoire de navigation d'une liste (CRM, devis, factures…).
 *
 *  Objectif : ouvrir une fiche puis revenir à la liste EXACTEMENT là où on
 *  l'avait laissée — mêmes filtres, même page, même position de scroll — et
 *  repérer d'un coup d'œil la dernière fiche ouverte pour enchaîner sur la
 *  suivante sans rechercher sa ligne.
 *
 *  Règle importante : la restauration est ARMÉE (`pendingReturn`) par l'ouverture
 *  d'une fiche et CONSOMMÉE au retour sur la liste. Une arrivée « fraîche »
 *  (menu latéral, tableau de bord, F5) repart donc des filtres par défaut — ce
 *  qui garantit qu'une liste s'ouvre toujours sur son filtre par défaut plutôt
 *  que sur un filtre restreint oublié en session.
 *
 *  Stockage : sessionStorage (isolé par onglet, purgé à la déconnexion par
 *  clearSession()). Un stockage indisponible (Safari privé strict) dégrade
 *  silencieusement vers « pas de mémoire » — jamais d'exception.
 */

interface Snapshot<F> {
  filters:      F
  page:         number
  scrollY:      number
  lastOpenedId: string | null
  /** true entre l'ouverture d'une fiche et le retour sur la liste. */
  pendingReturn: boolean
}

/** Clé de stockage, scopée par liste ET par tenant (routes /:tenantSlug/…). */
export function listNavKey(list: string, tenantSlug?: string | null): string {
  return `gestiq_${list}_nav_${tenantSlug || 'default'}`
}

function readSnapshot<F>(key: string): Partial<Snapshot<F>> | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeSnapshot(key: string, snap: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(snap)) } catch { /* ignore */ }
}

/**
 *  À appeler au montage de la FICHE de détail : mémorise l'élément ouvert et
 *  arme la restauration de la liste. Couvre les entrées qui ne passent pas par
 *  la liste (lien d'une notification de relance, URL collée, recherche
 *  globale) — sans quoi la liste surlignerait la mauvaise ligne au retour.
 */
export function markListItemOpened(key: string, id: string) {
  const prev = readSnapshot<unknown>(key) ?? {}
  writeSnapshot(key, { ...prev, lastOpenedId: id, pendingReturn: true })
}

export interface ListNavMemory<F> {
  /** Filtres à utiliser comme état initial (restaurés, sinon `defaultFilters`). */
  initialFilters: F
  /** Page de pagination à utiliser comme état initial (1 par défaut). */
  initialPage: number
  /** Id de la dernière fiche ouverte — sert à surligner sa ligne. */
  lastOpenedId: string | null
  /** À appeler JUSTE AVANT de naviguer vers la fiche : fige l'état courant. */
  remember: (id: string, filters: F, page: number) => void
}

/**
 *  @param key             clé de stockage (cf. `listNavKey`)
 *  @param defaultFilters  filtres d'une arrivée « fraîche » sur la liste
 *  @param ready           true quand les lignes sont rendues (la hauteur du
 *                         document est alors exploitable pour le scroll)
 */
export function useListNavMemory<F>(
  key: string,
  defaultFilters: F,
  ready: boolean,
): ListNavMemory<F> {
  /* Lu UNE SEULE fois au montage : les valeurs restaurées servent d'état
     initial, elles ne doivent plus bouger ensuite. */
  const snapRef = useRef<Partial<Snapshot<F>> | null>(null)
  if (snapRef.current === null) {
    const stored = readSnapshot<F>(key) ?? {}
    snapRef.current = stored.pendingReturn
      /* Retour d'une fiche : on restaure tout. */
      ? stored
      /* Arrivée fraîche : filtres/page/scroll par défaut. On garde seulement
         le surlignage de la dernière fiche consultée, utile comme repère. */
      : { lastOpenedId: stored.lastOpenedId ?? null }
  }
  const snap = snapRef.current

  /* Désarme APRÈS le montage — jamais pendant le rendu. Sous StrictMode la
     fonction du composant est appelée deux fois : un désarmement en rendu
     ferait lire `pendingReturn: false` au 2ᵉ passage et la restauration
     serait perdue en développement. */
  useEffect(() => {
    const stored = readSnapshot<F>(key)
    if (stored?.pendingReturn) writeSnapshot(key, { ...stored, pendingReturn: false })
  }, [key])

  const [lastOpenedId, setLastOpenedId] = useState<string | null>(snap.lastOpenedId ?? null)

  const remember = useCallback((id: string, filters: F, page: number) => {
    setLastOpenedId(id)
    writeSnapshot(key, {
      filters, page, scrollY: window.scrollY, lastOpenedId: id, pendingReturn: true,
    })
  }, [key])

  /* ── Restauration du scroll ──────────────────────────────────────
     On attend que les lignes soient dans le DOM, puis on repositionne sur
     quelques frames : la hauteur du document grandit encore (animations
     d'entrée framer-motion, polices, images), un seul scrollTo arriverait
     trop tôt et serait écrasé. */
  const restoredRef = useRef(false)
  useLayoutEffect(() => {
    if (restoredRef.current || !ready) return
    restoredRef.current = true

    const target = snap.scrollY ?? 0
    if (target <= 0) return

    let frames = 0
    let raf = 0
    const tick = () => {
      window.scrollTo(0, target)
      /* Tant que le document est trop court, scrollY reste sous la cible :
         on retente jusqu'à ~20 frames (≈ 330 ms) puis on abandonne. */
      if (Math.abs(window.scrollY - target) > 2 && frames++ < 20) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready, snap.scrollY])

  return {
    initialFilters: (snap.filters ?? defaultFilters) as F,
    initialPage:    typeof snap.page === 'number' && snap.page > 0 ? snap.page : 1,
    lastOpenedId,
    remember,
  }
}
