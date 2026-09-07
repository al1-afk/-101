/**
 * Onglet « Performance commerciale ».
 *
 * ── Ce qui est affiché, et ce qui ne l'est pas ──────────────────────
 * Le serveur calcule tous les chiffres, y compris le taux de conversion.
 * L'écran ne recalcule RIEN : deux formules — l'une ici, l'autre côté
 * serveur — finiraient par afficher deux taux différents sur la même
 * page dès que les périodes cessent de se recouvrir exactement.
 *
 * Quand une valeur n'est pas mesurable (le chiffre d'affaires n'est
 * rattachable à personne tant qu'aucun paiement ne porte de client), on
 * affiche « — » et on explique pourquoi. Un zéro se lirait comme une
 * mesure : « ce commercial n'a rien vendu », alors que la vérité est
 * « on ne sait pas ».
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2, AlertCircle, RefreshCw, Users, PhoneCall, Activity as ActivityIcon,
  FileText, UserCheck, Building2, Coins, Percent, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { commercialsApi, type CrmPerformanceKpis } from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'

/* ── Périodes ────────────────────────────────────────────────────
   Les bornes sont calculées ICI et envoyées au serveur : sans elles, il
   appliquerait sa période par défaut, et deux écrans ouverts côte à côte
   afficheraient des chiffres différents sans qu'on sache pourquoi. */
type Cle = 'jour' | 'semaine' | 'mois' | 'trimestre' | 'annee' | 'perso'

const iso = (d: Date) => d.toISOString().slice(0, 10)

function bornes(cle: Cle, maintenant = new Date()): { from?: string; to?: string } {
  const d = new Date(maintenant)
  const fin = iso(d)
  switch (cle) {
    case 'jour':
      return { from: fin, to: fin }
    case 'semaine': {
      /* Semaine ISO : lundi comme premier jour, pas dimanche. */
      const jour = (d.getDay() + 6) % 7
      const lundi = new Date(d)
      lundi.setDate(d.getDate() - jour)
      return { from: iso(lundi), to: fin }
    }
    case 'mois':
      return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: fin }
    case 'trimestre': {
      const premierMois = Math.floor(d.getMonth() / 3) * 3
      return { from: iso(new Date(d.getFullYear(), premierMois, 1)), to: fin }
    }
    case 'annee':
      return { from: iso(new Date(d.getFullYear(), 0, 1)), to: fin }
    default:
      return {}
  }
}

const PERIODES: { cle: Cle; label: string }[] = [
  { cle: 'jour',      label: "Aujourd'hui" },
  { cle: 'semaine',   label: 'Cette semaine' },
  { cle: 'mois',      label: 'Ce mois' },
  { cle: 'trimestre', label: 'Ce trimestre' },
  { cle: 'annee',     label: 'Cette année' },
  { cle: 'perso',     label: 'Personnalisé' },
]

export default function PerformanceTab({ userId, nom }: { userId: string; nom: string }) {
  const [cle, setCle]   = useState<Cle>('mois')
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  const periode = useMemo(
    () => (cle === 'perso' ? { from: from || undefined, to: to || undefined } : bornes(cle)),
    [cle, from, to],
  )

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['commercial-performance', userId, periode.from ?? '', periode.to ?? ''],
    queryFn:  () => commercialsApi.performance(userId, periode),
    enabled:  !!userId && (cle !== 'perso' || (!!from && !!to)),
  })

  const k = data?.kpis

  return (
    <div className="space-y-4">
      {/* ── Filtres de période ─────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarDays className="w-4 h-4 text-muted-foreground mr-1" />
          {PERIODES.map(p => (
            <button
              key={p.cle}
              onClick={() => setCle(p.cle)}
              className={cn(
                'h-8 px-3 rounded-lg text-[12px] font-medium transition-colors',
                cle === p.cle
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
          {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-1" />}
        </div>

        {cle === 'perso' && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">Du</span>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-40" />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">Au</span>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-40" />
            </label>
            {(!from || !to) && (
              <span className="text-[11px] text-muted-foreground pb-2">
                Choisissez les deux bornes pour lancer le calcul.
              </span>
            )}
          </div>
        )}

        {data?.periode?.from && (
          <p className="text-[11px] text-muted-foreground">
            Période retenue par le serveur : du {new Date(data.periode.from).toLocaleDateString('fr-FR')}
            {data.periode.to ? ` au ${new Date(data.periode.to).toLocaleDateString('fr-FR')}` : ''}.
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <AlertCircle className="w-7 h-7 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {(error as Error)?.message ?? 'Performance indisponible'}
          </p>
          <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Réessayer
          </Button>
        </div>
      ) : !k ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Choisissez une période pour afficher les résultats de {nom}.
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Kpi icone={Users}        label="Prospects attribués" valeur={k.prospects_assigned} />
          <Kpi icone={PhoneCall}    label="Prospects contactés"  valeur={k.prospects_contacted} />
          <Kpi icone={ActivityIcon} label="En cours"             valeur={k.prospects_open} />
          <Kpi icone={FileText}     label="Devis envoyés"        valeur={k.devis_sent} />
          <Kpi icone={UserCheck}    label="Prospects convertis"  valeur={k.converted} ton="emerald" />
          <Kpi icone={Building2}    label="Clients gagnés"       valeur={k.clients_won} ton="emerald" />
          <Kpi
            icone={Coins} label="Chiffre d'affaires" ton="violet"
            valeur={k.revenue}
            rendu={v => (v > 0 ? formatCurrency(v) : '—')}
            note={k.revenue > 0 ? undefined
              : "Aucun montant rattachable : les paiements de cet espace ne portent ni client ni facture."}
          />
          <Kpi
            icone={Percent} label="Taux de conversion" ton="blue"
            valeur={k.conversion_rate}
            rendu={v => `${Math.round(v * 10) / 10} %`}
          />
        </div>
      )}
    </div>
  )
}

const TONS: Record<string, string> = {
  slate:   'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  blue:    'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  violet:  'bg-violet-500/10 text-violet-600 dark:text-violet-300',
}

function Kpi({ icone: Icone, label, valeur, ton = 'slate', rendu, note }: {
  icone: React.ElementType
  label: string
  valeur: number
  ton?: keyof typeof TONS | string
  rendu?: (v: number) => string
  note?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center', TONS[ton] ?? TONS.slate)}>
          <Icone className="w-4 h-4" />
        </span>
        <p className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">
        {rendu ? rendu(valeur) : valeur}
      </p>
      {note && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{note}</p>}
    </div>
  )
}
