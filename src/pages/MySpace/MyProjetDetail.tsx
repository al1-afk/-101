/**
 * /my-space/projets/:id — fiche complète du projet pour le membre.
 * Infos client, identifiants (masqués + copy), liens utiles, ses tâches.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Briefcase, Calendar, Building2, Phone, Mail, MapPin,
  Loader2, KeyRound, Link2, Users, Crown, FileText,
  CheckSquare, Square, CircleDot, Play, Square as SquareIcon, Pause, Check,
  Sparkles, ExternalLink, AlertCircle,
} from 'lucide-react'
import { mySpaceApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import PasswordField from '@/components/PasswordField'
import ProjetChat from '@/components/projet/ProjetChat'
import { useMember } from '@/hooks/useMember'
import { parseProjet, CREDENTIAL_PRESETS } from '@/lib/projetNotes'
import { SopBlocksRenderer } from '@/components/sop/SopBlocksRenderer'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { MessageSquare, BookOpen } from 'lucide-react'

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

function copy(text: string, label: string) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => toast.success(`✓ ${label} copié`)).catch(() => {})
}

export default function MyProjetDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { member } = useMember()
  const { data: projet, isLoading, error } = useQuery<any>({
    queryKey: ['my-space', 'projet', id],
    queryFn:  () => mySpaceApi.projet(id!),
    enabled:  !!id,
    staleTime: 30_000,
  })

  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      mySpaceApi.updateTaskStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-space', 'projet', id] })
      qc.invalidateQueries({ queryKey: ['my-space', 'tasks'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
  }
  if (error || !projet) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-slate-600 dark:text-slate-300">Projet introuvable ou tu n'y es plus assigné.</p>
        <Link to="/my-space/projets" className="inline-block mt-3 text-sm text-blue-600 hover:underline">← Retour à mes projets</Link>
      </div>
    )
  }

  const parsed = parseProjet(projet.notes)
  const statut = STATUT_CFG[projet.statut] ?? STATUT_CFG.planifie
  const shareInfos = projet.share_infos !== false

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <Link to="/my-space/projets" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" /> Mes projets
      </Link>

      {/* Hero */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{projet.nom}</h1>
              <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded', statut.cls)}>
                {statut.label}
              </span>
              {projet.my_role === 'lead' && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Crown className="w-3 h-3" /> Lead
                </span>
              )}
            </div>
            {projet.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{projet.description}</p>
            )}
            <div className="flex items-center flex-wrap gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
              {shareInfos && (projet.client_entreprise || projet.client_nom) && (
                <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{projet.client_entreprise || projet.client_nom}</span>
              )}
              {projet.date_debut && (
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Du {fmtDate(projet.date_debut)} au {fmtDate(projet.date_fin_prevue)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bandeau "accès restreint" si infos non partagées ── */}
      {!shareInfos && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Tu vois ce projet et ses tâches, mais les informations sensibles (contact client, identifiants, liens, notes) ne te sont pas partagées.
          </p>
        </div>
      )}

      {/* ── Contact client ── */}
      {shareInfos && (
        <Section title="Contact client" icon={Building2} color="blue">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Info label="Entreprise" value={projet.client_entreprise ?? projet.client_nom ?? '—'} icon={Building2} />
            <Info label="Contact" value={projet.client_nom ?? '—'} icon={Users} />
            <Info label="Téléphone" value={projet.client_telephone ?? '—'} icon={Phone} copyable />
            <Info label="Email" value={projet.client_email ?? '—'} icon={Mail} copyable />
            {(projet.client_adresse || projet.client_ville) && (
              <Info className="md:col-span-2" label="Adresse" icon={MapPin}
                value={[projet.client_adresse, projet.client_ville, projet.client_pays].filter(Boolean).join(', ') || '—'} />
            )}
          </div>
        </Section>
      )}

      {/* ── Notes ── */}
      {shareInfos && parsed.infos && (
        <Section title="Notes" icon={FileText} color="violet">
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{parsed.infos}</p>
        </Section>
      )}

      {/* ── Identifiants ── */}
      {shareInfos && parsed.credentials.length > 0 && (
        <Section title={`Identifiants (${parsed.credentials.length})`} icon={KeyRound} color="amber">
          <div className="space-y-2">
            {parsed.credentials.map(c => {
              const preset = CREDENTIAL_PRESETS.find(p => p.type === c.type) ?? CREDENTIAL_PRESETS.find(p => p.type === 'custom')!
              return (
                <div key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{preset.emoji}</span>
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{c.label || preset.label}</span>
                  </div>
                  <div className="space-y-1.5 pl-7 text-xs">
                    {c.url && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 w-20">URL</span>
                        <a href={c.url} target="_blank" rel="noreferrer" className="font-mono text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1">
                          {c.url} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </div>
                    )}
                    {c.username && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 w-20">Utilisateur</span>
                        <span className="font-mono text-slate-700 dark:text-slate-200">{c.username}</span>
                        <button onClick={() => copy(c.username!, 'Utilisateur')} className="p-0.5 rounded text-slate-400 hover:text-blue-500">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                      </div>
                    )}
                    {c.password && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 w-20">Mot de passe</span>
                        <div className="flex-1">
                          <PasswordField value={c.password} readOnly />
                        </div>
                      </div>
                    )}
                    {c.notes && (
                      <p className="text-[11px] text-slate-500 italic mt-1.5">💡 {c.notes}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* ── Liens utiles ── */}
      {shareInfos && parsed.usefulLinks.length > 0 && (
        <Section title={`Liens utiles (${parsed.usefulLinks.length})`} icon={Link2} color="emerald">
          <div className="space-y-1.5">
            {parsed.usefulLinks.map(l => (
              <a key={l.id} href={l.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors text-sm group"
              >
                <Link2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">{l.label || 'Lien'}</span>
                <span className="text-xs text-slate-500 font-mono truncate flex-1">{l.url}</span>
                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* ── Équipe du projet ── */}
      {projet.teammates && projet.teammates.length > 0 && (
        <Section title={`Équipe (${projet.teammates.length})`} icon={Users} color="violet">
          <div className="space-y-1.5">
            {projet.teammates.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-[10px]">
                  {(m.first_name?.[0] ?? '') + (m.last_name?.[0] ?? '')}
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.first_name} {m.last_name}</span>
                {m.role === 'lead' && <Crown className="w-3 h-3 text-amber-500" />}
                {m.job_title && <span className="text-xs text-slate-500 ml-auto">{m.job_title}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Documentation projet (lecture seule) ── */}
      {shareInfos && parsed.blocks.length > 0 && (
        <Section title="Documentation projet" icon={BookOpen} color="violet">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2 mb-2">
            Brief, spécifications, livrables — aperçu formaté.
          </p>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-5">
            <SopBlocksRenderer blocks={parsed.blocks} />
          </div>
        </Section>
      )}

      {/* ── 💬 Discussion projet ── */}
      <Section title="Discussion" icon={MessageSquare} color="blue">
        <ProjetChat
          projetId={id!}
          currentUserName={member ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || 'Membre' : 'Membre'}
          isAdmin={false}
          queryKey={['my-space', 'projet', id, 'messages']}
          fetchMessages={() => mySpaceApi.projetMessages(id!)}
          postMessage={(text) => mySpaceApi.postProjetMessage(id!, text)}
        />
      </Section>

      {/* ── Mes tâches sur ce projet ── */}
      <Section title={`Mes tâches (${projet.my_tasks?.length ?? 0})`} icon={CheckSquare} color="blue">
        {(projet.my_tasks ?? []).length === 0 ? (
          <p className="text-sm text-slate-500 italic text-center py-4">Aucune tâche assignée pour ce projet.</p>
        ) : (
          <div className="space-y-1.5">
            {projet.my_tasks.map((t: any) => {
              const isDone = t.status === 'done'
              const isInProgress = t.status === 'in_progress'
              const isValidation = t.status === 'validation'
              return (
                <div key={t.id} className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800',
                  isValidation && 'border-violet-300 dark:border-violet-800/60 bg-violet-50/30 dark:bg-violet-950/10',
                  isDone && 'opacity-60',
                )}>
                  <button onClick={() => updateTask.mutate({ id: t.id, status: isDone ? 'todo' : 'done' })}>
                    {isDone ? <CheckSquare className="w-4 h-4 text-emerald-600" /> :
                     isInProgress ? <CircleDot className="w-4 h-4 text-blue-600" /> :
                     <Square className="w-4 h-4 text-slate-300" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.category && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">{t.category}</span>}
                      {t.is_request && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" /> Demande</span>}
                      {isValidation && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-200 dark:bg-violet-800/60 text-violet-800 dark:text-violet-200">⚑ En validation</span>}
                    </div>
                    <div className={cn('text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5', isDone && 'line-through')}>{t.title}</div>
                  </div>
                  {!isDone && !isValidation && (
                    <div className="flex gap-1">
                      {!isInProgress ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => updateTask.mutate({ id: t.id, status: 'in_progress' })}>
                          <Play className="w-3 h-3" /> Commencer
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => updateTask.mutate({ id: t.id, status: 'todo' })}>
                          <Pause className="w-3 h-3" /> Pause
                        </Button>
                      )}
                      <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                        onClick={() => updateTask.mutate({ id: t.id, status: 'validation' })}>
                        <SquareIcon className="w-3 h-3" /> Terminer
                      </Button>
                    </div>
                  )}
                  {isValidation && (
                    <span className="text-[11px] text-violet-700 dark:text-violet-400 italic flex items-center gap-1">
                      <Check className="w-3 h-3" /> En attente du manager
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

/* ─── Helpers ─────────────────────────────────────── */
function Section({ title, icon: Icon, color, children }: {
  title:    string
  icon:     React.ElementType
  color:    'blue' | 'violet' | 'amber' | 'emerald'
  children: React.ReactNode
}) {
  const colorCls = {
    blue:    'text-blue-500',
    violet:  'text-violet-500',
    amber:   'text-amber-500',
    emerald: 'text-emerald-500',
  }[color]
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('w-4 h-4', colorCls)} />
        <h2 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Info({ label, value, icon: Icon, copyable, className }: {
  label:    string
  value:    string
  icon?:    React.ElementType
  copyable?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30', className)}>
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{value}</p>
      </div>
      {copyable && value !== '—' && (
        <button onClick={() => copy(value, label)} className="p-1 rounded text-slate-400 hover:text-blue-500" title="Copier">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      )}
    </div>
  )
}
