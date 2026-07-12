import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Activity, User, FileText, Receipt, UserCheck, DollarSign, Filter,
  LogIn, CheckSquare, ShieldCheck, Mail, KeyRound, Eye, Briefcase,
  UserPlus, Truck, Package, Building2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { activityApi, type ActivityEntry } from '@/lib/api'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'

/* Icônes par module / action */
const ICONS: Record<string, React.ElementType> = {
  factures:      Receipt,
  paiements:     DollarSign,
  devis:         FileText,
  clients:       User,
  prospects:     UserCheck,
  contrats:      FileText,
  expenses:      DollarSign,
  fournisseurs:  Building2,
  team_members:  UserPlus,
  team:          UserPlus,
  personal_tasks: CheckSquare,
  projets:       Briefcase,
  bons_livraison: Truck,
  produits:      Package,
  security:      ShieldCheck,
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  login:              LogIn,
  logout:             LogIn,
  task_completed:     CheckSquare,
  task_updated:       CheckSquare,
  sop_viewed:         Eye,
  invitation_sent:    Mail,
  invitation_resent:  Mail,
  invitation_accepted: UserPlus,
  invite_link_shared: Mail,
  reset_link_shared:  KeyRound,
  password_reset_requested: KeyRound,
  access_updated:     ShieldCheck,
}

const MODULE_DOT: Record<string, string> = {
  factures: 'bg-amber-500', paiements: 'bg-emerald-500', devis: 'bg-violet-500',
  clients: 'bg-purple-500', prospects: 'bg-blue-500', contrats: 'bg-indigo-500',
  expenses: 'bg-red-500', fournisseurs: 'bg-orange-500',
  team_members: 'bg-cyan-500', team: 'bg-cyan-500',
  personal_tasks: 'bg-teal-500', projets: 'bg-violet-500',
  bons_livraison: 'bg-fuchsia-500', produits: 'bg-lime-500',
  security: 'bg-rose-500',
}

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export default function ActivityLogs() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity', 500],
    queryFn:  () => activityApi.list(500),
    staleTime: 30_000,
  })

  const [search, setSearch] = useState('')
  const [filterSource, setFilterSource] = useState<'all' | 'crud' | 'member' | 'security'>('all')
  const [filterModule, setFilterModule] = useState('all')
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)
  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])

  const modules = useMemo(() => {
    const s = new Set<string>()
    for (const l of logs) s.add(l.module)
    return [...s].sort()
  }, [logs])

  const filtered = useMemo(() =>
    logs.filter(l => {
      const q  = search.toLowerCase().trim()
      const ms = !q || [l.title, l.detail, l.module, l.actor, l.actor_email, l.action]
        .filter(Boolean).some(x => (x as string).toLowerCase().includes(q))
      const fm = filterModule === 'all' || l.module === filterModule
      const fs = filterSource === 'all' || l.source === filterSource
      const md = dateMatch(l.created_at)
      return ms && fm && fs && md
    })
  , [logs, search, filterModule, filterSource, dateMatch])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Journal d'activité
          </h1>
          <p className="page-sub">
            {filtered.length} événement{filtered.length > 1 ? 's' : ''} enregistré{filtered.length > 1 ? 's' : ''}
            {logs.length !== filtered.length && ` (sur ${logs.length} au total)`}
          </p>
        </div>
      </div>

      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher un utilisateur, une action, un document..."
                 value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterSource} onValueChange={(v) => setFilterSource(v as any)}>
          <SelectTrigger className="w-44">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sources</SelectItem>
            <SelectItem value="crud">Modifications</SelectItem>
            <SelectItem value="member">Actions membres</SelectItem>
            <SelectItem value="security">Sécurité</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modules</SelectItem>
            {modules.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="card-premium p-6">
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30 animate-pulse" />
            <p>Chargement du journal…</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-5">
              {filtered.map(log => <LogRow key={log.id} log={log} />)}
              {filtered.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucun événement trouvé</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LogRow({ log }: { log: ActivityEntry }) {
  const Icon = ACTION_ICONS[log.action] ?? ICONS[log.module] ?? Activity
  const dot = MODULE_DOT[log.module] ?? 'bg-slate-500'
  const sourceBadge: Record<string, { label: string; cls: string }> = {
    crud:     { label: 'Modif.',   cls: 'bg-blue-500/10 text-blue-600' },
    member:   { label: 'Membre',   cls: 'bg-emerald-500/10 text-emerald-600' },
    security: { label: 'Sécurité', cls: 'bg-rose-500/10 text-rose-600' },
  }
  const sb = sourceBadge[log.source] ?? sourceBadge.crud
  return (
    <div className="flex items-start gap-4 relative">
      <div className={`w-7 h-7 rounded-full ${dot} flex items-center justify-center flex-shrink-0 z-10 ring-4 ring-background`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 pt-0.5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-medium text-foreground">{log.title}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${sb.cls}`}>{sb.label}</span>
            </div>
            {log.detail && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{log.detail}</p>
            )}
            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
              {log.actor && (
                <span className="inline-flex items-center gap-1">
                  <User className="w-3 h-3" />{log.actor}
                </span>
              )}
              {log.ip && <span>· {log.ip}</span>}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-muted-foreground whitespace-nowrap">{formatTs(log.created_at)}</p>
            <Badge variant="secondary" className="text-[10px] mt-1 capitalize">{log.module}</Badge>
          </div>
        </div>
      </div>
    </div>
  )
}
