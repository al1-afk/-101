import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Edit2, Trash2, Phone, Mail, MapPin,
  Building2, CheckSquare, Clock, FileText, Receipt,
  CreditCard, FileCheck, DollarSign, Package, Upload,
  ChevronDown, ChevronRight, Calendar,
  Loader2, AlertCircle, Circle, CheckCircle2, AlertTriangle,
  TrendingUp, Star, FolderKanban, Globe, Server, PhoneCall,
} from 'lucide-react'
import { parseClientNotes, serializeClientNotes, daysUntil, type ClientMeta } from '@/lib/clientNotes'
import BlockEditor from '@/components/BlockEditor'
import type { SopBlock } from '@/hooks/useSops'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useClients, useUpdateClient, useDeleteClient, type Client } from '@/hooks/useClients'
import { useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '@/lib/api'
import { useFactures }  from '@/hooks/useFactures'
import { useDevis }     from '@/hooks/useDevis'
import { useProjets }   from '@/hooks/useProjets'
import { formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { toast } from 'sonner'

/* ─── Section wrapper ─────────────────────────────────────────────── */
function Section({
  title, icon: Icon, count, action, children, color = '#6366f1',
}: {
  title:    string
  icon:     React.ElementType
  count?:   number
  action?:  { label: string; onClick: () => void }
  children: React.ReactNode
  color?:   string
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
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          }
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
            <div className="border-t border-border px-5 py-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EmptyState({ label, icon: Icon }: { label: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center py-6 gap-2 text-center">
      {Icon && <Icon className="w-8 h-8 text-muted-foreground/30" />}
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

const DEVIS_STATUT: Record<string, { label: string; bg: string; color: string }> = {
  brouillon: { label: 'Brouillon', bg: 'bg-muted',                        color: 'text-muted-foreground'                  },
  envoye:    { label: 'Envoyé',    bg: 'bg-blue-500/10',                   color: 'text-blue-600 dark:text-blue-400'       },
  accepte:   { label: 'Accepté',   bg: 'bg-emerald-500/10',                color: 'text-emerald-600 dark:text-emerald-400' },
  refuse:    { label: 'Refusé',    bg: 'bg-red-500/10',                    color: 'text-red-600 dark:text-red-400'         },
  expire:    { label: 'Expiré',    bg: 'bg-amber-500/10',                  color: 'text-amber-600 dark:text-amber-400'     },
}

const FACTURE_STATUT: Record<string, { label: string; bg: string; color: string }> = {
  brouillon: { label: 'Brouillon', bg: 'bg-muted',            color: 'text-muted-foreground'                  },
  envoyee:   { label: 'Envoyée',   bg: 'bg-blue-500/10',      color: 'text-blue-600 dark:text-blue-400'       },
  impayee:   { label: 'Impayée',   bg: 'bg-red-500/10',       color: 'text-red-600 dark:text-red-400'         },
  partielle: { label: 'Partielle', bg: 'bg-amber-500/10',     color: 'text-amber-600 dark:text-amber-400'     },
  payee:     { label: 'Payée',     bg: 'bg-emerald-500/10',   color: 'text-emerald-600 dark:text-emerald-400' },
  annulee:   { label: 'Annulée',   bg: 'bg-muted',            color: 'text-muted-foreground'                  },
  refusee:   { label: 'Refusée',   bg: 'bg-red-500/10',       color: 'text-red-600 dark:text-red-400'         },
}

interface ClientNote {
  id:         string
  created_at: string
  tag:        string
  text:       string
}

function ClientEditForm({ client, onClose }: { client: Client; onClose: () => void }) {
  const update = useUpdateClient()
  const initial = parseClientNotes(client.notes)
  const [form, setForm] = useState({
    nom:        client.nom,
    email:      client.email ?? '',
    telephone:  client.telephone ?? '',
    entreprise: client.entreprise ?? '',
    adresse:    client.adresse ?? '',
    ville:      client.ville ?? '',
    pays:       client.pays ?? 'Maroc',
    notes:      initial.text,
  })
  const s = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    /* Preserve existing meta (domain / hosting) when saving free-text notes */
    const merged = { ...form, notes: serializeClientNotes(initial.meta, form.notes) }
    update.mutate({ id: client.id, ...merged }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <label className="form-label">Nom complet *</label>
          <AutocorrectInput value={form.nom} onChange={s('nom')} required />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Email</label>
          <Input type="email" value={form.email} onChange={s('email')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Téléphone</label>
          <Input value={form.telephone} onChange={s('telephone')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Entreprise</label>
          <AutocorrectInput value={form.entreprise} onChange={s('entreprise')} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Ville</label>
          <AutocorrectInput value={form.ville} onChange={s('ville')} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <label className="form-label">Adresse</label>
          <AutocorrectInput value={form.adresse} onChange={s('adresse')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="form-label">Notes internes</label>
        <AutocorrectTextarea value={form.notes} onChange={s('notes')} className="input-field resize-none h-20" />
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

/* ─── Main page ───────────────────────────────────────────────────── */
export default function ClientDetail() {
  const { id, tenantSlug } = useParams<{ id: string; tenantSlug: string }>()
  const navigate = useNavigate()
  const base = tenantSlug ? `/${tenantSlug}` : ''
  const { data: clients = [] }      = useClients()
  const { data: allFactures = [] }  = useFactures()
  const { data: allDevis = [] }     = useDevis()
  const { data: allProjets = [] }   = useProjets()
  const deleteClient = useDeleteClient()

  const client   = clients.find(c => c.id === id)
  const factures = useMemo(() => allFactures.filter(f => f.client_id === id), [allFactures, id])
  const devis    = useMemo(() => allDevis.filter(d => d.client_id === id),    [allDevis, id])
  const projets  = useMemo(() => allProjets.filter(p => p.client_id === id),  [allProjets, id])

  /* Parse client.notes into structured meta (domain/hosting) + free text + blocks */
  const clientNotes = useMemo(() => parseClientNotes(client?.notes), [client?.notes])

  /* ── Notion-style documentation blocks (auto-saved on change) ── */
  const [blocks,    setBlocks]    = useState<SopBlock[]>(clientNotes.blocks)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const lastSerialized = useRef<string>(client?.notes ?? '')
  const qc = useQueryClient()

  /* Reset blocks when switching to a different client */
  useEffect(() => {
    setBlocks(clientNotes.blocks)
    lastSerialized.current = client?.notes ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id])

  /* Auto-save with 600ms debounce, silent (no toast) */
  useEffect(() => {
    if (!client) return
    const next = serializeClientNotes(clientNotes.meta, clientNotes.text, blocks)
    if (next === lastSerialized.current) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        await clientsApi.update(client.id, { notes: next })
        lastSerialized.current = next
        qc.invalidateQueries({ queryKey: ['clients'] })
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

  /* « Marquer comme contacté » — sort le client de l'alerte quotidienne
     « clients à contacter » et alimente le rapport hebdomadaire
     (colonne clients.date_dernier_contact, migration 086). */
  const [markingContact, setMarkingContact] = useState(false)
  const markContacted = async () => {
    if (!client) return
    setMarkingContact(true)
    try {
      await clientsApi.update(client.id, { date_dernier_contact: new Date().toISOString() })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Contact enregistré')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Enregistrement impossible')
    } finally {
      setMarkingContact(false)
    }
  }

  const [tasks,      setTasks]      = useState<{ id: string; titre: string; done: boolean }[]>([])
  const [notes,      setNotes]      = useState<ClientNote[]>([
    clientNotes.text
      ? { id: '0', created_at: new Date().toISOString(), tag: 'Info', text: clientNotes.text }
      : null,
  ].filter(Boolean) as ClientNote[])
  const [newNote,    setNewNote]    = useState('')
  const [noteTag,    setNoteTag]    = useState('Info')
  const [newTask,    setNewTask]    = useState('')
  const [editOpen,   setEditOpen]   = useState(false)
  const [hostingOpen,setHostingOpen]= useState(false)
  const [delConfirm, setDelConfirm] = useState(false)

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground">Client introuvable.</p>
        <Button size="sm" variant="secondary" onClick={() => navigate(`${base}/clients`)}>
          <ArrowLeft className="w-4 h-4" /> Retour aux clients
        </Button>
      </div>
    )
  }

  const initials = getInitials(client.nom)
  const totalCA  = factures.filter(f => f.statut === 'payee').reduce((s, f) => s + f.montant_ttc, 0)
  const enAttente = factures
    .filter(f => ['envoyee', 'impayee', 'partielle'].includes(f.statut))
    .reduce((s, f) => s + f.montant_ttc - f.montant_paye, 0)

  const addNote = () => {
    if (!newNote.trim()) return
    setNotes(p => [{ id: Date.now().toString(), created_at: new Date().toISOString(), tag: noteTag, text: newNote.trim() }, ...p])
    setNewNote('')
    toast.success('Note ajoutée')
  }

  const addTask = () => {
    if (!newTask.trim()) return
    setTasks(p => [{ id: Date.now().toString(), titre: newTask.trim(), done: false }, ...p])
    setNewTask('')
  }

  const handleDelete = () => {
    deleteClient.mutate(client.id, {
      onSuccess: () => { navigate(`${base}/clients`); toast.success('Client supprimé') },
    })
  }

  // Avatar color based on name
  const avatarColors = [
    ['#6366f1','#818cf8'], ['#8b5cf6','#a78bfa'], ['#ec4899','#f472b6'],
    ['#3b82f6','#60a5fa'], ['#10b981','#34d399'], ['#f59e0b','#fbbf24'],
  ]
  const colorIdx = client.nom.charCodeAt(0) % avatarColors.length
  const [clr1, clr2] = avatarColors[colorIdx]

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(`${base}/clients`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Clients
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground">{client.nom}</span>
      </div>

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden rounded-2xl" style={{
        background: `linear-gradient(135deg, ${clr1} 0%, ${clr2} 100%)`,
      }}>
        {/* decorative blobs */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-20" style={{ background: 'white' }} />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-10" style={{ background: 'white' }} />

        <div className="relative p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-lg flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.3)' }}>
            {initials}
          </div>

          {/* Name + contacts */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-black text-white leading-tight">{client.nom}</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-sm">Client</span>
            </div>
            {client.entreprise && (
              <p className="text-white/80 text-sm flex items-center gap-1.5 mb-3">
                <Building2 className="w-3.5 h-3.5" />{client.entreprise}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {client.telephone && (
                <a href={`tel:${client.telephone}`}
                  className="flex items-center gap-1.5 text-xs text-white/90 bg-white/15 hover:bg-white/25 backdrop-blur-sm px-3 py-1.5 rounded-full transition-all">
                  <Phone className="w-3 h-3" />{client.telephone}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`}
                  className="flex items-center gap-1.5 text-xs text-white/90 bg-white/15 hover:bg-white/25 backdrop-blur-sm px-3 py-1.5 rounded-full transition-all">
                  <Mail className="w-3 h-3" />{client.email}
                </a>
              )}
              {client.ville && (
                <span className="flex items-center gap-1.5 text-xs text-white/80 bg-white/10 px-3 py-1.5 rounded-full">
                  <MapPin className="w-3 h-3" />{[client.ville, client.pays].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-white/30 border backdrop-blur-sm h-9"
              variant="ghost"
              onClick={markContacted}
              disabled={markingContact}
              title={client.date_dernier_contact
                ? `Dernier contact : ${formatDate(client.date_dernier_contact)}`
                : 'Aucun contact enregistré — ce client apparaît dans l\'alerte quotidienne'}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              {client.date_dernier_contact
                ? `Contacté le ${formatDate(client.date_dernier_contact)}`
                : 'Marquer comme contacté'}
            </Button>
            <Button
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-white/30 border backdrop-blur-sm h-9"
              variant="ghost"
              onClick={() => setEditOpen(true)}
            >
              <Edit2 className="w-3.5 h-3.5" /> Modifier
            </Button>
            <Button
              size="sm"
              className="bg-red-500/30 hover:bg-red-500/50 text-white border-0 h-9"
              variant="ghost"
              onClick={() => setDelConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'CA Encaissé',  value: formatCurrency(totalCA),    icon: TrendingUp,  color: '#10b981', bg: '#10b98112' },
          { label: 'En attente',   value: formatCurrency(enAttente),  icon: Clock,       color: '#f59e0b', bg: '#f59e0b12' },
          { label: 'Projets',      value: String(projets.length),     icon: FolderKanban,color: '#6366f1', bg: '#6366f112' },
          { label: 'Factures',     value: String(factures.length),    icon: Receipt,     color: '#3b82f6', bg: '#3b82f612' },
          { label: 'Devis',        value: String(devis.length),       icon: FileCheck,   color: '#8b5cf6', bg: '#8b5cf612' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-base font-bold text-foreground leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">

        {/* LEFT */}
        <div className="space-y-3">

          {/* Tâches */}
          <Section title="Tâches" icon={CheckSquare} count={tasks.length} color="#6366f1"
            action={{ label: 'Ajouter', onClick: () => {} }}
          >
            <div className="flex gap-2 mb-4">
              <AutocorrectInput
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="Nouvelle tâche..."
                className="h-9 text-sm"
              />
              <Button size="sm" className="h-9 px-3" onClick={addTask} disabled={!newTask.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {tasks.length === 0
              ? <EmptyState label="Aucune tâche pour ce client" icon={CheckSquare} />
              : tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <button onClick={() => setTasks(p => p.map(x => x.id === t.id ? { ...x, done: !x.done } : x))}>
                      {t.done
                        ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                        : <Circle className="w-4.5 h-4.5 text-muted-foreground" />
                      }
                    </button>
                    <span className={`text-sm flex-1 ${t.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {t.titre}
                    </span>
                    <button onClick={() => setTasks(p => p.filter(x => x.id !== t.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400 transition-colors" />
                    </button>
                  </div>
                ))
            }
          </Section>

          {/* Historique / Notes */}
          <Section title="Historique & Notes" icon={FileText} count={notes.length} color="#8b5cf6"
            action={{ label: 'Ajouter une note', onClick: () => {} }}
          >
            <div className="flex gap-2 mb-4">
              <select
                value={noteTag}
                onChange={e => setNoteTag(e.target.value)}
                className="h-9 text-sm rounded-lg border border-border bg-background px-2 text-foreground w-24 flex-shrink-0"
              >
                {['Info', 'CRM', 'Appel', 'Email', 'RDV', 'Important'].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <AutocorrectInput
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder="Ajouter une note..."
                className="h-9 text-sm flex-1"
              />
              <Button size="sm" className="h-9 px-3 bg-violet-500/15 text-violet-600 dark:text-violet-400 hover:bg-violet-500/25 border-0"
                onClick={addNote} disabled={!newNote.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {notes.length === 0
              ? <EmptyState label="Aucun historique enregistré" icon={FileText} />
              : notes.map(n => (
                  <div key={n.id} className="flex items-start gap-3 py-3 border-b border-border last:border-0">
                    <div className="w-2 h-2 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleDateString('fr-FR')} {new Date(n.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 uppercase tracking-wide">
                          {n.tag}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{n.text}</p>
                    </div>
                    <button onClick={() => setNotes(p => p.filter(x => x.id !== n.id))}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400 transition-colors" />
                    </button>
                  </div>
                ))
            }
          </Section>

          {/* Projets */}
          <Section title="Projets" icon={FolderKanban} count={projets.length} color="#6366f1"
            action={{ label: 'Nouveau projet', onClick: () => navigate(`${base}/projets`) }}
          >
            {projets.length === 0
              ? <EmptyState label="Aucun projet pour ce client" icon={FolderKanban} />
              : projets.map(p => {
                  const statutColors: Record<string, { bg: string; color: string; label: string }> = {
                    planifie: { bg: 'bg-blue-500/10',    color: 'text-blue-600 dark:text-blue-400',       label: 'Planifié' },
                    en_cours: { bg: 'bg-amber-500/10',   color: 'text-amber-600 dark:text-amber-400',     label: 'En cours' },
                    en_pause: { bg: 'bg-muted',          color: 'text-muted-foreground',                  label: 'En pause' },
                    termine:  { bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400', label: 'Terminé'  },
                    annule:   { bg: 'bg-red-500/10',     color: 'text-red-600 dark:text-red-400',         label: 'Annulé'   },
                  }
                  const s = statutColors[p.statut] ?? statutColors.planifie
                  return (
                    <div key={p.id} className="py-3 border-b border-border last:border-0 hover:bg-muted/20 -mx-2 px-2 rounded-lg transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{p.nom}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.date_debut && formatDate(p.date_debut)}
                            {p.date_debut && p.date_fin_prevue && ' → '}
                            {p.date_fin_prevue && formatDate(p.date_fin_prevue)}
                            {p.responsable && ` · ${p.responsable}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.color}`}>{s.label}</span>
                          {(p.budget ?? 0) > 0 && (
                            <span className="text-sm font-bold text-foreground hidden sm:inline">{formatCurrency(p.budget ?? 0)}</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${p.progression}%`,
                              background: p.progression === 100
                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                : 'linear-gradient(90deg, #6366f1, #818cf8)',
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-muted-foreground w-9 text-right">{p.progression}%</span>
                      </div>
                    </div>
                  )
                })
            }
          </Section>

          {/* Devis */}
          <Section title="Devis" icon={FileCheck} count={devis.length} color="#8b5cf6"
            action={{ label: 'Nouveau devis', onClick: () => navigate(`${base}/devis`) }}
          >
            {devis.length === 0
              ? <EmptyState label="Aucun devis pour ce client" icon={FileCheck} />
              : devis.map(d => {
                  const s = DEVIS_STATUT[d.statut]
                  return (
                    <div key={d.id} className="flex items-center justify-between py-3 border-b border-border last:border-0 hover:bg-muted/20 -mx-2 px-2 rounded-lg transition-colors cursor-pointer">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{d.numero}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(d.date_emission)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s?.bg} ${s?.color}`}>{s?.label}</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(d.montant_ttc)}</span>
                      </div>
                    </div>
                  )
                })
            }
          </Section>

          {/* Factures */}
          <Section title="Factures" icon={Receipt} count={factures.length} color="#3b82f6"
            action={{ label: 'Nouvelle facture', onClick: () => navigate(`${base}/factures`) }}
          >
            {factures.length === 0
              ? <EmptyState label="Aucune facture pour ce client" icon={Receipt} />
              : factures.map(f => {
                  const s = FACTURE_STATUT[f.statut]
                  return (
                    <div key={f.id} className="flex items-center justify-between py-3 border-b border-border last:border-0 hover:bg-muted/20 -mx-2 px-2 rounded-lg transition-colors cursor-pointer">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{f.numero}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(f.date_emission)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s?.bg} ${s?.color}`}>{s?.label}</span>
                        <span className="text-sm font-bold text-foreground">{formatCurrency(f.montant_ttc)}</span>
                      </div>
                    </div>
                  )
                })
            }
          </Section>

          {/* Paiements */}
          <Section title="Paiements" icon={DollarSign} count={0} color="#10b981"
            action={{ label: 'Nouveau paiement', onClick: () => navigate(`${base}/paiements`) }}
          >
            <EmptyState label="Aucun paiement enregistré" icon={DollarSign} />
          </Section>

          {/* Chèques */}
          <Section title="Chèques" icon={CreditCard} count={0} color="#6366f1"
            action={{ label: 'Nouveau chèque', onClick: () => navigate(`${base}/cheques-recus`) }}
          >
            <EmptyState label="Aucun chèque enregistré" icon={CreditCard} />
          </Section>

          {/* Documents */}
          <Section title="Documents" icon={Upload} count={0} color="#64748b"
            action={{ label: 'Uploader', onClick: () => {} }}
          >
            <div className="flex flex-col items-center py-6 gap-3 border-2 border-dashed border-border rounded-xl">
              <Upload className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Glisser-déposer ou cliquer pour uploader</p>
            </div>
          </Section>

          {/* Documentation — Notion-style block editor */}
          <Section title="Documentation" icon={FileText} count={blocks.length} color="#0ea5e9">
            <div className="space-y-3 pl-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Notes libres, spécifications, instructions — utilisez <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">/</kbd> pour insérer un bloc.
                </p>
                <span className={`text-[11px] font-medium ${
                  saveState === 'saving' ? 'text-amber-500' :
                  saveState === 'saved'  ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                }`}>
                  {saveState === 'saving' && '💾 Enregistrement…'}
                  {saveState === 'saved'  && '✓ Enregistré'}
                </span>
              </div>
              <BlockEditor value={blocks} onChange={setBlocks} placeholder="Cliquer pour commencer à écrire — tapez « / » pour insérer un bloc" />
            </div>
          </Section>
        </div>

        {/* RIGHT sidebar */}
        <div className="space-y-3 lg:sticky lg:top-4">

          {/* Contact info */}
          <div className="card p-5 space-y-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Informations</p>
            <div className="space-y-3">
              {client.telephone && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <a href={`tel:${client.telephone}`} className="text-sm text-foreground hover:text-emerald-500 transition-colors">
                    {client.telephone}
                  </a>
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <a href={`mailto:${client.email}`} className="text-sm text-foreground hover:text-blue-500 transition-colors truncate">
                    {client.email}
                  </a>
                </div>
              )}
              {(client.adresse || client.ville) && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <span className="text-sm text-muted-foreground leading-snug">
                    {[client.adresse, client.ville, client.pays].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                <span className="text-sm text-muted-foreground">Depuis {formatDate(client.created_at)}</span>
              </div>
            </div>

            {notes.length > 0 && (
              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Notes</p>
                {notes.slice(0, 2).map(n => (
                  <div key={n.id} className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5 leading-relaxed">
                    <span className="font-bold text-violet-600 dark:text-violet-400">[{n.tag}]</span> {n.text}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" className="flex-1 h-8 text-xs" onClick={() => setEditOpen(true)}>
                <Edit2 className="w-3 h-3" /> Modifier
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-red-400 hover:bg-red-500/10 px-3"
                onClick={() => setDelConfirm(true)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Domaine & Hébergement */}
          <DomainHostingCard
            meta={clientNotes.meta}
            onEdit={() => setHostingOpen(true)}
          />

          {/* Stats */}
          <div className="card p-5 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Statistiques</p>
            {[
              { label: 'Devis créés',  value: devis.length,              color: 'text-violet-600 dark:text-violet-400' },
              { label: 'Factures',     value: factures.length,           color: 'text-blue-600 dark:text-blue-400'     },
              { label: 'CA payé',      value: formatCurrency(totalCA),   color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'En attente',   value: formatCurrency(enAttente), color: 'text-amber-600 dark:text-amber-400'   },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between py-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className={`text-sm font-bold ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* Client score */}
          <div className="card p-5"
            style={{ background: `linear-gradient(135deg, ${clr1}15, ${clr2}10)`, borderColor: `${clr1}25` }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Score client</p>
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-black" style={{ color: clr1 }}>
                {Math.min(100, Math.round((totalCA / 10000) * 10 + factures.length * 5 + devis.length * 3))}
              </span>
              <span className="text-sm text-muted-foreground mb-1">/ 100</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.min(100, Math.round((totalCA / 10000) * 10 + factures.length * 5 + devis.length * 3))}%`,
                background: `linear-gradient(90deg, ${clr1}, ${clr2})`,
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier {client.nom}</DialogTitle>
          </DialogHeader>
          <ClientEditForm client={client} onClose={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Domain & hosting dialog */}
      <Dialog open={hostingOpen} onOpenChange={setHostingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" /> Domaine & Hébergement
            </DialogTitle>
          </DialogHeader>
          <DomainHostingForm
            client={client}
            initialMeta={clientNotes.meta}
            initialText={clientNotes.text}
            onClose={() => setHostingOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={delConfirm} onOpenChange={setDelConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" /> Supprimer ce client ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Cette action est irréversible. Toutes les données liées à <strong className="text-foreground">{client.nom}</strong> seront perdues.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setDelConfirm(false)}>Annuler</Button>
            <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-0"
              onClick={handleDelete} disabled={deleteClient.isPending}>
              {deleteClient.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Supprimer définitivement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Domain & Hosting card (right sidebar) ────────────────────────── */
function DomainHostingCard({ meta, onEdit }: { meta: ClientMeta; onEdit: () => void }) {
  const empty = !meta.domainName && !meta.domainExpiry && !meta.hostingName && !meta.hostingExpiry

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Domaine & Hébergement</p>
        <button
          onClick={onEdit}
          className="p-1 rounded text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
          title="Modifier"
        >
          <Edit2 className="w-3 h-3" />
        </button>
      </div>

      {empty ? (
        <button
          onClick={onEdit}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border-2 border-dashed border-border hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-all"
        >
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Ajouter domaine / hébergement</span>
        </button>
      ) : (
        <div className="space-y-2.5">
          <ExpiryRow
            icon={Globe}
            iconColor="text-blue-600 dark:text-blue-400"
            iconBg="bg-blue-500/10"
            label="Domaine"
            name={meta.domainName}
            expiry={meta.domainExpiry}
          />
          <ExpiryRow
            icon={Server}
            iconColor="text-violet-600 dark:text-violet-400"
            iconBg="bg-violet-500/10"
            label="Hébergement"
            name={meta.hostingName}
            expiry={meta.hostingExpiry}
          />
        </div>
      )}
    </div>
  )
}

function ExpiryRow({
  icon: Icon, iconColor, iconBg, label, name, expiry,
}: {
  icon:      React.ElementType
  iconColor: string
  iconBg:    string
  label:     string
  name?:     string
  expiry?:   string
}) {
  if (!name && !expiry) return null
  const days = daysUntil(expiry)
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2.5">
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBg}`}>
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
          <p className="text-sm font-semibold text-foreground truncate" title={name}>{name || '—'}</p>
          {expiry && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[11px] text-muted-foreground">Expire le {formatDate(expiry)}</span>
              {days !== null && <ExpiryBadge days={days} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ExpiryBadge({ days }: { days: number }) {
  let cls = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  let txt = `Reste ${days} j`
  if (days < 0) {
    cls = 'bg-red-500/15 text-red-600 dark:text-red-400'
    txt = `Expiré (-${Math.abs(days)} j)`
  } else if (days === 0) {
    cls = 'bg-red-500/15 text-red-600 dark:text-red-400'
    txt = `Expire aujourd'hui`
  } else if (days <= 7) {
    cls = 'bg-red-500/10 text-red-600 dark:text-red-400'
  } else if (days <= 30) {
    cls = 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  }
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${cls}`}>{txt}</span>
}

/* ─── Form dialog for domain & hosting ─────────────────────────────── */
function DomainHostingForm({
  client, initialMeta, initialText, onClose,
}: {
  client:       Client
  initialMeta:  ClientMeta
  initialText:  string
  onClose:      () => void
}) {
  const update = useUpdateClient()
  const [domainName,    setDomainName]    = useState(initialMeta.domainName ?? '')
  const [domainExpiry,  setDomainExpiry]  = useState(initialMeta.domainExpiry ?? '')
  const [hostingName,   setHostingName]   = useState(initialMeta.hostingName ?? '')
  const [hostingExpiry, setHostingExpiry] = useState(initialMeta.hostingExpiry ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const meta: ClientMeta = {
      domainName:    domainName.trim()    || undefined,
      domainExpiry:  domainExpiry         || undefined,
      hostingName:   hostingName.trim()   || undefined,
      hostingExpiry: hostingExpiry        || undefined,
    }
    update.mutate(
      { id: client.id, notes: serializeClientNotes(meta, initialText) },
      { onSuccess: onClose }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Ces informations apparaîtront dans la fiche client avec un compteur de jours restants.
      </p>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-blue-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-foreground">Nom de domaine</p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <Input
            className="col-span-3"
            placeholder="ex. exemple.com"
            value={domainName}
            onChange={e => setDomainName(e.target.value)}
          />
          <Input
            className="col-span-2"
            type="date"
            value={domainExpiry}
            onChange={e => setDomainExpiry(e.target.value)}
            title="Date d'expiration"
          />
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-violet-500" />
          <p className="text-xs font-bold uppercase tracking-wider text-foreground">Hébergement</p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <Input
            className="col-span-3"
            placeholder="ex. OVH, Dokploy, Hostinger…"
            value={hostingName}
            onChange={e => setHostingName(e.target.value)}
          />
          <Input
            className="col-span-2"
            type="date"
            value={hostingExpiry}
            onChange={e => setHostingExpiry(e.target.value)}
            title="Date d'expiration"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
