import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  MessageCircle, Eye, Copy,
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
  PROSPECT_STAGES, PROSPECT_SOURCES, PROSPECT_PRIORITIES, prioriteRank,
  type Prospect, type ProspectStatut, type ProspectPriorite,
} from '@/hooks/useProspects'
import {
  useProspectLogs, useAddProspectLog, useAllProspectLogs,
  type ProspectLog, type LogType,
} from '@/hooks/useProspectLogs'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { prospectsSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, makeDatePredicate, computeRange, DEFAULT_RANGE,
  type DateRange, type DatePreset,
} from '@/components/ui/DateRangeFilter'
import { useListNavMemory, listNavKey } from '@/hooks/useListNavMemory'
import { canonicalPhone, groupByPhone } from '@/lib/phone'

/* ─── helpers ─────────────────────────────────────────────────────── */
/* Les colonnes DATE reviennent de l'API en timestamp décalé au fuseau
   (ex. '2026-07-23T23:00:00.000Z' pour une date locale du 2026-07-24).
   ymd() ramène toute valeur date à 'YYYY-MM-DD' en heure LOCALE, pour comparer
   les jours de façon fiable. */
function ymd(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TODAY = ymd(new Date().toISOString())
const isRelanceToday = (p: Prospect) => !!p.date_relance && ymd(p.date_relance) === TODAY

/* Heure de relance 'HH:MM' (depuis relance_at) — vide si minuit / non renseignée. */
function relanceTime(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const hh = d.getHours(), mm = d.getMinutes()
  if (hh === 0 && mm === 0) return ''
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/* Filtre par défaut : « Toute la période ». On ne masque jamais de prospects
   à l'ouverture — la période se restreint ensuite d'un clic si besoin. */
const DEFAULT_FILTERS: ListFilters = {
  view:         'table',
  search:       '',
  filterStatut: 'all',
  todayOnly:    false,
  dupOnly:      false,
  dateRange:    DEFAULT_RANGE,
}

/* État de liste mémorisé le temps de la session (cf. useListNavMemory) :
   on retrouve la liste telle qu'on l'a quittée en revenant d'une fiche. */
interface ListFilters {
  view:         'table' | 'pipeline'
  search:       string
  filterStatut: string
  todayOnly:    boolean
  /** N'afficher que les prospects dont le téléphone apparaît plusieurs fois. */
  dupOnly:      boolean
  dateRange:    DateRange
}

const PAGE_SIZE = 50

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
  whatsapp: { icon: MessageCircle,   color: 'text-green-600 dark:text-green-400',     bg: 'bg-green-500/20'   },
}

/* ─── Styles des résultats d'appel (badge « dernier appel » dans la liste) ── */
const OUTCOME_STYLE: Record<string, string> = {
  'Pas de réponse': 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  'À rappeler':     'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'Occupé':         'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'Faux numéro':    'bg-red-500/15 text-red-600 dark:text-red-400',
  'Intéressé':      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'Pas intéressé':  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
}
function outcomeBadgeClass(msg: string): string {
  const key = Object.keys(OUTCOME_STYLE).find(k => msg.startsWith(k))
  return key ? OUTCOME_STYLE[key] : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
}

/* ─── Badge de priorité prospect ──────────────────────────────────── */
function PrioriteBadge({ priorite }: { priorite: ProspectPriorite }) {
  const meta = PROSPECT_PRIORITIES.find(x => x.id === priorite)
  if (!meta) return null
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
      title={`Priorité : ${meta.label}`}
    >
      {meta.icon} {meta.label}
    </span>
  )
}

/* ─── Timeline component ──────────────────────────────────────────── */
function ProspectTimeline({ prospectId }: { prospectId: string }) {
  const { data: logs = [], isLoading } = useProspectLogs(prospectId)
  const [zoom, setZoom] = useState<string | null>(null)

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
              {log.media && log.media.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {log.media.map((src, k) => (
                    <button key={k} type="button" onClick={() => setZoom(src)} title="Agrandir">
                      <img src={src} alt="" className="h-20 w-auto max-w-[160px] object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}
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
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" />
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
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
  priorite:       '' as ProspectPriorite | '',
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
    priorite:       p.priorite ?? '',
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
  /* Numéro dont l'utilisateur a déjà accepté le doublon (cf. handleSave).
     Déclaré ici car le bloc de re-synchro ci-dessous le remet à zéro. */
  const [ackedPhone, setAckedPhone] = useState<string | null>(null)

  // Re-sync form + reset tab when prospect changes
  const [prevProspect, setPrevProspect] = useState(prospect)
  if (prevProspect !== prospect) {
    setPrevProspect(prospect)
    setForm(prospect ? prospectToForm(prospect) : { ...EMPTY_FORM })
    setTab('form')
    setNoteText('')
    setNoteType('note')
    setAckedPhone(null)
  }

  /* Réinitialisation à chaque OUVERTURE du tiroir.
     Le bloc ci-dessus ne suffit pas : l'édition d'une fiche passe désormais par
     la page de détail, donc `prospect` vaut toujours null ici et la comparaison
     n'est jamais vraie. Sans ce second garde-fou, « Nouveau prospect » rouvrait
     avec les valeurs du prospect précédent, et surtout l'accord donné sur un
     doublon survivait : la 2ᵉ création avec le même numéro passait sans aucune
     confirmation. */
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setForm(prospect ? prospectToForm(prospect) : { ...EMPTY_FORM })
      setTab('form')
      setNoteText('')
      setNoteType('note')
      setAckedPhone(null)
    }
  }

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const busy = create.isPending || update.isPending

  /* Doublon de téléphone : détecté PENDANT la saisie, avant même d'enregistrer.
     C'est le vrai garde-fou — un prospect créé deux fois (formulaire du site,
     import, appel entrant) fait rappeler le même client. */
  const { data: allProspects = [] } = useProspects()
  const phoneTwins = useMemo(() => {
    const key = canonicalPhone(form.telephone)
    if (!key) return []
    return allProspects.filter(o =>
      o.id !== prospect?.id && canonicalPhone(o.telephone) === key
    )
  }, [allProspects, form.telephone, prospect?.id])

  /* L'accord porte sur UN numéro précis : le modifier l'invalide aussitôt. */
  const dupAcknowledged = ackedPhone !== null && ackedPhone === canonicalPhone(form.telephone)

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
    /* Doublon de téléphone : on n'interdit pas (un standard d'entreprise peut
       servir à deux contacts) mais on exige une 2ᵉ validation consciente.
       L'accord porte sur CE numéro : le modifier redemande confirmation. */
    if (phoneTwins.length > 0 && !dupAcknowledged) {
      setAckedPhone(canonicalPhone(form.telephone))
      toast.warning(
        `Numéro déjà utilisé par ${phoneTwins[0].nom}${phoneTwins.length > 1 ? ` et ${phoneTwins.length - 1} autre(s)` : ''}.`,
        { description: 'Cliquez à nouveau sur Enregistrer pour créer quand même.', duration: 8000 },
      )
      return
    }
    const payload = {
      nom:            form.nom.trim(),
      email:          form.email.trim() || null,
      telephone:      form.telephone.trim() || null,
      entreprise:     form.entreprise.trim() || null,
      statut:         form.statut,
      priorite:       form.priorite || null,
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

          {/* Wrapper de centrage (fixe + flex center) — évite que framer-motion
              n'écrase le -translate-x/y de Tailwind quand il anime scale/y. */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            onClick={onClose}
          >
            <motion.aside
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', damping: 24, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] bg-[var(--surface-card)] border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
            >

            {/* ── HERO HEADER ── */}
            <div
              className="relative flex-shrink-0 px-6 pt-5 pb-4"
              style={{ background: `linear-gradient(135deg, ${accent}18 0%, transparent 60%)` }}
            >
              {/* Bouton Créer / Enregistrer centré horizontalement en haut */}
              {tab === 'form' && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={busy}
                    className="h-8 px-5 text-xs font-semibold shadow-md"
                  >
                    {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isEdit ? '💾 Enregistrer' : '➕ Créer'}
                  </Button>
                </div>
              )}
              {/* Close à droite */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              {isEdit ? (
                <div className="flex items-start gap-4 pr-10">
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
                <div className="flex items-center gap-3 pr-32">
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
                      <div>
                        <div className="relative">
                          <Phone className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${
                            phoneTwins.length ? 'text-red-500' : 'text-muted-foreground'
                          }`} />
                          <Input
                            value={form.telephone}
                            onChange={set('telephone')}
                            placeholder="Téléphone"
                            className={`pl-9 ${phoneTwins.length ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                          />
                        </div>
                        {phoneTwins.length > 0 && (
                          <div className="mt-1.5 rounded-lg border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-500/10 px-2.5 py-2">
                            <p className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              Ce numéro est déjà enregistré — ne rappelez pas ce client deux fois.
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {phoneTwins.slice(0, 4).map(t => (
                                <li key={t.id} className="text-[11px] text-red-700/90 dark:text-red-300/90 truncate">
                                  • {t.nom}
                                  {t.entreprise ? ` · ${t.entreprise}` : ''}
                                  {' — '}{stageLabel(t.statut)}
                                </li>
                              ))}
                              {phoneTwins.length > 4 && (
                                <li className="text-[11px] text-red-700/70 dark:text-red-300/70">
                                  et {phoneTwins.length - 4} autre{phoneTwins.length - 4 > 1 ? 's' : ''}…
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
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

                    {/* Priorité (feeling commercial) */}
                    <div>
                      <p className="form-label mb-2">Priorité</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PROSPECT_PRIORITIES.map(pr => (
                          <button
                            key={pr.id}
                            type="button"
                            onClick={() => setForm(p => ({ ...p, priorite: p.priorite === pr.id ? '' : pr.id }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                              form.priorite === pr.id
                                ? 'border-transparent text-white shadow-sm'
                                : 'border-border text-muted-foreground hover:text-foreground bg-transparent'
                            }`}
                            style={form.priorite === pr.id ? { backgroundColor: pr.color } : {}}
                          >
                            {pr.icon} {pr.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        { t: 'note'     as LogType, label: 'Note'           },
                        { t: 'appel'    as LogType, label: 'Appel'          },
                        { t: 'whatsapp' as LogType, label: 'Audio WhatsApp' },
                        { t: 'email'    as LogType, label: 'Email'          },
                        { t: 'edit'     as LogType, label: 'Autre'          },
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
                        : noteType === 'whatsapp' ? "Ex : Vocal WhatsApp envoyé — présentation de l’offre…"
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
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ─── ProspectRow (table) ─────────────────────────────────────────── */
function ProspectRow({
  p, onEdit, selected, onToggle, lastCall, visited, twins,
}: {
  p: Prospect
  onEdit:   (p: Prospect) => void
  selected: boolean
  onToggle: (id: string) => void
  lastCall?: ProspectLog
  /** Dernière fiche ouverte : surlignée pour retrouver sa place en un coup d'œil. */
  visited?: boolean
  /** Autres prospects partageant ce numéro — signalés pour ne pas rappeler deux fois. */
  twins?: Prospect[]
}) {
  const accent  = stageAccent(p.statut)
  const dot     = stageDot(p.statut)
  const label   = stageLabel(p.statut)
  const isToday = isRelanceToday(p)

  /* Ordre de priorité : sélection (cases à cocher) > dernière fiche ouverte >
     relance du jour. `row-visited` est une classe CSS (index.css) et non des
     utilitaires Tailwind : le fond doit être posé sur les <td> pour survivre
     aux zébrures et au survol. */
  const tone =
    selected  ? 'bg-blue-50/50 dark:bg-blue-900/10'
    : visited ? 'row-visited'
    : isToday ? 'bg-amber-50/70 dark:bg-amber-500/10 shadow-[inset_3px_0_0_0_#f59e0b]'
    : ''

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className={`table-row cursor-pointer group ${tone}`}
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
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-foreground leading-tight truncate">{p.nom}</p>
              {p.priorite && <PrioriteBadge priorite={p.priorite} />}
              {visited && (
                <span
                  title="Dernière fiche ouverte"
                  className="inline-flex items-center gap-1 flex-shrink-0 px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 text-[10px] font-bold"
                >
                  <Eye className="w-2.5 h-2.5" /> Vu
                </span>
              )}
            </div>
            {p.entreprise && <p className="text-xs text-muted-foreground truncate">{p.entreprise}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {p.email     && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail  className="w-3 h-3" />{p.email}</p>}
          {p.telephone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
              <Phone className="w-3 h-3" />{p.telephone}
              {!!twins?.length && (
                <span
                  title={`Déjà présent sur : ${twins.map(t => t.nom).join(', ')}\nNe rappelez pas ce client deux fois.`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-bold"
                >
                  <Copy className="w-2.5 h-2.5" />
                  Doublon{twins.length > 1 ? ` ×${twins.length + 1}` : ''}
                </span>
              )}
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            {label}
          </span>
          {lastCall && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium max-w-[160px] ${outcomeBadgeClass(lastCall.message)}`}
              title={`Dernier appel : ${lastCall.message}`}
            >
              <PhoneCall className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{lastCall.message}</span>
            </span>
          )}
        </div>
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
            {relanceTime(p.relance_at) && <span className="font-semibold">· {relanceTime(p.relance_at)}</span>}
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
  p, index, onEdit, accent, lastCall, visited, twins,
}: {
  p: Prospect
  index: number
  onEdit: (p: Prospect) => void
  accent: string
  lastCall?: ProspectLog
  /** Dernière fiche ouverte : carte surlignée pour retrouver sa place. */
  visited?: boolean
  /** Autres prospects partageant ce numéro. */
  twins?: Prospect[]
}) {
  const isToday = isRelanceToday(p)
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
            className={`border rounded-lg p-3 select-none will-change-transform ${
              visited
                ? 'bg-violet-100/70 dark:bg-violet-500/15 border-violet-400 dark:border-violet-500/50 ring-1 ring-violet-400/50'
                : 'bg-[var(--surface-card)] border-border'
            } ${
              snapshot.isDragging
                ? 'cursor-grabbing shadow-xl ring-1 ring-offset-0'
                : 'cursor-grab hover:shadow-md hover:-translate-y-0.5 active:cursor-grabbing'
            }`}
            onClick={() => { if (!snapshot.isDragging) onEdit(p) }}
          >
            <div className="flex items-start justify-between gap-1.5 mb-1">
              <p className="text-sm font-medium text-foreground leading-snug">{p.nom}</p>
              {visited && (
                <span
                  title="Dernière fiche ouverte"
                  className="inline-flex items-center gap-1 flex-shrink-0 px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-300 text-[10px] font-bold"
                >
                  <Eye className="w-2.5 h-2.5" /> Vu
                </span>
              )}
            </div>
            {p.entreprise && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                <Building2 className="w-3 h-3 flex-shrink-0" />
                {p.entreprise}
              </p>
            )}
            {!!twins?.length && (
              <p
                title={`Déjà présent sur : ${twins.map(t => t.nom).join(', ')}\nNe rappelez pas ce client deux fois.`}
                className="inline-flex items-center gap-1 mb-2 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-bold"
              >
                <Copy className="w-2.5 h-2.5" /> Numéro en doublon
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
            {lastCall && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium mt-2 max-w-full ${outcomeBadgeClass(lastCall.message)}`}
                title={`Dernier appel : ${lastCall.message}`}
              >
                <PhoneCall className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{lastCall.message}</span>
              </span>
            )}
          </div>
        )
      }}
    </Draggable>
  )
}

/* ─── Main Page ───────────────────────────────────────────────────── */
export default function Prospects() {
  const navigate = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base = tenantSlug ? `/${tenantSlug}` : ''
  const { data: prospects = [], isLoading, isError } = useProspects()
  const { data: allLogs = [] } = useAllProspectLogs()
  const createProspect  = useCreateProspect()
  const updateProspect  = useUpdateProspect()
  const deleteProspect  = useDeleteProspect()
  const addLog          = useAddProspectLog()
  const qc              = useQueryClient()

  /* Dernier appel enregistré par prospect (allLogs est trié du + récent au + ancien). */
  const lastCallByProspect = useMemo(() => {
    const m = new Map<string, ProspectLog>()
    for (const log of allLogs) {
      if (log.type === 'appel' && !m.has(log.prospect_id)) m.set(log.prospect_id, log)
    }
    return m
  }, [allLogs])

  /* Mémoire de navigation : filtres + page + scroll + dernière fiche ouverte.
     `ready` = les lignes sont rendues, condition pour restaurer le scroll. */
  const [rowsReady, setRowsReady] = useState(false)
  const nav = useListNavMemory<ListFilters>(
    listNavKey('prospects', tenantSlug),
    DEFAULT_FILTERS,
    rowsReady,
  )

  const [view,         setView]         = useState<'table' | 'pipeline'>(nav.initialFilters.view)
  const [search,       setSearch]       = useState(nav.initialFilters.search)
  const [filterStatut, setFilterStatut] = useState<string>(nav.initialFilters.filterStatut)
  const [todayOnly,    setTodayOnly]    = useState(nav.initialFilters.todayOnly)
  /* `?? false` : un instantané enregistré avant l'ajout du filtre n'a pas la clé. */
  const [dupOnly,      setDupOnly]      = useState(nav.initialFilters.dupOnly ?? false)
  const [dateRange,    setDateRange]    = useState<DateRange>(nav.initialFilters.dateRange)
  const [page,         setPage]         = useState(nav.initialPage)
  const [drawerOpen,   setDrawerOpen]   = useState(false)
  const [editTarget,   setEditTarget]   = useState<Prospect | null>(null)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [confirmOpen,  setConfirmOpen]  = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  const todayCount = useMemo(
    () => prospects.filter(isRelanceToday).length,
    [prospects]
  )

  /* Doublons de téléphone — calculés sur TOUS les prospects, pas sur la liste
     filtrée : un doublon doit être signalé même si son jumeau est masqué par
     la période ou le statut, sinon on rappellerait le client une 2ᵉ fois. */
  const phoneGroups = useMemo(
    () => groupByPhone(prospects, p => p.telephone),
    [prospects],
  )
  const twinsOf = useCallback((p: Prospect): Prospect[] => {
    const group = phoneGroups.get(canonicalPhone(p.telephone))
    return group ? group.filter(o => o.id !== p.id) : []
  }, [phoneGroups])
  /* Nombre de prospects impliqués dans un doublon (pas le nombre de groupes). */
  const duplicateCount = useMemo(
    () => [...phoneGroups.values()].reduce((n, g) => n + g.length, 0),
    [phoneGroups],
  )

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const searching = search.trim().length > 0

  /* Base = tous les filtres SAUF la période (sert aussi aux compteurs). */
  const baseFiltered = useMemo(() => {
    const q       = search.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')                       // chiffres tapés
    const qCanon  = qDigits.replace(/^(00212|212|0)/, '')      // numéro national (sans 0 / +212)
    /* Recherche par téléphone : compare les chiffres, et gère l'équivalence
       0XXXXXXXXX ↔ +212XXXXXXXXX (ex. « 663883668 » trouve « +212 663-883668 »). */
    const phoneHit = (phone: string | null) => {
      if (!phone || qDigits.length < 3) return false
      const d = phone.replace(/\D/g, '')
      return d.includes(qDigits) || d.replace(/^(00212|212|0)/, '').includes(qCanon)
    }
    return prospects.filter(p => {
      const matchSearch  = !q
        || p.nom.toLowerCase().includes(q)
        || (p.entreprise ?? '').toLowerCase().includes(q)
        || phoneHit(p.telephone)
      const matchStatut  = filterStatut === 'all' || p.statut === filterStatut
      /* Une recherche active affiche la liste complète : on ignore les
         filtres de période (« Ce mois ») et « à contacter aujourd'hui ». */
      const matchToday   = !!q || !todayOnly || isRelanceToday(p)
      /* Le filtre doublons reste actif même pendant une recherche : il sert
         justement à retrouver l'autre fiche du même client. */
      const matchDup     = !dupOnly || phoneGroups.has(canonicalPhone(p.telephone))
      return matchSearch && matchStatut && matchToday && matchDup
    })
  }, [prospects, search, filterStatut, todayOnly, dupOnly, phoneGroups])

  const filtered = useMemo(() => (
    baseFiltered
      .filter(p => searching || dateMatch(p.created_at))
      .sort((a, b) => {
        /* Priorité d'abord (Premium en tête), puis les plus récents. */
        const dr = prioriteRank(a.priorite) - prioriteRank(b.priorite)
        if (dr !== 0) return dr
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  ), [baseFiltered, searching, dateMatch])

  /* Nombre de prospects par période, affiché sur chaque pastille du filtre. */
  const periodCounts = useMemo(() => {
    const countFor = (range: DateRange) => {
      const match = makeDatePredicate(range)
      return baseFiltered.filter(p => match(p.created_at)).length
    }
    const presets: Exclude<DatePreset, 'all' | 'custom'>[] = ['today', 'week', 'month', 'year']
    const counts: Partial<Record<DatePreset, number>> = { all: baseFiltered.length }
    presets.forEach(preset => {
      /* La pastille active suit la période réellement affichée (flèches ‹ ›). */
      if (preset === dateRange.preset) { counts[preset] = countFor(dateRange); return }
      const { from, to } = computeRange(preset)
      counts[preset] = countFor({ preset, from, to })
    })
    /* « Personnalisé » : compte la plage choisie, sinon rien à afficher. */
    if (dateRange.preset === 'custom') counts.custom = countFor(dateRange)
    return counts
  }, [baseFiltered, dateRange])

  /* Pagination — 50 par page, reset à 1 quand les filtres changent VRAIMENT.
     On compare une signature plutôt que de « sauter le 1er passage » : sous
     StrictMode l'effet est monté deux fois, et un simple drapeau laisserait le
     2ᵉ passage écraser la page restaurée au retour d'une fiche. */
  const filterSig = JSON.stringify({ search, filterStatut, todayOnly, dupOnly, dateRange })
  const filterSigRef = useRef(filterSig)
  useEffect(() => {
    if (filterSigRef.current === filterSig) return
    filterSigRef.current = filterSig
    setPage(1)
  }, [filterSig])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  /* Page restaurée devenue hors-limites (prospects supprimés entre-temps) :
     on recadre plutôt que d'afficher un tableau vide. */
  useEffect(() => {
    if (!isLoading && filtered.length > 0 && page > totalPages) setPage(totalPages)
  }, [isLoading, filtered.length, page, totalPages])
  const pageStart  = (page - 1) * PAGE_SIZE
  const paginated  = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  /* Les lignes sont dans le DOM → la position de scroll peut être restaurée. */
  useEffect(() => {
    if (!rowsReady && !isLoading && filtered.length > 0) setRowsReady(true)
  }, [rowsReady, isLoading, filtered.length])

  const openNew     = () => { setEditTarget(null); setDrawerOpen(true) }
  /* Ouvre la fiche EN MÉMORISANT l'état de la liste : au retour on retrouve
     les mêmes filtres, la même page, la même position, et la ligne ouverte
     reste surlignée pour enchaîner sur le prospect suivant. */
  const openEdit    = (p: Prospect) => {
    nav.remember(p.id, { view, search, filterStatut, todayOnly, dupOnly, dateRange }, page)
    navigate(`${base}/prospects/${p.id}`)
  }
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
            placeholder="Rechercher par nom, entreprise ou téléphone..."
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

        {/* Doublons de téléphone — masqué s'il n'y en a pas, MAIS toujours
            visible tant que le filtre est actif : sinon, résoudre le dernier
            doublon ferait disparaître le bouton en laissant la liste vide. */}
        {(duplicateCount > 0 || dupOnly) && (
          <button
            onClick={() => setDupOnly(p => !p)}
            title="N'afficher que les prospects dont le numéro apparaît plusieurs fois"
            className={`flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all border ${
              dupOnly
                ? 'bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-400'
                : 'bg-[var(--surface-card)] border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Copy className="w-3.5 h-3.5 text-red-500" />
            Doublons
            <span className="w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
              {duplicateCount}
            </span>
          </button>
        )}
      </div>

      {/* Date filter */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} counts={periodCounts} />
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
                    {paginated.map(p => (
                      <ProspectRow
                        key={p.id}
                        p={p}
                        onEdit={openEdit}
                        selected={selectedIds.has(p.id)}
                        onToggle={toggleSelect}
                        lastCall={lastCallByProspect.get(p.id)}
                        visited={p.id === nav.lastOpenedId}
                        twins={twinsOf(p)}
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

            {/* ── Pagination ─────────────────────────────────────── */}
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/20 text-xs">
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{pageStart + 1}</span>
                  {' – '}
                  <span className="font-semibold text-foreground">{Math.min(pageStart + PAGE_SIZE, filtered.length)}</span>
                  {' sur '}
                  <span className="font-semibold text-foreground">{filtered.length}</span>
                  {' prospects'}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Préc.
                  </button>
                  <span className="px-2 text-muted-foreground">
                    Page <span className="font-semibold text-foreground">{page}</span> / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Suiv. →
                  </button>
                </div>
              </div>
            )}
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
                            lastCall={lastCallByProspect.get(p.id)}
                            visited={p.id === nav.lastOpenedId}
                            twins={twinsOf(p)}
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
