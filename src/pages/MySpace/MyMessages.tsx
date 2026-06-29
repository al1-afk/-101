/**
 * /my-space/messages — vue d'ensemble de toutes les discussions projets
 * où le membre est assigné. Clic = ouvre le chat plein écran du projet.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  MessageSquare, Loader2, Inbox, ArrowRight, Briefcase, ArrowLeft,
} from 'lucide-react'
import { mySpaceApi } from '@/lib/api'
import { useMember } from '@/hooks/useMember'
import ProjetChat from '@/components/projet/ProjetChat'
import { cn } from '@/lib/utils'

function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)     return `il y a ${diff}s`
  if (diff < 3600)   return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400)  return `il y a ${Math.floor(diff / 3600)} h`
  return `il y a ${Math.floor(diff / 86400)} j`
}

interface ProjectWithChat {
  id:        string
  nom:       string
  client_entreprise?: string | null
  client_nom?:        string | null
  lastMessage?: {
    text:        string
    author_name: string
    is_admin:    boolean
    created_at:  string
  }
  totalCount: number
}

export default function MyMessages() {
  const { member } = useMember()
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)

  /* Récupère tous les projets assignés */
  const { data: projets = [], isLoading } = useQuery<any[]>({
    queryKey: ['my-space', 'projets'],
    queryFn:  () => mySpaceApi.projets(),
    staleTime: 30_000,
  })

  /* Pour chaque projet, on charge ses messages (en parallèle) */
  const messageQueries = useQuery({
    queryKey: ['my-space', 'all-projet-messages', projets.map(p => p.id).sort().join(',')],
    queryFn:  async () => {
      const result: Record<string, ProjectWithChat['lastMessage'] & { count: number } | { count: number; lastMessage?: any }> = {}
      await Promise.all(projets.map(async p => {
        try {
          const msgs = await mySpaceApi.projetMessages(p.id)
          const sorted = msgs.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          result[p.id] = { count: msgs.length, lastMessage: sorted[0] }
        } catch { result[p.id] = { count: 0 } }
      }))
      return result
    },
    enabled: projets.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const projectsWithChat: ProjectWithChat[] = useMemo(() =>
    projets.map(p => {
      const d = messageQueries.data?.[p.id] ?? { count: 0 }
      return {
        id:               p.id,
        nom:              p.nom,
        client_entreprise:p.client_entreprise,
        client_nom:       p.client_nom,
        totalCount:       d.count,
        lastMessage:      (d as any).lastMessage,
      }
    }).sort((a, b) => {
      const at = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0
      const bt = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0
      return bt - at
    }),
    [projets, messageQueries.data]
  )

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
  }

  /* Vue chat plein écran sur un projet sélectionné */
  if (openProjectId) {
    const p = projets.find(x => x.id === openProjectId)
    if (!p) { setOpenProjectId(null); return null }
    const memberName = member ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || 'Membre' : 'Membre'
    return (
      <div className="space-y-3">
        <button onClick={() => setOpenProjectId(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Retour aux messages
        </button>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{p.nom}</h1>
            {(p.client_entreprise || p.client_nom) && (
              <p className="text-xs text-slate-500">{p.client_entreprise || p.client_nom}</p>
            )}
          </div>
        </div>
        <ProjetChat
          projetId={p.id}
          currentUserName={memberName}
          isAdmin={false}
          queryKey={['my-space', 'projet', p.id, 'messages']}
          fetchMessages={() => mySpaceApi.projetMessages(p.id)}
          postMessage={(text) => mySpaceApi.postProjetMessage(p.id, text)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-blue-500" /> Messages
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Toutes les discussions de tes projets en un coup d'œil.
        </p>
      </div>

      {projectsWithChat.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tu n'as aucun projet assigné — donc aucune discussion à voir pour le moment.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {projectsWithChat.map(p => (
            <button
              key={p.id}
              onClick={() => setOpenProjectId(p.id)}
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
            >
              {/* Avatar projet */}
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white flex-shrink-0">
                <Briefcase className="w-5 h-5" />
              </div>

              {/* Infos */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{p.nom}</p>
                  {p.lastMessage && (
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">{timeAgo(p.lastMessage.created_at)}</span>
                  )}
                </div>
                {(p.client_entreprise || p.client_nom) && (
                  <p className="text-[11px] text-slate-500 truncate">{p.client_entreprise || p.client_nom}</p>
                )}
                {p.lastMessage ? (
                  <div className="flex items-start gap-1.5 mt-1.5">
                    <span className={cn('text-[11px] font-semibold flex-shrink-0', p.lastMessage.is_admin ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400')}>
                      {p.lastMessage.is_admin && '👔 '}{p.lastMessage.author_name.split(' ')[0]}:
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{p.lastMessage.text}</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1 italic">Aucun message — démarre la discussion</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {p.totalCount > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {p.totalCount}
                  </span>
                )}
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        💡 Le chat de chaque projet est aussi accessible depuis <Link to="/my-space/projets" className="text-blue-600 hover:underline">Mes projets</Link>.
      </p>
    </div>
  )
}
