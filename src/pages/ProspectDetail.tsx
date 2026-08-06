import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Edit2, Trash2, Phone, Mail, Building2, User,
  Calendar, Bell, DollarSign, Loader2, AlertCircle, Clock, FileText,
  ChevronDown, ChevronRight, UserPlus, ArrowRightLeft, PhoneCall,
  TrendingUp, Target, Tag, Check, AlertTriangle, MessageCircle, Sparkles, Languages,
  Image as ImageIcon, X, Copy,
} from 'lucide-react'
import { aiApi } from '@/lib/aiApi'
import { extractImageFilesFromClipboard, compressImageToDataURL } from '@/lib/pasteImage'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useProspects, useUpdateProspect, useDeleteProspect,
  PROSPECT_STAGES, PROSPECT_SOURCES, PROSPECT_PRIORITIES,
  type Prospect, type ProspectStatut, type ProspectPriorite,
} from '@/hooks/useProspects'
import {
  useProspectLogs, useAddProspectLog, type LogType,
} from '@/hooks/useProspectLogs'
import { useDevis, type Devis } from '@/hooks/useDevis'
import { markListItemOpened, listNavKey } from '@/hooks/useListNavMemory'
import { canonicalPhone } from '@/lib/phone'
import { formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import AIQuoteGeneratorDialog from '@/components/devis/AIQuoteGeneratorDialog'
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

/* Numéro → format international pour wa.me (défaut Maroc +212).
   0661091900 → 212661091900 ; 00212… / +212… → 212… ; garde un indicatif déjà présent. */
function waNumber(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.startsWith('0')) d = '212' + d.slice(1)
  return d
}
function waLink(phone: string, text?: string): string {
  const base = `https://wa.me/${waNumber(phone)}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

/* Timestamp/date → 'YYYY-MM-DD' local (pour un <input type="date">). */
function toDateInput(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/* Timestamp → 'HH:MM' local (pour un <input type="time">). '' si null/absent. */
function toTimeInput(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
/* Combine 'YYYY-MM-DD' + 'HH:MM' (heure optionnelle) → ISO, ou null si pas de date/heure. */
function combineRelance(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null
  const d = new Date(`${dateStr}T${timeStr}`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}
/* Affichage lisible « 25/07/2026 à 14:30 » (ou juste la date si minuit). */
function formatRelance(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  if (isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`
  return time === '00:00' ? date : `${date} à ${time}`
}

/* Issues d'appel fréquentes — enregistrées en 1 clic (type='appel'). */
const CALL_OUTCOMES = [
  'Pas de réponse',
  'À rappeler',
  'Occupé',
  'Faux numéro',
  'Intéressé',
  'Pas intéressé',
]

/* Suivis WhatsApp fréquents — enregistrés en 1 clic (type='whatsapp').
   Cas principal : on envoie un vocal au prospect et on le trace sans rien taper. */
const WA_OUTCOMES = [
  'Audio envoyé',
  'Audio reçu',
  'Message envoyé',
  'Vu sans réponse',
  'A répondu',
]

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
  whatsapp: { icon: MessageCircle,  color: 'text-green-600 dark:text-green-400',     bg: 'bg-green-500/20'   },
}

/* Statuts de devis — badge dans l'encart « Devis » de la colonne droite. */
const DEVIS_STATUT: Record<Devis['statut'], { label: string; color: string; bg: string }> = {
  brouillon: { label: 'Brouillon', color: 'text-muted-foreground',                 bg: 'bg-muted'                             },
  envoye:    { label: 'Envoyé',    color: 'text-blue-600 dark:text-blue-400',      bg: 'bg-blue-50 dark:bg-blue-500/15'       },
  accepte:   { label: 'Accepté',   color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/15' },
  refuse:    { label: 'Refusé',    color: 'text-red-600 dark:text-red-400',        bg: 'bg-red-50 dark:bg-red-500/15'         },
  expire:    { label: 'Expiré',    color: 'text-amber-600 dark:text-amber-400',    bg: 'bg-amber-50 dark:bg-amber-500/15'     },
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
  const totalCallMin = logs.reduce((s, l) => s + (l.type === 'appel' ? (l.duration_minutes ?? 0) : 0), 0)
  const callCount    = logs.filter(l => l.type === 'appel').length
  return (
    <div>
      {totalCallMin > 0 && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 w-fit">
          <PhoneCall className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            Temps d'appel total : {totalCallMin} min{callCount > 1 ? ` · ${callCount} appels` : ''}
          </span>
        </div>
      )}
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
              <div className="flex items-start gap-2 flex-wrap">
                <p className="text-sm text-foreground leading-snug">{log.message}</p>
                {log.duration_minutes != null && log.duration_minutes > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
                    <Clock className="w-3 h-3" />{log.duration_minutes} min
                  </span>
                )}
              </div>
              {log.media && log.media.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {log.media.map((src, k) => (
                    <button key={k} type="button" onClick={() => setZoom(src)} title="Agrandir">
                      <img src={src} alt="" className="h-24 w-auto max-w-[180px] object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</span>
                {log.auteur && <span className="text-xs text-muted-foreground">· {log.auteur}</span>}
              </div>
            </div>
          </motion.div>
        )
      })}
      </div>
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
    priorite:       (prospect.priorite ?? '') as ProspectPriorite | '',
    valeur_estimee: prospect.valeur_estimee != null ? String(prospect.valeur_estimee) : '',
    source:         prospect.source ?? '',
    notes:          prospect.notes ?? '',
    responsable:    prospect.responsable ?? '',
    date_contact:   toDateInput(prospect.date_contact),
    relance_date:   toDateInput(prospect.date_relance),
    relance_time:   toTimeInput(prospect.relance_at),
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
      priorite:       form.priorite || null,
      valeur_estimee: form.valeur_estimee ? parseFloat(form.valeur_estimee) : null,
      source:         form.source || null,
      notes:          form.notes.trim() || null,
      responsable:    form.responsable.trim() || null,
      date_contact:   form.date_contact || null,
      date_relance:   form.relance_date || null,
      relance_at:     combineRelance(form.relance_date, form.relance_time),
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
        <div className="space-y-1.5 col-span-2">
          <label className="form-label">Priorité</label>
          <div className="flex flex-wrap gap-1.5">
            {PROSPECT_PRIORITIES.map(pr => (
              <button
                key={pr.id}
                type="button"
                onClick={() => setForm(p => ({ ...p, priorite: p.priorite === pr.id ? '' : pr.id }))}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  form.priorite === pr.id ? 'border-transparent text-white shadow-sm' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
                style={form.priorite === pr.id ? { backgroundColor: pr.color } : {}}
              >
                {pr.icon} {pr.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="form-label">1er contact</label>
          <Input type="date" value={form.date_contact} onChange={set('date_contact')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Relance (heure facultative)</label>
          <div className="flex gap-2">
            <Input type="date" value={form.relance_date} onChange={set('relance_date')} className="flex-1" />
            <Input type="time" value={form.relance_time} onChange={set('relance_time')} disabled={!form.relance_date} className="w-28" title="Heure (facultative)" />
          </div>
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
  const { can } = usePermissions()
  /* Bouton « Générer un devis IA » : admin, manager (chef de projet) et
     commercial autorisés — aligné sur le droit de créer un devis. */
  const canGenerateQuote = can('devis', 'create')
  const canViewQuotes    = can('devis', 'view')

  const prospect = prospects.find(p => p.id === id)

  /* Mémorise la fiche ouverte et arme la restauration de la liste. Couvre les
     entrées qui ne passent pas par la liste (notification de relance, URL
     collée) : au retour, c'est bien CETTE ligne qui est surlignée. */
  useEffect(() => {
    if (id) markListItemOpened(listNavKey('prospects', tenantSlug), id)
  }, [id, tenantSlug])

  /* Autres prospects partageant ce téléphone — averti AVANT d'appeler. */
  const phoneTwins = useMemo(() => {
    const key = canonicalPhone(prospect?.telephone)
    if (!key) return []
    return prospects.filter(o => o.id !== prospect?.id && canonicalPhone(o.telephone) === key)
  }, [prospects, prospect?.id, prospect?.telephone])

  /* Devis présentés à ce prospect (cf. migration 078 : devis.prospect_id),
     du plus récent au plus ancien. */
  const { data: allDevis = [] } = useDevis()
  const prospectDevis = useMemo(
    () => allDevis
      .filter(d => d.prospect_id === id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [allDevis, id],
  )

  const [editOpen,   setEditOpen]   = useState(false)
  const [aiQuoteOpen, setAiQuoteOpen] = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)
  const [noteText,     setNoteText]     = useState('')
  const [translating,  setTranslating]  = useState(false)
  const [pastedImages, setPastedImages] = useState<string[]>([])
  const [noteType,     setNoteType]     = useState<LogType>('note')
  const [callDuration, setCallDuration] = useState('')   // durée d'appel en minutes
  const [notesDraft,   setNotesDraft]   = useState(prospect?.notes ?? '')

  /* Reset du composer d'activité quand on change de prospect */
  const [prevId, setPrevId] = useState(id)
  if (prevId !== id) {
    setPrevId(id)
    setNoteText('')
    setNoteType('note')
    setCallDuration('')
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

  /* Priorité (feeling) — clic sur la puce active/désactive. */
  const changePriorite = (next: ProspectPriorite) => {
    const value = prospect.priorite === next ? null : next
    update.mutate({ id: prospect.id, priorite: value }, {
      onSuccess: () => toast.success(value ? `Priorité : ${PROSPECT_PRIORITIES.find(x => x.id === value)?.label}` : 'Priorité retirée'),
    })
  }

  /* Colle une ou plusieurs images (CMD/Ctrl+V) : compression + ajout en vignette. */
  const handlePasteImages = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = extractImageFilesFromClipboard(e)
    if (files.length === 0) return
    e.preventDefault()   // ne pas coller le contenu binaire dans le champ texte
    try {
      const urls = await Promise.all(files.map(compressImageToDataURL))
      setPastedImages(prev => [...prev, ...urls])
      toast.success(files.length === 1 ? 'Image ajoutée' : `${files.length} images ajoutées`)
    } catch {
      toast.error('Impossible de traiter l’image collée')
    }
  }

  const handleAddNote = () => {
    const text = noteText.trim()
    if (!text && pastedImages.length === 0) return
    const dur = noteType === 'appel' && callDuration ? parseInt(callDuration, 10) : null
    addLog.mutate(
      {
        prospect_id: prospect.id, type: noteType,
        message: text || '🖼️ Image jointe', auteur: 'Said',
        duration_minutes: dur && dur > 0 ? dur : null,
        ...(pastedImages.length ? { media: pastedImages } : {}),
      },
      { onSuccess: () => { setNoteText(''); setCallDuration(''); setPastedImages([]); toast.success('Activité enregistrée') } },
    )
  }

  /* Traduction automatique de la note en français correct (arabe, darija,
     anglais ou français fautif → français impeccable) via l'IA distante. */
  const handleTranslateNote = async () => {
    if (!noteText.trim()) { toast.error('Écrivez d’abord une note à traduire'); return }
    setTranslating(true)
    try {
      const r = await aiApi.translate(noteText)
      if (r?.text) { setNoteText(r.text); toast.success('Note traduite en français') }
    } catch (e: any) {
      toast.error(e?.message ?? 'Traduction indisponible (IA non configurée)')
    } finally {
      setTranslating(false)
    }
  }

  /* Issue d'appel en 1 clic : log immédiat (message = outcome, + durée si saisie).
     Le texte libre éventuel est ajouté après « — ». */
  const quickLogCall = (outcome: string) => {
    const dur = callDuration ? parseInt(callDuration, 10) : null
    const extra = noteText.trim()
    addLog.mutate(
      {
        prospect_id: prospect.id, type: 'appel', auteur: 'Said',
        message: extra ? `${outcome} — ${extra}` : outcome,
        duration_minutes: dur && dur > 0 ? dur : null,
        ...(pastedImages.length ? { media: pastedImages } : {}),
      },
      { onSuccess: () => { setNoteText(''); setCallDuration(''); setPastedImages([]); toast.success(`Appel enregistré : ${outcome}`) } },
    )
  }

  /* Suivi WhatsApp en 1 clic : « Audio envoyé » etc. Le texte libre éventuel
     (et les captures collées) est joint au log. */
  const quickLogWhatsapp = (outcome: string) => {
    const extra = noteText.trim()
    addLog.mutate(
      {
        prospect_id: prospect.id, type: 'whatsapp', auteur: 'Said',
        message: extra ? `${outcome} — ${extra}` : outcome,
        ...(pastedImages.length ? { media: pastedImages } : {}),
      },
      { onSuccess: () => { setNoteText(''); setPastedImages([]); toast.success(`WhatsApp enregistré : ${outcome}`) } },
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

  /* Édition inline du 1er contact (date simple) — sauvegarde au changement. */
  const saveDate = (field: 'date_contact' | 'date_relance', value: string) => {
    const current = (field === 'date_relance' ? prospect.date_relance : prospect.date_contact) ?? ''
    if (value === current) return
    update.mutate({ id: prospect.id, [field]: value || null }, {
      onSuccess: () => toast.success(field === 'date_relance' ? 'Date de relance mise à jour' : 'Date de 1er contact mise à jour'),
    })
  }

  /* Relance : date (obligatoire) + heure (FACULTATIVE).
     - pas de date → relance supprimée
     - date seule  → date_relance = jour, relance_at = null (« à rappeler ce jour »)
     - date+heure  → relance_at = rendez-vous précis
     date_relance garde toujours la partie jour (liste / filtre / surlignage). */
  const saveRelanceParts = (dateStr: string, timeStr: string) => {
    if (!dateStr) {
      update.mutate({ id: prospect.id, relance_at: null, date_relance: null }, {
        onSuccess: () => toast.success('Relance supprimée'),
      })
      return
    }
    update.mutate(
      { id: prospect.id, date_relance: dateStr, relance_at: combineRelance(dateStr, timeStr) },
      { onSuccess: () => toast.success(timeStr ? 'Relance programmée' : 'Date de relance mise à jour') },
    )
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

      {/* ── Alerte doublon de téléphone ── */}
      {phoneTwins.length > 0 && (
        <div className="rounded-xl border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400">
            <Copy className="w-4 h-4 flex-shrink-0" />
            Ce numéro existe déjà sur {phoneTwins.length} autre{phoneTwins.length > 1 ? 's' : ''} fiche{phoneTwins.length > 1 ? 's' : ''}
          </p>
          <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/80">
            Vérifiez avant d’appeler — ce client a peut-être déjà été contacté.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {phoneTwins.map(t => (
              <button
                key={t.id}
                onClick={() => navigate(`${base}/prospects/${t.id}`)}
                title={`Ouvrir la fiche de ${t.nom}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 dark:bg-red-500/15 border border-red-300 dark:border-red-800/60 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-white dark:hover:bg-red-500/25 transition-colors"
              >
                {t.nom}
                <span className="font-normal opacity-70">· {stageLabel(t.statut)}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            ))}
          </div>
        </div>
      )}

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
              {prospect.priorite && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/25 text-white backdrop-blur-sm">
                  {PROSPECT_PRIORITIES.find(x => x.id === prospect.priorite)?.icon} {PROSPECT_PRIORITIES.find(x => x.id === prospect.priorite)?.label}
                </span>
              )}
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
            {prospect.telephone && (
              <a
                href={waLink(prospect.telephone)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Envoyer un WhatsApp à ${prospect.telephone}`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-[#25D366] hover:bg-[#20bd5a] text-white transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
            {canGenerateQuote && (
              <Button size="sm" variant="ghost"
                className="bg-white text-blue-700 hover:bg-white/90 border-0 h-9 font-semibold shadow-sm"
                onClick={() => setAiQuoteOpen(true)}
                title="Analyser le prospect et générer un devis brouillon avec l'IA">
                <Sparkles className="w-3.5 h-3.5" /> Générer un devis IA
              </Button>
            )}
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

      {/* ── Priorité (feeling commercial) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">Priorité :</span>
        {PROSPECT_PRIORITIES.map(pr => {
          const active = prospect.priorite === pr.id
          return (
            <button
              key={pr.id}
              onClick={() => changePriorite(pr.id)}
              disabled={update.isPending}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                active ? 'border-transparent text-white shadow-sm' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              style={active ? { backgroundColor: pr.color } : {}}
            >
              {pr.icon} {pr.label}
            </button>
          )
        })}
      </div>

      {/* ── KPI ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Valeur estimée', value: prospect.valeur_estimee != null ? formatCurrency(prospect.valeur_estimee) : '—', icon: DollarSign, color: '#10b981', bg: '#10b98112' },
          { label: 'Statut',         value: stageLabel(prospect.statut), icon: Target, color: accent, bg: `${accent}12` },
          { label: '1er contact',    value: prospect.date_contact ? formatDate(prospect.date_contact) : '—', icon: Calendar, color: '#6366f1', bg: '#6366f112' },
          { label: 'Relance',        value: prospect.date_relance ? formatDate(prospect.date_relance) : '—', icon: Bell, color: '#f59e0b', bg: '#f59e0b12' },
        ].map(({ label, value, icon: Icon, color, bg }) => {
          const dateField: 'date_contact' | 'date_relance' | null =
            label === 'Relance' ? 'date_relance' : label === '1er contact' ? 'date_contact' : null
          return (
            <div key={label} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                {dateField === 'date_relance' ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={toDateInput(prospect.date_relance)}
                      onChange={e => saveRelanceParts(e.target.value, toTimeInput(prospect.relance_at))}
                      title="Date de relance"
                      className="text-sm font-bold text-foreground bg-transparent outline-none cursor-pointer -ml-0.5 min-w-0"
                      style={{ colorScheme: 'light dark' }}
                    />
                    <input
                      type="time"
                      value={toTimeInput(prospect.relance_at)}
                      onChange={e => saveRelanceParts(toDateInput(prospect.date_relance), e.target.value)}
                      title="Heure (facultative)"
                      disabled={!prospect.date_relance}
                      className="text-xs font-semibold text-muted-foreground bg-transparent outline-none cursor-pointer w-[52px] disabled:opacity-40"
                      style={{ colorScheme: 'light dark' }}
                    />
                  </div>
                ) : dateField === 'date_contact' ? (
                  <input
                    type="date"
                    value={toDateInput(prospect.date_contact)}
                    onChange={e => saveDate('date_contact', e.target.value)}
                    title="Cliquer pour définir la date"
                    className="w-full text-sm font-bold text-foreground bg-transparent outline-none cursor-pointer -ml-0.5"
                    style={{ colorScheme: 'light dark' }}
                  />
                ) : (
                  <p className="text-base font-bold text-foreground leading-tight truncate">{value}</p>
                )}
              </div>
            </div>
          )
        })}
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
                  { t: 'note'     as LogType, label: 'Note'          },
                  { t: 'appel'    as LogType, label: 'Appel'         },
                  { t: 'whatsapp' as LogType, label: 'Audio WhatsApp' },
                  { t: 'email'    as LogType, label: 'Email'         },
                  { t: 'edit'     as LogType, label: 'Autre'         },
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
              {/* Durée d'appel — suivi du temps passé au téléphone */}
              {noteType === 'appel' && (
                <div className="flex items-center gap-2">
                  <div className="relative w-40">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-500 pointer-events-none" />
                    <Input
                      type="number"
                      min={0}
                      value={callDuration}
                      onChange={e => setCallDuration(e.target.value)}
                      placeholder="Durée"
                      className="pl-9 pr-10 h-8 text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">min</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Durée de l'appel (optionnel)</span>
                </div>
              )}
              {/* Issues d'appel — 1 clic pour enregistrer le résultat de l'appel */}
              {noteType === 'appel' && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">Résultat de l'appel (1 clic) :</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {CALL_OUTCOMES.map(o => (
                      <button
                        key={o}
                        onClick={() => quickLogCall(o)}
                        disabled={addLog.isPending}
                        className="px-2.5 py-1 rounded-full text-xs font-medium border border-border text-foreground hover:bg-cyan-500/10 hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all disabled:opacity-50"
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Suivi WhatsApp — 1 clic pour tracer un vocal envoyé/reçu */}
              {noteType === 'whatsapp' && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">Suivi WhatsApp (1 clic) :</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {WA_OUTCOMES.map(o => (
                      <button
                        key={o}
                        onClick={() => quickLogWhatsapp(o)}
                        disabled={addLog.isPending}
                        className="px-2.5 py-1 rounded-full text-xs font-medium border border-border text-foreground hover:bg-green-500/10 hover:border-green-500/40 hover:text-green-600 dark:hover:text-green-400 transition-all disabled:opacity-50"
                      >
                        {o}
                      </button>
                    ))}
                    {prospect.telephone && (
                      <a
                        href={waLink(prospect.telephone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ouvrir la conversation WhatsApp"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-[#25D366] border border-[#25D366]/40 hover:bg-[#25D366]/10 transition-all"
                      >
                        <MessageCircle className="w-3 h-3" /> Ouvrir WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )}
              <AutocorrectTextarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onPaste={handlePasteImages}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                className="input-field resize-none h-20 text-sm"
                placeholder={
                  noteType === 'appel' ? "Ex : Appel de 15 min, intéressé par l'offre premium…"
                  : noteType === 'whatsapp' ? 'Ex : Vocal envoyé — présentation de l’offre et du devis…'
                  : noteType === 'email' ? 'Ex : Email de suivi envoyé avec devis joint…'
                  : 'Ajouter une note… (collez une capture avec ⌘/Ctrl + V)'
                }
              />

              {/* Vignettes des images collées */}
              {pastedImages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pastedImages.map((src, i) => (
                    <div key={i} className="relative group">
                      <img src={src} alt={`Image ${i + 1}`}
                        className="h-16 w-16 object-cover rounded-lg border border-border" />
                      <button
                        type="button"
                        onClick={() => setPastedImages(prev => prev.filter((_, j) => j !== i))}
                        title="Retirer l'image"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground hidden sm:flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Collez une image (⌘/Ctrl + V)
                </p>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleTranslateNote}
                    disabled={!noteText.trim() || translating}
                    title="Traduire la note en français (arabe, darija, anglais…)"
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-300/40 dark:border-fuchsia-800/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                    Traduire
                  </button>
                  <Button size="sm" onClick={handleAddNote} disabled={(!noteText.trim() && pastedImages.length === 0) || addLog.isPending} className="h-7 px-3 text-xs">
                    {addLog.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Enregistrer
                  </Button>
                </div>
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
              {prospect.telephone && (
                <a
                  href={waLink(prospect.telephone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 ml-6 text-xs font-semibold text-[#25D366] hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Envoyer un WhatsApp
                </a>
              )}
              <InfoRow icon={UserPlus}  label="Responsable" value={prospect.responsable} />
              <InfoRow icon={Tag}       label="Source"      value={prospect.source} />
              <InfoRow icon={DollarSign} label="Valeur"     value={prospect.valeur_estimee != null ? formatCurrency(prospect.valeur_estimee) : null} />
              <InfoRow icon={Calendar}  label="1er contact" value={prospect.date_contact ? formatDate(prospect.date_contact) : null} />
              <InfoRow icon={Bell}      label="Relance"     value={formatRelance(prospect.relance_at ?? prospect.date_relance)} />
              <InfoRow icon={Clock}     label="Créé le"     value={formatDate(prospect.created_at)} />
            </div>
          </div>

          {/* ── Devis présentés à ce prospect ── */}
          {canViewQuotes && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Devis
                  {prospectDevis.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {prospectDevis.length}
                    </span>
                  )}
                </p>
                {canGenerateQuote && (
                  <button
                    onClick={() => setAiQuoteOpen(true)}
                    className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Générer
                  </button>
                )}
              </div>

              {prospectDevis.length === 0 ? (
                <p className="text-xs text-muted-foreground/70">
                  Aucun devis présenté à ce prospect pour l’instant.
                </p>
              ) : (
                <div className="space-y-2">
                  {prospectDevis.map(d => {
                    const st = DEVIS_STATUT[d.statut] ?? DEVIS_STATUT.brouillon
                    return (
                      <button
                        key={d.id}
                        onClick={() => navigate(`${base}/devis/${d.id}/preview`)}
                        title="Ouvrir le devis"
                        className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-foreground truncate">{d.numero}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${st.bg} ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-[11px] text-muted-foreground">
                            {d.date_emission ? formatDate(d.date_emission) : formatDate(d.created_at)}
                          </span>
                          <span className="text-sm font-bold text-foreground">
                            {formatCurrency(d.montant_ttc)}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
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

      {/* ── Génération de devis IA ── */}
      {canGenerateQuote && aiQuoteOpen && (
        <AIQuoteGeneratorDialog open={aiQuoteOpen} onClose={() => setAiQuoteOpen(false)} prospect={prospect} />
      )}

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
