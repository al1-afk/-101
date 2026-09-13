/**
 * RECEVOIR LES NOTIFICATIONS SUR CET APPAREIL.
 *
 * ── Pourquoi cette carte existe ─────────────────────────────────────
 * L'abonnement push était possible depuis un seul endroit de toute
 * l'application : la carte « Rappels de tâches », tout en bas de l'onglet
 * Notifications. Quelqu'un qui cherche « pourquoi je ne reçois rien sur
 * mon téléphone » ne va pas le chercher là — et le 13/09/2026, personne
 * ne l'avait trouvé : la table des abonnements était vide alors que le
 * serveur poussait depuis des semaines.
 *
 * ── Ce qu'elle règle sur iPhone ─────────────────────────────────────
 * Safari n'expose l'API de notifications QUE dans une application
 * ajoutée à l'écran d'accueil. Dans un onglet ordinaire, l'ancien écran
 * affichait « ce navigateur ne gère pas les notifications » et grisait
 * le bouton : un cul-de-sac, alors qu'il manquait un seul geste. Cette
 * carte le nomme, dans l'ordre, et garde le bouton visible.
 *
 * Elle n'invente aucune règle : tout l'état vient de `pushStatus()`,
 * qui interroge le navigateur ET le serveur.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  BellRing, CheckCircle2, AlertTriangle, Smartphone, Share, Loader2, Send, BellOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { usePushSubscription, usePushDevices } from '@/hooks/useTaskReminders'
import { sendTestPush } from '@/lib/pushClient'

/** Les trois gestes d'un iPhone, dans l'ordre où ils doivent être faits. */
const GESTES_IOS = [
  { icone: Share,      texte: 'Bouton Partager, en bas de Safari' },
  { icone: Smartphone, texte: '« Sur l\'écran d\'accueil », puis Ajouter' },
  { icone: BellRing,   texte: 'Rouvrir par l\'icône, puis revenir ici' },
]

export default function NotificationsAppareil() {
  const push = usePushSubscription()
  const { data: appareils = [] } = usePushDevices()
  const [test, setTest] = useState(false)

  const etat = push.status?.state
  const pret     = etat === 'ready'
  const aInstaller = etat === 'ios-a-installer'
  const bloque   = etat === 'denied' || etat === 'unsupported' || etat === 'server-off' || etat === 'no-sw'

  const envoyerTest = async () => {
    setTest(true)
    try {
      const res = await sendTestPush()
      const n = res?.delivered ?? 0
      if (n > 0) {
        toast.success(`Envoyée à ${n} appareil${n > 1 ? 's' : ''} — elle doit apparaître à l'instant.`)
      } else {
        /* Le serveur a bien répondu mais n'a joint personne : le dire
           franchement, sinon on attend une bannière qui ne viendra pas. */
        toast.error('Aucun appareil joint. Activez d\'abord les notifications sur cet appareil.')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Envoi impossible')
    } finally {
      setTest(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-premium p-5 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          pret ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
               : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
        }`}>
          {pret ? <CheckCircle2 className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">
            Notifications sur cet appareil
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paiements, retards, mises à jour de l'équipe et rappels — même application fermée.
          </p>
        </div>
      </div>

      {/* État, dans les mots du navigateur et du serveur. */}
      <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs leading-relaxed ${
        pret       ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : aInstaller ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
        : bloque   ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                   : 'bg-muted/40 text-muted-foreground'
      }`}>
        {pret ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              : bloque ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              : <BellRing className="w-4 h-4 flex-shrink-0 mt-0.5" />}
        <span>{push.status?.reason ?? 'Vérification…'}</span>
      </div>

      {/* iPhone : les trois gestes, nommés. */}
      {aInstaller && (
        <ol className="space-y-2">
          {GESTES_IOS.map((g, i) => {
            const Icone = g.icone
            return (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <Icone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground">{g.texte}</span>
              </li>
            )
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {pret ? (
          <>
            <Button size="sm" onClick={envoyerTest} disabled={test}>
              {test ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Recevoir un test
            </Button>
            <Button size="sm" variant="ghost" onClick={push.disable} disabled={push.busy}>
              <BellOff className="w-4 h-4" />
              Ne plus recevoir ici
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={push.enable}
            /* Sur iPhone non installé, le bouton reste VISIBLE mais
               inopérant : le griser sans rien dire était précisément le
               cul-de-sac qu'on corrige. Les trois gestes sont juste
               au-dessus. */
            disabled={push.busy || aInstaller || etat === 'unsupported' || etat === 'no-sw'}
          >
            {push.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
            Activer sur cet appareil
          </Button>
        )}
      </div>

      {appareils.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {appareils.length} appareil{appareils.length > 1 ? 's' : ''} abonné{appareils.length > 1 ? 's' : ''} à ce compte.
        </p>
      )}
    </motion.div>
  )
}
