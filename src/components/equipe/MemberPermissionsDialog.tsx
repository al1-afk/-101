/**
 * « Modifier les permissions » — édition rapide depuis la ligne du tableau
 * Espace équipe : Type · Poste, Accès SOPs et Statut du compte.
 *
 * Chaque bloc a son propre endpoint côté API : on n'appelle que ceux qui
 * ont réellement changé, pour éviter des écritures/audits inutiles.
 */
import { useState } from 'react'
import { Loader2, ShieldCheck, ShieldOff, Briefcase } from 'lucide-react'
import { teamMgmtApi, type TeamMemberRow, type TeamMemberAccess, type TeamInviteInput } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import SopAccessEditor from './SopAccessEditor'

const TYPES: { key: 'employee' | 'trainer' | 'freelance'; label: string; emoji: string }[] = [
  { key: 'employee',  label: 'Employé',   emoji: '👤' },
  { key: 'trainer',   label: 'Formateur', emoji: '🎓' },
  { key: 'freelance', label: 'Freelance', emoji: '🧑‍💻' },
]

/** Clé de comparaison stable — l'ordre des catégories n'a pas de sens métier. */
function accessKey(access: TeamMemberAccess[]): string {
  return access
    .map(a => `${a.category}:${a.level}`)
    .sort()
    .join('|')
}

export default function MemberPermissionsDialog({ member, onClose, onSaved }: {
  member:  TeamMemberRow
  onClose: () => void
  onSaved: () => void
}) {
  /* Photo de la ligne au moment de l'ouverture. La prop `member` vient de la
     query ['team-mgmt'] : elle peut être rafraîchie (staleTime 30 s, refetch
     au focus) pendant l'édition. Diffuser l'état saisi contre la prop vivante
     rendrait « sale » un champ jamais touché — et l'enregistrement écraserait
     silencieusement la modification d'un autre admin. On compare donc toujours
     à cette photo. */
  const [baseline] = useState(() => ({
    memberType: member.member_type,
    jobTitle:   member.job_title ?? '',
    accessKey:  accessKey(member.access),
    status:     member.account_status,
  }))

  const [type,     setType]     = useState(baseline.memberType)
  const [jobTitle, setJobTitle] = useState(baseline.jobTitle)
  const [access,   setAccess]   = useState<TeamMemberAccess[]>(
    () => member.access.map(a => ({ category: a.category, level: a.level })),
  )
  const [suspended, setSuspended] = useState(baseline.status === 'suspended')
  const [saving,    setSaving]    = useState(false)

  /* Le statut n'est modifiable que pour un compte déjà créé : réactiver un
     compte « invité » lui donnerait accès sans mot de passe, et un compte
     archivé se restaure depuis la corbeille. */
  const statusEditable = baseline.status === 'active' || baseline.status === 'suspended'

  const profileChanged = type !== baseline.memberType || jobTitle.trim() !== baseline.jobTitle
  const accessChanged  = accessKey(access) !== baseline.accessKey
  const statusChanged  = statusEditable && suspended !== (baseline.status === 'suspended')
  const dirty = profileChanged || accessChanged || statusChanged

  const save = async () => {
    if (!dirty) return onClose()
    setSaving(true)
    try {
      if (profileChanged) {
        const patch: Partial<TeamInviteInput> = {}
        if (type !== baseline.memberType) patch.member_type = type
        if (jobTitle.trim() !== baseline.jobTitle) patch.job_title = jobTitle.trim()
        await teamMgmtApi.update(member.id, patch)
      }
      if (accessChanged) await teamMgmtApi.setAccess(member.id, access)
      if (statusChanged) {
        await (suspended ? teamMgmtApi.suspend(member.id) : teamMgmtApi.activate(member.id))
      }
      toast.success('Permissions mises à jour')
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la mise à jour')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Modifier les permissions — {member.first_name} {member.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Type · Poste */}
          <section className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Type · Poste
            </p>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                    type === t.key
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300',
                  )}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-9"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="Titre du poste — ex : Community Manager"
              />
            </div>
          </section>

          {/* Accès SOPs */}
          <section className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Accès SOPs
            </p>
            <SopAccessEditor value={access} onChange={setAccess} />
          </section>

          {/* Statut */}
          <section className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Statut du compte
            </p>
            {statusEditable ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSuspended(false)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                    !suspended
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300',
                  )}
                >
                  <ShieldCheck className="w-4 h-4" /> Actif — peut se connecter
                </button>
                <button
                  type="button"
                  onClick={() => setSuspended(true)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                    suspended
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300',
                  )}
                >
                  <ShieldOff className="w-4 h-4" /> Suspendu — accès bloqué
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {baseline.status === 'invited'
                  ? "Invitation en attente — le compte deviendra actif dès que le membre aura créé son mot de passe."
                  : 'Compte archivé — restaurez-le depuis la corbeille pour modifier son statut.'}
              </p>
            )}
          </section>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button onClick={save} disabled={saving || !dirty} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
