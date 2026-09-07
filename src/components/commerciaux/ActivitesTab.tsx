/**
 * Onglet « Activités » de la fiche commerciale.
 *
 * ── Une honnêteté à afficher ───────────────────────────────────────
 * Jusqu'à la migration 103, `prospect_logs` ne portait que `auteur`, une
 * CHAÎNE écrite en dur à « Said » par une dizaine de points d'appel du
 * front. Les activités antérieures ne sont donc rattachables à personne,
 * et aucun rattrapage n'est possible. Plutôt que de les faire disparaître
 * ou, pire, de les attribuer au commercial affiché, l'écran le dit.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, AlertCircle, RefreshCw, StickyNote, PhoneCall, MessageSquare,
  Mail, CalendarClock, History, Pencil, Sparkles, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { commercialsApi, type CrmActivity } from '@/lib/api'
import { cn } from '@/lib/utils'

const ICONE: Record<string, React.ElementType> = {
  note: StickyNote, appel: PhoneCall, whatsapp: MessageSquare, email: Mail,
  rdv: CalendarClock, relance: CalendarClock, creation: Sparkles,
  statut: History, edit: Pencil,
}

const TON: Record<string, string> = {
  note:     'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  appel:    'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  whatsapp: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  email:    'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  rdv:      'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  relance:  'bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

export default function ActivitesTab({ userId, nom }: { userId: string; nom: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['commercial-activities', userId],
    queryFn:  () => commercialsApi.activities(userId, 200),
    enabled:  !!userId,
  })

  const activites = useMemo(() => data?.activities ?? [], [data])
  const sansAuteur = useMemo(
    () => activites.filter(a => !a.auteur).length,
    [activites],
  )

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <AlertCircle className="w-7 h-7 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          {(error as Error)?.message ?? 'Activités indisponibles'}
        </p>
        <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" /> Réessayer
        </Button>
      </div>
    )
  }

  if (activites.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <History className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">Aucune activité enregistrée</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Les appels, notes, messages WhatsApp et relances que {nom} enregistrera depuis son espace
          apparaîtront ici, avec leur date et le prospect concerné.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sansAuteur > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 dark:text-amber-200">
            {sansAuteur} activité{sansAuteur > 1 ? 's' : ''} sans auteur identifié.
            Avant la mise à jour du module, le journal ne conservait qu'un nom en texte libre :
            ces lignes ne peuvent être attribuées à personne de façon fiable.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {activites.map(a => <Ligne key={a.id} a={a} />)}
      </div>
    </div>
  )
}

function Ligne({ a }: { a: CrmActivity }) {
  const Icone = ICONE[a.type] ?? StickyNote
  return (
    <div className="p-3 flex items-start gap-3">
      <span className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        TON[a.type] ?? 'bg-muted text-muted-foreground',
      )}>
        <Icone className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {a.type}
          </span>
          {a.prospect_nom && (
            <span className="text-[11px] text-foreground font-medium truncate">· {a.prospect_nom}</span>
          )}
        </div>
        <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words">{a.message}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {new Date(a.created_at).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
          {a.auteur ? ` · ${a.auteur}` : ' · auteur inconnu'}
          {a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}
        </p>
      </div>
    </div>
  )
}
