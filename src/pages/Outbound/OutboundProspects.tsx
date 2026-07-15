import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Loader2, Building2, User, Mail, Phone, MessageCircle,
  UserCheck, DollarSign, Filter, Bell, CheckCircle2, Trash2, Users2, Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  useOutboundProspects, useOutboundSectors, useOutboundTeam, useConvertOutboundToCrm,
} from '@/hooks/useOutbound'
import { OUTBOUND_STATUS, type OutboundProspect, type OutboundStatut } from '@/lib/outboundApi'
import { statusAccent, statusLabel, fullContactName, isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'
import OutboundProspectDrawer from './OutboundProspectDrawer'

const TODAY = new Date().toISOString().slice(0, 10)
const PAGE_SIZE = 15

export default function OutboundProspects() {
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)

  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('all')
  const [filterSecteur, setFilterSecteur] = useState<string>('all')
  const [filterOwner, setFilterOwner] = useState<string>('all')
  const [todayOnly, setTodayOnly] = useState(false)
  const [hideConverted, setHideConverted] = useState(true)
  const [page, setPage] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<OutboundProspect | null>(null)

  const query = useMemo(() => {
    const q: Record<string, string> = {}
    if (filterStatut !== 'all') q.statut = filterStatut
    if (filterSecteur !== 'all') q.secteur = filterSecteur
    if (filterOwner !== 'all' && canManageAll) q.owner = filterOwner
    if (hideConverted) q.converted = 'false'
    if (search.trim()) q.search = search.trim()
    return q
  }, [filterStatut, filterSecteur, filterOwner, hideConverted, search, canManageAll])

  const { data: prospects = [], isLoading } = useOutboundProspects(query)
  const { data: sectors = [] } = useOutboundSectors()
  const { data: team = [] } = useOutboundTeam()
  const convert = useConvertOutboundToCrm()

  const filtered = useMemo(() => {
    return prospects.filter(p => {
      if (todayOnly && p.date_prochaine_relance !== TODAY) return false
      return true
    })
  }, [prospects, todayOnly])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageStart = (page - 1) * PAGE_SIZE
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const stats = useMemo(() => ({
    total: prospects.length,
    aContacter: prospects.filter(p => p.statut === 'a_contacter').length,
    pipeline: prospects.filter(p => !['refuse','non_qualifie','converti'].includes(p.statut))
                       .reduce((s, p) => s + Number(p.valeur_potentielle ?? 0), 0),
    conversions: prospects.filter(p => p.converted_to_crm).length,
  }), [prospects])

  const openNew = () => { setEditTarget(null); setDrawerOpen(true) }
  const openEdit = (p: OutboundProspect) => { setEditTarget(p); setDrawerOpen(true) }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Prospects Outbound</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.total} prospects · {stats.aContacter} à contacter · Pipeline {formatCurrency(stats.pipeline)} · {stats.conversions} conversions
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4" /> Nouveau prospect
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Total" value={stats.total} icon={UserCheck} color="sky" />
        <Kpi label="À contacter" value={stats.aContacter} icon={Bell} color="amber" />
        <Kpi label="Pipeline" value={formatCurrency(stats.pipeline)} icon={DollarSign} color="violet" small />
        <Kpi label="Conversions" value={stats.conversions} icon={CheckCircle2} color="emerald" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher entreprise, contact, email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="pl-9 h-8 text-sm"
          />
        </div>

        <Select value={filterStatut} onValueChange={v => { setFilterStatut(v); setPage(1) }}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {OUTBOUND_STATUS.map(s => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSecteur} onValueChange={v => { setFilterSecteur(v); setPage(1) }}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Secteur" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous secteurs</SelectItem>
            {sectors.filter(s => !s.parent_id).map(s => (
              <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canManageAll && (
          <Select value={filterOwner} onValueChange={v => { setFilterOwner(v); setPage(1) }}>
            <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="Employé" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous employés</SelectItem>
              {team.map(m => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.name ?? m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <button
          onClick={() => setTodayOnly(t => !t)}
          className={`flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all border ${
            todayOnly ? 'bg-amber-500/20 border-amber-500/50 text-amber-600' : 'bg-[var(--surface-card)] border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bell className="w-3.5 h-3.5" /> Relance aujourd'hui
        </button>

        <button
          onClick={() => setHideConverted(h => !h)}
          className={`flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all border ${
            hideConverted ? 'bg-[var(--surface-card)] border-border text-muted-foreground' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> {hideConverted ? 'Convertis masqués' : 'Convertis affichés'}
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  {['Entreprise', 'Contact', 'Statut', 'Secteur', 'Valeur', 'Relance', canManageAll ? 'Employé' : ''].filter(Boolean).map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {paginated.map(p => (
                    <ProspectRow
                      key={p.id}
                      p={p}
                      team={team}
                      canManageAll={canManageAll}
                      onEdit={openEdit}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <Users2 className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Aucun prospect trouvé</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total === 0 ? 'Commencez par ajouter votre premier prospect' : 'Ajustez les filtres'}
                </p>
              </div>
            )}
          </div>

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/20 text-xs">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{pageStart + 1}</span>
                {' – '}
                <span className="font-semibold text-foreground">{Math.min(pageStart + PAGE_SIZE, filtered.length)}</span>
                {' sur '}
                <span className="font-semibold text-foreground">{filtered.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted/60 disabled:opacity-40"
                >
                  ← Préc.
                </button>
                <span className="px-2 text-muted-foreground">
                  Page <span className="font-semibold text-foreground">{page}</span> / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted/60 disabled:opacity-40"
                >
                  Suiv. →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <OutboundProspectDrawer
        open={drawerOpen}
        prospect={editTarget}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}

function ProspectRow({
  p, team, canManageAll, onEdit,
}: {
  p: OutboundProspect
  team: any[]
  canManageAll: boolean
  onEdit: (p: OutboundProspect) => void
}) {
  const accent = statusAccent(p.statut)
  const isRelanceToday = p.date_prochaine_relance === TODAY
  const owner = team.find(m => m.user_id === p.assigned_to_id)

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className="table-row cursor-pointer"
      onClick={() => onEdit(p)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: accent }}
          >
            {p.entreprise.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground leading-tight flex items-center gap-2">
              {p.entreprise}
              {p.converted_to_crm && (
                <span title="Converti CRM">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                </span>
              )}
            </p>
            {p.ville && <p className="text-xs text-muted-foreground">{p.ville}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {(p.nom_contact || p.prenom_contact) && (
            <p className="text-xs text-foreground">{fullContactName(p)}</p>
          )}
          {p.telephone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{p.telephone}</p>}
          {p.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</p>}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
          {statusLabel(p.statut)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {p.secteur_id ? '—' : '—'}{/* sector name would need sector lookup */}
      </td>
      <td className="px-4 py-3 text-sm text-foreground">
        {p.valeur_potentielle ? formatCurrency(Number(p.valeur_potentielle)) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3">
        {p.date_prochaine_relance ? (
          <span className={`text-xs flex items-center gap-1 ${isRelanceToday ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
            {isRelanceToday && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            <Bell className="w-3 h-3" />
            {isRelanceToday ? "Aujourd'hui" : formatDate(p.date_prochaine_relance)}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      {canManageAll && (
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {owner?.name ?? owner?.email ?? '—'}
        </td>
      )}
    </motion.tr>
  )
}

function Kpi({
  label, value, icon: Icon, color, small = false,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: 'sky' | 'amber' | 'violet' | 'emerald'
  small?: boolean
}) {
  const bg = {
    sky:     'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400',
    amber:   'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    violet:  'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  }[color]

  return (
    <div className="card-premium p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className={`${small ? 'text-xl' : 'text-2xl'} font-extrabold text-foreground`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  )
}
