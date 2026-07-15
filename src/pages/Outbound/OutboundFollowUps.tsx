import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Bell, Loader2, Calendar, CheckCircle2, X, Building2, Trash2, Clock,
  Mail, Phone, MessageCircle, Link as LinkIcon, Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import {
  useOutboundFollowUps, useCreateFollowUp, useUpdateFollowUp, useDeleteFollowUp,
  useOutboundProspects, useOutboundTeam,
} from '@/hooks/useOutbound'
import { isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

const TODAY = new Date().toISOString().slice(0, 10)

const CANAL_ICONS = {
  email: Mail, whatsapp: MessageCircle, telephone: Phone, linkedin: LinkIcon, sms: Send, rdv: Calendar,
} as const

export default function OutboundFollowUps() {
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)

  const [filterStatut, setFilterStatut] = useState('a_faire')
  const [todayOnly, setTodayOnly] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const query = useMemo(() => {
    const q: Record<string, string> = {}
    if (filterStatut !== 'all') q.statut = filterStatut
    if (todayOnly) q.today = '1'
    return q
  }, [filterStatut, todayOnly])

  const { data: followUps = [], isLoading } = useOutboundFollowUps(query)
  const update = useUpdateFollowUp()
  const del = useDeleteFollowUp()

  const grouped = useMemo(() => {
    const g: Record<string, typeof followUps> = { retard: [], today: [], soon: [], later: [] }
    followUps.forEach(f => {
      const date = f.date_prevue.slice(0, 10)
      if (date < TODAY) g.retard.push(f)
      else if (date === TODAY) g.today.push(f)
      else if (date <= addDays(TODAY, 7)) g.soon.push(f)
      else g.later.push(f)
    })
    return g
  }, [followUps])

  const markDone = (id: string) => update.mutate({ id, statut: 'fait' })
  const markCancel = (id: string) => update.mutate({ id, statut: 'annule' })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{canManageAll ? 'Relances' : 'Mes relances'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {followUps.length} relance{followUps.length > 1 ? 's' : ''} · {grouped.retard.length} en retard · {grouped.today.length} aujourd'hui
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" /> Nouvelle relance
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            <SelectItem value="a_faire">À faire</SelectItem>
            <SelectItem value="fait">Faites</SelectItem>
            <SelectItem value="annule">Annulées</SelectItem>
            <SelectItem value="reporte">Reportées</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={() => setTodayOnly(t => !t)}
          className={`flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all border ${
            todayOnly ? 'bg-amber-500/20 border-amber-500/50 text-amber-600' : 'bg-[var(--surface-card)] border-border text-muted-foreground'
          }`}
        >
          <Bell className="w-3.5 h-3.5" /> Aujourd'hui uniquement
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : followUps.length === 0 ? (
        <div className="card-premium p-16 text-center">
          <Bell className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Aucune relance</p>
          <p className="text-xs text-muted-foreground mt-1">Créez votre première relance pour rester organisé</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.retard.length > 0 && (
            <Section title="En retard" color="text-red-600 dark:text-red-400" icon={Clock}>
              {grouped.retard.map(f => (
                <FollowUpCard key={f.id} f={f} onDone={markDone} onCancel={markCancel} onDelete={id => del.mutate(id)} />
              ))}
            </Section>
          )}
          {grouped.today.length > 0 && (
            <Section title="Aujourd'hui" color="text-amber-600 dark:text-amber-400" icon={Bell}>
              {grouped.today.map(f => (
                <FollowUpCard key={f.id} f={f} onDone={markDone} onCancel={markCancel} onDelete={id => del.mutate(id)} />
              ))}
            </Section>
          )}
          {grouped.soon.length > 0 && (
            <Section title="7 prochains jours" color="text-sky-600 dark:text-sky-400" icon={Calendar}>
              {grouped.soon.map(f => (
                <FollowUpCard key={f.id} f={f} onDone={markDone} onCancel={markCancel} onDelete={id => del.mutate(id)} />
              ))}
            </Section>
          )}
          {grouped.later.length > 0 && (
            <Section title="Plus tard" color="text-muted-foreground" icon={Calendar}>
              {grouped.later.map(f => (
                <FollowUpCard key={f.id} f={f} onDone={markDone} onCancel={markCancel} onDelete={id => del.mutate(id)} />
              ))}
            </Section>
          )}
        </div>
      )}

      <NewFollowUpDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}

function Section({
  title, color, icon: Icon, children,
}: {
  title: string; color: string; icon: React.ElementType; children: React.ReactNode
}) {
  return (
    <div>
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        <Icon className="w-4 h-4" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function FollowUpCard({
  f, onDone, onCancel, onDelete,
}: {
  f: any; onDone: (id: string) => void; onCancel: (id: string) => void; onDelete: (id: string) => void
}) {
  const CanalIcon = f.canal && CANAL_ICONS[f.canal as keyof typeof CANAL_ICONS]
  const isToday = f.date_prevue.slice(0, 10) === TODAY
  const isDone = f.statut === 'fait'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card-premium p-3 flex items-center gap-3 ${isDone ? 'opacity-60' : ''}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isDone ? 'bg-emerald-500/20 text-emerald-600' :
        isToday ? 'bg-amber-500/20 text-amber-600' : 'bg-sky-500/20 text-sky-600'
      }`}>
        {CanalIcon ? <CanalIcon className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium text-foreground truncate ${isDone ? 'line-through' : ''}`}>{f.titre}</p>
        {f.entreprise && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Building2 className="w-3 h-3" /> {f.entreprise}
          </p>
        )}
        {f.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{f.description}</p>}
      </div>
      <div className="text-xs text-muted-foreground text-right flex-shrink-0">
        {formatDate(f.date_prevue)}
        <br />
        <span className="text-[10px]">{new Date(f.date_prevue).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {!isDone && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onDone(f.id)}
            className="w-7 h-7 rounded-md hover:bg-emerald-500/15 text-emerald-600 flex items-center justify-center"
            title="Marquer comme fait"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onCancel(f.id)}
            className="w-7 h-7 rounded-md hover:bg-muted text-muted-foreground flex items-center justify-center"
            title="Annuler"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => { if (confirm('Supprimer cette relance ?')) onDelete(f.id) }}
            className="w-7 h-7 rounded-md hover:bg-red-500/15 text-red-500 flex items-center justify-center"
            title="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  )
}

function NewFollowUpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)
  const { data: prospects = [] } = useOutboundProspects({ converted: 'false' })
  const { data: team = [] } = useOutboundTeam()
  const create = useCreateFollowUp()

  const [prospectId, setProspectId] = useState('')
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [canal, setCanal] = useState('')
  const [datePrevue, setDatePrevue] = useState(TODAY + 'T09:00')
  const [assignedTo, setAssignedTo] = useState('')

  const reset = () => {
    setProspectId(''); setTitre(''); setDescription(''); setCanal('')
    setDatePrevue(TODAY + 'T09:00'); setAssignedTo('')
  }

  const handleCreate = () => {
    if (!prospectId || !titre.trim() || !datePrevue) return
    create.mutate({
      prospect_id: prospectId,
      titre: titre.trim(),
      description: description.trim() || null,
      canal: (canal || null) as any,
      date_prevue: new Date(datePrevue).toISOString(),
      ...(canManageAll && assignedTo ? { assigned_to_id: assignedTo } : {}),
    }, {
      onSuccess: () => { reset(); onClose() }
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle relance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Prospect *</p>
            <Select value={prospectId} onValueChange={setProspectId}>
              <SelectTrigger><SelectValue placeholder="Choisir un prospect..." /></SelectTrigger>
              <SelectContent className="max-h-64">
                {prospects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.entreprise}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Titre *</p>
            <AutocorrectInput value={titre} onChange={e => setTitre(e.target.value)} placeholder="Appeler pour proposition..." />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Description</p>
            <AutocorrectTextarea value={description} onChange={e => setDescription(e.target.value)} className="input-field h-16 resize-none text-sm" placeholder="Contexte, questions..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Canal</p>
              <Select value={canal || '__none__'} onValueChange={v => setCanal(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {['email','whatsapp','telephone','linkedin','sms','rdv'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Date *</p>
              <Input type="datetime-local" value={datePrevue} onChange={e => setDatePrevue(e.target.value)} />
            </div>
          </div>
          {canManageAll && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Assigner à</p>
              <Select value={assignedTo || '__none__'} onValueChange={v => setAssignedTo(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Moi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Moi</SelectItem>
                  {team.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name ?? m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
            <Button size="sm" onClick={handleCreate} disabled={create.isPending || !prospectId || !titre.trim()}>
              {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Créer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
