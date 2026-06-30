/**
 * Admin tab in /equipe — manages team_member accounts (invitation flow,
 * SOP access, suspend/activate, tasks, activity).
 *
 * Self-contained: doesn't touch the existing HR features of /equipe.
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  UserPlus, Loader2, Mail, Phone, Briefcase, Check, X, Search, MoreVertical,
  Send, ShieldOff, ShieldCheck, RefreshCw, Trash2, KeyRound, Copy, Activity, ClipboardList,
  AlertTriangle, ChevronDown,
} from 'lucide-react'
import { teamMgmtApi, type TeamMemberRow, type TeamMemberAccess } from '@/lib/api'
import { SOP_CATEGORIES } from '@/lib/sopCategories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const STATUS_META: Record<string, { label: string; color: string }> = {
  invited:    { label: 'Invité',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  active:     { label: 'Actif',     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  suspended:  { label: 'Suspendu',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  archived:   { label: 'Archivé',   color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
}

const TYPE_META: Record<string, { label: string; color: string; emoji: string }> = {
  employee:  { label: 'Employé',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',     emoji: '👤' },
  trainer:   { label: 'Formateur',  color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', emoji: '🎓' },
  freelance: { label: 'Freelance',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', emoji: '🧑‍💻' },
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Jamais'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return "à l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}

export default function TeamSpaceTab() {
  const qc = useQueryClient()
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team-mgmt'],
    queryFn:  () => teamMgmtApi.list(),
    staleTime: 30_000,
  })

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType]     = useState<string>('all')
  const [inviteOpen, setInviteOpen]     = useState(false)
  const [detailId, setDetailId]         = useState<string | null>(null)

  const filtered = useMemo(() => members.filter(m => {
    if (filterStatus !== 'all' && m.account_status !== filterStatus) return false
    if (filterType   !== 'all' && m.member_type    !== filterType)   return false
    if (!search) return true
    const q = search.toLowerCase()
    return (m.first_name + ' ' + m.last_name + ' ' + m.email + ' ' + (m.job_title ?? '')).toLowerCase().includes(q)
  }), [members, filterStatus, filterType, search])

  const counts = useMemo(() => ({
    active:    members.filter(m => m.account_status === 'active').length,
    invited:   members.filter(m => m.account_status === 'invited').length,
    suspended: members.filter(m => m.account_status === 'suspended').length,
    trainers:  members.filter(m => m.member_type === 'trainer').length,
  }), [members])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Espace équipe & accès SOPs</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {counts.active} actif{counts.active > 1 ? 's' : ''} · {counts.invited} invitation{counts.invited > 1 ? 's' : ''} en attente · {counts.trainers} formateur{counts.trainers > 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <UserPlus className="w-4 h-4 mr-1.5" /> Inviter un membre
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value="all">Tous statuts</option>
          <option value="active">Actifs</option>
          <option value="invited">Invités</option>
          <option value="suspended">Suspendus</option>
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value="all">Tous types</option>
          <option value="employee">Employés</option>
          <option value="trainer">Formateurs</option>
          <option value="freelance">Freelances</option>
        </select>
      </div>

      {/* Members table */}
      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
          <UserPlus className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {members.length === 0 ? 'Aucun membre invité pour le moment.' : 'Aucun membre ne correspond aux filtres.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Membre</th>
                <th className="px-4 py-3 text-left">Type · Poste</th>
                <th className="px-4 py-3 text-left">Accès SOPs</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-left">Dernière connexion</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((m, i) => (
                <motion.tr
                  key={m.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.015 }}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                >
                  <td className="px-4 py-3">
                    <button onClick={() => setDetailId(m.id)} className="text-left flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">
                        {(m.first_name?.[0] ?? '') + (m.last_name?.[0] ?? '')}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{m.first_name} {m.last_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <Mail className="w-3 h-3" /> {m.email}
                        </div>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={cn('text-[10px] font-bold', TYPE_META[m.member_type]?.color)}>
                      {TYPE_META[m.member_type]?.emoji} {TYPE_META[m.member_type]?.label}
                    </Badge>
                    {m.job_title && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{m.job_title}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                      {m.access.length === 0 ? (
                        <span className="text-xs text-slate-400 dark:text-slate-600">Aucun</span>
                      ) : m.access.slice(0, 4).map(a => {
                        const meta = SOP_CATEGORIES.find(c => c.key === a.category)
                        return (
                          <span key={a.category} className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', meta?.bg, meta?.text)}>
                            {meta?.emoji} {meta?.label ?? a.category}
                          </span>
                        )
                      })}
                      {m.access.length > 4 && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">+{m.access.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold', STATUS_META[m.account_status]?.color)}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }} />
                      {STATUS_META[m.account_status]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {timeAgo(m.last_login_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MemberActions member={m} onOpen={() => setDetailId(m.id)} onInvalidate={() => qc.invalidateQueries({ queryKey: ['team-mgmt'] })} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite dialog */}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {/* Detail dialog */}
      {detailId && <MemberDetailDialog id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   MemberActions — dropdown per row
   ════════════════════════════════════════════════════════════════════ */
function MemberActions({ member, onOpen, onInvalidate }: {
  member: TeamMemberRow
  onOpen: () => void
  onInvalidate: () => void
}) {
  const qc = useQueryClient()

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    try { await fn(); toast.success(okMsg); onInvalidate() }
    catch (e: any) { toast.error(e?.message ?? 'Erreur') }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreVertical className="w-4 h-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onOpen}>
          <ClipboardList className="w-4 h-4 mr-2" /> Voir le détail
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {member.account_status === 'invited' && (
          <DropdownMenuItem onClick={() => run(() => teamMgmtApi.resend(member.id), 'Invitation renvoyée')}>
            <Send className="w-4 h-4 mr-2" /> Renvoyer l'invitation
          </DropdownMenuItem>
        )}
        {member.account_status === 'active' && (
          <>
            <DropdownMenuItem onClick={() => run(() => teamMgmtApi.resetPwd(member.id), 'Email de réinitialisation envoyé')}>
              <KeyRound className="w-4 h-4 mr-2" /> Réinitialiser le mot de passe
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => run(() => teamMgmtApi.suspend(member.id), 'Compte suspendu')}>
              <ShieldOff className="w-4 h-4 mr-2" /> Suspendre
            </DropdownMenuItem>
          </>
        )}
        {member.account_status === 'suspended' && (
          <DropdownMenuItem onClick={() => run(() => teamMgmtApi.activate(member.id), 'Compte réactivé')}>
            <ShieldCheck className="w-4 h-4 mr-2" /> Réactiver
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            if (confirm(`Archiver ${member.first_name} ${member.last_name} ? Le compte ne pourra plus se connecter.`)) {
              run(() => teamMgmtApi.archive(member.id), 'Membre archivé')
            }
          }}
          className="text-red-600 focus:text-red-700"
        >
          <Trash2 className="w-4 h-4 mr-2" /> Archiver
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ════════════════════════════════════════════════════════════════════
   InviteDialog
   ════════════════════════════════════════════════════════════════════ */
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [type,      setType]      = useState<'employee' | 'trainer' | 'freelance'>('employee')
  const [jobTitle,  setJobTitle]  = useState('')
  const [access,    setAccess]    = useState<TeamMemberAccess[]>([])
  const [tasks,     setTasks]     = useState<{ title: string; priority: string; due_date: string }[]>([])
  const [showInvitationUrl, setShowInvitationUrl] = useState<string | null>(null)

  const invite = useMutation({
    mutationFn: () => teamMgmtApi.invite({
      first_name: firstName,
      last_name:  lastName,
      email,
      phone:      phone || undefined,
      member_type: type,
      job_title:  jobTitle || undefined,
      sop_categories: access,
      tasks: tasks.filter(t => t.title.trim()).map(t => ({
        title:    t.title,
        priority: t.priority as any,
        due_date: t.due_date || null,
      })),
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['team-mgmt'] })
      toast.success(`${firstName} a été invité(e) — email envoyé à ${email}`)
      setShowInvitationUrl(data.invitation_url)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const reset = () => {
    setFirstName(''); setLastName(''); setEmail(''); setPhone('')
    setType('employee'); setJobTitle('')
    setAccess([]); setTasks([])
    setShowInvitationUrl(null)
  }

  const close = () => { reset(); onClose() }

  const toggleAccess = (category: string) => {
    setAccess(prev => {
      const has = prev.find(a => a.category === category)
      if (has) return prev.filter(a => a.category !== category)
      return [...prev, { category, level: 'read' }]
    })
  }
  const setLevel = (category: string, level: 'read' | 'complete' | 'edit') => {
    setAccess(prev => prev.map(a => a.category === category ? { ...a, level } : a))
  }

  const canSubmit = firstName.trim() && lastName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !invite.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" /> Inviter un membre
          </DialogTitle>
        </DialogHeader>

        {showInvitationUrl ? (
          <InvitationSuccess url={showInvitationUrl} email={email} onClose={close} />
        ) : (
          <div className="space-y-5 mt-2">
            {/* SECTION 1 — Identité */}
            <Section title="1. Identité">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Prénom *" value={firstName} onChange={setFirstName} />
                <Field label="Nom *" value={lastName} onChange={setLastName} />
                <Field label="Email professionnel *" value={email} onChange={setEmail} type="email" placeholder="prenom.nom@nextgital.com" />
                <Field label="Téléphone" value={phone} onChange={setPhone} placeholder="+212 6XX XX XX XX" />
              </div>
              <div className="mt-3">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 block">Type de membre *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['employee','trainer','freelance'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                        type === t
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300',
                      )}
                    >
                      {TYPE_META[t].emoji} {TYPE_META[t].label}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            {/* SECTION 2 — Poste */}
            <Section title="2. Poste">
              <Field
                label="Titre du poste"
                value={jobTitle}
                onChange={setJobTitle}
                placeholder="ex : Développeur Web, Designer Graphiste, Community Manager…"
              />
            </Section>

            {/* SECTION 3 — Accès SOPs */}
            <Section title="3. Accès aux SOPs" subtitle="Sélectionnez les catégories accessibles à ce membre.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SOP_CATEGORIES.slice(0, 8).map(c => {
                  const a = access.find(x => x.category === c.key)
                  const selected = !!a
                  return (
                    <div
                      key={c.key}
                      className={cn(
                        'p-3 rounded-lg border transition-all',
                        selected
                          ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
                      )}
                    >
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleAccess(c.key)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{c.emoji}</span>
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{c.desc}</p>
                        </div>
                      </label>
                      {selected && (
                        <div className="mt-2 pl-6">
                          <select
                            value={a!.level}
                            onChange={e => setLevel(c.key, e.target.value as any)}
                            className="text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-300 w-full"
                          >
                            <option value="read">Lecture seule</option>
                            <option value="complete">Lecture + checklists</option>
                            <option value="edit">Édition (formateur)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                {access.length} catégorie{access.length > 1 ? 's' : ''} sélectionnée{access.length > 1 ? 's' : ''}
              </p>
            </Section>

            {/* SECTION 4 — Tâches initiales */}
            <Section title="4. Tâches initiales (optionnel)">
              {tasks.map((t, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-center">
                  <AutocorrectInput
                    className="col-span-6"
                    placeholder="Titre de la tâche"
                    value={t.title}
                    onChange={e => setTasks(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                  />
                  <select
                    className="col-span-3 px-2 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200"
                    value={t.priority}
                    onChange={e => setTasks(prev => prev.map((x, j) => j === i ? { ...x, priority: e.target.value } : x))}
                  >
                    <option value="low">Basse</option>
                    <option value="normal">Normale</option>
                    <option value="high">Haute</option>
                    <option value="urgent">Urgente</option>
                  </select>
                  <Input
                    type="date"
                    className="col-span-2"
                    value={t.due_date}
                    onChange={e => setTasks(prev => prev.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))}
                  />
                  <button
                    onClick={() => setTasks(prev => prev.filter((_, j) => j !== i))}
                    className="col-span-1 text-red-500 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTasks(prev => [...prev, { title: '', priority: 'normal', due_date: '' }])}
              >
                + Ajouter une tâche
              </Button>
            </Section>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <Button variant="outline" onClick={close}>Annuler</Button>
              <Button
                onClick={() => invite.mutate()}
                disabled={!canSubmit}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {invite.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Créer le compte et envoyer l'invitation
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InvitationSuccess({ url, email, onClose }: { url: string; email: string; onClose: () => void }) {
  return (
    <div className="text-center py-4 space-y-4">
      <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto flex items-center justify-center">
        <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Invitation envoyée !</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Un email avec le lien d'activation a été envoyé à <strong>{email}</strong>.
        </p>
      </div>
      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3 text-left">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Lien d'invitation direct (valable 7 jours)</div>
        <div className="flex items-center gap-2">
          <code className="text-xs text-slate-700 dark:text-slate-300 break-all flex-1">{url}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { navigator.clipboard.writeText(url); toast.success('Lien copié') }}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <Button onClick={onClose} className="w-full">Fermer</Button>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </section>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">{label}</label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   MemberDetailDialog
   ════════════════════════════════════════════════════════════════════ */
function MemberDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['team-mgmt', id],
    queryFn:  () => teamMgmtApi.get(id),
    staleTime: 30_000,
  })

  const [editingAccess, setEditingAccess] = useState(false)
  const [draftAccess, setDraftAccess] = useState<TeamMemberAccess[]>([])

  const saveAccess = useMutation({
    mutationFn: () => teamMgmtApi.setAccess(id, draftAccess),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team-mgmt'] }); refetch(); setEditingAccess(false); toast.success('Accès mis à jour') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const startEditAccess = () => {
    setDraftAccess(data?.access?.map((a: any) => ({ category: a.sop_category, level: a.access_level })) ?? [])
    setEditingAccess(true)
  }
  const toggleDraft = (category: string) => {
    setDraftAccess(prev => {
      const has = prev.find(a => a.category === category)
      if (has) return prev.filter(a => a.category !== category)
      return [...prev, { category, level: 'read' }]
    })
  }
  const setDraftLevel = (category: string, level: 'read' | 'complete' | 'edit') => {
    setDraftAccess(prev => prev.map(a => a.category === category ? { ...a, level } : a))
  }

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détail du membre</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
        ) : (
          <Tabs defaultValue="info" className="mt-2">
            <TabsList>
              <TabsTrigger value="info">Informations</TabsTrigger>
              <TabsTrigger value="access">Accès SOPs</TabsTrigger>
              <TabsTrigger value="tasks">Tâches</TabsTrigger>
              <TabsTrigger value="activity">Activité</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-3 pt-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-lg font-bold">
                  {(data.first_name?.[0] ?? '') + (data.last_name?.[0] ?? '')}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{data.first_name} {data.last_name}</h3>
                  <p className="text-sm text-slate-500">{data.job_title || 'Membre'}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">Email</dt><dd className="text-slate-900 dark:text-slate-100">{data.email}</dd></div>
                <div><dt className="text-xs text-slate-500">Téléphone</dt><dd className="text-slate-900 dark:text-slate-100">{data.telephone || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Type</dt><dd className="text-slate-900 dark:text-slate-100">{TYPE_META[data.member_type]?.label}</dd></div>
                <div><dt className="text-xs text-slate-500">Statut</dt><dd><span className={cn('px-2 py-0.5 rounded text-xs', STATUS_META[data.account_status]?.color)}>{STATUS_META[data.account_status]?.label}</span></dd></div>
                <div><dt className="text-xs text-slate-500">Invitation envoyée</dt><dd className="text-slate-900 dark:text-slate-100">{timeAgo(data.invitation_sent_at)}</dd></div>
                <div><dt className="text-xs text-slate-500">Acceptée</dt><dd className="text-slate-900 dark:text-slate-100">{timeAgo(data.invitation_accepted_at)}</dd></div>
                <div><dt className="text-xs text-slate-500">Dernière connexion</dt><dd className="text-slate-900 dark:text-slate-100">{timeAgo(data.last_login_at)}</dd></div>
              </dl>
            </TabsContent>

            <TabsContent value="access" className="space-y-3 pt-3">
              {editingAccess ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SOP_CATEGORIES.slice(0, 8).map(c => {
                      const a = draftAccess.find(x => x.category === c.key)
                      const selected = !!a
                      return (
                        <div key={c.key} className={cn('p-3 rounded-lg border', selected ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-800')}>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={selected} onChange={() => toggleDraft(c.key)} className="mt-1" />
                            <div className="flex-1">
                              <div className="text-sm font-semibold">{c.emoji} {c.label}</div>
                            </div>
                          </label>
                          {selected && (
                            <select
                              value={a!.level}
                              onChange={e => setDraftLevel(c.key, e.target.value as any)}
                              className="mt-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 w-full"
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
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setEditingAccess(false)}>Annuler</Button>
                    <Button onClick={() => saveAccess.mutate()} disabled={saveAccess.isPending}>
                      {saveAccess.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Enregistrer
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">{data.access.length} catégorie{data.access.length > 1 ? 's' : ''}</p>
                    <Button variant="outline" size="sm" onClick={startEditAccess}>Modifier</Button>
                  </div>
                  {data.access.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucune catégorie assignée.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {data.access.map((a: any) => {
                        const meta = SOP_CATEGORIES.find(c => c.key === a.sop_category)
                        return (
                          <li key={a.sop_category} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-sm">
                            <span>{meta?.emoji} <strong>{meta?.label ?? a.sop_category}</strong></span>
                            <span className="text-xs text-slate-500">{a.access_level === 'edit' ? 'Édition' : a.access_level === 'complete' ? 'Checklist' : 'Lecture'}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="tasks" className="space-y-2 pt-3">
              {data.tasks.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune tâche assignée.</p>
              ) : data.tasks.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-sm">
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded font-bold',
                    t.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                    t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-200 text-slate-700',
                  )}>{t.status === 'done' ? '✓' : t.status === 'in_progress' ? '…' : '○'}</span>
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.due_date && <span className="text-xs text-slate-500">{new Date(t.due_date).toLocaleDateString('fr-FR')}</span>}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="activity" className="space-y-1.5 pt-3 max-h-96 overflow-y-auto">
              {data.activity.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune activité enregistrée.</p>
              ) : data.activity.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <span className="text-slate-700 dark:text-slate-300">
                    {a.action_type}
                    {a.action_details?.sop_title && <span className="text-slate-400 ml-1">· {a.action_details.sop_title}</span>}
                  </span>
                  <span className="text-slate-400">{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
