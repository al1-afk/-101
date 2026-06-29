/**
 * /my-space/projets — liste des projets où le membre est assigné.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Briefcase, Loader2, Inbox, Calendar, CheckSquare, Crown, User as UserIcon } from 'lucide-react'
import { mySpaceApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const STATUT_CFG: Record<string, { label: string; cls: string }> = {
  planifie: { label: 'Planifié',  cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  en_cours: { label: 'En cours',  cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  en_pause: { label: 'En pause',  cls: 'bg-slate-500/10 text-slate-700 dark:text-slate-400' },
  termine:  { label: 'Terminé',   cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  annule:   { label: 'Annulé',    cls: 'bg-red-500/10 text-red-700 dark:text-red-400' },
}

function fmtDate(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function MyProjets() {
  const { data: projets = [], isLoading } = useQuery<any[]>({
    queryKey: ['my-space', 'projets'],
    queryFn:  () => mySpaceApi.projets(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mes projets</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Projets sur lesquels tu es assigné(e). Clique pour voir les infos, identifiants, et tes tâches.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : projets.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tu n'es assigné à aucun projet pour le moment.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projets.map((p) => {
            const statut = STATUT_CFG[p.statut] ?? STATUT_CFG.planifie
            const pct = p.my_tasks_count > 0
              ? Math.round((p.my_tasks_done / p.my_tasks_count) * 100)
              : p.progression ?? 0
            return (
              <Link
                key={p.id}
                to={`/my-space/projets/${p.id}`}
                className="block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:border-blue-500/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{p.nom}</h3>
                      {p.my_role === 'lead' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                    </div>
                    {(p.client_entreprise || p.client_nom) && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                        <UserIcon className="w-3 h-3" /> {p.client_entreprise || p.client_nom}
                      </p>
                    )}
                  </div>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded', statut.cls)}>
                    {statut.label}
                  </span>
                </div>

                {p.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{p.description}</p>
                )}

                <div className="space-y-2">
                  {/* Progress */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all"
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200 w-10 text-right">{pct}%</span>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" />
                      {p.my_tasks_done}/{p.my_tasks_count} tâches
                    </span>
                    {p.date_fin_prevue && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Échéance : {fmtDate(p.date_fin_prevue)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
