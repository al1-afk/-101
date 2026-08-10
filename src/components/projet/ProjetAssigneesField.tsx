/**
 * « Personnes assignées au projet » — champ du formulaire projet.
 *
 * Contrôlé et sans effet de bord : il ne fait ni requête ni mutation, il
 * expose une liste de sélections. C'est l'appelant qui la réconcilie avec
 * projet_assignees au moment de l'enregistrement — indispensable à la
 * création, où l'id du projet n'existe pas encore quand l'admin coche.
 *
 * Chaque personne porte son périmètre de tâches (projet_assignees.task_access,
 * migration 085) : « Toutes les tâches » ou « Par tâche ».
 */
import { useMemo, useState } from 'react'
import { Users, Search, Crown, X, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { getInitials, cn } from '@/lib/utils'
import { useTeam } from '@/hooks/useTeam'
import { useStagiaires } from '@/hooks/useStagiaires'
import type { ProjetTaskAccess } from '@/hooks/useProjetAssignees'
import { memberKey, stagiaireKey, type AssigneeKey, type AssigneePick } from '@/lib/projetAssigneeKeys'
import TaskAccessToggle from './TaskAccessToggle'

interface Person {
  key:    AssigneeKey
  name:   string
  sub:    string
  isStagiaire: boolean
}

export default function ProjetAssigneesField({
  value, onChange, leadKey, loading,
}: {
  value:    AssigneePick[]
  onChange: (next: AssigneePick[]) => void
  /** Personne déjà lead sur le projet — affichée avec la couronne. */
  leadKey?: AssigneeKey | null
  /** L'équipe actuelle du projet n'est pas encore connue : la section reste
      inerte, faute de quoi une case cochée maintenant partirait d'une liste
      vide et l'enregistrement retirerait les assignés déjà en base. */
  loading?: boolean
}) {
  const { data: members = [] }    = useTeam()
  const { data: stagiaires = [] } = useStagiaires()
  const [search, setSearch] = useState('')

  const picked = useMemo(() => new Map(value.map(p => [p.key, p])), [value])

  /* On propose les personnes disponibles, plus celles déjà assignées même
     devenues inactives : sinon leur ligne disparaîtrait de la liste tout en
     restant comptée, et l'admin n'aurait aucun moyen de les décocher. */
  const people = useMemo<Person[]>(() => [
    ...members
      .filter(m => m.statut !== 'inactif' || picked.has(memberKey(m.id)))
      .map(m => ({
        key:  memberKey(m.id),
        name: `${m.prenom ?? ''} ${m.nom ?? ''}`.trim() || m.email || 'Membre',
        sub:  m.statut === 'inactif' ? 'Inactif' : (m.poste || m.email || '—'),
        isStagiaire: false,
      })),
    ...stagiaires
      .filter(s => s.statut === 'accepte' || s.statut === 'en_cours' || picked.has(stagiaireKey(s.id)))
      /* Une fiche stagiaire rattachée à un membre d'équipe désigne la même
         personne : la proposer en plus créerait DEUX lignes projet_assignees
         pour un seul humain, avec deux réglages d'accès contradictoires.
         On ne la garde que si elle est déjà cochée — sinon l'admin n'aurait
         plus aucun moyen de défaire une assignation historique. */
      .filter(s => !s.member_id
                   || picked.has(stagiaireKey(s.id))
                   || !members.some(m => m.id === s.member_id))
      .map(s => ({
        key:  stagiaireKey(s.id),
        name: s.nom_complet,
        sub:  s.formation || s.email || '—',
        isStagiaire: true,
      })),
  ], [members, stagiaires, picked])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? people.filter(p => `${p.name} ${p.sub}`.toLowerCase().includes(q))
    : people

  /* Les personnes cochées restent en tête : on ne perd pas de vue ce qu'on
     vient de sélectionner en tapant une recherche. */
  const sorted = useMemo(() => {
    const inSel = (p: Person) => (picked.has(p.key) ? 0 : 1)
    return [...filtered].sort((a, b) => inSel(a) - inSel(b) || a.name.localeCompare(b.name, 'fr'))
  }, [filtered, picked])

  const toggle = (key: AssigneeKey) => {
    if (picked.has(key)) onChange(value.filter(p => p.key !== key))
    /* Défaut « Par tâche » : le partage large est un geste explicite,
       cohérent avec le DEFAULT 'assigned' de la migration 085. */
    else onChange([...value, { key, task_access: 'assigned' }])
  }

  const setAccess = (key: AssigneeKey, task_access: ProjetTaskAccess) =>
    onChange(value.map(p => (p.key === key ? { ...p, task_access } : p)))

  return (
    <div className="space-y-2 sm:col-span-2 p-3 rounded-xl border-2 border-dashed border-violet-300 dark:border-violet-700/50 bg-violet-50/30 dark:bg-violet-950/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Personnes assignées au projet
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Coche les personnes, puis choisis ce qu'elles voient dans leur espace membre.
          </p>
        </div>
        {value.length > 0 && (
          <span className="text-[11px] font-bold px-2 py-1 rounded bg-violet-600 text-white flex-shrink-0">
            {value.length} personne{value.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Légende des deux options — la formulation vaut contrat côté API. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
        <p className="p-2 rounded-lg bg-background border border-border/60 text-muted-foreground">
          <span className="font-semibold text-blue-600 dark:text-blue-400">Toutes les tâches</span> — consulte
          l'ensemble des tâches du projet et suit leur avancement.
        </p>
        <p className="p-2 rounded-lg bg-background border border-border/60 text-muted-foreground">
          <span className="font-semibold text-amber-600 dark:text-amber-400">Par tâche</span> — ne voit que
          les tâches qui lui sont attribuées, les autres restent invisibles.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground italic py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement de l'équipe du projet…
        </p>
      ) : people.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-3 text-center">
          Aucun membre d'équipe actif. Ajoute-les depuis Équipe.
        </p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une personne…"
              className="pl-8 h-9 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
            {sorted.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Aucun résultat</p>
            ) : sorted.map(p => {
              const pick = picked.get(p.key)
              const selected = !!pick
              return (
                <div key={p.key}
                  className={cn(
                    'rounded-lg border transition-all',
                    selected
                      ? 'border-violet-400 dark:border-violet-600 bg-background shadow-sm'
                      : 'border-border bg-background/60 hover:border-violet-300',
                  )}>
                  <label className="flex items-center gap-2.5 p-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggle(p.key)}
                      className="w-4 h-4 accent-violet-600 flex-shrink-0"
                    />
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      p.isStagiaire
                        ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                        : 'avatar-initials',
                    )}>
                      <span className="font-bold text-[10px]">{getInitials(p.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                        {p.name}
                        {p.isStagiaire && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                            🎓 Stagiaire
                          </span>
                        )}
                        {leadKey === p.key && <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.sub}</p>
                    </div>
                  </label>

                  {selected && (
                    <div className="flex items-center justify-between gap-2 flex-wrap px-2 pb-2 pl-[4.1rem]">
                      <span className="text-[11px] text-muted-foreground">Accès aux tâches</span>
                      <TaskAccessToggle
                        value={pick!.task_access}
                        onChange={v => setAccess(p.key, v)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
