/**
 * Réglages « Messages privés » — Paramètres → Notifications.
 *
 * Sept canaux, un par ligne, chacun expliqué en une phrase : personne ne devrait
 * avoir à deviner la différence entre « fenêtre surgissante » et « notification
 * navigateur ». Le premier est un bandeau dans l'onglet ouvert, le second
 * traverse l'onglet fermé — ce sont deux besoins différents, d'où deux
 * interrupteurs.
 *
 * L'enregistrement est immédiat, sans bouton : ces réglages se changent un par
 * un, souvent en réaction à une gêne (« coupe-moi ce son »), et un bouton
 * « Enregistrer » oublié laisserait le son en place. Le retour visuel reste
 * discret pour ne pas faire clignoter la page à chaque bascule.
 *
 * Les deux dernières lignes concernent l'e-mail : elles n'ont d'effet que si
 * l'espace laisse partir cette catégorie d'e-mails (panneau « Envois
 * automatiques » juste au-dessus), d'où la précision affichée sous le bloc.
 *
 * Le panneau sert les DEUX espaces (`as`) : l'employé reçoit plus de messages
 * que personne, il doit pouvoir couper son, push et e-mail depuis son profil —
 * pas seulement l'administrateur depuis Paramètres. `as` choisit le jeton et
 * donc la ligne de préférences lue et écrite ; il ajuste aussi le repère
 * « Envois automatiques », panneau qui n'existe que côté administrateur.
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  MessageCircle, Bell, MessageSquare, Volume2, Monitor, Smartphone, Mail, MailWarning,
  Check, Loader2, BellRing, Play,
} from 'lucide-react'
import { playNotificationSound } from '@/lib/notificationSound'
import { cn } from '@/lib/utils'
import { useMessagesPrefs } from '@/hooks/useMessaging'
import type { DmPrefs } from '@/lib/api'

interface MessagesNotifSettingsProps {
  /** Espace appelant. Défaut 'admin' : l'appel existant de Parametres.tsx
   *  n'a pas à être touché. */
  as?: 'admin' | 'member'
}

export default function MessagesNotifSettings({ as = 'admin' }: MessagesNotifSettingsProps) {
  const { prefs, save, isSaving } = useMessagesPrefs(as)
  const [justSaved, setJustSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Le témoin se déclenche au geste, pas à la réponse du serveur : la bascule
     est optimiste côté hook, et un échec réel remonte de lui-même en toast. */
  const set = (patch: Partial<DmPrefs>) => {
    save(patch)
    setJustSaved(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setJustSaved(false), 2_000)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  /* ── Essai en conditions réelles ──────────────────────────────────
     Reproduit exactement ce qui se passe à l'arrivée d'un message : le
     même bandeau et la même sonorité. Deux raisons d'en faire un bouton
     plutôt qu'une phrase :
       • un réglage de son qu'on ne peut pas entendre se règle à l'aveugle ;
       • le navigateur n'autorise le son QU'APRÈS un geste sur la page.
         Ce clic en est un : il réveille le contexte audio pour toute la
         session, et les notifications suivantes s'entendront vraiment.
     Le son est joué en mode « forcé » : on veut l'entendre même quand
     l'interrupteur est sur coupé, puisque c'est un essai et non une
     notification. */
  const testerLeSignal = (urgent: boolean) => {
    playNotificationSound(urgent ? 'urgent' : 'message', true)
    toast(urgent ? '🔴 URGENT — aperçu du signal' : '💬 Aperçu du signal', {
      description: urgent
        ? "« Merci de venir dans mon bureau immédiatement. » — voici ce que vous verrez et entendrez pour un message urgent."
        : "« Peux-tu venir me voir ? » — voici ce que vous verrez et entendrez à l'arrivée d'un message.",
      duration: urgent ? 8_000 : 5_000,
    })
  }

  return (
    <div className={cn(
      'p-6 space-y-5',
      /* MyProfile compose ses blocs en cartes slate : card-premium y ferait
         une pièce rapportée. */
      as === 'member'
        ? 'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800'
        : 'card-premium',
    )}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Messages privés
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Comment être prévenu quand quelqu'un de l'espace vous écrit.
          </p>
        </div>

        <span className={cn(
          'text-[11px] flex items-center gap-1.5 transition-opacity duration-200',
          isSaving || justSaved ? 'opacity-100' : 'opacity-0',
          justSaved ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
        )}>
          {isSaving
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Enregistrement…</>
            : <><Check className="w-3 h-3" /> Enregistré</>}
        </span>
      </div>

      {/* ── Dans l'application ────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-foreground mb-2">Dans l'application</label>
        <div className="space-y-2">
          <PrefRow
            icon={Bell} label="Notification dans l'application"
            hint="Le message alimente la cloche et la pastille rouge du menu — une trace qui reste, même si vous n'étiez pas devant l'écran."
            checked={prefs.inapp_enabled}
            onChange={v => set({ inapp_enabled: v })}
          />
          <PrefRow
            icon={MessageSquare} label="Fenêtre surgissante"
            hint="Un bandeau cliquable apparaît sur la page en cours, avec un raccourci vers la conversation."
            checked={prefs.popup_enabled}
            onChange={v => set({ popup_enabled: v })}
          />
          <PrefRow
            icon={Volume2} label="Son"
            hint="Un signal court à l'arrivée du message ; les messages urgents ont leur propre sonorité."
            checked={prefs.sound_enabled}
            onChange={v => set({ sound_enabled: v })}
          />

          {/* Essai du signal — bandeau et son, exactement comme en vrai. */}
          <div className="flex flex-wrap items-center gap-2 pl-1">
            <button
              type="button"
              onClick={() => testerLeSignal(false)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium
                         text-blue-700 dark:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20
                         border border-blue-500/20 transition-colors active:scale-[0.98]"
            >
              <Play className="w-3.5 h-3.5" /> Tester la notification
            </button>
            <button
              type="button"
              onClick={() => testerLeSignal(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium
                         text-red-700 dark:text-red-300 bg-red-500/10 hover:bg-red-500/20
                         border border-red-500/20 transition-colors active:scale-[0.98]"
            >
              <BellRing className="w-3.5 h-3.5" /> Tester le signal urgent
            </button>
            <span className="text-[11px] text-muted-foreground">
              Le navigateur n'autorise le son qu'après un clic sur la page — celui-ci l'active pour la session.
            </span>
          </div>
        </div>
      </div>

      {/* ── Hors de l'onglet ──────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-foreground mb-2">Quand vous n'êtes pas sur l'application</label>
        <div className="space-y-2">
          <PrefRow
            icon={Monitor} label="Notification navigateur"
            hint="S'affiche même si l'onglet NEXT GITAL est en arrière-plan ou réduit."
            checked={prefs.browser_enabled}
            onChange={v => set({ browser_enabled: v })}
          />
          <PrefRow
            icon={Smartphone} label="Notification mobile (push)"
            hint="Part sur les appareils abonnés — téléphone et application installée — même navigateur fermé."
            checked={prefs.push_enabled}
            onChange={v => set({ push_enabled: v })}
          />
        </div>
      </div>

      {/* ── E-mail ────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-foreground mb-2">Par e-mail</label>
        <div className="space-y-2">
          <PrefRow
            icon={Mail} label="E-mail à chaque message"
            hint="Un e-mail pour chaque message reçu : utile si vous n'ouvrez l'application que de temps en temps."
            checked={prefs.email_enabled}
            onChange={v => set({ email_enabled: v })}
          />
          <PrefRow
            icon={MailWarning} label="E-mail pour les messages urgents"
            hint="Même sans e-mail systématique, un message marqué « urgent » vous rattrape dans votre boîte."
            checked={prefs.urgent_email_enabled}
            onChange={v => set({ urgent_email_enabled: v })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {as === 'member' ? (
            <>
              Votre administrateur peut couper globalement cette catégorie d'e-mails pour
              tout l'espace : tant qu'elle est coupée, ces deux réglages n'envoient rien.
            </>
          ) : (
            <>
              L'espace peut couper globalement cette catégorie d'e-mails dans
              <strong className="text-foreground"> « Envois automatiques »</strong> ci-dessus : tant qu'elle
              est coupée là-bas, ces deux réglages n'envoient rien.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function PrefRow({
  icon: Icon, label, hint, checked, onChange,
}: {
  icon: React.ElementType
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  /* La bascule reprend TRAIT POUR TRAIT celle des « Notifications système »
     juste au-dessus (src/pages/Parametres.tsx) : deux panneaux voisins qui
     règlent la même chose ne doivent pas avoir deux commandes différentes.
     Une case à cocher standard, ici, se voyait immédiatement comme une pièce
     rapportée. */
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 text-left rounded-lg border border-border px-3 py-2.5
                 hover:border-electric-500/30 transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {label}
        </span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">{hint}</span>
      </span>
      <span className={cn(
        'w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5',
        checked ? 'bg-blue-600' : 'bg-border',
      )}>
        <span className={cn(
          'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all',
          checked ? 'right-0.5' : 'left-0.5',
        )} />
      </span>
    </button>
  )
}
