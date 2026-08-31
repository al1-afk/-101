/**
 * Formulaire de fiche salarié — création et modification.
 *
 * Extrait de src/pages/Equipe.tsx pour être partagé : la page Équipe
 * l'ouvre depuis « Ajouter un salarié », la fiche individuelle depuis
 * « Modifier ». Un seul formulaire, donc un seul endroit où corriger un
 * champ ou en ajouter un — dupliquer aurait garanti la dérive entre les
 * deux écrans.
 *
 * Écrit par le CRUD générique (`teamApi` → /api/team_members), qui est le
 * seul des trois chemins d'écriture de cette table à accepter l'ensemble
 * des champs RH.
 */
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useCreateTeamMember, useUpdateTeamMember, type TeamMember,
} from '@/hooks/useTeam'
import { ROLE_LABELS, ROLE_COLORS, type Role } from '@/lib/permissions'
import { cn } from '@/lib/utils'

/* Statuts réellement enregistrables.
   La base n'accepte que 'actif' et 'inactif' (contrainte
   team_members_statut_check) : proposer « En congé » produisait un refus
   « Valeur non autorisée pour un des champs » au moment d'enregistrer.
   L'absence d'un collaborateur relève du module Congés, pas d'un statut
   de fiche. */
const STATUTS = [
  { valeur: 'actif',   label: 'Actif' },
  { valeur: 'inactif', label: 'Inactif' },
] as const

const TYPES_COLLABORATION = [
  { valeur: 'employee',  label: 'Salarié' },
  { valeur: 'trainer',   label: 'Formateur' },
  { valeur: 'freelance', label: 'Freelance' },
] as const

export default function TeamMemberForm({
  member, onClose, onSaved,
}: {
  member?: TeamMember
  onClose: () => void
  /** Appelé après un enregistrement réussi — sert à rafraîchir un écran
   *  qui lit la fiche par une autre requête que la liste. */
  onSaved?: () => void
}) {
  const create = useCreateTeamMember()
  const update = useUpdateTeamMember()

  const [form, setForm] = useState({
    nom:          member?.nom           || '',
    prenom:       member?.prenom        || '',
    email:        member?.email         || '',
    telephone:    member?.telephone     || '',
    poste:        member?.poste         || '',
    departement:  member?.departement   || '',
    role:         (member?.role         || 'commercial') as Role,
    salaire_base: member?.salaire_base  || 0,
    date_embauche:member?.date_embauche || '',
    statut:       (member?.statut       || 'actif') as TeamMember['statut'],
    /* Renseigné explicitement plutôt que laissé vide : sans lui, la fiche
       n'apparaît dans l'onglet Employés que par un repli, et le type réel
       de collaboration reste indéterminé en base. */
    member_type:  (member?.member_type  || 'employee') as NonNullable<TeamMember['member_type']>,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (member) await update.mutateAsync({ id: member.id, ...form })
    else        await create.mutateAsync(form)
    onSaved?.()
    onClose()
  }

  const enCours = create.isPending || update.isPending

  return (
    <form id="team-member-form" onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="form-label">Prénom *</label>
          <AutocorrectInput value={form.prenom} onChange={e => setForm(p => ({ ...p, prenom: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Nom *</label>
          <AutocorrectInput value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Email</label>
          <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Téléphone</label>
          <Input value={form.telephone} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Type de collaboration</label>
          <Select
            value={form.member_type}
            onValueChange={v => setForm(p => ({ ...p, member_type: v as typeof p.member_type }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES_COLLABORATION.map(t => (
                <SelectItem key={t.valeur} value={t.valeur}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Poste</label>
          <AutocorrectInput value={form.poste} onChange={e => setForm(p => ({ ...p, poste: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Département</label>
          <AutocorrectInput value={form.departement} onChange={e => setForm(p => ({ ...p, departement: e.target.value }))} placeholder="Tech, Ventes, Admin…" />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Rôle d'accès</label>
          <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as Role }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold mr-2', ROLE_COLORS[k])}>{v}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Salaire de base (MAD)</label>
          <Input type="number" value={form.salaire_base || ''} onChange={e => setForm(p => ({ ...p, salaire_base: +e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Date d'embauche</label>
          <Input type="date" value={form.date_embauche} onChange={e => setForm(p => ({ ...p, date_embauche: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Statut</label>
          <Select value={form.statut} onValueChange={v => setForm(p => ({ ...p, statut: v as TeamMember['statut'] }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUTS.map(s => <SelectItem key={s.valeur} value={s.valeur}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" disabled={enCours}>
          {enCours && <Loader2 className="w-4 h-4 animate-spin" />}
          {member ? 'Mettre à jour' : 'Ajouter'}
        </Button>
      </div>
    </form>
  )
}
