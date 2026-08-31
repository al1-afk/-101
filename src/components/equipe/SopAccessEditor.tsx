/**
 * Éditeur d'accès SOPs partagé — utilisé par :
 *  - InviteDialog            (attribution à l'invitation)
 *  - MemberDetailDialog      (onglet « Accès SOPs »)
 *  - MemberPermissionsDialog (option « Modifier les permissions »)
 *
 * Affiche la TOTALITÉ du catalogue SOP_CATEGORIES : un éditeur tronqué
 * effacerait les catégories non affichées au moment d'enregistrer
 * (l'API remplace la liste complète).
 */
import { ShieldCheck } from 'lucide-react'
import { SOP_CATEGORIES } from '@/lib/sopCategories'
import type { TeamMemberAccess } from '@/lib/api'
import { cn } from '@/lib/utils'

type AccessLevel = TeamMemberAccess['level']

export default function SopAccessEditor({ value, onChange, className }: {
  value:     TeamMemberAccess[]
  onChange:  (next: TeamMemberAccess[]) => void
  className?: string
}) {
  const toggle = (category: string) => {
    const has = value.some(a => a.category === category)
    onChange(has
      ? value.filter(a => a.category !== category)
      : [...value, { category, level: 'read' }])
  }
  const setLevel = (category: string, level: AccessLevel) =>
    onChange(value.map(a => a.category === category ? { ...a, level } : a))

  const selectAll = (level: AccessLevel) =>
    onChange(SOP_CATEGORIES.map(c => ({ category: c.key, level })))

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
          {value.length} / {SOP_CATEGORIES.length} catégorie{value.length > 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => selectAll('read')}
            className="text-[10px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-400 text-slate-600 dark:text-slate-300"
          >
            Tout en lecture
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-red-400 text-slate-600 dark:text-slate-300"
          >
            Tout effacer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[22rem] overflow-y-auto pr-1">
        {SOP_CATEGORIES.map(c => {
          const a = value.find(x => x.category === c.key)
          const selected = !!a
          return (
            <div
              key={c.key}
              className={cn(
                'p-2.5 rounded-lg border transition-all',
                selected
                  ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
              )}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(c.key)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span>{c.emoji}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{c.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{c.desc}</p>
                </div>
              </label>
              {selected && (
                <select
                  value={a!.level}
                  onChange={e => setLevel(c.key, e.target.value as AccessLevel)}
                  className="mt-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 w-full text-slate-700 dark:text-slate-300"
                >
                  <option value="read">Lecture seule</option>
                  <option value="complete">Lecture + checklists</option>
                  <option value="edit">Édition (formateur)</option>
                </select>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
