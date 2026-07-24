import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Edit2, Trash2, Phone, Mail, Building2, User,
  Calendar, Bell, DollarSign, Loader2, AlertCircle, Clock, FileText,
  ChevronDown, ChevronRight, UserPlus, ArrowRightLeft, PhoneCall,
  TrendingUp, Target, Tag, Check, AlertTriangle,
} from 'lucide-react'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useProspects, useUpdateProspect, useDeleteProspect,
  PROSPECT_STAGES, PROSPECT_SOURCES,
  type Prospect, type ProspectStatut,
} from '@/hooks/useProspects'
import {
  useProspectLogs, useAddProspectLog, type LogType,
} from '@/hooks/useProspectLogs'
import { formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { toast } from 'sonner'

/* ─── Stage helpers ───────────────────────────────────────────────── */
function stageAccent(statut: ProspectStatut) {
  return PROSPECT_STAGES.find(s => s.id === statut)?.accent ?? '#64748B'
}
function stageLabel(statut: ProspectStatut) {
  return PROSPECT_STAGES.find(s => s.id === statut)?.label ?? statut
}
/* Étapes de progression linéaire (hors "perdu", qui est une issue terminale). */
const PIPELINE = PROSPECT_STAGES.filter(s => s.id !== 'perdu')

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

const LOG_CONFIG: Record<LogType, { icon: React.ElementType; color: string; bg: string }> = {
  creation: { icon: UserPlus,       color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/20' },
  statut:   { icon: ArrowRightLeft, color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-500/20'    },
  note:     { icon: FileText,       color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-500/20'  },
  edit:     { icon: Edit2,          color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-500/20'   },
  appel:    { icon: PhoneCall,      color: 'text-cyan-600 dark:text-cyan-400',       bg: 'bg-cyan-500/20'    },
  email:    { icon: Mail,           color: 'text-pink-600 dark:text-pink-400',       bg: 'bg-pink-500/20'    },
}

/* ─── Collapsible section (repris de ClientDetail) ────────────────── */
function Section({
  title, icon: Icon, count, action, children, color = '#6366f1',
}: {
  title: string
  icon: React.ElementType
  count?: number
  action?: { label: string; onClick: () => void }
  children: React.ReactNode
  color?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {count !== undefined && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${color}15`, color }}>
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action && open && (
            <button
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:scale-105"
              style={{ background: `${color}12`, color }}
              onClick={e => { e.stopPropagation(); action.onClick() }}
            >
              <Plus className="w-3 h-3" />
              {action.label}
            </button>
          )}
          {open
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Timeline ────────────────────────────────────────────────────── */
function ProspectTimeline({ prospectId }: { prospectId: string }) {
  const { data: logs = [], isLoading } = useProspectLogs(prospectId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (logs.length === 0) {
    return (
      <div className="py-6 text-center">
        <Clock className="w-6 h-6 text-muted-foreground opacity-30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Aucune activité enregistrée</p>
      </div>
    )
  }
  return (
    <div className="relative space-y-0">
      <div className="absolute left-[17px] top-4 bottom-4 w-px bg-border" />
      {logs.map((log, i) => {
        const cfg  = LOG_CONFIG[log.type] ?? LOG_CONFIG.edit
        const Icon = cfg.icon
        return (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative flex gap-3 pb-4"
          >
            <div className={`relative z-10 flex-shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center ${cfg.bg}`}>
              <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
            </div>
            <div className="flex-1 pt-1.5 min-w-0">
              <p className="text-sm text-foreground leading-snug">{log.message}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</span>
                {log.auteur && <span className="text-xs text-muted-foreground">· {log.auteur}</span>}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

/* ─── Edit form (dialog) ──────────────────────────────────────────── */
function ProspectEditForm({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  const update = useUpdateProspect()
  const addLog = useAddProspectLog()
  const [form, setForm] = useState({
    nom:            prospect.nom,
    email:          prospect.email ?? '',
    telephone:      prospect.telephone ?? '',
    entreprise:     prospect.entreprise ?? '',
    statut:         prospect.statut,
    valeur_estimee: prospect.valeur_estimee != null ? String(prospect.valeur_estimee) : '',
    source:         prospect.source ?? '',
    notes:          prospect.notes ?? '',
    responsable:    prospect.responsable ?? '',
    date_contact:   prospect.date_contact ?? '',
    date_relance:   prospect.date_relance ?? '',
  })
  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nom.trim()) { toast.error('Le nom est requis'); return }
    const payload = {
      nom:            form.nom.trim(),
      email:          form.email.trim() || null,
      telephone:      form.telephone.trim() || null,
      entreprise:     form.entreprise.trim() || null,
      statut:         form.statut,
      valeur_estimee: form.valeur_estimee ? parseFloat(form.valeur_estimee) : null,
      source:         form.source || null,
      notes:          form.notes.trim() || null,
      responsable:    form.responsable.trim() || null,
      date_contact:   form.date_contact || null,
      date_relance:   form.date_relance || null,
    }
    update.mutate({ id: prospect.id, ...payload }, {
      onSuccess: () => {
        if (form.statut !== prospect.statut) {
          addLog.mutate({
            prospect_id: prospect.id, type: 'statut', auteur: 'Said',
            message: `Statut : ${stageLabel(prospect.statut)} → ${stageLabel(form.statut)}`,
          })
        } else {
          addLog.mutate({ prospect_id: prospect.id, type: 'edit', message: 'Informations mises à jour', auteur: 'Said' })
        }
        onClose()
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <label className="form-label">Nom complet *</label>
          <AutocorrectInput value={form.nom} onChange={set('nom')} required />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Entreprise</label>
          <AutocorrectInput value={form.entreprise} onChange={set('entreprise')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Responsable</label>
          <AutocorrectInput value={form.responsable} onChange={set('responsable')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Email</label>
          <Input type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Téléphone</label>
          <Input value={form.telephone} onChange={set('telephone')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Valeur (MAD)</label>
          <Input type="number" min={0} value={form.valeur_estimee} onChange={set('valeur_estimee')} placeholder="15 000" />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Source</label>
          <Select
            value={form.source || '__none__'}
            onValueChange={v => setForm(p => ({ ...p, source: v === '__none__' ? '' : v }))}
          >
            <SelectTrigger><SelectValue placeholder="Origine…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {PROSPECT_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="form-label">1er contact</label>
          <Input type="date" value={form.date_contact} onChange={set('date_contact')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Relance</label>
          <Input type="date" value={form.date_relance} onChange={set('date_relance')} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <label className="form-label">Notes</label>
          <AutocorrectTextarea value={form.notes} onChange={set('notes')} className="input-field resize-none h-24" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function ProspectDetail() {
  const { id, tenantSlug } = useParams<{ id: string; tenantSlug: string }>()
  const navigate = useNavigate()
  const base = tenantSlug ? `/${tenantSlug}` : ''

  const { data: prospects = [], isLoading } = useProspects()
  const update  = useUpdateProspect()
  const del     = useDeleteProspect()
  const addLog  = useAddProspectLog()

  const prospect = prospects.find(p => p.id === id)

  const [editOpen,   setEditOpen]   = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const [noteText,   setNoteText]   = useState('')
  const [noteType,   setNoteType]   = useState<LogType>('note')
  const [notesDraft, setNotesDraft] = useState(prospect?.notes ?? '')

  /* Reset du composer d'activité quand on change de prospect */
  const [prevId, setPrevId] = useState(id)
  if (prevId !== id) {
    setPrevId(id)
    setNoteText('')
    setNoteType('note')
  }
  /* Garde le brouillon de notes aligné sur la valeur persistée — couvre le
     changement de prospect ET une édition via le dialog « Modifier ».
     Un refetch qui ne change pas les notes ne déclenche rien (pas d'écrasement
     d'une saisie en cours). */
  const [notesSeen, setNotesSeen] = useState(prospect?.notes ?? '')
  if (notesSeen !== (prospect?.notes ?? '')) {
    setNotesSeen(prospect?.notes ?? '')
    setNotesDraft(prospect?.notes ?? '')
  }

  const accent = prospect ? stageAccent(prospect.statut) : '#64748B'
  const currentIdx = useMemo(
    () => (prospect ? PIPELINE.findIndex(s => s.id === prospect.statut) : -1),
    [prospect],
  )

  if (!prospect) {
    /* Pendant le chargement du cache (ex. rafraîchissement direct de l'URL),
       on affiche un loader plutôt qu'un faux « introuvable ». */
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground">Prospect introuvable.</p>
        <Button size="sm" variant="secondary" onClick={() => navigate(`${base}/prospects`)}>
          <ArrowLeft className="w-4 h-4" /> Retour aux prospects
        </Button>
      </div>
    )
  }

  const changeStatut = (next: ProspectStatut) => {
    if (next === prospect.statut) return
    const prev = prospect.statut
    update.mutate({ id: prospect.id, statut: next }, {
      onSuccess: () => addLog.mutate({
        prospect_id: prospect.id, type: 'statut', auteur: 'Said',
        message: `Statut : ${stageLabel(prev)} → ${stageLabel(next)}`,
      }),
    })
  }

  const handleAddNote = () => {
    if (!noteText.trim()) return
    addLog.mutate(
      { prospect_id: prospect.id, type: noteType, message: noteText.trim(), auteur: 'Said' },
      { onSuccess: () => { setNoteText(''); toast.success('Activité enregistrée') } },
    )
  }

  const handleSaveNotes = () => {
    const next = notesDraft.trim()
    if (next === (prospect.notes ?? '').trim()) { toast('Aucun changement'); return }
    update.mutate({ id: prospect.id, notes: next || null }, {
      onSuccess: () => {
        if (next) addLog.mutate({
          prospect_id: prospect.id, type: 'note', auteur: 'Said',
          message: `Note : ${next.slice(0, 80)}${next.length > 80 ? '…' : ''}`,
        })
      },
    })
  }

  const handleDelete = () => {
    del.mutate(prospect.id, {
      onSuccess: () => { navigate(`${base}/prospects`); toast.success('Prospect supprimé') },
    })
  }

  const isLost = prospect.statut === 'perdu'
  const isWon  = prospect.statut === 'gagne'

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(`${base}/prospects`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Prospects
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground">{prospect.nom}</span>
      </div>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl" style={{
        background: `linear-gradient(135deg, ${accent} 0%, ${accent}bb 100%)`,
      }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-20 bg-white" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-10 bg-white" />

        <div className="relative p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-lg flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.3)' }}>
            {getInitials(prospect.nom)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-2xl font-black text-white leading-tight">{prospect.nom}</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-sm">Prospect</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/25 text-white backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                {stageLabel(prospect.statut)}
              </span>
            </div>
            {prospect.entreprise && (
              <p className="text-white/80 text-sm flex items-center gap-1.5 mb-3">
                <Building2 className="w-3.5 h-3.5" />{prospect.entreprise}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {prospect.telephone && (
                <a href={`tel:${prospect.telephone}`}
                  className="flex items-center gap-1.5 text-xs text-white/90 bg-white/15 hover:bg-white/25 backdrop-blur-sm px-3 py-1.5 rounded-full transition-all">
                  <Phone className="w-3 h-3" />{prospect.telephone}
                </a>
              )}
              {prospect.email && (
                <a href={`mailto:${prospect.email}`}
                  className="flex items-center gap-1.5 text-xs text-white/90 bg-white/15 hover:bg-white/25 backdrop-blur-sm px-3 py-1.5 rounded-full transition-all">
                  <Mail className="w-3 h-3" />{prospect.email}
                </a>
              )}
              {prospect.source && (
                <span className="flex items-center gap-1.5 text-xs text-white/80 bg-white/10 px-3 py-1.5 rounded-full">
                  <Tag className="w-3 h-3" />{prospect.source}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="ghost"
              className="bg-white/20 hover:bg-white/30 text-white border-white/30 border backdrop-blur-sm h-9"
              onClick={() => setEditOpen(true)}>
              <Edit2 className="w-3.5 h-3.5" /> Modifier
            </Button>
            <Button size="sm" variant="ghost"
              className="bg-red-500/30 hover:bg-red-500/50 text-white border-0 h-9"
              onClick={() => setDelConfirm(true)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Valeur estimée', value: prospect.valeur_estimee != null ? formatCurrency(prospect.valeur_estimee) : '—', icon: DollarSign, color: '#10b981', bg: '#10b98112' },
          { label: 'Statut',         value: stageLabel(prospect.statut), icon: Target, color: accent, bg: `${accent}12` },
          { label: '1er contact',    value: prospect.date_contact ? formatDate(prospect.date_contact) : '—', icon: Calendar, color: '#6366f1', bg: '#6366f112' },
          { label: 'Relance',        value: prospect.date_relance ? formatDate(prospect.date_relance) : '—', icon: Bell, color: '#f59e0b', bg: '#f59e0b12' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-base font-bold text-foreground leading-tight truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pipeline stepper ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" /> Pipeline
          </p>
          <button
            onClick={() => changeStatut('perdu')}
            disabled={update.isPending}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              isLost ? 'border-transparent text-white bg-red-500' : 'border-border text-muted-foreground hover:text-red-500'
            }`}
          >
            <AlertTriangle className="w-3 h-3" /> Perdu
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {PIPELINE.map((s, i) => {
            const reached = !isLost && currentIdx >= 0 && i <= currentIdx
            const isCurrent = !isLost && prospect.statut === s.id
            return (
              <div key={s.id} className="flex-1 flex items-center gap-1.5">
                <button
                  onClick={() => changeStatut(s.id)}
                  disabled={update.isPending}
                  title={s.label}
                  className={`group flex-1 flex flex-col items-center gap-1.5 ${update.isPending ? 'opacity-60' : ''}`}
                >
                  <div className="w-full h-1.5 rounded-full transition-all"
                    style={{ background: reached ? s.accent : 'var(--border, #e5e7eb)' }} />
                  <span className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                    isCurrent ? '' : 'text-muted-foreground group-hover:text-foreground'
                  }`} style={isCurrent ? { color: s.accent } : {}}>
                    {reached && <Check className="w-3 h-3" style={{ color: s.accent }} />}
                    {s.label}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
        {isWon && (
          <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Prospect gagné — pense à le convertir en client.
          </p>
        )}
        {isLost && (
          <p className="mt-3 text-xs text-red-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Prospect marqué perdu.
          </p>
        )}
      </div>

      {/* ── Two columns ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

        {/* LEFT */}
        <div className="space-y-3">
          {/* Activité */}
          <Section title="Activité" icon={Clock} color="#3b82f6">
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 mb-5">
              <p className="text-xs font-bold text-foreground">Ajouter une activité</p>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { t: 'note'  as LogType, label: 'Note'  },
                  { t: 'appel' as LogType, label: 'Appel' },
                  { t: 'email' as LogType, label: 'Email' },
                  { t: 'edit'  as LogType, label: 'Autre' },
                ]).map(({ t, label }) => {
                  const cfg = LOG_CONFIG[t]; const Icon = cfg.icon
                  return (
                    <button key={t} onClick={() => setNoteType(t)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                        noteType === t ? `${cfg.bg} ${cfg.color} border-transparent` : 'border-border text-muted-foreground hover:text-foreground'
                      }`}>
                      <Icon className="w-3 h-3" />{label}
                    </button>
                  )
                })}
              </div>
              <AutocorrectTextarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                className="input-field resize-none h-20 text-sm"
                placeholder={
                  noteType === 'appel' ? "Ex : Appel de 15 min, intéressé par l'offre premium…"
                  : noteType === 'email' ? 'Ex : Email de suivi envoyé avec devis joint…'
                  : 'Ajouter une note sur ce prospect…'
                }
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">⌘ Entrée pour enregistrer</p>
                <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim() || addLog.isPending} className="h-7 px-3 text-xs">
                  {addLog.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Enregistrer
                </Button>
              </div>
            </div>
            <ProspectTimeline prospectId={prospect.id} />
          </Section>

          {/* Notes */}
          <Section title="Notes" icon={FileText} color="#8b5cf6">
            <div className="relative">
              <AutocorrectTextarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                className="input-field resize-none h-32"
                placeholder="Contexte, points clés, prochaines étapes…"
              />
              {notesDraft.length > 0 && (
                <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{notesDraft.length} car.</span>
              )}
            </div>
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={handleSaveNotes}
                disabled={update.isPending || notesDraft.trim() === (prospect.notes ?? '').trim()}
                className="h-8 px-4 text-xs">
                {update.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Enregistrer les notes
              </Button>
            </div>
          </Section>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">Coordonnées</p>
              <button onClick={() => setEditOpen(true)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <Edit2 className="w-3 h-3" /> Modifier
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <InfoRow icon={User}      label="Nom"         value={prospect.nom} />
              <InfoRow icon={Building2} label="Entreprise"  value={prospect.entreprise} />
              <InfoRow icon={Mail}      label="Email"       value={prospect.email} href={prospect.email ? `mailto:${prospect.email}` : undefined} />
              <InfoRow icon={Phone}     label="Téléphone"   value={prospect.telephone} href={prospect.telephone ? `tel:${prospect.telephone}` : undefined} />
              <InfoRow icon={UserPlus}  label="Responsable" value={prospect.responsable} />
              <InfoRow icon={Tag}       label="Source"      value={prospect.source} />
              <InfoRow icon={DollarSign} label="Valeur"     value={prospect.valeur_estimee != null ? formatCurrency(prospect.valeur_estimee) : null} />
              <InfoRow icon={Calendar}  label="1er contact" value={prospect.date_contact ? formatDate(prospect.date_contact) : null} />
              <InfoRow icon={Bell}      label="Relance"     value={prospect.date_relance ? formatDate(prospect.date_relance) : null} />
              <InfoRow icon={Clock}     label="Créé le"     value={formatDate(prospect.created_at)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier {prospect.nom}</DialogTitle>
          </DialogHeader>
          <ProspectEditForm prospect={prospect} onClose={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={delConfirm} onOpenChange={setDelConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-5 h-5" /> Supprimer le prospect
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Supprimer <span className="font-semibold text-foreground">{prospect.nom}</span> et tout son historique ? Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setDelConfirm(false)}>Annuler</Button>
            <Button size="sm" onClick={handleDelete} disabled={del.isPending}
              className="bg-red-500 hover:bg-red-600 text-white">
              {del.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Petit composant ligne d'info ────────────────────────────────── */
function InfoRow({
  icon: Icon, label, value, href,
}: {
  icon: React.ElementType
  label: string
  value?: string | null
  href?: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        {value
          ? href
            ? <a href={href} className="text-sm text-foreground hover:text-blue-500 transition-colors break-words">{value}</a>
            : <p className="text-sm text-foreground break-words">{value}</p>
          : <p className="text-sm text-muted-foreground/50">—</p>}
      </div>
    </div>
  )
}
