import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Loader2, Target, Play, Pause, CheckCircle2, Archive, Trash2, Edit2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { useOutboundCampaigns, useCreateCampaign, useUpdateCampaign, useDeleteCampaign, useOutboundSectors } from '@/hooks/useOutbound'
import type { OutboundCampaign } from '@/lib/outboundApi'
import { isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

const STATUT_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  brouillon: { label: 'Brouillon', color: 'text-slate-500', icon: Edit2 },
  active:    { label: 'Active',    color: 'text-emerald-600', icon: Play },
  pausee:    { label: 'En pause',  color: 'text-amber-600', icon: Pause },
  terminee:  { label: 'Terminée',  color: 'text-blue-600', icon: CheckCircle2 },
  archivee:  { label: 'Archivée',  color: 'text-slate-400', icon: Archive },
}

export default function OutboundCampaigns() {
  const { role } = useAuth()
  const canManage = isOutboundManager(role)

  const { data: campaigns = [], isLoading } = useOutboundCampaigns()
  const del = useDeleteCampaign()
  const update = useUpdateCampaign()

  const [dialog, setDialog] = useState<{ open: boolean; editing: OutboundCampaign | null }>({ open: false, editing: null })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Campagnes Outbound</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {campaigns.length} campagne{campaigns.length > 1 ? 's' : ''}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setDialog({ open: true, editing: null })}>
            <Plus className="w-4 h-4" /> Nouvelle campagne
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card-premium p-16 text-center">
          <Target className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Aucune campagne</p>
          <p className="text-xs text-muted-foreground mt-1">
            Créez une campagne pour cibler un secteur ou un objectif précis
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const meta = STATUT_META[c.statut] ?? STATUT_META.brouillon
            const StatutIcon = meta.icon
            return (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-premium p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-foreground truncate">{c.nom}</h3>
                    {c.objectif && <p className="text-xs text-muted-foreground mt-0.5">{c.objectif}</p>}
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${meta.color}`}>
                    <StatutIcon className="w-3.5 h-3.5" /> {meta.label}
                  </span>
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3">{c.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {c.cible_prospects > 0 && (
                    <div className="p-2 rounded-lg bg-muted/40">
                      <p className="text-muted-foreground">Cible</p>
                      <p className="font-semibold text-foreground">{c.cible_prospects} prospects</p>
                    </div>
                  )}
                  {c.cible_contacts > 0 && (
                    <div className="p-2 rounded-lg bg-muted/40">
                      <p className="text-muted-foreground">Contacts</p>
                      <p className="font-semibold text-foreground">{c.cible_contacts}</p>
                    </div>
                  )}
                </div>
                {(c.date_debut || c.date_fin) && (
                  <p className="text-xs text-muted-foreground">
                    {c.date_debut ? formatDate(c.date_debut) : '?'} → {c.date_fin ? formatDate(c.date_fin) : '?'}
                  </p>
                )}
                {canManage && (
                  <div className="flex items-center gap-1 pt-2 border-t border-border">
                    <Select value={c.statut} onValueChange={(v) => update.mutate({ id: c.id, statut: v as any })}>
                      <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUT_META).map(([k, m]) => (
                          <SelectItem key={k} value={k}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setDialog({ open: true, editing: c })}
                      className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { if (confirm('Supprimer cette campagne ?')) del.mutate(c.id) }}
                      className="w-7 h-7 rounded-md hover:bg-red-500/15 flex items-center justify-center text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      <CampaignDialog
        open={dialog.open}
        editing={dialog.editing}
        onClose={() => setDialog({ open: false, editing: null })}
      />
    </div>
  )
}

function CampaignDialog({
  open, editing, onClose,
}: {
  open: boolean; editing: OutboundCampaign | null; onClose: () => void
}) {
  const create = useCreateCampaign()
  const update = useUpdateCampaign()
  const { data: sectors = [] } = useOutboundSectors()

  const [form, setForm] = useState({
    nom: '', description: '', objectif: '',
    secteur_id: '', cible_prospects: '', cible_contacts: '',
    date_debut: '', date_fin: '', statut: 'active' as OutboundCampaign['statut'],
  })
  const [prev, setPrev] = useState<OutboundCampaign | null>(null)
  if (prev !== editing) {
    setPrev(editing)
    if (editing) {
      setForm({
        nom: editing.nom,
        description: editing.description ?? '',
        objectif: editing.objectif ?? '',
        secteur_id: editing.secteur_id ?? '',
        cible_prospects: String(editing.cible_prospects ?? 0),
        cible_contacts: String(editing.cible_contacts ?? 0),
        date_debut: editing.date_debut ?? '',
        date_fin: editing.date_fin ?? '',
        statut: editing.statut,
      })
    } else {
      setForm({
        nom: '', description: '', objectif: '',
        secteur_id: '', cible_prospects: '', cible_contacts: '',
        date_debut: '', date_fin: '', statut: 'active',
      })
    }
  }

  const handleSubmit = () => {
    if (!form.nom.trim()) return
    const payload = {
      nom: form.nom.trim(),
      description: form.description.trim() || null,
      objectif: form.objectif.trim() || null,
      secteur_id: form.secteur_id || null,
      cible_prospects: parseInt(form.cible_prospects) || 0,
      cible_contacts: parseInt(form.cible_contacts) || 0,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
      statut: form.statut,
    }
    if (editing) {
      update.mutate({ id: editing.id, ...payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Modifier la campagne' : 'Nouvelle campagne'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Nom *</p>
            <AutocorrectInput value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Prospection médecins Oujda Q3" autoFocus />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Objectif</p>
            <AutocorrectInput value={form.objectif} onChange={e => setForm(p => ({ ...p, objectif: e.target.value }))} placeholder="Signer 5 cliniques d'ici la fin du trimestre" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Description</p>
            <AutocorrectTextarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input-field h-20 resize-none text-sm" placeholder="Angle d'approche, arguments..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Secteur</p>
              <Select value={form.secteur_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, secteur_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {sectors.filter(s => !s.parent_id).map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Statut</p>
              <Select value={form.statut} onValueChange={(v: any) => setForm(p => ({ ...p, statut: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUT_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Cible prospects</p>
              <Input type="number" min={0} value={form.cible_prospects} onChange={e => setForm(p => ({ ...p, cible_prospects: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Cible contacts</p>
              <Input type="number" min={0} value={form.cible_contacts} onChange={e => setForm(p => ({ ...p, cible_contacts: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Date début</p>
              <Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Date fin</p>
              <Input type="date" value={form.date_fin} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
            <Button size="sm" onClick={handleSubmit} disabled={busy || !form.nom.trim()}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (editing ? 'Enregistrer' : 'Créer')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
