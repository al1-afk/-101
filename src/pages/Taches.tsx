import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, CheckCircle2, AlertTriangle, Trash2,
  Calendar, Zap, Brain, DollarSign, Building2,
  Target, Flame, StickyNote, Send, X, ChevronRight,
  Clock, TrendingUp, MessageSquare
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate, formatCurrency, getDaysUntil } from '@/lib/utils'
import { tacheActionsApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { tachesSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
type Statut    = 'todo' | 'en_cours' | 'done'
type Categorie = 'suivi' | 'proposition' | 'livraison' | 'support' | 'admin' | 'relance'
type Stage     = 'prospect' | 'actif' | 'a_risque' | 'gagne' | 'perdu'

interface Note {
  id: string
  text: string
  created_at: string   // ISO datetime
  author: string
}

interface Action {
  id: string
  titre: string
  description?: string
  statut: Statut
  client: string
  client_avatar?: string
  deal_value: number
  revenue_at_risk: number
  deadline?: string
  created_at: string
  categorie: Categorie
  stage: Stage
  churn_risk: number
  overdue_days?: number
  impact_score?: number
  notes: Note[]
}

/* ─────────────────────────────────────────────
   IMPACT SCORE ENGINE
   score = poids_valeur(30) + poids_deadline(40) + poids_churn(20) + poids_retard(10)
───────────────────────────────────────────── */
function calcImpactScore(action: Action): number {
  const AVG_DEAL = 50000
  const valeurScore   = Math.min((action.deal_value / AVG_DEAL) * 30, 30)

  const days = action.deadline ? getDaysUntil(action.deadline) : 99
  const deadlineScore = days < 0 ? 40 : days === 0 ? 38 : days <= 2 ? 35 : days <= 7 ? 22 : days <= 14 ? 12 : 5

  const churnScore    = (action.churn_risk / 100) * 20
  const retardScore   = Math.min((action.overdue_days || 0) * 2, 10)

  return Math.round(Math.min(valeurScore + deadlineScore + churnScore + retardScore, 100))
}

function getScoreColor(score: number) {
  if (score >= 80) return { text: 'text-red-600 dark:text-red-400',    bg: 'bg-red-50 dark:bg-red-500/15',    ring: 'ring-red-200 dark:ring-red-500/30' }
  if (score >= 60) return { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/15', ring: 'ring-amber-200 dark:ring-amber-500/30' }
  if (score >= 40) return { text: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-500/15',   ring: 'ring-blue-200 dark:ring-blue-500/30' }
  return                  { text: 'text-muted-foreground',               bg: 'bg-muted',                         ring: 'ring-border' }
}

/* empty — data now comes from DB */























































const CATEGORIE_CONFIG: Record<Categorie, { label: string; color: string; bg: string }> = {
  relance:     { label: 'Relance',     color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-500/15' },
  suivi:       { label: 'Suivi',       color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-500/15' },
  proposition: { label: 'Proposition', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-500/15' },
  livraison:   { label: 'Livraison',   color: 'text-teal-600 dark:text-teal-400',    bg: 'bg-teal-50 dark:bg-teal-500/15' },
  support:     { label: 'Support',     color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-500/15' },
  admin:       { label: 'Admin',       color: 'text-muted-foreground',               bg: 'bg-muted' },
}

const STAGE_CONFIG: Record<Stage, { label: string; dot: string }> = {
  prospect: { label: 'Prospect', dot: 'bg-blue-500' },
  actif:    { label: 'Actif',    dot: 'bg-emerald-500' },
  a_risque: { label: 'À risque', dot: 'bg-red-500' },
  gagne:    { label: 'Gagné',    dot: 'bg-teal-500' },
  perdu:    { label: 'Perdu',    dot: 'bg-slate-400' },
}

/* ─────────────────────────────────────────────
   AI BRIEFING — rule-based insights
───────────────────────────────────────────── */
function generateInsights(actions: Action[]) {
  const active = actions.filter(a => a.statut !== 'done')
  const insights: { icon: string; type: 'danger' | 'warning' | 'success' | 'info'; text: string }[] = []

  // Risque churn élevé
  const highChurn = active.filter(a => a.churn_risk >= 75 && a.deal_value > 0)
  if (highChurn.length > 0) {
    const total = highChurn.reduce((s, a) => s + a.deal_value, 0)
    insights.push({ icon: '🔥', type: 'danger', text: `${highChurn.length} client(s) à haut risque de churn — ${formatCurrency(total)} en jeu. Agir dans 24h.` })
  }

  // Actions en retard
  const overdue = active.filter(a => a.deadline && getDaysUntil(a.deadline) < 0)
  if (overdue.length > 0) {
    insights.push({ icon: '⚠️', type: 'warning', text: `${overdue.length} action(s) en retard. Vérifier immédiatement.` })
  }

  // Deadline dans 48h
  const urgent48 = active.filter(a => a.deadline && getDaysUntil(a.deadline) >= 0 && getDaysUntil(a.deadline) <= 2)
  if (urgent48.length > 0) {
    insights.push({ icon: '⏰', type: 'warning', text: `${urgent48.length} action(s) à livrer dans 48h. Planifiez votre journée en conséquence.` })
  }

  // Revenue at risk total
  const riskTotal = active.reduce((s, a) => s + a.revenue_at_risk, 0)
  if (riskTotal > 0) {
    insights.push({ icon: '💰', type: 'info', text: `${formatCurrency(riskTotal)} de revenus à risque ce mois. Concentrez-vous sur les actions à impact élevé.` })
  }

  // Top recommandation
  const topAction = [...active]
    .map(a => ({ ...a, impact_score: calcImpactScore(a) }))
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0))[0]
  if (topAction) {
    insights.push({ icon: '🎯', type: 'success', text: `Action prioritaire : "${topAction.titre}" — score ${topAction.impact_score}/100. Commencez par ça.` })
  }

  return insights
}

/* ─────────────────────────────────────────────
   COMPOSANT PRINCIPAL
───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   ACTION DRAWER — détails + notes
───────────────────────────────────────────── */
function ActionDrawer({
  action,
  onClose,
  onAddNote,
  onToggleStatut,
}: {
  action: Action & { impact_score: number }
  onClose: () => void
  onAddNote: (id: string, text: string) => void
  onToggleStatut: (id: string) => void
}) {
  const [noteText, setNoteText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scoreColor  = getScoreColor(action.impact_score)
  const catConfig   = CATEGORIE_CONFIG[action.categorie]
  const stageConfig = STAGE_CONFIG[action.stage]
  const daysLeft    = action.deadline ? getDaysUntil(action.deadline) : null
  const isOverdue   = daysLeft !== null && daysLeft < 0
  const isDone      = action.statut === 'done'

  const handleSend = () => {
    const txt = noteText.trim()
    if (!txt) return
    onAddNote(action.id, txt)
    setNoteText('')
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start gap-3 p-5 border-b border-border">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catConfig.bg} ${catConfig.color}`}>
              {catConfig.label}
            </span>
            {!isDone && (
              <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg ring-1 ${scoreColor.bg} ${scoreColor.ring} ${scoreColor.text}`}>
                <Zap className="w-3 h-3" /> {action.impact_score}
              </span>
            )}
          </div>
          <h2 className="font-semibold text-base text-foreground leading-snug">{action.titre}</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Meta info */}
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium text-foreground">{action.client}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stageConfig.dot}`} />
            {stageConfig.label}
          </div>
          {action.deadline && (
            <div className={`flex items-center gap-1.5 font-medium ${isOverdue ? 'text-red-500' : daysLeft !== null && daysLeft <= 2 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              {isOverdue ? `En retard de ${Math.abs(daysLeft!)}j` : daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? 'Demain' : formatDate(action.deadline)}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            Créé le {formatDate(action.created_at)}
          </div>
        </div>

        {/* Deal value + churn */}
        {action.deal_value > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground">Valeur deal</p>
              <p className="text-sm font-bold text-foreground">{formatCurrency(action.deal_value)}</p>
            </div>
            {action.revenue_at_risk > 0 && !isDone && (
              <div>
                <p className="text-xs text-muted-foreground">À risque</p>
                <p className="text-sm font-bold text-red-500">{formatCurrency(action.revenue_at_risk)}</p>
              </div>
            )}
            {action.churn_risk > 0 && !isDone && (
              <div className="ml-auto">
                <p className="text-xs text-muted-foreground mb-1">Risque churn</p>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${action.churn_risk >= 70 ? 'bg-red-500' : action.churn_risk >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${action.churn_risk}%` }} />
                  </div>
                  <span className="text-xs font-medium">{action.churn_risk}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {action.description && (
          <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
            {action.description}
          </p>
        )}

        {/* Bouton statut */}
        <button
          onClick={() => onToggleStatut(action.id)}
          className={`mt-3 w-full text-xs font-medium py-2 rounded-lg border transition-all ${
            isDone
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400'
              : action.statut === 'en_cours'
              ? 'border-blue-200 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400'
              : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {isDone ? '✅ Terminée — cliquer pour réouvrir' : action.statut === 'en_cours' ? '🔄 En cours — cliquer pour terminer' : '⭕ À faire — cliquer pour démarrer'}
        </button>
      </div>

      {/* Input nouvelle note — en haut */}
      <div className="px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Notes & suivi</span>
          {action.notes.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
              {action.notes.length}
            </span>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mb-1">
            <span className="text-white text-xs font-bold">NG</span>
          </div>
          <div className="flex-1 relative">
            <AutocorrectTextarea
              ref={textareaRef}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Ajouter une note... (Entrée pour envoyer)"
              rows={2}
              className="input-field resize-none text-sm w-full pr-10 py-2.5"
            />
            <button
              onClick={handleSend}
              disabled={!noteText.trim()}
              className="absolute right-2 bottom-2.5 text-primary disabled:text-muted-foreground transition-colors hover:text-primary/80"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 ml-8">Shift+Entrée pour nouvelle ligne</p>
      </div>

      {/* Liste des notes */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {action.notes.length === 0 ? (
          <div className="text-center py-8">
            <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Aucune note — écrivez la première ci-dessus</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...action.notes].reverse().map(note => (
              <div key={note.id} className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">{note.author}</span>
                </div>
                <div className="flex-1 bg-muted/50 rounded-xl rounded-tl-sm px-3 py-2.5">
                  <p className="text-sm text-foreground leading-relaxed">{note.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(note.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-2 border-t border-border" />
    </div>
  )
}

/* ─────────────────────────────────────────────
   COMPOSANT PRINCIPAL
───────────────────────────────────────────── */
export default function Taches() {
  const qc = useQueryClient()
  const { data: actions = [] } = useQuery<Action[]>({
    queryKey: ['tache_actions'],
    queryFn: () => tacheActionsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Action[]>,
  })

  const createMut = useMutation({
    mutationFn: (data: Omit<Action, 'id' | 'created_at'>) => tacheActionsApi.create(data as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tache_actions'] }); toast.success('✅ Action créée avec succès') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Partial<Action> & { id: string }) => tacheActionsApi.update(id, data as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tache_actions'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const removeMut = useMutation({
    mutationFn: (id: string) => tacheActionsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tache_actions'] }); setSelectedId(null); toast.success('Action supprimée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [search, setSearch]   = useState('')
  const [filterStatut, setFilterStatut]     = useState('all')
  const [filterCategorie, setFilterCategorie] = useState('all')
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)
  const [showForm, setShowForm]     = useState(false)
  const [showBriefing, setShowBriefing] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const todayISO = () => new Date().toISOString().split('T')[0]
  const [newAction, setNewAction]   = useState<Partial<Action>>({
    statut: 'todo', categorie: 'suivi', stage: 'actif',
    deal_value: 0, revenue_at_risk: 0, churn_risk: 20,
    deadline: todayISO(),
  })

  // Enrichissement avec impact_score
  const enriched = useMemo(() =>
    actions.map(a => ({ ...a, impact_score: calcImpactScore(a) }))
  , [actions])

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])

  // Filtrage + tri par impact_score
  const filtered = useMemo(() =>
    enriched
      .filter(a => {
        const ms = !search || a.titre.toLowerCase().includes(search.toLowerCase()) || a.client.toLowerCase().includes(search.toLowerCase())
        const ms2 = filterStatut === 'all' || a.statut === filterStatut
        const mc  = filterCategorie === 'all' || a.categorie === filterCategorie
        const md  = dateMatch(a.created_at)
        return ms && ms2 && mc && md
      })
      .sort((a, b) => {
        if (a.statut === 'done' && b.statut !== 'done') return 1
        if (b.statut === 'done' && a.statut !== 'done') return -1
        return (b.impact_score ?? 0) - (a.impact_score ?? 0)
      })
  , [enriched, search, filterStatut, filterCategorie, dateMatch])

  // KPIs revenue
  const kpis = useMemo(() => {
    const active = enriched.filter(a => a.statut !== 'done')
    return {
      revenueAtRisk:  active.reduce((s, a) => s + a.revenue_at_risk, 0),
      highImpact:     active.filter(a => (a.impact_score ?? 0) >= 70).length,
      overdueCount:   active.filter(a => a.deadline && getDaysUntil(a.deadline) < 0).length,
      totalDeals:     active.reduce((s, a) => s + a.deal_value, 0),
      todo:           actions.filter(a => a.statut === 'todo').length,
      en_cours:       actions.filter(a => a.statut === 'en_cours').length,
      done:           actions.filter(a => a.statut === 'done').length,
    }
  }, [enriched, actions])

  const insights = useMemo(() => generateInsights(enriched), [enriched])

  const toggleStatut = (id: string) => {
    const action = actions.find(a => a.id === id)
    if (!action) return
    const next: Statut = action.statut === 'todo' ? 'en_cours' : action.statut === 'en_cours' ? 'done' : 'todo'
    updateMut.mutate({ id, statut: next }, {
      onSuccess: () => toast.success(next === 'done' ? '✅ Action terminée' : '🔄 Statut mis à jour'),
    })
  }

  const deleteAction = (id: string) => removeMut.mutate(id)

  const addNote = (actionId: string, text: string) => {
    const action = actions.find(a => a.id === actionId)
    if (!action) return
    const note: Note = { id: Date.now().toString(), text, created_at: new Date().toISOString(), author: 'NG' }
    updateMut.mutate({ id: actionId, notes: [...(action.notes ?? []), note] })
  }

  const addAction = () => {
    if (!newAction.titre?.trim()) return
    createMut.mutate({
      titre:           newAction.titre!.trim(),
      description:     newAction.description,
      statut:          'todo',
      client:          newAction.client?.trim() || '—',
      deal_value:      newAction.deal_value ?? 0,
      revenue_at_risk: newAction.revenue_at_risk ?? newAction.deal_value ?? 0,
      churn_risk:      newAction.churn_risk ?? 20,
      deadline:        newAction.deadline || todayISO(),
      categorie:       newAction.categorie as Categorie ?? 'suivi',
      stage:           newAction.stage as Stage ?? 'actif',
      notes:           [],
    } as any, {
      onSuccess: () => { setNewAction({ statut: 'todo', categorie: 'suivi', stage: 'actif', deal_value: 0, revenue_at_risk: 0, churn_risk: 20, deadline: todayISO() }); setShowForm(false) },
    })
  }

  const selectedAction = useMemo(
    () => enriched.find(a => a.id === selectedId) ?? null,
    [enriched, selectedId]
  )

  return (
    <div className={`space-y-5 animate-fade-in transition-all ${selectedAction ? 'pr-[400px]' : ''}`}>

      {/* ── En-tête ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Actions & Revenus</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {kpis.highImpact} à fort impact · {kpis.overdueCount > 0 ? `${kpis.overdueCount} en retard · ` : ''}{kpis.todo} à faire
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={tachesSchema}
            data={actions}
            onImport={async (row: any) => {
              await createMut.mutateAsync({
                titre:           row.titre,
                description:     row.description,
                statut:          row.statut ?? 'todo',
                client:          row.client ?? '',
                deal_value:      row.deal_value ?? 0,
                revenue_at_risk: row.revenue_at_risk ?? row.deal_value ?? 0,
                churn_risk:      row.churn_risk ?? 20,
                deadline:        row.deadline,
                categorie:       row.categorie ?? 'suivi',
                stage:           row.stage ?? 'actif',
                notes:           [],
              } as any)
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setShowBriefing(v => !v)} className="gap-1.5">
            <Brain className="w-4 h-4 text-purple-500" />
            IA Briefing
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Nouvelle action
          </Button>
        </div>
      </div>

      {/* ── Revenue Header ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="card-premium p-4 border border-red-200 dark:border-red-500/20 bg-red-50/60 dark:bg-red-500/5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Revenus à risque</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(kpis.revenueAtRisk)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">si actions non traitées</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="card-premium p-4 border border-blue-200 dark:border-blue-500/20 bg-blue-50/60 dark:bg-blue-500/5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Deals actifs</span>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(kpis.totalDeals)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">pipeline en cours</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="card-premium p-4 border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Fort impact</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{kpis.highImpact}</p>
          <p className="text-xs text-muted-foreground mt-0.5">actions score ≥ 70</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="card-premium p-4 border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Terminées</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{kpis.done}</p>
          <p className="text-xs text-muted-foreground mt-0.5">cette période</p>
        </motion.div>
      </div>

      {/* ── AI Briefing ── */}
      <AnimatePresence>
        {showBriefing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="card-premium border border-purple-200 dark:border-purple-500/20 bg-gradient-to-r from-purple-50/80 to-blue-50/50 dark:from-purple-500/5 dark:to-blue-500/5 overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-purple-500 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">NEXT GITAL Intelligence</p>
                  <p className="text-xs text-muted-foreground">Analyse de votre pipeline aujourd'hui</p>
                </div>
                <span className="ml-auto text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/20 px-2 py-0.5 rounded-full font-medium">
                  {insights.length} insights
                </span>
              </div>
              <div className="space-y-2">
                {insights.map((insight, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg text-sm ${
                      insight.type === 'danger'  ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300' :
                      insight.type === 'warning' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                      insight.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
                                                   'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    <span className="text-base leading-none mt-0.5">{insight.icon}</span>
                    <span className="leading-relaxed">{insight.text}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Date filter ── */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* ── Filtres ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher action, client..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="todo">À faire</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="done">Terminées</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategorie} onValueChange={setFilterCategorie}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Catégorie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            {Object.entries(CATEGORIE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">
          {filtered.filter(a => a.statut !== 'done').length} action(s) active(s)
        </div>
      </div>

      {/* ── Liste des actions ── */}
      <div className="space-y-2">
        <AnimatePresence>
          {filtered.map((action, idx) => {
            const score       = action.impact_score ?? 0
            const scoreColor  = getScoreColor(score)
            const catConfig   = CATEGORIE_CONFIG[action.categorie]
            const stageConfig = STAGE_CONFIG[action.stage]
            const daysLeft    = action.deadline ? getDaysUntil(action.deadline) : null
            const isOverdue   = daysLeft !== null && daysLeft < 0
            const isDone      = action.statut === 'done'

            return (
              <motion.div
                key={action.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => setSelectedId(action.id)}
                className={`card-premium p-4 group flex items-start gap-3 transition-all cursor-pointer hover:shadow-md ${
                  selectedId === action.id ? 'ring-2 ring-primary/40' :
                  isDone ? 'opacity-55' : isOverdue ? 'border-red-200 dark:border-red-500/20' : ''
                }`}
              >
                {/* Toggle statut */}
                <button
                  onClick={e => { e.stopPropagation(); toggleStatut(action.id) }}
                  title="Changer le statut"
                  className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 ${
                    isDone
                      ? 'bg-emerald-500 border-emerald-500'
                      : action.statut === 'en_cours'
                      ? 'border-blue-500'
                      : 'border-slate-300 dark:border-slate-600 hover:border-primary'
                  }`}
                >
                  {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  {action.statut === 'en_cours' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </button>

                {/* Contenu principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <p className={`font-medium text-sm leading-snug ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {action.titre}
                    </p>
                    {/* Badge catégorie */}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catConfig.bg} ${catConfig.color}`}>
                      {catConfig.label}
                    </span>
                  </div>

                  {action.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{action.description}</p>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {/* Client */}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="w-3 h-3" />
                      {action.client}
                    </span>

                    {/* Stage */}
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={`w-1.5 h-1.5 rounded-full ${stageConfig.dot}`} />
                      {stageConfig.label}
                    </span>

                    {/* Deadline */}
                    {action.deadline && (
                      <span className={`flex items-center gap-1 text-xs font-medium ${
                        isOverdue ? 'text-red-600 dark:text-red-400' :
                        daysLeft !== null && daysLeft <= 2 ? 'text-amber-600 dark:text-amber-400' :
                        'text-muted-foreground'
                      }`}>
                        <Calendar className="w-3 h-3" />
                        {isOverdue
                          ? `En retard de ${Math.abs(daysLeft!)}j`
                          : daysLeft === 0 ? "Aujourd'hui"
                          : daysLeft === 1 ? 'Demain'
                          : formatDate(action.deadline)
                        }
                      </span>
                    )}

                    {/* Statut pill */}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      action.statut === 'en_cours' ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                      action.statut === 'done'     ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {action.statut === 'todo' ? 'À faire' : action.statut === 'en_cours' ? 'En cours' : 'Terminé'}
                    </span>
                  </div>
                </div>

                {/* Panneau droit — valeur + impact */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0 ml-2">
                  {/* Impact Score */}
                  {!isDone && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ring-1 ${scoreColor.bg} ${scoreColor.ring}`}>
                      <Zap className={`w-3 h-3 ${scoreColor.text}`} />
                      <span className={`text-xs font-bold tabular-nums ${scoreColor.text}`}>{score}</span>
                    </div>
                  )}

                  {/* Valeur deal */}
                  {action.deal_value > 0 && (
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${isDone ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {formatCurrency(action.deal_value)}
                      </p>
                      {action.revenue_at_risk > 0 && !isDone && (
                        <p className="text-xs text-red-500 dark:text-red-400">
                          à risque
                        </p>
                      )}
                    </div>
                  )}

                  {/* Churn risk bar */}
                  {action.churn_risk > 0 && !isDone && (
                    <div className="flex items-center gap-1.5" title={`Risque churn: ${action.churn_risk}%`}>
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            action.churn_risk >= 70 ? 'bg-red-500' :
                            action.churn_risk >= 40 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${action.churn_risk}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{action.churn_risk}%</span>
                    </div>
                  )}

                  {/* Notes count */}
                  {action.notes.length > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="w-3 h-3" />
                      {action.notes.length}
                    </span>
                  )}

                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); deleteAction(action.id) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Open arrow */}
                  <ChevronRight className={`w-4 h-4 transition-all text-muted-foreground/50 group-hover:text-primary ${selectedId === action.id ? 'text-primary rotate-90' : ''}`} />
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="empty-state">
            <Target className="empty-state-icon" />
            <p className="empty-state-title">Aucune action trouvée</p>
            <p className="empty-state-desc">Créez votre première action pour commencer</p>
          </div>
        )}
      </div>

      {/* ── Drawer détail action ── */}
      <AnimatePresence>
        {selectedAction && (
          <motion.div
            key="drawer"
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 h-[100dvh] w-full sm:w-[400px] max-w-full bg-card border-l border-border shadow-xl z-40 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >
            <ActionDrawer
              action={selectedAction as Action & { impact_score: number }}
              onClose={() => setSelectedId(null)}
              onAddNote={addNote}
              onToggleStatut={toggleStatut}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay fermeture drawer sur mobile */}
      <AnimatePresence>
        {selectedAction && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelectedId(null)}
            className="fixed inset-0 bg-black/10 z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* ── Formulaire nouvelle action ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
                <Target className="w-4 h-4 text-white" />
              </div>
              Nouvelle action
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">

            <div className="space-y-1.5">
              <label className="form-label">Titre de l'action *</label>
              <AutocorrectInput
                autoFocus
                value={newAction.titre ?? ''}
                onChange={e => setNewAction(p => ({ ...p, titre: e.target.value }))}
                placeholder="Ex: Relancer PharmaTech pour le devis..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label">Client <span className="text-muted-foreground font-normal">(optionnel)</span></label>
                <AutocorrectInput
                  value={newAction.client ?? ''}
                  onChange={e => setNewAction(p => ({ ...p, client: e.target.value }))}
                  placeholder="Nom du client (facultatif)"
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Catégorie</label>
                <Select
                  value={newAction.categorie}
                  onValueChange={v => setNewAction(p => ({ ...p, categorie: v as Categorie }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label">Valeur du deal (MAD)</label>
                <Input
                  type="number"
                  value={newAction.deal_value ?? 0}
                  onChange={e => setNewAction(p => ({ ...p, deal_value: Number(e.target.value), revenue_at_risk: Number(e.target.value) }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Risque churn (%)</label>
                <Input
                  type="number"
                  min={0} max={100}
                  value={newAction.churn_risk ?? 20}
                  onChange={e => setNewAction(p => ({ ...p, churn_risk: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label">Échéance <span className="text-muted-foreground font-normal">(auto: aujourd'hui)</span></label>
                <Input
                  type="date"
                  value={newAction.deadline ?? todayISO()}
                  onChange={e => setNewAction(p => ({ ...p, deadline: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Stage client</label>
                <Select
                  value={newAction.stage}
                  onValueChange={v => setNewAction(p => ({ ...p, stage: v as Stage }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STAGE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                          {v.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Notes</label>
              <AutocorrectTextarea
                value={newAction.description ?? ''}
                onChange={e => setNewAction(p => ({ ...p, description: e.target.value }))}
                className="input-field resize-none h-16"
                placeholder="Contexte, détails importants..."
              />
            </div>

            {/* Preview impact score */}
            {(newAction.deal_value ?? 0) > 0 || newAction.deadline ? (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">Impact score estimé :</span>
                <span className="font-bold text-sm">
                  {calcImpactScore({
                    ...newAction,
                    id: '', titre: newAction.titre || '', statut: 'todo',
                    client: newAction.client || '', created_at: '',
                    deal_value: newAction.deal_value ?? 0,
                    revenue_at_risk: newAction.revenue_at_risk ?? 0,
                    churn_risk: newAction.churn_risk ?? 20,
                    categorie: newAction.categorie as Categorie ?? 'suivi',
                    stage: newAction.stage as Stage ?? 'actif',
                  } as Action)}
                  /100
                </span>
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button onClick={addAction} disabled={!newAction.titre?.trim()}>
                Créer l'action
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
