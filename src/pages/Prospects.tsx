import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DragDropContext, Droppable, Draggable,
  type DropResult, type DragStart, type DragUpdate,
} from '@hello-pangea/dnd'
import {
  Plus, Search, LayoutList, Kanban, X, Trash2,
  Mail, Building2, User, Calendar, Bell, DollarSign, TrendingUp, UserCheck,
  Loader2, AlertCircle, Phone, PhoneCall, FileText, Edit2,
  UserPlus, ArrowRightLeft, Clock, CheckSquare, Square, AlertTriangle,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useProspects, useCreateProspect, useUpdateProspect, useDeleteProspect,
  PROSPECT_STAGES, PROSPECT_SOURCES,
  type Prospect, type ProspectStatut,
} from '@/hooks/useProspects'
import {
  useProspectLogs, useAddProspectLog,
  type ProspectLog, type LogType,
} from '@/hooks/useProspectLogs'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { prospectsSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'

/* ─── helpers ─────────────────────────────────────────────────────── */
const TODAY = new Date().toISOString().slice(0, 10)

function stageAccent(statut: ProspectStatut) {
  return PROSPECT_STAGES.find(s => s.id === statut)?.accent ?? '#64748B'
}
function stageDot(statut: ProspectStatut) {
  return PROSPECT_STAGES.find(s => s.id === statut)?.dot ?? 'bg-slate-400'
}
function stageLabel(statut: ProspectStatut) {
  return PROSPECT_STAGES.find(s => s.id === statut)?.label ?? statut
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/* ─── Log type config ─────────────────────────────────────────────── */
const LOG_CONFIG: Record<LogType, { icon: React.ElementType; color: string; bg: string }> = {
  creation: { icon: UserPlus,        color: 'text-emerald-600 dark:text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/20' },
  statut:   { icon: ArrowRightLeft,  color: 'text-blue-600 dark:text-blue-600 dark:text-blue-400',       bg: 'bg-blue-500/20'    },
  note:     { icon: FileText,        color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-500/20'  },
  edit:     { icon: Edit2,           color: 'text-amber-600 dark:text-amber-600 dark:text-amber-400',     bg: 'bg-amber-500/20'   },
  appel:    { icon: PhoneCall,       color: 'text-cyan-600 dark:text-cyan-400',       bg: 'bg-cyan-500/20'    },
  email:    { icon: Mail,            color: 'text-pink-600 dark:text-pink-400',       bg: 'bg-pink-500/20'    },
}

/* ─── Timeline component ──────────────────────────────────────────── */
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
      {/* Vertical line */}
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
            {/* Icon dot */}
            <div className={`relative z-10 flex-shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center ${cfg.bg}`}>
              <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
            </div>

            {/* Content */}
            <div className="flex-1 pt-1.5 min-w-0">
              <p className="text-sm text-foreground leading-snug">{log.message}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(log.created_at)}
                </span>
                {log.auteur && (
                  <span className="text-xs text-muted-foreground">· {log.auteur}</span>
                )}
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

/* ─── Form shape ──────────────────────────────────────────────────── */
const EMPTY_FORM = {
  nom:            '',
  email:          '',
  telephone:      '',
  entreprise:     '',
  statut:         'nouveau' as ProspectStatut,
  valeur_estimee: '',
  source:         '',
  notes:          '',
  responsable:    '',
  date_contact:   '',
  date_relance:   '',
}

function prospectToForm(p: Prospect): typeof EMPTY_FORM {
  return {
    nom:            p.nom,
    email:          p.email ?? '',
    telephone:      p.telephone ?? '',
    entreprise:     p.entreprise ?? '',
    statut:         p.statut,
    valeur_estimee: p.valeur_estimee != null ? String(p.valeur_estimee) : '',
    source:         p.source ?? '',
    notes:          p.notes ?? '',
    responsable:    p.responsable ?? '',
    date_contact:   p.date_contact ?? '',
    date_relance:   p.date_relance ?? '',
  }
}

/* ─── ProspectDrawer ──────────────────────────────────────────────── */
interface DrawerProps {
  open:     boolean
  prospect: Prospect | null
  onClose:  () => void
}

function ProspectDrawer({ open, prospect, onClose }: DrawerProps) {
  const isEdit = !!prospect
  const create = useCreateProspect()
  const update = useUpdateProspect()
  const del    = useDeleteProspect()
  const addLog = useAddProspectLog()

  const [tab,      setTab]      = useState<'form' | 'history'>('form')
  const [form,     setForm]     = useState<typeof EMPTY_FORM>(() =>
    prospect ? prospectToForm(prospect) : { ...EMPTY_FORM }
  )
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState<LogType>('note')

  // Re-sync form + reset tab when prospect changes
  const [prevProspect, setPrevProspect] = useState(prospect)
  if (prevProspect !== prospect) {
    setPrevProspect(prospect)
    setForm(prospect ? prospectToForm(prospect) : { ...EMPTY_FORM })
    setTab('form')
    setNoteText('')
    setNoteType('note')
  }

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const busy = create.isPending || update.isPending

  /* ── Compute what changed for auto-logging ── */
  const computeLogs = useCallback((pid: string): Array<{ type: LogType; message: string }> => {
    if (!prospect) return []
    const entries: Array<{ type: LogType; message: string }> = []

    // Statut change
    if (form.statut !== prospect.statut) {
      entries.push({
        type:    'statut',
        message: `Statut : ${stageLabel(prospect.statut)} → ${stageLabel(form.statut)}`,
      })
    }

    // Notes changed
    const oldNotes = (prospect.notes ?? '').trim()
    const newNotes = form.notes.trim()
    if (newNotes && newNotes !== oldNotes) {
      entries.push({ type: 'note', message: `Note : ${newNotes.slice(0, 80)}${newNotes.length > 80 ? '…' : ''}` })
    }

    // Other fields changed (non-statut, non-note)
    const otherChanged =
      form.nom.trim()          !== prospect.nom          ||
      (form.email.trim()||null) !== prospect.email        ||
      (form.telephone.trim()||null) !== prospect.telephone ||
      (form.entreprise.trim()||null) !== prospect.entreprise ||
      (form.responsable.trim()||null) !== prospect.responsable ||
      (form.date_contact||null) !== prospect.date_contact  ||
      (form.date_relance||null) !== prospect.date_relance  ||
      (form.valeur_estimee ? parseFloat(form.valeur_estimee) : null) !== prospect.valeur_estimee ||
      (form.source||null) !== prospect.source

    if (otherChanged && entries.every(e => e.type !== 'statut' && e.type !== 'note')) {
      entries.push({ type: 'edit', message: 'Informations mises à jour' })
    } else if (otherChanged) {
      // If we already have statut/note entries, still note field edits
      const nonStatusNoteChange =
        form.nom.trim() !== prospect.nom ||
        (form.email.trim()||null) !== prospect.email ||
        (form.telephone.trim()||null) !== prospect.telephone ||
        (form.entreprise.trim()||null) !== prospect.entreprise

      if (nonStatusNoteChange) {
        entries.push({ type: 'edit', message: 'Informations mises à jour' })
      }
    }

    return entries.map(e => ({ ...e }))
  }, [prospect, form])

  const handleAddNote = () => {
    if (!noteText.trim() || !prospect) return
    addLog.mutate(
      { prospect_id: prospect.id, type: noteType, message: noteText.trim(), auteur: 'Said' },
      { onSuccess: () => { setNoteText(''); toast.success('Activité enregistrée') } }
    )
  }

  const handleSave = () => {
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

    if (isEdit && prospect) {
      const logEntries = computeLogs(prospect.id)
      update.mutate({ id: prospect.id, ...payload }, {
        onSuccess: () => {
          logEntries.forEach(e =>
            addLog.mutate({ prospect_id: prospect.id, type: e.type, message: e.message, auteur: 'Said' })
          )
          onClose()
        },
      })
    } else {
      create.mutate(payload, {
        onSuccess: (newP) => {
          addLog.mutate({
            prospect_id: newP.id,
            type:        'creation',
            message:     'Prospect créé',
            auteur:      'Said',
          })
          onClose()
        },
      })
    }
  }

  const handleDelete = () => {
    if (!prospect) return
    del.mutate(prospect.id, { onSuccess: onClose })
  }

  const accent = isEdit ? stageAccent(prospect.statut) : '#64748B'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[480px] bg-[var(--surface-card)] border-l border-border shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          >

            {/* ── HERO HEADER ── */}
            <div
              className="relative flex-shrink-0 px-6 pt-5 pb-4"
              style={{ background: `linear-gradient(135deg, ${accent}18 0%, transparent 60%)` }}
            >
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              {isEdit ? (
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-lg"
                    style={{ backgroundColor: accent }}
                  >
                    {prospect.nom.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0 pt-0.5">
                    <h2 className="text-lg font-bold text-foreground leading-tight truncate">{prospect.nom}</h2>
                    {prospect.entreprise && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                        {prospect.entreprise}
                      </p>
                    )}
                    {/* Statut pill */}
                    <span
                      className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: `${accent}22`, color: accent }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                      {stageLabel(prospect.statut)}
                    </span>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-1.5 pt-0.5">
                    {prospect.telephone && (
                      <a
                        href={`tel:${prospect.telephone}`}
                        onClick={e => e.stopPropagation()}
                        className="w-8 h-8 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 flex items-center justify-center transition-colors"
                        title={prospect.telephone}
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      </a>
                    )}
                    {prospect.email && (
                      <a
                        href={`mailto:${prospect.email}`}
                        onClick={e => e.stopPropagation()}
                        className="w-8 h-8 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 flex items-center justify-center transition-colors"
                        title={prospect.email}
                      >
                        <Mail className="w-3.5 h-3.5 text-blue-400" />
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 pr-10">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">Nouveau prospect</h2>
                    <p className="text-xs text-muted-foreground">Remplissez les informations ci-dessous</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── TABS ── */}
            {isEdit && (
              <div className="flex px-6 gap-1 border-b border-border flex-shrink-0 bg-[var(--surface-card)]">
                {(['form', 'history'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                      tab === t
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === 'form' ? 'Informations' : 'Historique'}
                  </button>
                ))}
              </div>
            )}

            {/* ── BODY ── */}
            <div className="flex-1 overflow-y-auto">

              {/* ════ FORM TAB ════ */}
              {tab === 'form' && (
                <div className="px-6 py-5 space-y-6">

                  {/* Section — Identité */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Identité</p>
                    <div className="space-y-2.5">
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <AutocorrectInput
                          value={form.nom}
                          onChange={set('nom')}
                          placeholder="Nom complet *"
                          className="pl-9"
                          autoFocus={!isEdit}
                        />
                      </div>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <AutocorrectInput
                          value={form.entreprise}
                          onChange={set('entreprise')}
                          placeholder="Entreprise"
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section — Contact */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Contact</p>
                    <div className="space-y-2.5">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          type="email"
                          value={form.email}
                          onChange={set('email')}
                          placeholder="Email"
                          className="pl-9"
                        />
                      </div>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          value={form.telephone}
                          onChange={set('telephone')}
                          placeholder="Téléphone"
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section — Commercial */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Commercial</p>

                    {/* Statut visual pills */}
                    <div>
                      <p className="form-label mb-2">Statut</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PROSPECT_STAGES.map(s => (
                          <button
                            key={s.id}
                            onClick={() => setForm(p => ({ ...p, statut: s.id }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                              form.statut === s.id
                                ? 'border-transparent text-white shadow-sm'
                                : 'border-border text-muted-foreground hover:text-foreground bg-transparent'
                            }`}
                            style={form.statut === s.id ? { backgroundColor: s.accent } : {}}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Valeur */}
                      <div>
                        <p className="form-label mb-1.5">Valeur (MAD)</p>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <Input
                            type="number"
                            min={0}
                            value={form.valeur_estimee}
                            onChange={set('valeur_estimee')}
                            placeholder="15 000"
                            className="pl-9"
                          />
                        </div>
                      </div>
                      {/* Responsable */}
                      <div>
                        <p className="form-label mb-1.5">Responsable</p>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <AutocorrectInput
                            value={form.responsable}
                            onChange={set('responsable')}
                            placeholder="Said"
                            className="pl-9"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Source */}
                    <div>
                      <p className="form-label mb-1.5">Source</p>
                      <Select
                        value={form.source || '__none__'}
                        onValueChange={v => setForm(p => ({ ...p, source: v === '__none__' ? '' : v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Origine du prospect..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {PROSPECT_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Section — Planning */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Planning</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="form-label mb-1.5">1er contact</p>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <Input type="date" value={form.date_contact} onChange={set('date_contact')} className="pl-9" />
                        </div>
                      </div>
                      <div>
                        <p className="form-label mb-1.5">Relance</p>
                        <div className="relative">
                          <Bell className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <Input type="date" value={form.date_relance} onChange={set('date_relance')} className="pl-9" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section — Notes */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Notes</p>
                    <div className="relative">
                      <AutocorrectTextarea
                        value={form.notes}
                        onChange={set('notes')}
                        className="input-field resize-none h-28"
                        placeholder="Contexte, points clés, prochaines étapes…"
                      />
                      {form.notes.length > 0 && (
                        <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
                          {form.notes.length} car.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ════ HISTORY TAB ════ */}
              {tab === 'history' && prospect && (
                <div className="px-6 py-5 space-y-5">

                  {/* Quick add activity */}
                  <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-bold text-foreground">Ajouter une activité</p>

                    {/* Type pills */}
                    <div className="flex gap-1.5 flex-wrap">
                      {([
                        { t: 'note'  as LogType, label: 'Note'   },
                        { t: 'appel' as LogType, label: 'Appel'  },
                        { t: 'email' as LogType, label: 'Email'  },
                        { t: 'edit'  as LogType, label: 'Autre'  },
                      ]).map(({ t, label }) => {
                        const cfg  = LOG_CONFIG[t]
                        const Icon = cfg.icon
                        return (
                          <button
                            key={t}
                            onClick={() => setNoteType(t)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                              noteType === t
                                ? `${cfg.bg} ${cfg.color} border-transparent`
                                : 'border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <Icon className="w-3 h-3" />
                            {label}
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
                        : noteType === 'email' ? "Ex : Email de suivi envoyé avec devis joint…"
                        : "Ajouter une note sur ce prospect…"
                      }
                    />

                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">⌘ Entrée pour enregistrer</p>
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={!noteText.trim() || addLog.isPending}
                        className="h-7 px-3 text-xs"
                      >
                        {addLog.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Enregistrer
                      </Button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                      Historique
                    </p>
                    <ProspectTimeline prospectId={prospect.id} />
                  </div>
                </div>
              )}
            </div>

            {/* ── FOOTER ── */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 flex-shrink-0 bg-[var(--surface-card)]">
              {isEdit ? (
                <button
                  onClick={handleDelete}
                  disabled={del.isPending}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {del.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Supprimer
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onClose} className="h-8 px-4">
                  Annuler
                </Button>
                {tab === 'form' && (
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={busy}
                    className="h-8 px-5"
                    style={isEdit ? {} : { backgroundColor: undefined }}
                  >
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isEdit ? 'Enregistrer' : 'Créer le prospect'}
                  </Button>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/* ─── ProspectRow (table) ─────────────────────────────────────────── */
function ProspectRow({
  p, onEdit, selected, onToggle,
}: {
  p: Prospect
  onEdit:   (p: Prospect) => void
  selected: boolean
  onToggle: (id: string) => void
}) {
  const accent  = stageAccent(p.statut)
  const dot     = stageDot(p.statut)
  const label   = stageLabel(p.statut)
  const isToday = p.date_relance === TODAY

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className={`table-row cursor-pointer group ${selected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
      onClick={() => onEdit(p)}
    >
      {/* Checkbox */}
      <td className="pl-4 pr-2 py-3 w-8" onClick={e => { e.stopPropagation(); onToggle(p.id) }}>
        {selected
          ? <CheckSquare className="w-4 h-4 text-red-400" />
          : <Square      className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        }
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: accent }}
          >
            {p.nom.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">{p.nom}</p>
            {p.entreprise && <p className="text-xs text-muted-foreground">{p.entreprise}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {p.email     && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail  className="w-3 h-3" />{p.email}</p>}
          {p.telephone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{p.telephone}</p>}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          {label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-foreground">
        {p.valeur_estimee != null
          ? formatCurrency(p.valeur_estimee)
          : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{p.source ?? '—'}</td>
      <td className="px-4 py-3">
        {p.date_relance ? (
          <span className={`text-xs flex items-center gap-1 ${isToday ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
            {isToday && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            <Calendar className="w-3 h-3" />
            {isToday ? "Aujourd'hui" : formatDate(p.date_relance)}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 max-w-[200px]">
        {p.notes ? (
          <span className="flex items-start gap-1.5 text-xs text-violet-600 dark:text-violet-400">
            <FileText className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2 leading-snug">
              {p.notes}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
    </motion.tr>
  )
}

/* ─── KanbanCard ──────────────────────────────────────────────────── */
function KanbanCard({
  p, index, onEdit, accent,
}: {
  p: Prospect
  index: number
  onEdit: (p: Prospect) => void
  accent: string
}) {
  const isToday = p.date_relance === TODAY
  return (
    <Draggable draggableId={p.id} index={index}>
      {(provided, snapshot) => {
        const libStyle     = provided.draggableProps.style
        const isActiveDrag = snapshot.isDragging && !snapshot.isDropAnimating
        const style: React.CSSProperties = {
          ...libStyle,
          transition: snapshot.isDropAnimating
            ? libStyle?.transition
            : isActiveDrag
              ? 'box-shadow 180ms ease, background-color 180ms ease'
              : 'box-shadow 220ms ease, transform 220ms cubic-bezier(0.2, 0, 0, 1), border-color 180ms ease',
          transform: isActiveDrag
            ? `${libStyle?.transform ?? ''} rotate(2.5deg) scale(1.03)`
            : libStyle?.transform,
          boxShadow: isActiveDrag
            ? `0 18px 40px -12px ${accent}66, 0 6px 14px -6px rgba(0,0,0,0.25)`
            : undefined,
          borderLeft: `3px solid ${accent}`,
        }
        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={style}
            className={`bg-[var(--surface-card)] border border-border rounded-lg p-3 select-none will-change-transform ${
              snapshot.isDragging
                ? 'cursor-grabbing shadow-xl ring-1 ring-offset-0'
                : 'cursor-grab hover:shadow-md hover:-translate-y-0.5 active:cursor-grabbing'
            }`}
            onClick={() => { if (!snapshot.isDragging) onEdit(p) }}
          >
            <p className="text-sm font-medium text-foreground leading-snug mb-1">{p.nom}</p>
            {p.entreprise && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                <Building2 className="w-3 h-3 flex-shrink-0" />
                {p.entreprise}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {p.valeur_estimee != null && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(p.valeur_estimee)}
                </span>
              )}
              {p.date_relance && (
                <span className={`text-xs flex items-center gap-0.5 ${isToday ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                  {isToday && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse mr-0.5" />}
                  <Calendar className="w-3 h-3" />
                  {isToday ? "Auj." : formatDate(p.date_relance)}
                </span>
              )}
            </div>
            {p.source && (
              <p className="text-xs text-muted-foreground mt-1.5 truncate">{p.source}</p>
            )}
          </div>
        )
      }}
    </Draggable>
  )
}

/* ─── Main Page ───────────────────────────────────────────────────── */
export default function Prospects() {
  const { data: prospects = [], isLoading, isError } = useProspects()
  const createProspect  = useCreateProspect()
  const updateProspect  = useUpdateProspect()
  const deleteProspect  = useDeleteProspect()
  const addLog          = useAddProspectLog()
  const qc              = useQueryClient()

  const [view,         setView]         = useState<'table' | 'pipeline'>('table')
  const [search,       setSearch]       = useState('')
  const [filterStatut, setFilterStatut] = useState<string>('all')
  const [todayOnly,    setTodayOnly]    = useState(false)
  const [dateRange,    setDateRange]    = useState<DateRange>(DEFAULT_RANGE)
  const [drawerOpen,   setDrawerOpen]   = useState(false)
  const [editTarget,   setEditTarget]   = useState<Prospect | null>(null)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [confirmOpen,  setConfirmOpen]  = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  const todayCount = useMemo(
    () => prospects.filter(p => p.date_relance === TODAY).length,
    [prospects]
  )

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filtered = useMemo(() =>
    prospects
      .filter(p => {
        const matchSearch  = !search
          || p.nom.toLowerCase().includes(search.toLowerCase())
          || (p.entreprise ?? '').toLowerCase().includes(search.toLowerCase())
        const matchStatut  = filterStatut === 'all' || p.statut === filterStatut
        const matchToday   = !todayOnly || p.date_relance === TODAY
        const matchDate    = dateMatch(p.created_at)
        return matchSearch && matchStatut && matchToday && matchDate
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [prospects, search, filterStatut, todayOnly, dateMatch]
  )

  const openNew     = () => { setEditTarget(null); setDrawerOpen(true) }
  const openEdit    = (p: Prospect) => { setEditTarget(p); setDrawerOpen(true) }
  const closeDrawer = () => setDrawerOpen(false)

  const toggleSelect    = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleSelectAll = () =>
    setSelectedIds(prev =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id))
    )

  const handleBulkDelete = async () => {
    setDeleting(true)
    try {
      await Promise.all([...selectedIds].map(id => deleteProspect.mutateAsync(id)))
      toast.success(`${selectedIds.size} prospect${selectedIds.size > 1 ? 's' : ''} supprimé${selectedIds.size > 1 ? 's' : ''}`)
      setSelectedIds(new Set())
    } finally {
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  /* ── Kanban: group by stage ── */
  const byStage = useMemo(() => {
    const map: Record<ProspectStatut, Prospect[]> = {
      nouveau: [], contacte: [], qualifie: [], proposition: [], gagne: [], perdu: [],
    }
    filtered.forEach(p => { map[p.statut]?.push(p) })
    return map
  }, [filtered])

  /* ── DnD drag state for smooth feedback ── */
  const [dragSource, setDragSource] = useState<ProspectStatut | null>(null)
  const [dragOver,   setDragOver]   = useState<ProspectStatut | null>(null)

  const onDragStart = useCallback((start: DragStart) => {
    setDragSource(start.source.droppableId as ProspectStatut)
    setDragOver(start.source.droppableId as ProspectStatut)
  }, [])

  const onDragUpdate = useCallback((upd: DragUpdate) => {
    setDragOver((upd.destination?.droppableId as ProspectStatut) ?? null)
  }, [])

  /* ── DnD handler — auto-logs status change ── */
  const onDragEnd = useCallback((result: DropResult) => {
    setDragSource(null)
    setDragOver(null)
    const { draggableId, destination } = result
    if (!destination) return
    const newStatut = destination.droppableId as ProspectStatut
    const prospect  = prospects.find(p => p.id === draggableId)
    if (!prospect || prospect.statut === newStatut) return

    // Optimistic update
    qc.setQueryData<Prospect[]>(['prospects'], old =>
      (old ?? []).map(p => p.id === draggableId ? { ...p, statut: newStatut } : p)
    )

    // Persist + log
    updateProspect.mutate({ id: draggableId, statut: newStatut }, {
      onSuccess: () => {
        addLog.mutate({
          prospect_id: draggableId,
          type:        'statut',
          message:     `Statut : ${stageLabel(prospect.statut)} → ${stageLabel(newStatut)}`,
          auteur:      'Said',
        })
      },
    })
  }, [prospects, qc, updateProspect, addLog])

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total:  prospects.length,
    gagne:  prospects.filter(p => p.statut === 'gagne').length,
    valeur: prospects.filter(p => p.statut === 'gagne').reduce((s, p) => s + (p.valeur_estimee ?? 0), 0),
    pipe:   prospects.filter(p => !['gagne','perdu'].includes(p.statut)).reduce((s, p) => s + (p.valeur_estimee ?? 0), 0),
  }), [prospects])

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM – Prospects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.total} prospects · {stats.gagne} gagnés · Pipeline {formatCurrency(stats.pipe)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={prospectsSchema}
            data={prospects}
            onImport={async (row) => { await createProspect.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nouveau prospect
          </Button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total prospects</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
            <CheckSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.gagne}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Gagnés</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-teal-600 dark:text-teal-400">{formatCurrency(stats.valeur)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Valeur gagnée</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-violet-600 dark:text-violet-400">{formatCurrency(stats.pipe)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pipeline actif</p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden h-8 flex-shrink-0">
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors ${
              view === 'table'
                ? 'bg-blue-600 text-white'
                : 'bg-[var(--surface-card)] text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" /> Tableau
          </button>
          <button
            onClick={() => setView('pipeline')}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors ${
              view === 'pipeline'
                ? 'bg-blue-600 text-white'
                : 'bg-[var(--surface-card)] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" /> Pipeline
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher prospect ou entreprise..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>

        {/* Statut filter */}
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {PROSPECT_STAGES.map(s => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* À contacter aujourd'hui */}
        <button
          onClick={() => setTodayOnly(p => !p)}
          className={`relative flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all border ${
            todayOnly
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400'
              : 'bg-[var(--surface-card)] border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {todayCount > 0 && !todayOnly && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 text-[10px] font-bold text-black flex items-center justify-center animate-pulse">
              {todayCount}
            </span>
          )}
          <Bell className={`w-3.5 h-3.5 ${todayCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`} />
          À contacter aujourd'hui
          {todayOnly && (
            <span className="ml-1 w-4 h-4 rounded-full bg-amber-400 text-[10px] font-bold text-black flex items-center justify-center">
              {todayCount}
            </span>
          )}
        </button>
      </div>

      {/* Date filter */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* ── Loading / Error states ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {isError && (
        <div className="card-premium p-4 flex items-center gap-3 text-red-400 border-red-500/30 bg-red-500/5">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">Erreur de connexion. Les données de démo sont affichées.</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TABLE VIEW
      ══════════════════════════════════════════════ */}
      {!isLoading && view === 'table' && (
        <>
          {/* Bulk action bar */}
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30"
              >
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-red-400">
                    {selectedIds.size} prospect{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground h-7 text-xs"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Désélectionner
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white border-0"
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Supprimer ({selectedIds.size})
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="card-premium overflow-hidden">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    {/* Select-all checkbox */}
                    <th className="pl-4 pr-2 py-3 w-8"
                        onClick={toggleSelectAll}
                        title={selectedIds.size === filtered.length ? 'Tout désélectionner' : 'Tout sélectionner'}>
                      {filtered.length > 0 && selectedIds.size === filtered.length
                        ? <CheckSquare className="w-4 h-4 text-blue-600 cursor-pointer" />
                        : <Square      className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground" />
                      }
                    </th>
                    {['Prospect', 'Contact', 'Statut', 'Valeur', 'Source', 'Relance', 'Dernière note'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {filtered.map(p => (
                      <ProspectRow
                        key={p.id}
                        p={p}
                        onEdit={openEdit}
                        selected={selectedIds.has(p.id)}
                        onToggle={toggleSelect}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              {filtered.length === 0 && (
                <div className="py-16 text-center">
                  <User className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">Aucun prospect trouvé</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {todayOnly ? "Aucune relance prévue aujourd'hui" : 'Ajoutez votre premier prospect'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          PIPELINE / KANBAN VIEW
      ══════════════════════════════════════════════ */}
      {!isLoading && view === 'pipeline' && (
        <DragDropContext
          onDragStart={onDragStart}
          onDragUpdate={onDragUpdate}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 420 }}>
            {PROSPECT_STAGES.map(stage => {
              const cards    = byStage[stage.id] ?? []
              const total    = cards.reduce((s, p) => s + (p.valeur_estimee ?? 0), 0)
              const isActive = dragOver   === stage.id
              const isSource = dragSource === stage.id
              const dimmed   = dragSource && !isActive && !isSource
              return (
                <div
                  key={stage.id}
                  className="flex-shrink-0 flex flex-col rounded-xl border bg-[var(--surface-card)] overflow-hidden"
                  style={{
                    width: 220,
                    borderColor: isActive ? stage.accent : 'hsl(var(--border))',
                    boxShadow: isActive ? `0 0 0 2px ${stage.accent}40, 0 8px 24px -10px ${stage.accent}55` : undefined,
                    opacity: dimmed ? 0.55 : 1,
                    transform: isActive ? 'translateY(-2px)' : undefined,
                    transition: 'box-shadow 200ms ease, opacity 200ms ease, transform 200ms ease, border-color 200ms ease',
                  }}
                >
                  <div
                    className="px-3 py-2.5 border-b border-border"
                    style={{ borderTop: `3px solid ${stage.accent}` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{stage.label}</span>
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: stage.accent }}
                      >
                        {cards.length}
                      </span>
                    </div>
                    {total > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(total)}</p>
                    )}
                  </div>

                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="flex-1 p-2 space-y-2"
                        style={{
                          minHeight: 80,
                          backgroundColor: snapshot.isDraggingOver ? `${stage.accent}14` : 'transparent',
                          transition: 'background-color 180ms ease',
                        }}
                      >
                        {cards.map((p, i) => (
                          <KanbanCard
                            key={p.id}
                            p={p}
                            index={i}
                            onEdit={openEdit}
                            accent={stage.accent}
                          />
                        ))}
                        {provided.placeholder}
                        {cards.length === 0 && !snapshot.isDraggingOver && !isSource && (
                          <p className="text-xs text-muted-foreground text-center py-4 opacity-50">
                            Glissez ici
                          </p>
                        )}
                        {snapshot.isDraggingOver && cards.length === 0 && (
                          <div
                            className="border-2 border-dashed rounded-lg py-6 text-center text-xs font-medium"
                            style={{ borderColor: stage.accent, color: stage.accent }}
                          >
                            Déposer ici
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      )}

      {/* ── Confirmation delete dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Confirmer la suppression
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Vous allez supprimer{' '}
              <span className="font-semibold text-foreground">
                {selectedIds.size} prospect{selectedIds.size > 1 ? 's' : ''}
              </span>
              . Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>
                Annuler
              </Button>
              <Button
                size="sm"
                className="bg-red-500 hover:bg-red-600 text-white border-0"
                onClick={handleBulkDelete}
                disabled={deleting}
              >
                {deleting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2  className="w-3.5 h-3.5" />
                }
                Supprimer définitivement
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Right-side Drawer ── */}
      <ProspectDrawer
        open={drawerOpen}
        prospect={editTarget}
        onClose={closeDrawer}
      />
    </div>
  )
}
