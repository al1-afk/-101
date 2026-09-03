import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Edit2, Trash2, Loader2, AlertCircle,
  Users, CheckSquare, FileText, Briefcase, Plus, X,
  Calendar, Clock, CircleDot, Check, MoreHorizontal,
  Crown, User as UserIcon, LayoutGrid, List as ListIcon,
  Play, Pause, Square, RotateCcw, Sparkles, Receipt, KeyRound,
  MessageSquare, Settings, Globe, Server, CalendarCheck, UserPlus,
  Eye, CheckCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Badge }  from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProjet, useUpdateProjet, useDeleteProjet, type Projet, type ProjetStatut } from '@/hooks/useProjets'
import { PROJET_TEMPLATES, type ProjetTemplate } from '@/lib/projetTemplates'
import { useCustomTemplates, rowToTemplate } from '@/hooks/useProjetTemplates'
import TemplateEditorDialog from '@/components/projet/TemplateEditorDialog'
import { teamMemberTasksApi } from '@/lib/api'
import { useClients, type Client } from '@/hooks/useClients'
import { useTeam, type TeamMember } from '@/hooks/useTeam'
import {
  useAssigneesOf, useAddProjetAssignee, useRemoveProjetAssignee, useUpdateProjetAssignee,
  type ProjetAssignee, type ProjetAssigneeRole,
} from '@/hooks/useProjetAssignees'
import TaskAccessToggle from '@/components/projet/TaskAccessToggle'
import {
  useProjectTasks, useCreateTeamMemberTask, useUpdateTeamMemberTask, useDeleteTeamMemberTask,
  type TaskStatus, type TaskPriority, type TeamMemberTask,
} from '@/hooks/useTeamMemberTasks'
import { useStagiaires, type Stagiaire } from '@/hooks/useStagiaires'
import BlockEditor from '@/components/BlockEditor'
import AIButton from '@/components/ui/AIButton'
import RecurrenceDialog from '@/components/projet/RecurrenceDialog'
import { describeRecurrence, type TaskRecurrence } from '@/lib/taskRecurrence'
import { SopBlocksRenderer } from '@/components/sop/SopBlocksRenderer'
import { serializeTaskDesc } from '@/lib/taskNotes'
import { buildTasksFromTemplates, countTemplate } from '@/lib/templateTasks'
import InfosAccesTab from '@/components/projet/InfosAccesTab'
import TaskDetailDialog from '@/components/projet/TaskDetailDialog'
import ProjetChat from '@/components/projet/ProjetChat'
import { getActiveTimer, setActiveTimer, formatHMS } from '@/lib/taskTimer'
import { useAuth } from '@/hooks/useAuth'
import type { SopBlock } from '@/hooks/useSops'
import { useQueryClient } from '@tanstack/react-query'
import { projetsApi } from '@/lib/api'
import { formatDate, formatCurrency, getInitials, getDaysUntil, cn } from '@/lib/utils'
import { parseProjet, serializeProjet } from '@/lib/projetNotes'
import { extractImageFilesFromClipboard, compressImageToDataURL } from '@/lib/pasteImage'
import { toast } from 'sonner'

/* ─── Status & priority config ─────────────────────────────────── */
const STATUT_CFG: Record<ProjetStatut, { label: string; cls: string }> = {
  planifie: { label: 'Planifié',  cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  en_cours: { label: 'En cours',  cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  en_pause: { label: 'En pause',  cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  termine:  { label: 'Terminé',   cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  annule:   { label: 'Annulé',    cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
}

const TASK_STATUS_CFG: Record<TaskStatus, { label: string; cls: string; emoji: string }> = {
  todo:        { label: 'À faire',    cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',       emoji: '○' },
  in_progress: { label: 'En cours',   cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',       emoji: '◐' },
  validation:  { label: 'Validation', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',    emoji: '⚑' },
  done:        { label: 'Validé',     cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', emoji: '●' },
  cancelled:   { label: 'Annulé',     cls: 'bg-red-500/10 text-red-600 dark:text-red-400',             emoji: '×' },
}

const TASK_PRIORITY_CFG: Record<TaskPriority, { label: string; cls: string }> = {
  low:    { label: 'Basse',   cls: 'text-slate-500' },
  normal: { label: 'Normale', cls: 'text-blue-500' },
  high:   { label: 'Haute',   cls: 'text-amber-500' },
  urgent: { label: 'Urgente', cls: 'text-red-500' },
}

/* ─── Helpers ──────────────────────────────────────────────────── */
function parseProjetNotes(notes: string | null | undefined): { text: string; blocks: SopBlock[] } {
  if (!notes) return { text: '', blocks: [] }
  const trimmed = notes.trim()
  if (trimmed.startsWith('{') && trimmed.includes('__projet_meta__')) {
    try {
      const d = JSON.parse(trimmed) as { text?: string; blocks?: SopBlock[] }
      return { text: d.text ?? '', blocks: d.blocks ?? [] }
    } catch { /* fall through */ }
  }
  return { text: notes, blocks: [] }
}

function serializeProjetNotes(text: string, blocks: SopBlock[]): string {
  if (!text.trim() && blocks.length === 0) return ''
  if (blocks.length === 0) return text
  return JSON.stringify({ sentinel: '__projet_meta__', text, blocks })
}

const memberName = (m?: TeamMember) => m ? `${m.prenom ?? ''} ${m.nom ?? ''}`.trim() || (m.email ?? '—') : '—'

/** Convert a dropdown value ('none' | 'admin' | 'stag:<uuid>' | <member_uuid>)
    into the trio of FK fields. Un seul des trois ids est renseigné à la fois.
    Source de vérité unique : l'onglet Tâches et l'onglet Équipe l'utilisent
    tous les deux, un 4ᵉ canal d'assignation ne doit pas la redéfinir. */
function assigneeFieldsFor(v: string, adminUserId?: string | null): {
  team_member_id:        string | null
  assigned_user_id:      string | null
  assigned_stagiaire_id: string | null
} {
  if (v === 'admin')          return { team_member_id: null, assigned_user_id: adminUserId ?? null, assigned_stagiaire_id: null }
  if (v === 'none')           return { team_member_id: null, assigned_user_id: null, assigned_stagiaire_id: null }
  if (v.startsWith('stag:'))  return { team_member_id: null, assigned_user_id: null, assigned_stagiaire_id: v.slice(5) }
  return { team_member_id: v, assigned_user_id: null, assigned_stagiaire_id: null }
}

/** Clé d'assignation d'un membre projet, au format attendu par `assigneeFieldsFor`.
    Le préfixe `stag:` est le discriminant : passer l'uuid nu d'un stagiaire
    l'écrirait dans team_member_id (FK vers team_members) → violation de FK. */
const assigneeKeyOf = (a: ProjetAssignee) =>
  a.team_member_id ?? (a.stagiaire_id ? `stag:${a.stagiaire_id}` : 'none')

/** La tâche est-elle déjà portée par cette cible d'assignation ? */
const taskIsOn = (t: TeamMemberTask, targetKey: string) =>
  targetKey.startsWith('stag:')
    ? t.assigned_stagiaire_id === targetKey.slice(5)
    : !!targetKey && t.team_member_id === targetKey

/** Qui détient la tâche aujourd'hui — null si elle est libre. */
const taskHolder = (t: TeamMemberTask, members: TeamMember[], stagiaires: Stagiaire[]): string | null => {
  if (t.team_member_id)        return memberName(members.find(m => m.id === t.team_member_id))
  if (t.assigned_stagiaire_id) return stagiaires.find(s => s.id === t.assigned_stagiaire_id)?.nom_complet ?? 'un stagiaire'
  if (t.assigned_user_id)      return '🛡️ Admin'
  return null
}

/* ─── Date input helper — ISO string → YYYY-MM-DD (local timezone) ── */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* ─── Timer helpers maintenant centralisés dans @/lib/taskTimer ─── */

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════ */
type Tab = 'overview' | 'team' | 'tasks' | 'chat' | 'infos' | 'docs'

export default function ProjetDetail() {
  const { id, tenantSlug } = useParams<{ id: string; tenantSlug: string }>()
  const navigate = useNavigate()
  const base = tenantSlug ? `/${tenantSlug}` : ''

  const projet = useProjet(id)
  const { data: clients = [] } = useClients()
  const { data: members = [] } = useTeam()
  const assignees = useAssigneesOf(id)
  const tasks     = useProjectTasks(id)
  const auth      = useAuth()

  const updateProjet = useUpdateProjet()
  const deleteProjet = useDeleteProjet()

  const [tab, setTab] = useState<Tab>('tasks')
  const [delConfirm, setDelConfirm] = useState(false)

  /* Deep-link depuis les SOP : ProjectDataRef émet 'sop:goto-section'
     quand l'utilisateur clique « Compléter les informations ». */
  useEffect(() => {
    const onGoto = (e: Event) => {
      const detail = (e as CustomEvent<{ section: string }>).detail
      const map: Record<string, Tab> = {
        overview: 'overview',
        infos:    'infos',
        team:     'team',
        docs:     'docs',
        infra:    'infos',
      }
      const next = map[detail?.section]
      if (next) setTab(next)
    }
    window.addEventListener('sop:goto-section', onGoto)
    return () => window.removeEventListener('sop:goto-section', onGoto)
  }, [])

  /* Auto-progression from tasks (read-only display, optional override) */
  const taskProgression = useMemo(() => {
    if (tasks.length === 0) return null
    const done = tasks.filter(t => t.status === 'done').length
    return Math.round((done / tasks.length) * 100)
  }, [tasks])

  /* Domain & hosting expirations live inside projet.notes envelope */
  const envelope = useMemo(() => parseProjet(projet?.notes ?? null), [projet?.notes])

  if (!projet) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground">Projet introuvable.</p>
        <Button size="sm" variant="secondary" onClick={() => navigate(`${base}/projets`)}>
          <ArrowLeft className="w-4 h-4" /> Retour aux projets
        </Button>
      </div>
    )
  }

  const client    = clients.find(c => c.id === projet.client_id)
  const statutCfg = STATUT_CFG[projet.statut]

  const updateEnvelope = (patch: { domainExpiration?: string | null; hostingExpiration?: string | null }) => {
    const next = serializeProjet({ ...envelope, ...patch })
    updateProjet.mutate({ id: projet.id, notes: next })
  }

  const handleDelete = async () => {
    await deleteProjet.mutateAsync(projet.id)
    navigate(`${base}/projets`)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(`${base}/projets`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Projets
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground">{projet.nom}</span>
      </div>

      {/* Hero */}
      <div className="card-premium p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
            <Briefcase className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{projet.nom}</h1>
              <Badge className={cn('text-[11px] font-bold', statutCfg.cls)}>{statutCfg.label}</Badge>
            </div>
            {projet.description && <p className="text-sm text-muted-foreground mt-1">{projet.description}</p>}
            <div className="flex items-center flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
              {client && (
                <span className="flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5" />
                  Client : <span className="font-semibold text-foreground">{client.entreprise || client.nom}</span>
                </span>
              )}
              {projet.date_debut && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Du {formatDate(projet.date_debut)}
                  {projet.date_fin_prevue && ` au ${formatDate(projet.date_fin_prevue)}`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CreateInvoiceButton projet={projet} client={client} tasks={tasks} base={base} />
            <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/10" onClick={() => setDelConfirm(true)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <Kpi label="Budget"        value={projet.budget != null ? formatCurrency(projet.budget) : '—'} sub={projet.cout_reel ? `Réel : ${formatCurrency(projet.cout_reel)}` : undefined} />
          <Kpi label="Progression"   value={`${taskProgression ?? projet.progression}%`} sub={tasks.length > 0 ? `${tasks.filter(t => t.status === 'done').length}/${tasks.length} tâches` : undefined} />
          <Kpi label="Équipe"        value={String(assignees.length)} sub={`membre${assignees.length > 1 ? 's' : ''}`} />
          <Kpi label="Tâches"        value={String(tasks.length)}     sub={`${tasks.filter(t => t.status === 'in_progress').length} en cours`} />
        </div>

        {/* Échéances : domaine · hébergement · fin projet */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <ExpirationCard
            icon={Globe}
            label="Nom de domaine"
            iconClass="text-blue-500"
            value={envelope.domainExpiration}
            onChange={(v) => updateEnvelope({ domainExpiration: v })}
          />
          <ExpirationCard
            icon={Server}
            label="Hébergement"
            iconClass="text-violet-500"
            value={envelope.hostingExpiration}
            onChange={(v) => updateEnvelope({ hostingExpiration: v })}
          />
          <ExpirationCard
            icon={CalendarCheck}
            label="Fin du projet"
            iconClass="text-emerald-500"
            value={toDateInput(projet.date_fin_prevue)}
            onChange={(v) => updateProjet.mutate({ id: projet.id, date_fin_prevue: v || null })}
          />
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${taskProgression ?? projet.progression}%` }}
              transition={{ duration: 0.6 }}
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-muted/30 w-fit">
        {([
          { key: 'tasks',    label: 'Tâches',          icon: CheckSquare},
          { key: 'infos',    label: 'Infos & Accès',   icon: KeyRound   },
          { key: 'team',     label: 'Équipe',          icon: Users      },
          { key: 'chat',     label: 'Discussion',      icon: MessageSquare },
          { key: 'docs',     label: 'Documentation',   icon: FileText   },
          { key: 'overview', label: 'Vue d\'ensemble', icon: Briefcase },
        ] as const).map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                active ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}>
              <Icon className="w-4 h-4" />
              {t.label}
              {t.key === 'team' && assignees.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono">{assignees.length}</span>}
              {t.key === 'tasks' && tasks.length > 0     && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono">{tasks.length}</span>}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <OverviewTab projet={projet} onUpdate={(patch) => updateProjet.mutate({ id: projet.id, ...patch })} />
      )}
      {tab === 'team' && (
        <TeamTab projet={projet} assignees={assignees} members={members} tasks={tasks} />
      )}
      {tab === 'tasks' && (
        <TasksTab projet={projet} tasks={tasks} assignees={assignees} members={members} client={client} />
      )}
      {tab === 'chat' && (
        <ProjetChat
          projetId={projet.id}
          currentUserName={auth.name ?? auth.email ?? 'Admin'}
          isAdmin={true}
          as="admin"
          queryKey={['projet-chat', projet.id]}
        />
      )}
      {tab === 'infos' && (
        <InfosAccesTab projet={projet} client={client} />
      )}
      {tab === 'docs' && (
        <DocsTab projet={projet} />
      )}

      {/* Delete confirm */}
      <Dialog open={delConfirm} onOpenChange={setDelConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" /> Supprimer ce projet ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Toutes les données liées à <strong className="text-foreground">{projet.nom}</strong> seront perdues (tâches, équipe assignée, documentation).
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setDelConfirm(false)}>Annuler</Button>
            <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-0"
              onClick={handleDelete} disabled={deleteProjet.isPending}>
              {deleteProjet.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Supprimer définitivement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Create invoice from project ──────────────────────────────── */
function CreateInvoiceButton({ projet, client, tasks, base }: { projet: Projet; client?: { id: string; nom?: string; entreprise?: string | null }; tasks: TeamMemberTask[]; base: string }) {
  const navigate = useNavigate()
  /* Eligible when project is done OR has budget set */
  const validatedRequests = tasks.filter(t => t.is_request && (t.status === 'done' || t.status === 'validation'))
  const extras = validatedRequests.reduce((s, t) => s + (t.request_price ?? 0), 0)
  const totalHT = (projet.budget ?? 0) + extras
  if ((projet.budget ?? 0) === 0 && extras === 0) return null
  return (
    <Button size="sm" variant="secondary" className="text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40"
      onClick={() => {
        try {
          localStorage.setItem('gestiq_prefill_facture', JSON.stringify({
            client_id: client?.id ?? null,
            client_nom: client?.entreprise ?? client?.nom ?? '',
            projet_id:  projet.id,
            projet_nom: projet.nom,
            montant_ht: totalHT,
            lignes: [
              { titre: projet.nom, description: [], quantite: 1, prix_unitaire: projet.budget ?? 0 },
              ...validatedRequests.map(t => ({
                titre:         `📌 ${t.title}`,
                description:   [],
                quantite:      1,
                prix_unitaire: t.request_price ?? 0,
              })),
            ],
          }))
        } catch {}
        toast.success(`Facture pré-remplie : ${formatCurrency(totalHT)}${extras > 0 ? ` (dont ${formatCurrency(extras)} de demandes)` : ''}`)
        navigate(`${base}/factures`)
      }}>
      <Receipt className="w-3.5 h-3.5" /> Créer la facture
    </Button>
  )
}

/* ─── KPI tile ─────────────────────────────────────────────────── */
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
      <p className="text-xl font-extrabold text-foreground mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── Expiration tile (domaine · hébergement · fin projet) ─────── */
function ExpirationCard({
  icon: Icon, label, iconClass, value, onChange,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  iconClass: string
  value: string | null
  onChange: (v: string) => void
}) {
  const days = value ? getDaysUntil(value) : null
  const badge = (() => {
    if (days == null) return { text: 'Non défini', cls: 'bg-muted text-muted-foreground' }
    if (days < 0)     return { text: `Expiré il y a ${Math.abs(days)}j`, cls: 'bg-red-500/10 text-red-600 dark:text-red-400' }
    if (days === 0)   return { text: "Aujourd'hui", cls: 'bg-red-500/10 text-red-600 dark:text-red-400' }
    if (days <= 15)   return { text: `Dans ${days}j`, cls: 'bg-red-500/10 text-red-600 dark:text-red-400' }
    if (days <= 30)   return { text: `Dans ${days}j`, cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
    if (days <= 60)   return { text: `Dans ${days}j`, cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' }
    return { text: `Dans ${days}j`, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
  })()
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('w-3.5 h-3.5', iconClass)} />
        <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{label}</p>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <input
          type="date"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className="text-sm font-semibold text-foreground bg-transparent border-0 outline-none p-0 focus:ring-0 min-w-0 flex-1"
        />
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', badge.cls)}>
          {badge.text}
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   OVERVIEW TAB
═══════════════════════════════════════════════════════════════════ */
function OverviewTab({ projet, onUpdate }: { projet: Projet; onUpdate: (patch: Partial<Projet>) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card-premium p-5 space-y-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Statut & Priorité</p>
        <div className="flex items-center gap-2">
          <Select value={projet.statut} onValueChange={v => onUpdate({ statut: v as ProjetStatut })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(STATUT_CFG) as [ProjetStatut, { label: string; cls: string }][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projet.priorite} onValueChange={v => onUpdate({ priorite: v as any })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="basse">🟢 Basse</SelectItem>
              <SelectItem value="normale">🔵 Normale</SelectItem>
              <SelectItem value="haute">🟠 Haute</SelectItem>
              <SelectItem value="urgente">🔴 Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="card-premium p-5 space-y-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Budget & coûts</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Budget</label>
            <Input type="number" value={projet.budget ?? ''} onChange={e => onUpdate({ budget: e.target.value ? Number(e.target.value) : null })} placeholder="0" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Coût réel</label>
            <Input type="number" value={projet.cout_reel ?? ''} onChange={e => onUpdate({ cout_reel: e.target.value ? Number(e.target.value) : null })} placeholder="0" />
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-3 md:col-span-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Dates</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Début</label>
            <Input type="date" value={toDateInput(projet.date_debut)} onChange={e => onUpdate({ date_debut: e.target.value || null })} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Fin prévue</label>
            <Input type="date" value={toDateInput(projet.date_fin_prevue)} onChange={e => onUpdate({ date_fin_prevue: e.target.value || null })} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Fin réelle</label>
            <Input type="date" value={toDateInput(projet.date_fin_reelle)} onChange={e => onUpdate({ date_fin_reelle: e.target.value || null })} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TEAM TAB — multi-member assignment with roles + per-member progress
═══════════════════════════════════════════════════════════════════ */
function TeamTab({ projet, assignees, members, tasks }: { projet: Projet; assignees: ProjetAssignee[]; members: TeamMember[]; tasks: TeamMemberTask[] }) {
  const addAssignee    = useAddProjetAssignee()
  const removeAssignee = useRemoveProjetAssignee()
  const updateAssignee = useUpdateProjetAssignee()
  const { data: stagiaires = [] } = useStagiaires()
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search,     setSearch]     = useState('')
  /* Assignation en masse : on garde la LIGNE d'assignation (pas un id), elle
     porte déjà le discriminant membre/stagiaire. */
  const [bulkFor,  setBulkFor]  = useState<ProjetAssignee | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const activeStagiaires = stagiaires.filter(s => s.statut === 'accepte' || s.statut === 'en_cours')

  const available            = members.filter(m => !assignees.some(a => a.team_member_id === m.id))
  const availableStagiaires  = activeStagiaires.filter(s => !assignees.some(a => a.stagiaire_id === s.id))
  const q = search.trim().toLowerCase()
  const filteredMembers    = q ? available.filter(m => `${m.prenom} ${m.nom} ${m.email ?? ''}`.toLowerCase().includes(q)) : available
  const filteredStagiaires = q ? availableStagiaires.filter(s => `${s.nom_complet} ${s.email ?? ''}`.toLowerCase().includes(q)) : availableStagiaires
  const pickerEmpty        = available.length === 0 && availableStagiaires.length === 0

  /* Per-member progress : count tasks done vs total for each assignee */
  const memberStats = (memberId: string) => {
    const my = tasks.filter(t => t.team_member_id === memberId)
    const done = my.filter(t => t.status === 'done').length
    const pct = my.length > 0 ? Math.round((done / my.length) * 100) : 0
    const elapsed = my.reduce((s, t) => s + (t.elapsed_seconds ?? 0), 0)
    return { total: my.length, done, pct, elapsed }
  }
  const stagiaireStats = (stagiaireId: string) => {
    const my = tasks.filter(t => t.assigned_stagiaire_id === stagiaireId)
    const done = my.filter(t => t.status === 'done').length
    const pct = my.length > 0 ? Math.round((done / my.length) * 100) : 0
    const elapsed = my.reduce((s, t) => s + (t.elapsed_seconds ?? 0), 0)
    return { total: my.length, done, pct, elapsed }
  }

  /** Nom lisible d'un assigné, membre d'équipe ou stagiaire. */
  const assigneeLabel = (a: ProjetAssignee) =>
    a.team_member_id
      ? memberName(members.find(m => m.id === a.team_member_id))
      : stagiaires.find(s => s.id === a.stagiaire_id)?.nom_complet ?? 'ce stagiaire'

  /* Assignation en masse — deux écarts délibérés au bulkAssign de l'onglet Tâches :

     1. Par lots séquentiels de 5. Le pool Postgres est plafonné à 20 connexions
        avec un connectionTimeout de 2 s (server/db/pool.ts) et chaque PATCH
        monopolise une connexion le temps de sa transaction : 60 requêtes d'un
        coup en feraient échouer une bonne partie sur timeout.

     2. Appel direct de l'API plutôt que useUpdateTeamMemberTask, pour court-circuiter
        son onSuccess — il invalide le cache à CHAQUE mutation (60 refetch), et
        surtout il recrée une occurrence quand la tâche renvoyée est 'done' avec une
        récurrence (useTeamMemberTasks.ts:108). Réassigner une tâche terminée
        récurrente dupliquerait donc la tâche. Une seule invalidation à la fin. */
  const runBulkAssign = async (a: ProjetAssignee, ids: string[]) => {
    const key = assigneeKeyOf(a)
    /* Une ligne d'assignation porte toujours un membre OU un stagiaire. Si les
       deux sont nuls, `assigneeFieldsFor` renverrait le trio à null : on
       désassignerait en masse au lieu d'assigner. On refuse plutôt. */
    if (key === 'none') { toast.error('Membre introuvable — assignation annulée'); return }
    const fields = assigneeFieldsFor(key)
    const CHUNK  = 5
    let ok = 0, ko = 0
    setBulkBusy(true)
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const res = await Promise.allSettled(
          ids.slice(i, i + CHUNK).map(id => teamMemberTasksApi.update(id, fields)),
        )
        ok += res.filter(r => r.status === 'fulfilled').length
        ko += res.filter(r => r.status === 'rejected').length
      }
    } finally {
      /* Préfixe de la clé réelle [KEY, tenantId] — cf. useTeamMemberTasks.ts:40. */
      await qc.invalidateQueries({ queryKey: ['team_member_tasks'] })
      setBulkBusy(false)
    }
    if (ok > 0) toast.success(`${ok} tâche${ok > 1 ? 's' : ''} assignée${ok > 1 ? 's' : ''} à ${assigneeLabel(a)}`)
    if (ko > 0) toast.error(`${ko} tâche${ko > 1 ? 's' : ''} en échec`)
    setBulkFor(null)
  }

  return (
    <div className="card-premium p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Équipe assignée</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Affecte les membres au projet et désigne un lead. La progression s'affiche dès qu'ils ont des tâches.</p>
        </div>
        <Button size="sm" onClick={() => setPickerOpen(true)} disabled={pickerEmpty}>
          <Plus className="w-3.5 h-3.5" /> Assigner
        </Button>
      </div>

      {assignees.length === 0 ? (
        <div className="empty-state py-12">
          <Users className="empty-state-icon" />
          <p className="empty-state-title">Aucun membre assigné</p>
          <p className="empty-state-desc">Cliquez sur « Assigner » pour ajouter des membres au projet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignees.map(a => {
            const m = a.team_member_id ? members.find(x => x.id === a.team_member_id) : null
            const s = a.stagiaire_id  ? stagiaires.find(x => x.id === a.stagiaire_id)  : null
            const st = a.team_member_id
              ? memberStats(a.team_member_id)
              : a.stagiaire_id
                ? stagiaireStats(a.stagiaire_id)
                : { total: 0, done: 0, pct: 0, elapsed: 0 }
            const displayName = m ? memberName(m) : s?.nom_complet ?? '?'
            const displaySub  = m ? (m.poste || m.email || '—') : (s?.formation || s?.email || '—')
            const initials    = m ? getInitials(`${m.prenom} ${m.nom}`) : s ? getInitials(s.nom_complet) : '?'
            return (
              <div key={a.id} className={cn(
                'p-3 rounded-xl border space-y-2',
                s ? 'border-violet-200 dark:border-violet-800/40 bg-violet-50/40 dark:bg-violet-950/10' : 'border-border bg-muted/20',
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                    s ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300' : 'avatar-initials',
                  )}>
                    <span className="font-bold text-xs">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-foreground truncate">{displayName}</p>
                      {s && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">🎓 Stagiaire</span>}
                      {a.role === 'lead' && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{displaySub}</p>
                  </div>
                  <Select value={a.role} onValueChange={v => updateAssignee.mutate({ id: a.id, role: v as ProjetAssigneeRole })}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">👑 Lead</SelectItem>
                      <SelectItem value="member">👤 Membre</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-red-500" onClick={() => removeAssignee.mutate(a.id)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Toggle share_infos — accès aux Infos & Accès du projet */}
                <div className="flex items-center justify-between pl-12 pr-1 py-1.5 rounded-lg bg-background border border-border/60">
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-foreground">Voir les Infos & Accès</span>
                    <span className="text-[10px] text-muted-foreground">(contact, identifiants, liens)</span>
                  </div>
                  <button
                    onClick={() => updateAssignee.mutate({ id: a.id, share_infos: !a.share_infos } as any)}
                    className={cn(
                      'relative w-8 h-4 rounded-full transition-colors',
                      a.share_infos !== false ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700',
                    )}
                    title={a.share_infos !== false ? 'Partagé — clic pour bloquer' : 'Privé — clic pour partager'}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                      a.share_infos !== false ? 'translate-x-4' : 'translate-x-0.5',
                    )} />
                  </button>
                </div>

                {/* Périmètre des tâches visibles côté espace membre (migration 085).
                    Le filtre est appliqué par l'API : en mode « Par tâche », les
                    tâches des autres ne sont pas envoyées, pas seulement masquées. */}
                <div className="flex items-center justify-between gap-2 flex-wrap pl-12 pr-1 py-1.5 rounded-lg bg-background border border-border/60">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-[11px] font-medium text-foreground">Tâches visibles</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {a.task_access === 'all'
                        ? '(tout le projet, avancement compris)'
                        : '(uniquement les siennes)'}
                    </span>
                  </div>
                  <TaskAccessToggle
                    value={a.task_access === 'all' ? 'all' : 'assigned'}
                    onChange={v => updateAssignee.mutate({ id: a.id, task_access: v })}
                  />
                </div>

                {/* Assignation en masse des tâches du projet à ce membre */}
                <div className="pl-12">
                  <button
                    type="button"
                    onClick={() => setBulkFor(a)}
                    disabled={tasks.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-9 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    title={tasks.length === 0 ? 'Ce projet n’a aucune tâche' : `Assigner des tâches du projet à ${displayName}`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    Assigner des tâches
                    {tasks.length > 0 && <span className="font-mono opacity-60">({tasks.length})</span>}
                  </button>
                </div>

                {/* Per-member progress bar */}
                {st.total > 0 && (
                  <div className="flex items-center gap-3 pl-12">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${st.pct}%`,
                          background: st.pct === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #6366f1, #818cf8)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-foreground w-10 text-right">{st.pct}%</span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{st.done}/{st.total}</span>
                    {st.elapsed > 0 && <span className="text-[11px] text-muted-foreground whitespace-nowrap">⏱ {formatHMS(st.elapsed)}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Member picker dialog — membres + stagiaires */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" /> Assigner au projet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="max-h-80 overflow-y-auto space-y-2">
              {filteredMembers.length === 0 && filteredStagiaires.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {pickerEmpty ? 'Tous sont déjà assignés' : 'Aucun résultat'}
                </p>
              ) : (
                <>
                  {filteredMembers.length > 0 && (
                    <div>
                      <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Membres de l'équipe</p>
                      {filteredMembers.map(m => (
                        <button key={m.id}
                          onClick={() => {
                            addAssignee.mutate({ projet_id: projet.id, team_member_id: m.id, role: assignees.length === 0 ? 'lead' : 'member' })
                            setPickerOpen(false); setSearch('')
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors text-left">
                          <div className="avatar-initials w-8 h-8 flex-shrink-0">
                            <span className="font-bold text-[10px]">{getInitials(`${m.prenom} ${m.nom}`)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{memberName(m)}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{m.poste || m.email || '—'}</p>
                          </div>
                          {assignees.length === 0 && <span title="Sera Lead"><Crown className="w-3.5 h-3.5 text-amber-500" /></span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredStagiaires.length > 0 && (
                    <div>
                      <p className="px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">🎓 Stagiaires actifs</p>
                      {filteredStagiaires.map(s => (
                        <button key={s.id}
                          onClick={() => {
                            addAssignee.mutate({ projet_id: projet.id, stagiaire_id: s.id, role: 'member' })
                            setPickerOpen(false); setSearch('')
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-violet-50/60 dark:hover:bg-violet-950/20 transition-colors text-left">
                          <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center flex-shrink-0">
                            <span className="font-bold text-[10px]">{getInitials(s.nom_complet)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{s.nom_complet}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{s.formation || s.email || '—'}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assignation en masse des tâches à un membre du projet */}
      <BulkAssignTasksDialog
        open={!!bulkFor}
        onClose={() => { if (!bulkBusy) setBulkFor(null) }}
        targetName={bulkFor ? assigneeLabel(bulkFor) : ''}
        targetKey={bulkFor ? assigneeKeyOf(bulkFor) : ''}
        tasks={tasks}
        members={members}
        stagiaires={stagiaires}
        busy={bulkBusy}
        onConfirm={ids => { if (bulkFor) void runBulkAssign(bulkFor, ids) }}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   BULK ASSIGN DIALOG — donne d'un coup tout ou partie des tâches
   du projet à un membre. Sélection par tâche, par catégorie, ou tout.
═══════════════════════════════════════════════════════════════════ */
function BulkAssignTasksDialog({
  open, onClose, targetName, targetKey, tasks, members, stagiaires, busy, onConfirm,
}: {
  open:       boolean
  onClose:    () => void
  targetName: string
  /** Clé d'assignation de la cible : <member_uuid> ou `stag:<uuid>`. */
  targetKey:  string
  tasks:      TeamMemberTask[]
  members:    TeamMember[]
  stagiaires: Stagiaire[]
  busy:       boolean
  onConfirm:  (ids: string[]) => void
}) {
  /* On ne stocke que des IDS : `tasks` est re-dérivée du cache à chaque refetch
     (polling 10 s), les objets changent d'identité mais pas les ids. */
  const [sel,      setSel]      = useState<Set<string>>(() => new Set())
  const [showDone, setShowDone] = useState(false)

  /* Remise à zéro à l'ouverture, à la fermeture et au changement de cible.
     Ajustement d'état en phase de rendu plutôt qu'un effet : pas de rendu
     intermédiaire affichant la sélection du membre précédent. */
  const openKey = open ? targetKey : null
  const [prevKey, setPrevKey] = useState<string | null>(openKey)
  if (prevKey !== openKey) {
    setPrevKey(openKey)
    setSel(new Set())
    setShowDone(false)
  }

  const isOnTarget = (t: TeamMemberTask) => taskIsOn(t, targetKey)

  const visible = useMemo(
    () => tasks.filter(t => showDone || (t.status !== 'done' && t.status !== 'cancelled')),
    [tasks, showDone],
  )
  const doneHidden = useMemo(
    () => tasks.filter(t => t.status === 'done' || t.status === 'cancelled').length,
    [tasks],
  )
  /** Sélectionnables = tout ce qui n'est pas déjà sur la cible. */
  const selectable = useMemo(() => visible.filter(t => !taskIsOn(t, targetKey)), [visible, targetKey])

  /* Groupes par catégorie, dans l'ordre de l'onglet Tâches (ancienneté du
     premier élément), les demandes client isolées à la fin. */
  const groups = useMemo(() => {
    const ts = (s: string | null) => s ? new Date(s).getTime() : Infinity
    const m = new Map<string, TeamMemberTask[]>()
    for (const t of visible) {
      const k = t.is_request ? '🔔 Demandes client' : (t.category || '— Sans catégorie —')
      const arr = m.get(k) ?? []; arr.push(t); m.set(k, arr)
    }
    for (const [, arr] of m) arr.sort((a, b) => ts(a.created_at) - ts(b.created_at))
    return Array.from(m.entries()).sort(([ka, a], [kb, b]) => {
      if (ka === '🔔 Demandes client') return 1
      if (kb === '🔔 Demandes client') return -1
      return Math.min(...a.map(t => ts(t.created_at))) - Math.min(...b.map(t => ts(t.created_at)))
    })
  }, [visible])

  const toggleTask = (id: string) =>
    setSel(p => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  const toggleGroup = (items: TeamMemberTask[]) => {
    const ids = items.filter(t => !isOnTarget(t)).map(t => t.id)
    const all = ids.length > 0 && ids.every(id => sel.has(id))
    setSel(p => {
      const n = new Set(p)
      ids.forEach(id => { if (all) n.delete(id); else n.add(id) })
      return n
    })
  }

  /* Sélection EFFECTIVE : on repart toujours de ce qui est affiché. Masquer les
     tâches terminées, ou une tâche qui change de main via le polling 10 s, ne
     doit jamais laisser dans le lot une ligne que l'utilisateur ne voit plus. */
  const selectedIds = useMemo(
    () => visible.filter(t => sel.has(t.id) && !taskIsOn(t, targetKey)).map(t => t.id),
    [visible, sel, targetKey],
  )

  /* Combien de ces tâches appartiennent déjà à quelqu'un d'autre : c'est
     l'avertissement qui évite de retirer son travail à un collègue. */
  const stealing = useMemo(
    () => visible.filter(t =>
      selectedIds.includes(t.id) && taskHolder(t, members, stagiaires) !== null,
    ).length,
    [visible, selectedIds, members, stagiaires],
  )

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-500" />
            <span className="truncate">Assigner des tâches à {targetName}</span>
          </DialogTitle>
        </DialogHeader>

        {selectable.length === 0 ? (
          <div className="empty-state py-10">
            <CheckSquare className="empty-state-icon" />
            <p className="empty-state-title">Rien à assigner</p>
            <p className="empty-state-desc">
              {visible.length === 0
                ? 'Aucune tâche en cours sur ce projet'
                : `Toutes les tâches affichées sont déjà assignées à ${targetName}`}
            </p>
            {doneHidden > 0 && !showDone && (
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => setShowDone(true)}>
                Afficher les {doneHidden} terminée{doneHidden > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Barre d'outils */}
            <div className="flex items-center flex-wrap gap-2 pb-2 border-b border-border">
              <Button size="sm" variant="secondary" className="h-8"
                onClick={() => setSel(new Set(selectable.map(t => t.id)))} disabled={busy}>
                Tout sélectionner
              </Button>
              <Button size="sm" variant="secondary" className="h-8"
                onClick={() => setSel(new Set())} disabled={busy || selectedIds.length === 0}>
                Tout décocher
              </Button>
              {doneHidden > 0 && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer min-h-9 px-1">
                  <input type="checkbox" checked={showDone} disabled={busy}
                    onChange={e => setShowDone(e.target.checked)}
                    className="w-4 h-4 accent-blue-600" />
                  Terminées ({doneHidden})
                </label>
              )}
              <span className="ml-auto text-[11px] font-mono text-muted-foreground">
                {selectedIds.length}/{selectable.length}
              </span>
            </div>

            {/* Liste groupée */}
            <div className="max-h-[48dvh] overflow-y-auto space-y-3 pr-1">
              {groups.map(([cat, items]) => {
                const ids  = items.filter(t => !isOnTarget(t)).map(t => t.id)
                const nSel = ids.filter(id => sel.has(id)).length
                return (
                  <div key={cat} className="space-y-1">
                    <label className="flex items-center gap-2 py-1 cursor-pointer sticky top-0 bg-background z-10">
                      <input type="checkbox"
                        checked={ids.length > 0 && nSel === ids.length}
                        ref={el => { if (el) el.indeterminate = nSel > 0 && nSel < ids.length }}
                        disabled={busy || ids.length === 0}
                        onChange={() => toggleGroup(items)}
                        className="w-4 h-4 accent-blue-600" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">{cat}</span>
                      <span className="text-[11px] text-muted-foreground">{nSel}/{items.length}</span>
                    </label>

                    {items.map(t => {
                      const onTarget = isOnTarget(t)
                      const holder   = onTarget ? null : taskHolder(t, members, stagiaires)
                      const checked  = sel.has(t.id)
                      return (
                        <label key={t.id}
                          className={cn(
                            'flex items-start gap-3 p-2.5 min-h-11 rounded-lg border transition-colors',
                            onTarget
                              ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-950/10 cursor-default'
                              : checked
                                ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer'
                                : 'border-border bg-background hover:border-blue-300 cursor-pointer',
                          )}>
                          <input type="checkbox"
                            checked={checked} disabled={busy || onTarget}
                            onChange={() => toggleTask(t.id)}
                            className="mt-0.5 w-4 h-4 accent-blue-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-foreground break-words">{t.title}</p>
                            <div className="flex items-center flex-wrap gap-1.5 mt-1">
                              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', TASK_STATUS_CFG[t.status].cls)}>
                                {TASK_STATUS_CFG[t.status].label}
                              </span>
                              {onTarget && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                  ✓ déjà assignée
                                </span>
                              )}
                              {holder && (
                                <span
                                  title={`Actuellement à ${holder} — l'assigner à ${targetName} la lui retire`}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">
                                  ⚠ {holder}
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground min-w-0">
                {stealing > 0
                  ? <span className="text-amber-600 dark:text-amber-400 font-medium">⚠ {stealing} tâche{stealing > 1 ? 's' : ''} sera retirée à quelqu'un d'autre</span>
                  : `${selectedIds.length} sélectionnée${selectedIds.length > 1 ? 's' : ''}`}
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>Annuler</Button>
                <Button size="sm" disabled={selectedIds.length === 0 || busy} onClick={() => onConfirm(selectedIds)}>
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Assigner {selectedIds.length} tâche{selectedIds.length > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TASKS TAB — categories + validation flow + change requests + timer
═══════════════════════════════════════════════════════════════════ */
function TasksTab({
  projet, tasks, assignees, members, client,
}: { projet: Projet; tasks: TeamMemberTask[]; assignees: ProjetAssignee[]; members: TeamMember[]; client?: Client }) {
  const create = useCreateTeamMemberTask()
  const update = useUpdateTeamMemberTask()
  const remove = useDeleteTeamMemberTask()
  const qc     = useQueryClient()
  const auth   = useAuth()
  const { data: customs = [] } = useCustomTemplates()
  const { data: stagiaires = [] } = useStagiaires()
  /* Stagiaires actifs assignables : si le projet a des assignees stagiaires,
     on restreint à ceux-là ; sinon on propose tous les actifs. */
  const activeStagiaires = stagiaires.filter(s => s.statut === 'accepte' || s.statut === 'en_cours')
  const projectStagiaireIds = new Set(assignees.map(a => a.stagiaire_id).filter(Boolean) as string[])
  const pickableStagiaires = projectStagiaireIds.size > 0
    ? activeStagiaires.filter(s => projectStagiaireIds.has(s.id))
    : activeStagiaires
  const [showTaskForm,    setShowTaskForm]    = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  /** Date du jour au format YYYY-MM-DD (fuseau local) — pré-rempli sur les nouveaux formulaires. */
  const todayISO = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const [taskForm, setTaskForm] = useState({ title: '', team_member_id: 'none', priority: 'normal' as TaskPriority, due_date: todayISO, category: '' })
  const [taskImages, setTaskImages] = useState<string[]>([])
  const [taskBlocks, setTaskBlocks] = useState<SopBlock[]>([])
  const [showTaskDescription, setShowTaskDescription] = useState(false)
  const [taskRecurrence, setTaskRecurrence] = useState<TaskRecurrence | null>(null)
  const [recurrenceDialogOpen, setRecurrenceDialogOpen] = useState(false)
  const [reqForm,  setReqForm]  = useState({ title: '', team_member_id: 'none', priority: 'high' as TaskPriority, due_date: todayISO, price: '' })

  const handleTaskPaste = async (e: React.ClipboardEvent) => {
    const files = extractImageFilesFromClipboard(e)
    if (files.length === 0) return
    e.preventDefault()
    try {
      const urls = await Promise.all(files.map(compressImageToDataURL))
      setTaskImages(p => [...p, ...urls])
      toast.success(`${urls.length} image${urls.length > 1 ? 's' : ''} collée${urls.length > 1 ? 's' : ''}`)
    } catch (err: any) {
      toast.error(err?.message ?? 'Impossible de coller l\'image')
    }
  }

  const openTask = openTaskId ? tasks.find(t => t.id === openTaskId) : null

  /** Bulk-create tasks from chosen templates (applied to this existing project). */
  const applyTemplates = async (templateKeys: string[]) => {
    if (templateKeys.length === 0) return
    setSeeding(true)
    let count = 0
    try {
      /* Resolve key → template, looking in custom (DB) first then built-ins. */
      const customsAsTemplates = customs.map(rowToTemplate)
      const templates = templateKeys
        .map(k => customsAsTemplates.find(t => t.key === k) ?? PROJET_TEMPLATES.find(t => t.key === k))
        .filter(Boolean) as ProjetTemplate[]
      /* Une catégorie = une tâche, ses étapes en checklist.
         La règle et son pourquoi vivent dans templateTasks.ts, partagé
         avec la création de projet pour que les deux chemins produisent
         exactement les mêmes tâches. */
      for (const t of buildTasksFromTemplates(templates)) {
        try {
          await teamMemberTasksApi.create({
            project_id:     projet.id,
            team_member_id: null,
            status:         'todo',
            ...t,
          } as any)
          count++
        } catch (e: any) { console.error('[applyTemplate]', e?.message ?? e) }
      }
      /* Force refetch so the UI updates immediately without manual reload. */
      await qc.refetchQueries({ queryKey: ['team_member_tasks'] })
      toast.success(`${count} tâche${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''}`)
    } finally {
      setSeeding(false)
      setShowTemplateDialog(false)
    }
  }

  /* Members that can be assigned (only those on the project, fallback to all). */
  const pickable = assignees.length > 0
    ? members.filter(m => assignees.some(a => a.team_member_id === m.id))
    : members

  /* Split regular tasks vs change requests */
  const regular = tasks.filter(t => !t.is_request)
  const requests = tasks.filter(t => t.is_request)

  /* Group regular tasks by category (templates seed this field).
     Tri intra-groupe : mes tâches admin d'abord, puis open avant done,
     puis par due_date, puis par ordre chronologique de création (ASC)
     pour que les tâches d'un template apparaissent dans l'ordre défini
     (du début à la fin) et pas inversé.
     Ordre des catégories : par date de création de leur première tâche
     (ASC) — la première catégorie créée apparaît en tête. */
  const byCategory = useMemo(() => {
    const m = new Map<string, TeamMemberTask[]>()
    for (const t of regular) {
      const k = t.category || '— Sans catégorie —'
      const arr = m.get(k) ?? []; arr.push(t); m.set(k, arr)
    }
    const STATUS_ORDER: Record<string, number> = { in_progress: 0, validation: 1, todo: 2, done: 3, cancelled: 4 }
    const tsOf = (s: string | null) => s ? new Date(s).getTime() : Infinity
    for (const [, arr] of m) {
      arr.sort((a, b) => {
        const aMine = a.assigned_user_id === auth.userId ? 0 : 1
        const bMine = b.assigned_user_id === auth.userId ? 0 : 1
        if (aMine !== bMine) return aMine - bMine
        const aStatus = STATUS_ORDER[a.status] ?? 9
        const bStatus = STATUS_ORDER[b.status] ?? 9
        if (aStatus !== bStatus) return aStatus - bStatus
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity
        if (ad !== bd) return ad - bd
        // Ordre chronologique de création ASC (ancien en premier)
        return tsOf(a.created_at) - tsOf(b.created_at)
      })
    }
    // Trier les catégories par la plus ancienne tâche de chacune
    return Array.from(m.entries()).sort(([, arrA], [, arrB]) => {
      const minA = Math.min(...arrA.map(t => tsOf(t.created_at)))
      const minB = Math.min(...arrB.map(t => tsOf(t.created_at)))
      return minA - minB
    })
  }, [regular, auth.userId])

  const assigneeFields = (v: string) => assigneeFieldsFor(v, auth.userId)

  const submitTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskForm.title.trim()) return
    const description = serializeTaskDesc({ blocks: taskBlocks })
    create.mutate({
      project_id:     projet.id,
      ...assigneeFields(taskForm.team_member_id),
      title:          taskForm.title.trim(),
      priority:       taskForm.priority,
      due_date:       taskForm.due_date || null,
      category:       taskForm.category.trim() || null,
      attachments:    taskImages,
      description:    description || null,
      recurrence:     taskRecurrence,
    } as any, {
      onSuccess: () => {
        setTaskForm({ title: '', team_member_id: 'none', priority: 'normal', due_date: '', category: '' })
        setTaskImages([])
        setTaskBlocks([])
        setShowTaskDescription(false)
        setShowTaskForm(false)
        setTaskRecurrence(null)
      },
    })
  }

  const submitRequest = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reqForm.title.trim()) return
    create.mutate({
      project_id:     projet.id,
      ...assigneeFields(reqForm.team_member_id),
      title:          reqForm.title.trim(),
      priority:       reqForm.priority,
      due_date:       reqForm.due_date || null,
      is_request:     true,
      request_price:  reqForm.price ? Number(reqForm.price) : null,
    } as any, {
      onSuccess: () => { setReqForm({ title: '', team_member_id: 'none', priority: 'high', due_date: '', price: '' }); setShowRequestForm(false) },
    })
  }

  return (
    <div className="space-y-4">
      {/* ── Tâches du projet ───────────────────────────────────── */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Tâches du projet</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {assignees.length === 0
                ? '⚠️ Assigne d\'abord des membres pour pouvoir leur attribuer les tâches'
                : 'Le membre clique « Terminer » → la tâche passe en Validation → tu valides ou renvoies'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowTemplateDialog(true)}>
              <Sparkles className="w-3.5 h-3.5" /> Appliquer un template
            </Button>
            <Button size="sm" onClick={() => setShowTaskForm(s => !s)}>
              <Plus className="w-3.5 h-3.5" /> Nouvelle tâche
            </Button>
          </div>
        </div>

        {showTaskForm && (
          <form onSubmit={submitTask} onPaste={handleTaskPaste} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AutocorrectInput autoFocus value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="Titre de la tâche… (Cmd+V pour coller une image)" className="flex-1" />
              <AIButton
                value={taskForm.title}
                onChange={v => setTaskForm(p => ({ ...p, title: v }))}
                kinds={['correct', 'translate', 'rewrite', 'generate']}
                generationKind="tache"
              />
            </div>
            {taskImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {taskImages.map((src, i) => (
                  <div key={i} className="relative group/img">
                    <img src={src} alt={`Pièce jointe ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-border" />
                    <button
                      type="button"
                      onClick={() => setTaskImages(p => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                      title="Retirer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <AutocorrectInput value={taskForm.category} onChange={e => setTaskForm(p => ({ ...p, category: e.target.value }))} placeholder="Catégorie (ex: Design)" className="h-9" />
              <Select value={taskForm.team_member_id} onValueChange={v => setTaskForm(p => ({ ...p, team_member_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Assigner…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non assigné</SelectItem>
                  <SelectItem value="admin">🛡️ Moi (Admin)</SelectItem>
                  {pickable.map(m => <SelectItem key={m.id} value={m.id}>{memberName(m)}</SelectItem>)}
                  {pickableStagiaires.length > 0 && pickableStagiaires.map(s => (
                    <SelectItem key={`stag:${s.id}`} value={`stag:${s.id}`}>🎓 {s.nom_complet}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={taskForm.priority} onValueChange={v => setTaskForm(p => ({ ...p, priority: v as TaskPriority }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(TASK_PRIORITY_CFG) as [TaskPriority, { label: string; cls: string }][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={taskForm.due_date} onChange={e => setTaskForm(p => ({ ...p, due_date: e.target.value }))} className="h-9" />
            </div>
            {/* Bouton de récurrence */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRecurrenceDialogOpen(true)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                  taskRecurrence
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                    : 'border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground',
                )}
              >
                <span>🔁</span>
                {taskRecurrence
                  ? describeRecurrence(taskRecurrence)
                  : 'Ne se répète pas'}
              </button>
              {taskRecurrence && (
                <button
                  type="button"
                  onClick={() => setTaskRecurrence(null)}
                  className="text-[11px] text-muted-foreground hover:text-rose-500"
                  title="Retirer la récurrence"
                >
                  Retirer
                </button>
              )}
            </div>
            {showTaskDescription ? (
              <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    Description (Cmd+V pour coller un contenu structuré)
                  </label>
                  <button
                    type="button"
                    onClick={() => { setShowTaskDescription(false); setTaskBlocks([]) }}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Masquer
                  </button>
                </div>
                <BlockEditor
                  value={taskBlocks}
                  onChange={setTaskBlocks}
                  placeholder="Décris la tâche — tape « / » pour insérer, ou Cmd+V pour coller titres, checklists, tableaux…"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTaskDescription(true)}
                className="text-[11px] text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Ajouter description (titres, checklists, tableaux via Cmd+V)
              </button>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => { setShowTaskForm(false); setTaskImages([]); setTaskBlocks([]); setShowTaskDescription(false) }}>Annuler</Button>
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Créer
              </Button>
            </div>
          </form>
        )}

        {regular.length === 0 ? (
          <div className="empty-state py-10">
            <CheckSquare className="empty-state-icon" />
            <p className="empty-state-title">Aucune tâche</p>
            <p className="empty-state-desc">Clique <strong>« Appliquer un template »</strong> pour générer toutes les tâches d'un coup, ou crée-les manuellement</p>
            <Button size="sm" className="mt-3" onClick={() => setShowTemplateDialog(true)}>
              <Sparkles className="w-3.5 h-3.5" /> Choisir un template
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {byCategory.map(([cat, items]) => {
              const done = items.filter(t => t.status === 'done').length
              const pct  = Math.round((done / items.length) * 100)

              /* Assigner en masse toutes les tâches de la catégorie */
              const bulkAssign = (v: string) => {
                const fields = assigneeFields(v)
                const label =
                  v === 'none'  ? 'désassignées'
                  : v === 'admin' ? 'assignées à toi'
                  : v.startsWith('stag:')
                    ? `assignées à ${stagiaires.find(s => s.id === v.slice(5))?.nom_complet ?? 'ce stagiaire'}`
                    : `assignées à ${memberName(pickable.find(m => m.id === v)!)}`
                Promise.all(items.map(t => update.mutateAsync({ id: t.id, ...fields } as any)))
                  .then(() => toast.success(`${items.length} tâche${items.length > 1 ? 's' : ''} ${label}`))
                  .catch(() => toast.error("Erreur lors de l'assignation groupée"))
              }

              return (
                <div key={cat} className="space-y-1.5">
                  <div className="flex items-center gap-3 pb-1.5 border-b border-border">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">{cat}</span>
                    <span className="text-[11px] text-muted-foreground">{done}/{items.length}</span>
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden max-w-[120px]">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground">{pct}%</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                          title={`Assigner toutes les tâches "${cat}" à…`}
                        >
                          <UserPlus className="w-3 h-3" />
                          Assigner
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Assigner les {items.length} tâches à…
                        </div>
                        <DropdownMenuItem onClick={() => bulkAssign('admin')}>
                          🛡️ Moi (Admin)
                        </DropdownMenuItem>
                        {pickable.length > 0 && (
                          <>
                            <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-t border-border mt-1">
                              Membres
                            </div>
                            {pickable.map(m => (
                              <DropdownMenuItem key={m.id} onClick={() => bulkAssign(m.id)}>
                                👤 {memberName(m)}
                                {m.poste && <span className="text-[10px] text-muted-foreground ml-1">· {m.poste}</span>}
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                        {pickableStagiaires.length > 0 && (
                          <>
                            <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-t border-border mt-1">
                              Stagiaires
                            </div>
                            {pickableStagiaires.map(s => (
                              <DropdownMenuItem key={`stag:${s.id}`} onClick={() => bulkAssign(`stag:${s.id}`)}>
                                🎓 {s.nom_complet}
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                        <div className="border-t border-border mt-1 pt-1">
                          <DropdownMenuItem onClick={() => bulkAssign('none')} className="text-muted-foreground">
                            <X className="w-3.5 h-3.5 mr-1" /> Tout désassigner
                          </DropdownMenuItem>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-1">
                    {items.map(t => (
                      <TaskRow key={t.id} task={t} members={members} pickable={pickable} stagiaires={stagiaires} pickableStagiaires={pickableStagiaires}
                        onChange={patch => update.mutate({ id: t.id, ...patch })}
                        onRemove={() => remove.mutate(t.id)}
                        onOpen={() => setOpenTaskId(t.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Demandes client (changements / ajouts) ─────────────── */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Demandes client
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Changements ou ajouts demandés en cours de projet. Chaque demande peut être facturée à part.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowRequestForm(s => !s)}>
            <Plus className="w-3.5 h-3.5" /> Nouvelle demande
          </Button>
        </div>

        {showRequestForm && (
          <form onSubmit={submitRequest} className="rounded-xl border-2 border-violet-200 dark:border-violet-800/50 bg-violet-50/30 dark:bg-violet-950/10 p-3 space-y-2">
            <AutocorrectInput autoFocus value={reqForm.title} onChange={e => setReqForm(p => ({ ...p, title: e.target.value }))} placeholder="Demande client (ex: Changer la couleur du bouton)" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Select value={reqForm.team_member_id} onValueChange={v => setReqForm(p => ({ ...p, team_member_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Assigner…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non assigné</SelectItem>
                  <SelectItem value="admin">🛡️ Moi (Admin)</SelectItem>
                  {pickable.map(m => <SelectItem key={m.id} value={m.id}>{memberName(m)}</SelectItem>)}
                  {pickableStagiaires.map(s => (
                    <SelectItem key={`stag:${s.id}`} value={`stag:${s.id}`}>🎓 {s.nom_complet}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={reqForm.priority} onValueChange={v => setReqForm(p => ({ ...p, priority: v as TaskPriority }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(TASK_PRIORITY_CFG) as [TaskPriority, { label: string; cls: string }][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" value={reqForm.price} onChange={e => setReqForm(p => ({ ...p, price: e.target.value }))} placeholder="Prix MAD" className="h-9" />
              <Input type="date" value={reqForm.due_date} onChange={e => setReqForm(p => ({ ...p, due_date: e.target.value }))} className="h-9" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowRequestForm(false)}>Annuler</Button>
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Créer la demande
              </Button>
            </div>
          </form>
        )}

        {requests.length === 0 ? (
          <p className="text-xs text-muted-foreground/70 text-center py-4">Aucune demande en cours</p>
        ) : (
          <div className="space-y-1.5">
            {requests.map(t => (
              <TaskRow key={t.id} task={t} members={members} pickable={pickable} stagiaires={stagiaires} pickableStagiaires={pickableStagiaires} isRequest
                onChange={patch => update.mutate({ id: t.id, ...patch })}
                onRemove={() => remove.mutate(t.id)}
                onOpen={() => setOpenTaskId(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Template picker dialog */}
      <TemplatePickerDialog
        open={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onApply={applyTemplates}
        loading={seeding}
      />

      {/* Recurrence config dialog */}
      <RecurrenceDialog
        open={recurrenceDialogOpen}
        onOpenChange={setRecurrenceDialogOpen}
        value={taskRecurrence}
        onSave={setTaskRecurrence}
      />

      {/* Task detail dialog */}
      {openTask && (
        <TaskDetailDialog
          open={!!openTask}
          onClose={() => setOpenTaskId(null)}
          task={{
            ...openTask,
            project_name:     projet.nom,
            team_member_name: (() => { const m = members.find(x => x.id === openTask.team_member_id); return m ? `${m.prenom} ${m.nom}`.trim() : null })(),
          }}
          currentUserName={auth.name ?? auth.email ?? 'Admin'}
          isAdmin={true}
          projet={projet}
          client={client}
          onSave={async (patch) => {
            await update.mutateAsync({ id: openTask.id, ...patch } as any)
          }}
        />
      )}
    </div>
  )
}

function TemplatePickerDialog({
  open, onClose, onApply, loading,
}: {
  open:     boolean
  onClose:  () => void
  onApply:  (keys: string[]) => void
  loading:  boolean
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const { data: customs = [] } = useCustomTemplates()
  useEffect(() => { if (!open) setSelected([]) }, [open])

  /* Merge built-in + custom templates (custom first so they're easy to find). */
  const allTemplates = useMemo(
    () => [...customs.map(rowToTemplate), ...PROJET_TEMPLATES],
    [customs]
  )
  /* Ce qui sera réellement créé : une tâche par catégorie, les étapes
     devenant sa checklist. Annoncer les deux évite de promettre 44
     tâches pour en poser 9. */
  const total = selected.reduce((acc, k) => {
    const t = allTemplates.find(x => x.key === k)
    if (!t) return acc
    const c = countTemplate(t)
    return { taches: acc.taches + c.taches, etapes: acc.etapes + c.etapes }
  }, { taches: 0, etapes: 0 })
  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" /> Appliquer un ou plusieurs templates
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between -mt-2">
          <p className="text-xs text-muted-foreground">
            Coche les templates à appliquer. Chaque catégorie devient une tâche (non assignée), ses étapes sa checklist.
          </p>
          <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)} className="flex-shrink-0">
            <Settings className="w-3.5 h-3.5" /> Gérer
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          {allTemplates.map(tpl => {
            const isSel = selected.includes(tpl.key)
            const { taches, etapes } = countTemplate(tpl)
            const isCustom = tpl.key.startsWith('custom:')
            return (
              <label key={tpl.key}
                className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                  isSel ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm' : 'border-border bg-background hover:border-blue-300'
                }`}>
                <input type="checkbox" checked={isSel}
                  onChange={() => setSelected(p => isSel ? p.filter(k => k !== tpl.key) : [...p, tpl.key])}
                  className="mt-0.5 w-4 h-4 accent-blue-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <span>{tpl.emoji}</span> {tpl.label}
                    <span className="text-[10px] font-mono text-muted-foreground">({taches} tâches · {etapes} étapes)</span>
                    {isCustom && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">PERSO</span>}
                  </p>
                  {tpl.description && <p className="text-[11px] text-muted-foreground mt-0.5">{tpl.description}</p>}
                </div>
              </label>
            )
          })}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border">
          {total.taches > 0
            ? <span className="text-xs font-bold px-2 py-1 rounded bg-blue-600 text-white">
                {total.taches} tâche{total.taches > 1 ? 's' : ''} · {total.etapes} étape{total.etapes > 1 ? 's' : ''} à cocher
              </span>
            : <span className="text-xs text-muted-foreground">Aucun template sélectionné</span>}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
            <Button size="sm" disabled={selected.length === 0 || loading} onClick={() => onApply(selected)}>
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Appliquer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <TemplateEditorDialog open={editorOpen} onClose={() => setEditorOpen(false)} />
    </>
  )
}

/**
 * « L'employé a-t-il vu cette tâche ? » — le ✓✓ de WhatsApp appliqué aux
 * tâches. viewed_at est posé par le serveur à la première ouverture de
 * la fiche par la personne assignée, ou dès qu'elle agit dessus
 * (démarrage du chrono, changement de statut).
 *
 * Rien n'est affiché sur une tâche sans destinataire : il n'y a personne
 * pour la lire, un « Non lu » y serait un reproche adressé à personne.
 */
function TaskViewedBadge({ task, hasAssignee }: {
  task: TeamMemberTask
  hasAssignee: boolean
}) {
  if (!hasAssignee) return null

  if (!task.viewed_at) {
    return (
      <span
        className="flex items-center gap-1 text-muted-foreground/70"
        title="La personne assignée n'a pas encore ouvert cette tâche"
      >
        <Check className="w-3 h-3" /> Non lu
      </span>
    )
  }

  const d = new Date(task.viewed_at)
  const quand = d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  return (
    <span
      className="flex items-center gap-1 text-blue-500 dark:text-blue-400 font-medium"
      title={`Vu par ${task.viewed_by_name ?? 'la personne assignée'} le ${quand}`}
    >
      <CheckCheck className="w-3 h-3" /> Vu
    </span>
  )
}

function TaskRow({
  task, members, pickable, stagiaires, pickableStagiaires, isRequest, onChange, onRemove, onOpen,
}: {
  task:              TeamMemberTask
  members:           TeamMember[]
  pickable:          TeamMember[]
  stagiaires:        Stagiaire[]
  pickableStagiaires:Stagiaire[]
  isRequest?:        boolean
  onChange:          (patch: Partial<TeamMemberTask>) => void
  onRemove:          () => void
  onOpen?:           () => void
}) {
  const auth = useAuth()
  const m = task.team_member_id ? members.find(x => x.id === task.team_member_id) : null
  const stagiaireAssigned = task.assigned_stagiaire_id ? stagiaires.find(x => x.id === task.assigned_stagiaire_id) : null
  const isAdminAssigned = !!task.assigned_user_id
  const cfg = TASK_STATUS_CFG[task.status]

  /* Timer state — live elapsed seconds from localStorage + DB cumul */
  const [tick, setTick] = useState(0)
  const active = getActiveTimer()
  const isRunning = active?.taskId === task.id
  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [isRunning])
  const liveExtra = isRunning && active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0
  const totalSeconds = (task.elapsed_seconds ?? 0) + liveExtra

  const start = () => {
    setActiveTimer({ taskId: task.id, startedAt: Date.now() })
    if (task.status === 'todo') onChange({ status: 'in_progress' })
    setTick(t => t + 1)
  }
  const pause = () => {
    const a = getActiveTimer(); if (!a || a.taskId !== task.id) return
    const extra = Math.floor((Date.now() - a.startedAt) / 1000)
    setActiveTimer(null)
    onChange({ elapsed_seconds: (task.elapsed_seconds ?? 0) + extra })
    setTick(t => t + 1)
  }
  const finish = () => {
    const a = getActiveTimer()
    const extra = a?.taskId === task.id ? Math.floor((Date.now() - a.startedAt) / 1000) : 0
    if (a?.taskId === task.id) setActiveTimer(null)
    onChange({ elapsed_seconds: (task.elapsed_seconds ?? 0) + extra, status: 'validation' })
    toast.success(`✓ Tâche envoyée en validation`)
    setTick(t => t + 1)
  }
  const validate = () => { onChange({ status: 'done' }); toast.success('✓ Validé') }
  const sendBack = () => { onChange({ status: 'in_progress' }); toast.info('↩ Renvoyé pour correction') }

  return (
    <div className={cn(
      'flex items-center gap-3 p-2.5 rounded-lg border bg-background hover:border-blue-500/30 transition-colors group',
      isRequest ? 'border-violet-200 dark:border-violet-800/40 bg-violet-50/20 dark:bg-violet-950/10' : 'border-border',
    )}>
      <button onClick={() => onChange({ status: task.status === 'done' ? 'todo' : 'done' })} className="text-base flex-shrink-0" title="Toggle terminé">
        {task.status === 'done' ? <Check className="w-4 h-4 text-emerald-500" /> : <CircleDot className="w-4 h-4 text-muted-foreground" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpen}
            className={cn(
              'text-sm font-medium text-left hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors',
              task.status === 'done' && 'line-through text-muted-foreground',
            )}
            title="Cliquer pour voir les détails / commentaires"
          >
            {task.title}
          </button>
          {task.attachments?.length > 0 && (
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
              title={`${task.attachments.length} pièce${task.attachments.length > 1 ? 's' : ''} jointe${task.attachments.length > 1 ? 's' : ''}`}
            >
              📎 {task.attachments.length}
            </button>
          )}
          {isRequest && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
              📌 Demande
            </span>
          )}
          {task.recurrence && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
              title={`Récurrence : ${describeRecurrence(task.recurrence)}`}
            >
              🔁 {describeRecurrence(task.recurrence)}
            </span>
          )}
          {task.is_request && task.request_price != null && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              {formatCurrency(task.request_price)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
          {/* Avatar + select on single line */}
          <div className="flex items-center gap-1.5 min-w-0">
            {task.team_member_id && m ? (
              <div className="avatar-initials w-4 h-4 text-[8px] flex-shrink-0">
                <span className="font-bold">{getInitials(`${m.prenom} ${m.nom}`)}</span>
              </div>
            ) : isAdminAssigned ? (
              <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                <span className="text-[8px]">🛡️</span>
              </div>
            ) : stagiaireAssigned ? (
              <div className="w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                <span className="text-[8px]">🎓</span>
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <span className="text-[8px]">👤</span>
              </div>
            )}
            <Select
              value={
                isAdminAssigned          ? 'admin'
                : stagiaireAssigned      ? `stag:${stagiaireAssigned.id}`
                : (task.team_member_id ?? 'none')
              }
              onValueChange={v => {
                if (v === 'none') return
                if (v === 'admin')             onChange({ team_member_id: null, assigned_user_id: auth.userId ?? null, assigned_stagiaire_id: null } as any)
                else if (v.startsWith('stag:'))onChange({ team_member_id: null, assigned_user_id: null, assigned_stagiaire_id: v.slice(5) } as any)
                else                            onChange({ team_member_id: v,   assigned_user_id: null, assigned_stagiaire_id: null } as any)
              }}
            >
              <SelectTrigger className={cn(
                'h-6 px-1.5 text-[11px] border-transparent shadow-none w-auto min-w-0 gap-1 hover:bg-muted/50 focus:bg-muted/50',
                !task.team_member_id && !isAdminAssigned && !stagiaireAssigned && 'text-amber-600 dark:text-amber-400 font-medium',
                isAdminAssigned      && 'text-blue-600 dark:text-blue-400 font-medium',
                stagiaireAssigned    && 'text-violet-600 dark:text-violet-400 font-medium',
              )}>
                <span className="truncate max-w-[120px]">
                  {isAdminAssigned          ? 'Moi (Admin)'
                    : stagiaireAssigned     ? `🎓 ${stagiaireAssigned.nom_complet}`
                    : task.team_member_id   ? memberName(m ?? undefined)
                    : 'Non assigné'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">🛡️ Moi (Admin)</SelectItem>
                {pickable.map(x => <SelectItem key={x.id} value={x.id}>{memberName(x)}</SelectItem>)}
                {pickableStagiaires.map(s => (
                  <SelectItem key={`stag:${s.id}`} value={`stag:${s.id}`}>🎓 {s.nom_complet}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {task.due_date && (
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(task.due_date)}</span>
          )}
          <span className={cn('flex items-center gap-1', TASK_PRIORITY_CFG[task.priority].cls)}>
            ● <span>{TASK_PRIORITY_CFG[task.priority].label}</span>
          </span>
          {totalSeconds > 0 && (
            <span className={cn('flex items-center gap-1 font-mono', isRunning && 'text-amber-500 font-bold')}>
              ⏱ {formatHMS(totalSeconds)}{isRunning && ' …'}
            </span>
          )}
          <TaskViewedBadge task={task} hasAssignee={!!task.team_member_id || !!task.assigned_stagiaire_id} />
        </div>
      </div>

      {/* Timer controls — visible when task is active or in progress */}
      {(task.status === 'todo' || task.status === 'in_progress') && (
        <div className="flex items-center gap-0.5">
          {!isRunning ? (
            <Button variant="ghost" size="icon" className="w-7 h-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={start} title={totalSeconds > 0 ? 'Continuer' : 'Commencer'}>
              <Play className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="w-7 h-7 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" onClick={pause} title="Pause">
              <Pause className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="w-7 h-7 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20" onClick={finish} title="Terminer (passe en validation)">
            <Square className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Validation actions — manager validates or sends back */}
      {task.status === 'validation' && (
        <div className="flex items-center gap-1">
          <Button size="sm" className="h-7 text-xs bg-emerald-500 hover:bg-emerald-600 text-white border-0" onClick={validate}>
            <Check className="w-3 h-3" /> Valider
          </Button>
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={sendBack}>
            <RotateCcw className="w-3 h-3" /> Renvoyer
          </Button>
        </div>
      )}

      <Badge className={cn('text-[10px] font-bold', cfg.cls)}>{cfg.emoji} {cfg.label}</Badge>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(Object.entries(TASK_STATUS_CFG) as [TaskStatus, { label: string; cls: string; emoji: string }][]).filter(([k]) => k !== task.status).map(([k, v]) => (
            <DropdownMenuItem key={k} onClick={() => onChange({ status: k })}>{v.emoji} Forcer → {v.label}</DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={onRemove} className="text-red-500"><Trash2 className="w-3.5 h-3.5 mr-2" /> Supprimer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   DOCS TAB — Notion-style block editor (auto-save)
═══════════════════════════════════════════════════════════════════ */
function DocsTab({ projet }: { projet: Projet }) {
  const initial = useMemo(() => parseProjetNotes(projet.notes), [projet.notes])
  const [blocks, setBlocks] = useState<SopBlock[]>(initial.blocks)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [mode, setMode] = useState<'preview' | 'edit'>(initial.blocks.length === 0 ? 'edit' : 'preview')
  const lastSerialized = useRef<string>(projet.notes ?? '')
  const qc = useQueryClient()

  useEffect(() => {
    setBlocks(initial.blocks)
    lastSerialized.current = projet.notes ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projet.id])

  useEffect(() => {
    const next = serializeProjetNotes(initial.text, blocks)
    if (next === lastSerialized.current) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        await projetsApi.update(projet.id, { notes: next })
        lastSerialized.current = next
        qc.invalidateQueries({ queryKey: ['projets'] })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1500)
      } catch (e: any) {
        toast.error(e?.message ?? 'Erreur de sauvegarde')
        setSaveState('idle')
      }
    }, 600)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks])

  return (
    <div className="card-premium p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Documentation projet</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {mode === 'edit'
              ? 'Brief, spécifications, livrables — tapez « / » pour insérer un bloc.'
              : 'Aperçu formaté de ta documentation projet.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            'text-[11px] font-medium',
            saveState === 'saving' && 'text-amber-500',
            saveState === 'saved'  && 'text-emerald-600 dark:text-emerald-400',
            saveState === 'idle'   && 'text-muted-foreground',
          )}>
            {saveState === 'saving' && '💾 Enregistrement…'}
            {saveState === 'saved'  && '✓ Enregistré'}
          </span>
          {/* Toggle Aperçu / Édition */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-muted/30">
            <button onClick={() => setMode('preview')}
              className={cn('px-3 py-1 rounded-md text-xs font-semibold transition-colors',
                mode === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              disabled={blocks.length === 0}
            >
              👁 Aperçu
            </button>
            <button onClick={() => setMode('edit')}
              className={cn('px-3 py-1 rounded-md text-xs font-semibold transition-colors',
                mode === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              ✏ Édition
            </button>
          </div>
        </div>
      </div>

      {mode === 'preview' && blocks.length > 0 ? (
        <div className="rounded-xl border border-border bg-background p-6 space-y-4">
          <SopBlocksRenderer blocks={blocks} />
        </div>
      ) : (
        <BlockEditor value={blocks} onChange={setBlocks} placeholder="Cliquer pour commencer à documenter ce projet…" />
      )}
    </div>
  )
}
