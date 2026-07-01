import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Plus, Search, Briefcase, Trash2, Edit2, ChevronDown, ChevronRight,
  Calendar, DollarSign, CheckCircle2, Clock, Pause, Ban, Building2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  useProjets, useCreateProjet, useUpdateProjet, useDeleteProjet,
  type Projet, type ProjetStatut, type ProjetPriorite,
} from '@/hooks/useProjets'
import { useClients } from '@/hooks/useClients'
import { PROJET_TEMPLATES, type ProjetTemplate } from '@/lib/projetTemplates'
import { teamMemberTasksApi } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTeamMemberTasks } from '@/hooks/useTeamMemberTasks'
import { useProjetAssignees } from '@/hooks/useProjetAssignees'
import { useTeam } from '@/hooks/useTeam'
import { useCustomTemplates, rowToTemplate } from '@/hooks/useProjetTemplates'
import TemplateEditorDialog from '@/components/projet/TemplateEditorDialog'
import AdminTasksPanel from '@/components/projet/AdminTasksPanel'
import { Settings } from 'lucide-react'

const STATUT_CONFIG: Record<ProjetStatut, { label: string; variant: 'default'|'success'|'warning'|'secondary'|'destructive'; icon: React.ElementType }> = {
  planifie: { label: 'Planifié',  variant: 'default',     icon: Calendar      },
  en_cours: { label: 'En cours',  variant: 'warning',     icon: Clock         },
  en_pause: { label: 'En pause',  variant: 'secondary',   icon: Pause         },
  termine:  { label: 'Terminé',   variant: 'success',     icon: CheckCircle2  },
  annule:   { label: 'Annulé',    variant: 'destructive', icon: Ban           },
}

const PRIORITE_CONFIG: Record<ProjetPriorite, { label: string; color: string }> = {
  basse:    { label: 'Basse',    color: 'text-slate-500' },
  normale:  { label: 'Normale',  color: 'text-blue-600 dark:text-blue-400' },
  haute:    { label: 'Haute',    color: 'text-orange-600 dark:text-orange-400' },
  urgente:  { label: 'Urgente',  color: 'text-red-600 dark:text-red-400' },
}

const EMPTY: Partial<Projet> = {
  nom: '',
  description: '',
  client_id: null,
  statut: 'planifie',
  priorite: 'normale',
  date_debut: null,
  date_fin_prevue: null,
  date_fin_reelle: null,
  budget: 0,
  cout_reel: 0,
  progression: 0,
  responsable: '',
  notes: '',
}

/* ── Searchable client combobox ───────────────────────────────── */
function ClientPicker({ value, onChange }: { value: string | null; onChange: (id: string | null, nom: string) => void }) {
  const { data: clients = [] } = useClients()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = clients.find(c => c.id === value)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    /* Préserve l'ordre exact de la table /clients (created_at DESC),
       pour que la recherche corresponde à ce que l'utilisateur voit ailleurs. */
    const list = clients
    if (!q) return list
    return list.filter(c =>
      (c.nom ?? '').toLowerCase().includes(q) ||
      (c.entreprise ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    )
  }, [clients, query])

  const display = open ? query : (selected?.nom ?? '')

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={display}
        placeholder="Aucun client (projet interne) — tape pour rechercher..."
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 italic text-muted-foreground"
            onMouseDown={e => { e.preventDefault(); onChange(null, ''); setOpen(false) }}
          >
            — Projet interne (aucun client) —
          </button>
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60"
              onMouseDown={e => { e.preventDefault(); onChange(c.id, c.nom); setOpen(false) }}
            >
              {c.nom}
              {c.entreprise ? <span className="text-muted-foreground"> · {c.entreprise}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Project card (expandable row) ────────────────────────────── */
function ProjetCard({ projet, clientNom, projectTasks, onDelete, onEdit, onOpenClient, onOpen }: {
  projet: Projet
  clientNom: string | undefined
  /** Tâches de ce projet (passées depuis le parent qui a déjà les data) —
      utilisées pour calculer dynamiquement la progression : done / total. */
  projectTasks: { status: string }[]
  onDelete: (id: string) => void
  onEdit: (p: Projet) => void
  onOpenClient: (id: string) => void
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const statut = STATUT_CONFIG[projet.statut] ?? STATUT_CONFIG.planifie
  const StatutIcon = statut.icon
  const priorite = PRIORITE_CONFIG[projet.priorite] ?? PRIORITE_CONFIG.normale

  const marge = (projet.budget ?? 0) - (projet.cout_reel ?? 0)
  const margeColor = marge >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'

  /* Progression auto = ratio tâches done / total. Fallback sur le champ
     manuel projet.progression si aucune tâche existe. */
  const totalTasks = projectTasks.length
  const doneTasks  = projectTasks.filter(t => t.status === 'done').length
  const progression = totalTasks > 0
    ? Math.round((doneTasks / totalTasks) * 100)
    : (projet.progression ?? 0)

  return (
    <div className="card-premium overflow-hidden">
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <button className="text-muted-foreground" type="button">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={e => { e.stopPropagation(); onOpen(projet.id) }}
              className="font-bold text-foreground text-sm truncate hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors text-left"
              title="Ouvrir le projet"
            >
              {projet.nom}
            </button>
            {clientNom && (
              <button
                onClick={e => { e.stopPropagation(); if (projet.client_id) onOpenClient(projet.client_id) }}
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Building2 className="w-3 h-3" />
                {clientNom}
              </button>
            )}
            <span className={`text-[11px] font-bold ${priorite.color}`}>{priorite.label}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {projet.date_debut && <span>{formatDate(projet.date_debut)}</span>}
            {projet.date_debut && projet.date_fin_prevue && <span>→</span>}
            {projet.date_fin_prevue && <span>{formatDate(projet.date_fin_prevue)}</span>}
            {projet.responsable && <><span>·</span><span>{projet.responsable}</span></>}
          </div>
        </div>

        {/* Progression bar — auto-calculée depuis les tâches */}
        <div className="hidden sm:flex flex-col items-end gap-1 w-32">
          <span className="text-xs font-semibold text-muted-foreground">
            {progression}%
            {totalTasks > 0 && <span className="text-[10px] text-muted-foreground/70 ml-1">({doneTasks}/{totalTasks})</span>}
          </span>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progression}%`,
                background: progression === 100
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #6366f1, #818cf8)',
              }}
            />
          </div>
        </div>

        {(projet.budget ?? 0) > 0 && (
          <span className="hidden md:inline font-semibold text-indigo-600 dark:text-indigo-400 text-sm flex-shrink-0">
            {formatCurrency(projet.budget ?? 0)}
          </span>
        )}
        <Badge variant={statut.variant}>
          <StatutIcon className="w-3 h-3" />
          {statut.label}
        </Badge>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-5 space-y-4">
              {projet.description && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{projet.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="text-base font-bold text-foreground">{formatCurrency(projet.budget ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Coût réel</p>
                  <p className="text-base font-bold text-amber-600 dark:text-amber-400">{formatCurrency(projet.cout_reel ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Marge</p>
                  <p className={`text-base font-bold ${margeColor}`}>{formatCurrency(marge)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Progression</p>
                  <p className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                    {progression}%
                    {totalTasks > 0 && <span className="text-xs text-muted-foreground font-normal ml-1">({doneTasks}/{totalTasks} tâches)</span>}
                  </p>
                </div>
              </div>

              {projet.notes && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{projet.notes}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button size="sm" onClick={() => onOpen(projet.id)}>
                  Ouvrir le projet →
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onEdit(projet)}>
                  <Edit2 className="w-3.5 h-3.5" /> Modifier
                </Button>
                <Button variant="ghost" size="icon" className="w-8 h-8 text-red-400 hover:bg-red-500/10" onClick={() => onDelete(projet.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Main page ────────────────────────────────────────────────── */
export default function Projets() {
  const navigate = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base = tenantSlug ? `/${tenantSlug}` : ''

  const { data: projets = [], isLoading } = useProjets()
  const { data: clients = [] }            = useClients()
  const { data: allTasks = [] }           = useTeamMemberTasks()
  const create = useCreateProjet()
  const update = useUpdateProjet()
  const remove = useDeleteProjet()

  const clientMap = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach(c => m.set(c.id, c.nom))
    return m
  }, [clients])

  const [search, setSearch]     = useState('')
  const [statutFilter, setStatutFilter] = useState<'all' | ProjetStatut>('all')
  const [clientFilter, setClientFilter] = useState<'all' | string>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Projet | null>(null)
  const [form, setForm]         = useState<Partial<Projet>>(EMPTY)
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const { data: customs = [] } = useCustomTemplates()
  const allTemplates = useMemo(
    () => [...customs.map(rowToTemplate), ...PROJET_TEMPLATES],
    [customs]
  )
  const qc = useQueryClient()

  useEffect(() => {
    if (editing) {
      setForm({
        nom: editing.nom,
        description: editing.description ?? '',
        client_id: editing.client_id,
        statut: editing.statut,
        priorite: editing.priorite,
        date_debut: editing.date_debut,
        date_fin_prevue: editing.date_fin_prevue,
        date_fin_reelle: editing.date_fin_reelle,
        budget: editing.budget ?? 0,
        cout_reel: editing.cout_reel ?? 0,
        progression: editing.progression,
        responsable: editing.responsable ?? '',
        notes: editing.notes ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [editing])

  const filtered = useMemo(() => projets.filter(p => {
    if (statutFilter !== 'all' && p.statut !== statutFilter) return false
    if (clientFilter !== 'all' && p.client_id !== clientFilter) return false
    if (!search) return true
    const s = search.toLowerCase()
    return [p.nom, p.description, p.responsable, clientMap.get(p.client_id ?? '') ?? '']
      .some(x => (x ?? '').toLowerCase().includes(s))
  }), [projets, search, statutFilter, clientFilter, clientMap])

  const stats = useMemo(() => ({
    enCours:  projets.filter(p => p.statut === 'en_cours').length,
    termines: projets.filter(p => p.statut === 'termine').length,
    budget:   projets.reduce((s, p) => s + (p.budget ?? 0), 0),
    couts:    projets.reduce((s, p) => s + (p.cout_reel ?? 0), 0),
  }), [projets])

  const openNew  = () => { setEditing(null); setForm(EMPTY); setSelectedTemplates([]); setShowForm(true) }
  const openEdit = (p: Projet) => { setEditing(p); setSelectedTemplates([]); setShowForm(true) }

  /** Bulk-create tasks from selected templates after project is created. */
  const seedTasksFromTemplates = async (projetId: string, templateKeys: string[]) => {
    const templates = templateKeys
      .map(k => allTemplates.find(t => t.key === k))
      .filter(Boolean) as ProjetTemplate[]
    if (templates.length === 0) return
    let count = 0
    for (const tpl of templates) {
      for (const group of tpl.groups) {
        for (const task of group.tasks) {
          try {
            await teamMemberTasksApi.create({
              project_id:     projetId,
              team_member_id: null,                 // unassigned at creation
              title:          task.title,
              category:       group.category,
              priority:       task.priority ?? 'normal',
              status:         'todo',
            } as any)
            count++
          } catch (e: any) {
            console.error('[seedTasks]', e?.message ?? e)
          }
        }
      }
    }
    await qc.refetchQueries({ queryKey: ['team_member_tasks'] })
    if (count > 0) toast.success(`${count} tâche${count > 1 ? 's' : ''} créée${count > 1 ? 's' : ''} depuis les templates`)
  }

  const submit   = () => {
    const payload = {
      ...form,
      date_debut:      form.date_debut      || null,
      date_fin_prevue: form.date_fin_prevue || null,
      date_fin_reelle: form.date_fin_reelle || null,
      budget:    Number(form.budget    ?? 0),
      cout_reel: Number(form.cout_reel ?? 0),
      progression: Math.max(0, Math.min(100, Number(form.progression ?? 0))),
    }
    if (editing) {
      update.mutate({ id: editing.id, ...payload } as any, { onSuccess: () => { setShowForm(false); setEditing(null) } })
    } else {
      create.mutate(payload, {
        onSuccess: async (created: Projet) => {
          if (selectedTemplates.length > 0 && created?.id) {
            await seedTasksFromTemplates(created.id, selectedTemplates)
          }
          setShowForm(false); setForm(EMPTY); setSelectedTemplates([])
        },
      })
    }
  }

  const openClient = (id: string) => navigate(`${base}/clients/${id}`)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.enCours} en cours · {stats.termines} terminés · {formatCurrency(stats.budget)} budgétés
          </p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4" /> Nouveau projet</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center flex-shrink-0">
            <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-foreground">{projets.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total projets</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{stats.enCours}</p>
            <p className="text-xs text-muted-foreground mt-0.5">En cours</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.termines}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Terminés</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-foreground">{formatCurrency(stats.budget)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Budget total</p>
          </div>
        </div>
      </div>

      {/* Mes tâches admin (cross-projets) */}
      <AdminTasksPanel basePath={base} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher un projet, client, responsable..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statutFilter} onValueChange={v => setStatutFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUT_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les clients</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Vue d'ensemble agence (table cross-projets) ─────────── */}
      {filtered.length > 0 && (
        <AgencyOverviewTable
          projets={filtered}
          clients={clients}
          onOpen={id => navigate(`${base}/projets/${id}`)}
        />
      )}

      {isLoading ? (
        <div className="card-premium p-8 text-center text-muted-foreground text-sm">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="card-premium empty-state">
          <Briefcase className="empty-state-icon" />
          <p className="empty-state-title">Aucun projet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {projets.length === 0
              ? 'Commencez par créer votre premier projet.'
              : 'Aucun projet ne correspond à votre recherche.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <ProjetCard
              key={p.id}
              projet={p}
              clientNom={p.client_id ? clientMap.get(p.client_id) : undefined}
              projectTasks={allTasks.filter(t => t.project_id === p.id)}
              onDelete={id => remove.mutate(id)}
              onEdit={openEdit}
              onOpenClient={openClient}
              onOpen={id => navigate(`${base}/projets/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) setEditing(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="relative">
            <DialogTitle>{editing ? 'Modifier le projet' : 'Nouveau projet'}</DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
                disabled={create.isPending || update.isPending || !(form.nom ?? '').trim()}
                onClick={submit}
              >
                {editing ? '💾 Enregistrer' : '➕ Créer'}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="form-label">Nom du projet *</label>
                <Input
                  value={form.nom ?? ''}
                  onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                  placeholder="Ex: Site vitrine — Restaurant Le Marrakech"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="form-label">Client</label>
                <ClientPicker
                  value={form.client_id ?? null}
                  onChange={(id) => setForm(p => ({ ...p, client_id: id }))}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="form-label">Description</label>
                <AutocorrectTextarea
                  value={form.description ?? ''}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="input-field resize-none h-20"
                  placeholder="Objectifs, livrables, périmètre..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Statut</label>
                <Select value={form.statut} onValueChange={v => setForm(p => ({ ...p, statut: v as ProjetStatut }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUT_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Priorité</label>
                <Select value={form.priorite} onValueChange={v => setForm(p => ({ ...p, priorite: v as ProjetPriorite }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRIORITE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Date début</label>
                <Input
                  type="date"
                  value={form.date_debut ?? ''}
                  onChange={e => setForm(p => ({ ...p, date_debut: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Date fin prévue</label>
                <Input
                  type="date"
                  value={form.date_fin_prevue ?? ''}
                  onChange={e => setForm(p => ({ ...p, date_fin_prevue: e.target.value || null }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Budget (MAD)</label>
                <Input
                  type="number"
                  value={form.budget ?? 0}
                  onChange={e => setForm(p => ({ ...p, budget: +e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Coût réel (MAD)</label>
                <Input
                  type="number"
                  value={form.cout_reel ?? 0}
                  onChange={e => setForm(p => ({ ...p, cout_reel: +e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Responsable</label>
                <Input
                  value={form.responsable ?? ''}
                  onChange={e => setForm(p => ({ ...p, responsable: e.target.value }))}
                  placeholder="Nom du chef de projet"
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Progression : {form.progression ?? 0}%</label>
                <Input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.progression ?? 0}
                  onChange={e => setForm(p => ({ ...p, progression: +e.target.value }))}
                />
              </div>

              {form.statut === 'termine' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="form-label">Date de fin réelle</label>
                  <Input
                    type="date"
                    value={form.date_fin_reelle ?? ''}
                    onChange={e => setForm(p => ({ ...p, date_fin_reelle: e.target.value || null }))}
                  />
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <label className="form-label">Notes internes</label>
                <AutocorrectTextarea
                  value={form.notes ?? ''}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="input-field resize-none h-20"
                  placeholder="Suivi, blocages, décisions..."
                />
              </div>

              {/* Templates de tâches (création uniquement) */}
              {!editing && (
                <div className="space-y-2 sm:col-span-2 p-3 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700/50 bg-blue-50/30 dark:bg-blue-950/10">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-300">⚡ Templates de tâches</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Coche les templates pour créer automatiquement toutes les tâches du projet.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button type="button" size="sm" variant="outline" onClick={() => setTemplateEditorOpen(true)} className="h-7 text-[11px]">
                        <Settings className="w-3 h-3" /> Gérer
                      </Button>
                      {selectedTemplates.length > 0 && (
                        <span className="text-[11px] font-bold px-2 py-1 rounded bg-blue-600 text-white">
                          {selectedTemplates.reduce((s, k) => {
                            const t = allTemplates.find(x => x.key === k)
                            return s + (t ? t.groups.reduce((n, g) => n + g.tasks.length, 0) : 0)
                          }, 0)} tâches
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {allTemplates.map(tpl => {
                      const selected = selectedTemplates.includes(tpl.key)
                      const taskCount = tpl.groups.reduce((n, g) => n + g.tasks.length, 0)
                      const isCustom = tpl.key.startsWith('custom:')
                      return (
                        <label key={tpl.key}
                          className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                            selected
                              ? 'border-blue-500 bg-white dark:bg-slate-800 shadow-sm'
                              : 'border-border bg-background hover:border-blue-300'
                          }`}>
                          <input type="checkbox" checked={selected}
                            onChange={() => setSelectedTemplates(p => selected ? p.filter(k => k !== tpl.key) : [...p, tpl.key])}
                            className="mt-0.5 w-4 h-4 accent-blue-600" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                              <span>{tpl.emoji}</span> {tpl.label}
                              <span className="text-[10px] font-mono text-muted-foreground">({taskCount})</span>
                              {isCustom && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">PERSO</span>}
                            </p>
                            {tpl.description && <p className="text-[11px] text-muted-foreground truncate">{tpl.description}</p>}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null) }}>Annuler</Button>
              <Button
                disabled={create.isPending || update.isPending || !(form.nom ?? '').trim()}
                onClick={submit}
              >
                {(create.isPending || update.isPending) ? 'Enregistrement...' : (editing ? 'Enregistrer' : 'Créer')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Éditeur de templates persos (accessible depuis le picker) */}
      <TemplateEditorDialog open={templateEditorOpen} onClose={() => setTemplateEditorOpen(false)} />
    </div>
  )
}

/* ─── Agency overview table (cross-project dashboard) ─────────────── */
function AgencyOverviewTable({
  projets, clients, onOpen,
}: {
  projets: Projet[]
  clients: { id: string; nom: string; entreprise?: string | null }[]
  onOpen:  (id: string) => void
}) {
  const { data: tasks = [] }     = useTeamMemberTasks()
  const { data: assignees = [] } = useProjetAssignees()
  const { data: members = [] }   = useTeam()

  const clientMap = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach(c => m.set(c.id, c.entreprise || c.nom))
    return m
  }, [clients])

  const rows = useMemo(() => projets.map(p => {
    const t = tasks.filter(x => x.project_id === p.id)
    const done = t.filter(x => x.status === 'done').length
    const pct = t.length > 0 ? Math.round((done / t.length) * 100) : p.progression
    const lead = assignees.find(a => a.projet_id === p.id && a.role === 'lead')
              ?? assignees.find(a => a.projet_id === p.id)
    const leadMember = lead ? members.find(m => m.id === lead.team_member_id) : undefined
    const overdue = p.date_fin_prevue ? new Date(p.date_fin_prevue) < new Date() && p.statut !== 'termine' : false
    return { projet: p, taskCount: t.length, done, pct, leadName: leadMember ? `${leadMember.prenom} ${leadMember.nom}`.trim() : (p.responsable ?? '—'), overdue }
  }), [projets, tasks, assignees, members])

  return (
    <div className="card-premium overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-blue-500" />
        <p className="text-sm font-bold text-foreground">Vue d'ensemble agence</p>
        <span className="text-[11px] text-muted-foreground">— {rows.length} projet{rows.length > 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-bold">Client</th>
              <th className="px-4 py-2 text-left font-bold">Projet</th>
              <th className="px-4 py-2 text-left font-bold w-48">Progression</th>
              <th className="px-4 py-2 text-left font-bold">Responsable</th>
              <th className="px-4 py-2 text-left font-bold">Échéance</th>
              <th className="px-4 py-2 text-left font-bold">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ projet, taskCount, done, pct, leadName, overdue }) => {
              const statutCfg = STATUT_CONFIG[projet.statut] ?? STATUT_CONFIG.planifie
              const SIcon = statutCfg.icon
              return (
                <tr key={projet.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => onOpen(projet.id)}>
                  <td className="px-4 py-2.5 text-foreground/85">
                    {projet.client_id ? clientMap.get(projet.client_id) : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-foreground">{projet.nom}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${pct}%`,
                          background: pct === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #6366f1, #818cf8)',
                        }} />
                      </div>
                      <span className="text-xs font-mono font-bold tabular-nums w-10 text-right">{pct}%</span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{done}/{taskCount}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-foreground/80">{leadName}</td>
                  <td className="px-4 py-2.5">
                    {projet.date_fin_prevue
                      ? (
                          <span className={overdue ? 'text-red-500 font-semibold' : 'text-foreground/80'}>
                            {formatDate(projet.date_fin_prevue)}{overdue && ' ⚠'}
                          </span>
                        )
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statutCfg.variant}>
                      <SIcon className="w-3 h-3" />
                      {projet.statut === 'termine' ? '✔️ Terminé' : statutCfg.label}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
