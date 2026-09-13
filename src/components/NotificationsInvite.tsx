/**
 * L'INVITATION À ACTIVER LES NOTIFICATIONS — une seule touche, en face.
 *
 * ── Pourquoi ce bandeau existe ──────────────────────────────────────
 * Tout était prêt côté serveur depuis des semaines — clés VAPID, envois,
 * quatre alertes — et pourtant la table des abonnements est restée
 * VIDE : le seul bouton capable d'en créer un vivait dans un onglet de
 * réglages, dans une carte, en bas de page. Personne ne l'a trouvé.
 * Trois échanges ont été nécessaires pour en arriver à « je ne reçois
 * que des e-mails ».
 *
 * Une fonction qui exige d'être cherchée n'existe pas. Ce bandeau met
 * donc la seule action manquante là où elle ne peut pas être manquée :
 * au-dessus de l'application, dès la connexion.
 *
 * ── Ce qu'il ne fait pas ────────────────────────────────────────────
 * Il ne demande RIEN au navigateur tant qu'on n'a pas touché le bouton :
 * une demande d'autorisation qui surgit toute seule est refusée par
 * réflexe, et un refus est définitif — il faut ensuite passer par les
 * réglages du système pour revenir en arrière. La permission ne se
 * demande donc qu'après un geste explicite.
 *
 * Il ne s'affiche que si l'abonnement est RÉELLEMENT possible ici :
 * `pushStatus()` a déjà écarté l'adresse de développement, l'iPhone non
 * installé, le refus antérieur et l'absence de clés serveur.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BellRing, X, Loader2 } from 'lucide-react'
import { usePushSubscription } from '@/hooks/useTaskReminders'
import { sendTestPush } from '@/lib/pushClient'
import { toast } from 'sonner'

/* Repoussé, pas enterré : une semaine. Le masquer pour toujours d'un
   geste distrait ramènerait au problème qu'on corrige. */
const CLE_REPORT = 'push_invite_reporte_au'
const UNE_SEMAINE = 7 * 24 * 60 * 60 * 1000

function reporteMaintenant(): boolean {
  try {
    const jusqua = Number(localStorage.getItem(CLE_REPORT) ?? 0)
    return Number.isFinite(jusqua) && Date.now() < jusqua
  } catch { return false }
}

export default function NotificationsInvite() {
  const push = usePushSubscription()
  const [reporte, setReporte] = useState(reporteMaintenant)
  const [enCours, setEnCours] = useState(false)

  /* L'état arrive de façon asynchrone : on ne montre rien tant qu'on ne
     sait pas, plutôt que de faire clignoter un bandeau au chargement. */
  const [pret, setPret] = useState(false)
  useEffect(() => { if (push.status) setPret(true) }, [push.status])

  const visible = pret && !reporte && push.status?.state === 'available'

  const reporter = () => {
    try { localStorage.setItem(CLE_REPORT, String(Date.now() + UNE_SEMAINE)) } catch { /* stockage refusé */ }
    setReporte(true)
  }

  const activer = async () => {
    setEnCours(true)
    try {
      await push.enable()
      /* Une notification de bienvenue immédiatement : la preuve que ça
         marche vaut mieux qu'un message disant que ça marche. */
      const res = await sendTestPush().catch(() => null)
      if (res?.delivered) toast.success('C\'est fait — vous venez de recevoir votre première notification.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="mx-4 mt-3 mb-1 flex items-center gap-3 px-4 py-3 rounded-xl
                     border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-indigo-500/10"
        >
          <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Recevoir les alertes sur cet appareil
            </p>
            <p className="text-xs text-muted-foreground">
              Paiements, retards, mises à jour de l'équipe — même application fermée.
            </p>
          </div>
          <button
            type="button"
            onClick={activer}
            disabled={enCours || push.busy}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold
                       bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60"
          >
            {enCours || push.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
            Activer
          </button>
          <button
            type="button"
            onClick={reporter}
            title="Plus tard"
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
            <span className="sr-only">Plus tard</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
