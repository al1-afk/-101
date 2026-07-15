import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Loader2, Users2, Target, TrendingUp, Award, Settings2, Save, Check, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOutboundTeam, useUpdateTeamSettings, useOutboundSectors } from '@/hooks/useOutbound'
import type { OutboundTeamMember } from '@/lib/outboundApi'
import { isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

export default function OutboundTeam() {
  const { role } = useAuth()
  const canAccess = isOutboundManager(role)
  /* Tous les hooks DOIVENT être appelés inconditionnellement (Rules of Hooks). */
  const { data: members = [], isLoading } = useOutboundTeam()
  const [editing, setEditing] = useState<OutboundTeamMember | null>(null)

  if (!canAccess) {
    return (
      <div className="card-premium p-16 text-center">
        <Users2 className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">Accès réservé aux managers</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Équipe Outbound</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {members.length} membre{members.length > 1 ? 's' : ''} · Spécialisations, objectifs, autorisations
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m, i) => {
          const objProspects = m.objectif_prospects_mois ?? 0
          const progression = objProspects > 0 ? Math.min(100, (m.total_prospects / objProspects * 100)) : 0
          const rate = m.total_prospects > 0 ? (m.conversions / m.total_prospects * 100).toFixed(1) : '0'
          return (
            <motion.div
              key={m.user_id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card-premium p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center text-white text-base font-bold">
                  {(m.name ?? m.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{m.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 font-semibold uppercase">{m.role}</span>
                  </div>
                </div>
                <button
                  onClick={() => setEditing(m)}
                  className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                  title="Configurer"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-muted/40">
                  <p className="text-lg font-bold text-foreground">{m.total_prospects}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Prospects</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/40">
                  <p className="text-lg font-bold text-amber-600">{m.a_contacter}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">À contacter</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/40">
                  <p className="text-lg font-bold text-emerald-600">{m.conversions}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Convertis</p>
                </div>
              </div>

              {objProspects > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" /> Objectif</span>
                    <span className="font-semibold text-foreground">{m.total_prospects} / {objProspects}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all" style={{ width: `${progression}%` }} />
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Conversion</span>
                <span className="font-semibold text-emerald-600">{rate}%</span>
              </div>
            </motion.div>
          )
        })}
      </div>

      <TeamSettingsDialog
        open={!!editing}
        member={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function TeamSettingsDialog({
  open, member, onClose,
}: {
  open: boolean; member: OutboundTeamMember | null; onClose: () => void
}) {
  const { data: sectors = [] } = useOutboundSectors()
  const update = useUpdateTeamSettings()

  const [form, setForm] = useState({
    actif: true,
    objectif_prospects_mois: '',
    objectif_contacts_mois: '',
    objectif_rdv_mois: '',
    objectif_conversions_mois: '',
    limite_prospects_jour: '',
    secteurs_autorises: [] as string[],
    villes_autorisees: [] as string[],
    notes: '',
  })
  const [villesInput, setVillesInput] = useState('')
  const [prev, setPrev] = useState<OutboundTeamMember | null>(null)

  if (prev !== member) {
    setPrev(member)
    if (member) {
      setForm({
        actif: member.outbound_actif ?? true,
        objectif_prospects_mois: String(member.objectif_prospects_mois ?? 0),
        objectif_contacts_mois: String(member.objectif_contacts_mois ?? 0),
        objectif_rdv_mois: String(member.objectif_rdv_mois ?? 0),
        objectif_conversions_mois: String(member.objectif_conversions_mois ?? 0),
        limite_prospects_jour: '',
        secteurs_autorises: member.secteurs_autorises ?? [],
        villes_autorisees: member.villes_autorisees ?? [],
        notes: '',
      })
      setVillesInput((member.villes_autorisees ?? []).join(', '))
    }
  }

  const submit = () => {
    if (!member) return
    const villes = villesInput.split(',').map(v => v.trim()).filter(Boolean)
    update.mutate({
      userId: member.user_id,
      actif: form.actif,
      objectif_prospects_mois: parseInt(form.objectif_prospects_mois) || 0,
      objectif_contacts_mois: parseInt(form.objectif_contacts_mois) || 0,
      objectif_rdv_mois: parseInt(form.objectif_rdv_mois) || 0,
      objectif_conversions_mois: parseInt(form.objectif_conversions_mois) || 0,
      limite_prospects_jour: parseInt(form.limite_prospects_jour) || 0,
      secteurs_autorises: form.secteurs_autorises,
      villes_autorisees: villes,
    }, { onSuccess: onClose })
  }

  const toggleSector = (id: string) => {
    setForm(p => ({
      ...p,
      secteurs_autorises: p.secteurs_autorises.includes(id)
        ? p.secteurs_autorises.filter(x => x !== id)
        : [...p.secteurs_autorises, id]
    }))
  }

  if (!member) return null

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member.name ?? member.email} — Paramètres Outbound</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.actif} onChange={e => setForm(p => ({ ...p, actif: e.target.checked }))} className="w-4 h-4" />
            Employé actif sur le module Outbound
          </label>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Objectifs mensuels</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Prospects/mois</p>
                <Input type="number" min={0} value={form.objectif_prospects_mois} onChange={e => setForm(p => ({ ...p, objectif_prospects_mois: e.target.value }))} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Contacts/mois</p>
                <Input type="number" min={0} value={form.objectif_contacts_mois} onChange={e => setForm(p => ({ ...p, objectif_contacts_mois: e.target.value }))} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">RDV/mois</p>
                <Input type="number" min={0} value={form.objectif_rdv_mois} onChange={e => setForm(p => ({ ...p, objectif_rdv_mois: e.target.value }))} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Conversions/mois</p>
                <Input type="number" min={0} value={form.objectif_conversions_mois} onChange={e => setForm(p => ({ ...p, objectif_conversions_mois: e.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Autorisations</p>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Secteurs autorisés (aucun sélectionné = tous)</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {sectors.filter(s => !s.parent_id).map(s => {
                const active = form.secteurs_autorises.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSector(s.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      active ? 'text-white border-transparent' : 'border-border text-muted-foreground'
                    }`}
                    style={active ? { backgroundColor: s.couleur } : {}}
                  >
                    {s.nom}
                  </button>
                )
              })}
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Villes autorisées (séparées par virgules)</p>
            <Input value={villesInput} onChange={e => setVillesInput(e.target.value)} placeholder="Oujda, Casablanca, Rabat" />
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Limite prospects/jour (0 = illimité)</p>
            <Input type="number" min={0} value={form.limite_prospects_jour} onChange={e => setForm(p => ({ ...p, limite_prospects_jour: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
            <Button size="sm" onClick={submit} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
