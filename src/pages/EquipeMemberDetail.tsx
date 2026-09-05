import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Mail, Phone, Briefcase, Calendar, Loader2,
  CircleDollarSign, Wallet, TrendingUp, TrendingDown, FileDown,
  FolderKanban, ShieldCheck, Activity, CalendarDays, User,
  CheckCircle2, XCircle, Clock, MapPin, Building2, IdCard,
  Timer, BadgeCheck, Award, Zap, Pencil, MessageCircle, Lock, Check, Loader2 as Spinner,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import TeamMemberForm from '@/components/equipe/TeamMemberForm'
import type { TeamMember } from '@/hooks/useTeam'
import { teamMgmtApi, messagesApi, type DmPerson, type DmContactRules } from '@/lib/api'
import { sopCategoryLabel } from '@/lib/sopCategories'
import { cn } from '@/lib/utils'

const fmtMAD = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' MAD'
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMonth = (d: string) => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

type FinanceEntry = {
  date: string
  type: 'salaire' | 'prime' | 'avance' | 'retenue' | 'paiement'
  label: string
  debit: number    // ce que l'entreprise doit encaisser (avance versée, retenue)
  credit: number   // ce que l'entreprise doit au membre (salaire, prime)
  meta?: string
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
═══════════════════════════════════════════════════════════════════ */
export default function EquipeMemberDetail() {
  const { id, tenantSlug } = useParams<{ id: string; tenantSlug: string }>()
  const navigate = useNavigate()
  const base = tenantSlug ? `/${tenantSlug}` : ''

  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const memberQ = useQuery({
    queryKey: ['team-member', id],
    queryFn: () => teamMgmtApi.get(id!),
    enabled: !!id,
  })

  if (memberQ.isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
  }

  if (memberQ.isError || !memberQ.data) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="secondary" onClick={() => navigate(`${base}/equipe`)}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Retour à l'équipe
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          Membre introuvable.
        </div>
      </div>
    )
  }

  const m = memberQ.data
  const fullName = `${m.first_name} ${m.last_name}`.trim()
  const typeLabel = m.member_type === 'trainer' ? 'Formateur / Stagiaire'
                  : m.member_type === 'freelance' ? 'Freelance' : 'Salarié'
  const statusStyle = m.account_status === 'active'
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : m.account_status === 'suspended'
    ? 'bg-red-500/10 text-red-600 dark:text-red-400'
    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
  const statusLabel = m.account_status === 'active' ? 'Actif' : m.account_status === 'suspended' ? 'Suspendu' : 'Invité'

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`${base}/equipe`}>
          <Button variant="secondary" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Équipe
          </Button>
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-blue-50/20 dark:to-blue-950/10 p-5 flex flex-col md:flex-row md:items-center gap-5 shadow-sm">
        {m.avatar_url ? (
          <img src={m.avatar_url} alt={fullName}
               className="w-24 h-24 rounded-2xl object-cover flex-shrink-0 ring-4 ring-white dark:ring-slate-800 shadow-md" />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-500 flex items-center justify-center text-white text-3xl font-black flex-shrink-0 ring-4 ring-white dark:ring-slate-800 shadow-md">
            {fullName.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate tracking-tight">{fullName}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusStyle}`}>● {statusLabel}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
              {typeLabel}
            </span>
            {m.statut === 'actif' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                ● HR actif
              </span>
            )}
          </div>
          {(m.poste || m.job_title) && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" /> {m.poste || m.job_title}
              {m.departement && <span className="opacity-50">·</span>}
              {m.departement && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {m.departement}</span>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {m.email}</span>
            {m.telephone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {m.telephone}</span>}
            {m.date_embauche && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Embauché le {fmtDate(m.date_embauche)}
              </span>
            )}
            {!m.date_embauche && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Membre depuis {fmtDate(m.created_at)}
              </span>
            )}
          </div>
        </div>

        <Button
          variant="secondary"
          className="flex-shrink-0 self-start"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="w-4 h-4" /> Modifier
        </Button>
      </div>

      {/* Édition de la fiche — même formulaire que « Ajouter un salarié »
          côté page Équipe, pour qu'un champ corrigé le soit partout.

          Le mappage est explicite parce que les deux APIs de cette table
          ne parlent pas le même vocabulaire : /api/team renvoie
          first_name/last_name, le CRUD qui enregistre attend nom/prenom.
          Le confondre écrirait le prénom dans le nom. */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier la fiche de {fullName}</DialogTitle>
          </DialogHeader>
          <TeamMemberForm
            member={{
              id:            m.id,
              created_at:    m.created_at,
              nom:           m.last_name  ?? '',
              prenom:        m.first_name ?? '',
              email:         m.email      ?? null,
              telephone:     m.telephone  ?? null,
              poste:         m.poste      ?? null,
              departement:   m.departement ?? null,
              role:          m.role       ?? null,
              salaire_base:  Number(m.salaire_base) || 0,
              date_embauche: m.date_embauche ? String(m.date_embauche).slice(0, 10) : null,
              statut:        m.statut,
              member_type:   m.member_type,
            } as TeamMember}
            onClose={() => setEditOpen(false)}
            /* La fiche est lue par une requête distincte de la liste :
               sans cette invalidation, l'écran garderait les anciennes
               valeurs juste après l'enregistrement. */
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['team-member', id] })
              qc.invalidateQueries({ queryKey: ['team-mgmt'] })
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><User className="w-4 h-4 mr-1.5" /> Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="compte"><CircleDollarSign className="w-4 h-4 mr-1.5" /> Compte</TabsTrigger>
          <TabsTrigger value="conges"><CalendarDays className="w-4 h-4 mr-1.5" /> Congés</TabsTrigger>
          <TabsTrigger value="projets"><FolderKanban className="w-4 h-4 mr-1.5" /> Projets & tâches</TabsTrigger>
          <TabsTrigger value="access"><ShieldCheck className="w-4 h-4 mr-1.5" /> Accès SOPs</TabsTrigger>
          <TabsTrigger value="messagerie"><MessageCircle className="w-4 h-4 mr-1.5" /> Messagerie</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="w-4 h-4 mr-1.5" /> Journal</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab memberId={id!} member={m} tenantBase={base} /></TabsContent>
        <TabsContent value="compte"><CompteTab memberId={id!} memberName={fullName} /></TabsContent>
        <TabsContent value="conges"><CongesTab memberId={id!} /></TabsContent>
        <TabsContent value="projets"><ProjetsTab memberId={id!} member={m} tenantBase={base} /></TabsContent>
        <TabsContent value="access"><AccessTab access={m.access ?? []} /></TabsContent>
        <TabsContent value="messagerie"><MessagerieTab memberId={id!} memberName={fullName} /></TabsContent>
        <TabsContent value="activity"><ActivityTab memberId={id!} initialActivity={m.activity ?? []} /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 1 — Vue d'ensemble
═══════════════════════════════════════════════════════════════════ */
function OverviewTab({ memberId, member, tenantBase }: { memberId: string; member: any; tenantBase: string }) {
  const financeQ  = useQuery({ queryKey: ['team-finance',   memberId], queryFn: () => teamMgmtApi.finance(memberId) })
  const projectsQ = useQuery({ queryKey: ['team-projects',  memberId], queryFn: () => teamMgmtApi.projects(memberId) })
  const perfQ     = useQuery({ queryKey: ['team-perf',      memberId], queryFn: () => teamMgmtApi.performance(memberId) })
  const leavesQ   = useQuery({ queryKey: ['team-leaves',    memberId], queryFn: () => teamMgmtApi.leaves(memberId) })

  const kpi = useMemo(() => {
    const year = new Date().getFullYear()
    const payroll  = financeQ.data?.payroll ?? []
    const advances = financeQ.data?.advances ?? []
    const payments = financeQ.data?.payments ?? []
    const totalPaidThisYear = payments
      .filter((p: any) => p.is_paid && new Date(p.date).getFullYear() === year)
      .reduce((s: number, p: any) => s + Number(p.montant || 0), 0)
    const dueAdvances = advances
      .filter((a: any) => a.statut !== 'Remboursé' && !a.date_remboursement)
      .reduce((s: number, a: any) => s + Number(a.montant || 0), 0)
    const currentMonthPayroll = payroll.find((p: any) =>
      new Date(p.month).getMonth() === new Date().getMonth() &&
      new Date(p.month).getFullYear() === year
    )
    /* Salaire base : privilégier la valeur HR fixe (member.salaire_base) sinon
       dernier bulletin. Certains nouveaux membres n'ont pas encore de payroll. */
    const salaryBase = Number(currentMonthPayroll?.salaire_base ?? member?.salaire_base ?? 0)
    return {
      salaryBase,
      totalPaidThisYear,
      dueAdvances,
      projectsCount: projectsQ.data?.length ?? 0,
    }
  }, [financeQ.data, projectsQ.data, member?.salaire_base])

  const tasksCounts = useMemo(() => {
    const tasks = member.tasks ?? []
    return {
      total: tasks.length,
      done: tasks.filter((t: any) => t.status === 'done').length,
      inProgress: tasks.filter((t: any) => t.status === 'in_progress').length,
      todo: tasks.filter((t: any) => t.status === 'todo').length,
    }
  }, [member.tasks])

  /* Temps de travail (agrégats venant du backend) */
  const time = useMemo(() => {
    const t = member?.time_stats ?? {}
    const daily = (member?.daily_hours ?? []) as { day: string; seconds: number }[]
    const total  = Number(t.total_seconds  ?? 0)
    const today  = Number(t.today_seconds  ?? 0)
    const week   = Number(t.week_seconds   ?? 0)
    const month  = Number(t.month_seconds  ?? 0)
    const active = Number(t.active_days    ?? 0)
    /* Moyenne quotidienne sur les jours réellement actifs */
    const avgPerActiveDay = active > 0 ? Math.round(total / active) : 0
    return { total, today, week, month, active, avgPerActiveDay, daily }
  }, [member?.time_stats, member?.daily_hours])

  /* Présence & ancienneté */
  const presence = useMemo(() => {
    const payroll = financeQ.data?.payroll ?? []
    const leaves  = leavesQ.data ?? []
    const daysWorked  = payroll.reduce((s: number, p: any) => s + Number(p.jours_travailles ?? 0), 0)
    const daysAbsent  = payroll.reduce((s: number, p: any) => s + Number(p.jours_absents   ?? 0), 0)
    const leavesTaken = leaves
      .filter((r: any) => r.statut === 'Approuvé' || r.statut === 'approuve')
      .reduce((s: number, r: any) => s + Number(r.nb_jours ?? r.jours ?? 0), 0)

    /* Ancienneté depuis la date d'embauche (fallback : created_at) */
    const startIso = member?.date_embauche || member?.created_at
    let tenureLabel = '—'
    if (startIso) {
      const start = new Date(startIso)
      const now   = new Date()
      const totalMonths = Math.max(0,
        (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
      )
      const years  = Math.floor(totalMonths / 12)
      const months = totalMonths % 12
      if (years > 0 && months > 0) tenureLabel = `${years} an${years > 1 ? 's' : ''} ${months} m`
      else if (years > 0)          tenureLabel = `${years} an${years > 1 ? 's' : ''}`
      else if (months > 0)         tenureLabel = `${months} mois`
      else                         tenureLabel = 'Moins d\'un mois'
    }
    const tenureDays = startIso
      ? Math.max(1, Math.round((Date.now() - new Date(startIso).getTime()) / 86400000))
      : 0
    return { daysWorked, daysAbsent, leavesTaken, tenureLabel, tenureDays }
  }, [financeQ.data, leavesQ.data, member?.date_embauche, member?.created_at])

  const completionRate = tasksCounts.total > 0
    ? Math.round((tasksCounts.done / tasksCounts.total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Wallet         className="w-5 h-5" />} label="Salaire base"       value={fmtMAD(kpi.salaryBase)}         tone="blue" />
        <KpiCard icon={<TrendingUp     className="w-5 h-5" />} label={`Payé ${new Date().getFullYear()}`} value={fmtMAD(kpi.totalPaidThisYear)} tone="emerald" />
        <KpiCard icon={<TrendingDown   className="w-5 h-5" />} label="Avances dues"       value={fmtMAD(kpi.dueAdvances)}        tone="amber" />
        <KpiCard icon={<FolderKanban   className="w-5 h-5" />} label="Projets assignés"   value={String(kpi.projectsCount)}      tone="violet" />
      </div>

      {/* Temps de travail — heures/jour, semaine, mois */}
      <WorkTimePanel time={time} />

      {/* Identité + Présence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fiche identité HR complète */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
            <IdCard className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Fiche du salarié</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <InfoRow icon={User}         label="Nom complet"        value={`${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() || '—'} />
            <InfoRow icon={Mail}         label="Email pro"          value={member.email || '—'} />
            <InfoRow icon={Phone}        label="Téléphone"          value={member.telephone || '—'} />
            <InfoRow icon={Briefcase}    label="Poste"              value={member.poste || member.job_title || '—'} />
            <InfoRow icon={Building2}    label="Département"        value={member.departement || '—'} />
            <InfoRow icon={ShieldCheck}  label="Rôle d'accès"       value={(member.role || '—').toUpperCase()} />
            <InfoRow icon={Calendar}     label="Date d'embauche"    value={fmtDate(member.date_embauche)} />
            <InfoRow icon={BadgeCheck}   label="Statut RH"          value={
              member.statut === 'actif'  ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">● Actif</span>
              : member.statut === 'conge' ? <span className="text-amber-600 dark:text-amber-400 font-medium">● En congé</span>
              : member.statut === 'inactif' ? <span className="text-slate-500 font-medium">● Inactif</span>
              : '—'
            } />
            <InfoRow icon={Zap}          label="Type"               value={
              member.member_type === 'trainer' ? '🎓 Formateur / Stagiaire'
              : member.member_type === 'freelance' ? '🧑‍💻 Freelance'
              : '💼 Employé'
            } />
            <InfoRow icon={Wallet}       label="Salaire base HR"    value={fmtMAD(Number(member.salaire_base ?? 0))} />
          </div>
        </div>

        {/* Présence & ancienneté */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Timer className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Présence & ancienneté</h3>
          </div>
          <div className="space-y-2.5">
            <PresenceRow icon={Award}       tone="text-violet-500"  label="Ancienneté"       value={presence.tenureLabel} sub={presence.tenureDays > 0 ? `${presence.tenureDays} j au total` : undefined} />
            <PresenceRow icon={CheckCircle2} tone="text-emerald-500" label="Jours travaillés" value={`${presence.daysWorked} j`} sub="cumul bulletins" />
            <PresenceRow icon={XCircle}     tone="text-red-500"     label="Jours absents"    value={`${presence.daysAbsent} j`} sub="hors congés" />
            <PresenceRow icon={CalendarDays} tone="text-amber-500"  label="Congés approuvés" value={`${presence.leavesTaken} j`} sub="cumul" />
            <PresenceRow icon={Clock}       tone="text-blue-500"    label="Dernière connexion" value={member.last_login_at ? fmtDate(member.last_login_at) : 'Jamais'} />
          </div>
        </div>
      </div>

      {/* Tâches + taux de complétion */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Tâches
          </h3>
          {tasksCounts.total > 0 && (
            <span className="text-xs font-semibold text-foreground">
              {completionRate}% terminées
            </span>
          )}
        </div>
        {tasksCounts.total > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${completionRate}%` }} />
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-center">
          <StatBox value={tasksCounts.total}      label="Total" />
          <StatBox value={tasksCounts.done}       label="Terminées" tone="emerald" />
          <StatBox value={tasksCounts.inProgress} label="En cours"  tone="blue" />
          <StatBox value={tasksCounts.todo}       label="À faire"   tone="amber" />
        </div>
      </div>

      {/* Projets assignés (résumé rapide) */}
      {projectsQ.data && projectsQ.data.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5" /> Projets assignés ({projectsQ.data.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {projectsQ.data.slice(0, 6).map((p: any) => (
              <Link
                key={p.id}
                to={`${tenantBase}/projets/${p.id}`}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white flex-shrink-0">
                  <FolderKanban className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.titre ?? p.title ?? 'Projet'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {p.client_nom ? `${p.client_nom} · ` : ''}{p.statut ?? p.status ?? '—'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Performance */}
      {perfQ.data && perfQ.data.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Performance (derniers mois)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Mois</th>
                  <th className="py-2 pr-3">Tâches ✓/⌛</th>
                  <th className="py-2 pr-3">Deals gagnés</th>
                  <th className="py-2 pr-3">CA généré</th>
                  <th className="py-2 pr-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {perfQ.data.slice(0, 6).map((p: any) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-medium">{p.mois}</td>
                    <td className="py-2 pr-3">{p.taches_completees}/{p.taches_assignees}</td>
                    <td className="py-2 pr-3">{p.deals_gagnes}/{p.deals_assignes}</td>
                    <td className="py-2 pr-3">{fmtMAD(Number(p.chiffre_affaires))}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {p.note_performance}/10
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function fmtHours(seconds: number): string {
  if (!seconds || seconds < 60) return '0 h'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${String(m).padStart(2, '0')}`
}

function WorkTimePanel({ time }: {
  time: {
    total: number; today: number; week: number; month: number
    active: number; avgPerActiveDay: number
    daily: { day: string; seconds: number }[]
  }
}) {
  /* Sparkline : normaliser les 14 derniers jours (avec zéros pour les manquants) */
  const chart = useMemo(() => {
    const days: { day: string; seconds: number }[] = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const found = time.daily.find(x => x.day.slice(0, 10) === key)
      days.push({ day: key, seconds: found ? Number(found.seconds) : 0 })
    }
    const max = Math.max(1, ...days.map(d => d.seconds))
    return { days, max }
  }, [time.daily])

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5" /> Temps de travail
        </h3>
        {time.total > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {time.active} jour{time.active > 1 ? 's' : ''} actif{time.active > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <TimeKpi icon={Clock}       label="Aujourd'hui"   value={fmtHours(time.today)} tone="blue" />
        <TimeKpi icon={CalendarDays} label="Cette semaine" value={fmtHours(time.week)}  tone="emerald" />
        <TimeKpi icon={Calendar}    label="Ce mois-ci"    value={fmtHours(time.month)} tone="violet" />
        <TimeKpi icon={Timer}       label="Moy. par jour" value={fmtHours(time.avgPerActiveDay)} tone="amber" />
        <TimeKpi icon={Award}       label="Total cumulé"  value={fmtHours(time.total)} tone="rose" />
      </div>

      {/* Sparkline 14 jours */}
      <div className="mt-4">
        <div className="flex items-end gap-1 h-16">
          {chart.days.map((d) => {
            const pct = (d.seconds / chart.max) * 100
            const isToday = d.day === new Date().toISOString().slice(0, 10)
            const hasWork = d.seconds > 0
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center justify-end h-full group/bar relative"
                title={`${new Date(d.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtHours(d.seconds)}`}
              >
                <div
                  className={cn(
                    'w-full rounded-t-sm transition-all',
                    !hasWork ? 'bg-muted' : isToday ? 'bg-blue-500' : 'bg-blue-500/60 group-hover/bar:bg-blue-500',
                  )}
                  style={{ height: hasWork ? `${Math.max(6, pct)}%` : '4px' }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
          <span>Il y a 13 j</span>
          <span>14 derniers jours</span>
          <span>Aujourd'hui</span>
        </div>
      </div>

      {time.total === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground text-center">
          Aucune heure enregistrée. Le temps s'accumule automatiquement quand une tâche est démarrée (bouton ▶).
        </p>
      )}
    </div>
  )
}

function TimeKpi({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: string; tone: 'blue'|'emerald'|'violet'|'amber'|'rose'
}) {
  const tones = {
    blue:    'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    violet:  'text-violet-600 dark:text-violet-400 bg-violet-500/10',
    amber:   'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    rose:    'text-rose-600 dark:text-rose-400 bg-rose-500/10',
  }
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', tones[tone])}>
          <Icon className="w-3 h-3" />
        </div>
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground break-words">{value}</p>
      </div>
    </div>
  )
}

function PresenceRow({ icon: Icon, tone, label, value, sub }: {
  icon: React.ElementType; tone: string; label: string; value: React.ReactNode; sub?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0', tone)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground truncate">{value}</p>
        {sub && <p className="text-[10.5px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'blue'|'emerald'|'amber'|'violet' }) {
  const tones = {
    blue:    'from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/20',
    emerald: 'from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    amber:   'from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20',
    violet:  'from-violet-500/10 to-violet-500/5 text-violet-600 dark:text-violet-400 border-violet-500/20',
  }
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3 ${tones[tone]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="opacity-80">{icon}</span>
      </div>
      <p className="text-lg md:text-xl font-bold text-foreground truncate">{value}</p>
      <p className="text-[11px] uppercase tracking-wider opacity-80">{label}</p>
    </div>
  )
}

function StatBox({ value, label, tone }: { value: number; label: string; tone?: 'emerald'|'blue'|'amber' }) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    blue:    'text-blue-600 dark:text-blue-400',
    amber:   'text-amber-600 dark:text-amber-400',
  }
  return (
    <div className="rounded-lg bg-muted/30 border border-border p-2">
      <p className={`text-xl font-bold ${tone ? tones[tone] : 'text-foreground'}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 2 — Compte / Extrait comptable
═══════════════════════════════════════════════════════════════════ */
function CompteTab({ memberId, memberName }: { memberId: string; memberName: string }) {
  const financeQ = useQuery({ queryKey: ['team-finance', memberId], queryFn: () => teamMgmtApi.finance(memberId) })

  const entries = useMemo<FinanceEntry[]>(() => {
    if (!financeQ.data) return []
    const list: FinanceEntry[] = []

    /* Payroll → salaire brut (crédit) + primes (crédit) + deductions (débit) + avances (débit) */
    for (const p of financeQ.data.payroll) {
      const monthLabel = fmtMonth(p.month)
      if (Number(p.salaire_base) > 0) {
        list.push({ date: p.month, type: 'salaire', label: `Salaire — ${monthLabel}`, debit: 0, credit: Number(p.salaire_base), meta: `${p.jours_travailles}j travaillés` })
      }
      if (Number(p.primes) > 0) {
        list.push({ date: p.month, type: 'prime', label: `Prime — ${monthLabel}`, debit: 0, credit: Number(p.primes), meta: p.note ?? undefined })
      }
      if (Number(p.deductions) > 0) {
        list.push({ date: p.month, type: 'retenue', label: `Retenues — ${monthLabel}`, debit: Number(p.deductions), credit: 0, meta: `${p.jours_absents}j absents` })
      }
      if (Number(p.avances) > 0) {
        list.push({ date: p.month, type: 'avance', label: `Avance déduite — ${monthLabel}`, debit: Number(p.avances), credit: 0 })
      }
    }

    /* Advances → montant versé (débit — l'entreprise l'a payé au membre) */
    for (const a of financeQ.data.advances) {
      list.push({
        date: a.date_demande,
        type: 'avance',
        label: `Avance versée${a.note ? ` — ${a.note}` : ''}`,
        debit: 0,
        credit: 0,
        meta: a.statut,
      })
      // On ne double-compte pas ici : l'avance déjà réduite dans payroll est comptée là.
    }

    /* Paiements réels (team_payments) */
    for (const p of financeQ.data.payments) {
      if (!p.is_paid) continue
      list.push({
        date: p.date,
        type: 'paiement',
        label: `Paiement ${p.type}${p.projet ? ` — ${p.projet}` : ''}`,
        debit: Number(p.montant),
        credit: 0,
        meta: p.notes ?? undefined,
      })
    }

    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return list
  }, [financeQ.data])

  const totals = useMemo(() => {
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
    return { totalCredit, totalDebit, solde: totalCredit - totalDebit }
  }, [entries])

  const exportCSV = () => {
    const rows = [
      ['Date', 'Type', 'Libellé', 'Débit', 'Crédit', 'Solde'],
      ...entries.map((e, i) => {
        const soldeAt = entries.slice(0, i + 1).reduce((s, x) => s + x.credit - x.debit, 0)
        return [e.date, e.type, e.label, e.debit || '', e.credit || '', soldeAt]
      }),
      ['', '', 'TOTAUX', totals.totalDebit, totals.totalCredit, totals.solde],
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `compte_${memberName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  if (financeQ.isLoading) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Chargement…</div>

  return (
    <div className="space-y-4">
      {/* Totaux */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
          <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold">Total dû (crédit)</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{fmtMAD(totals.totalCredit)}</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5 p-4">
          <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-300 font-semibold">Total payé (débit)</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{fmtMAD(totals.totalDebit)}</p>
        </div>
        <div className={`rounded-xl border p-4 ${totals.solde >= 0 ? 'border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5' : 'border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5'}`}>
          <p className={`text-xs uppercase tracking-wider font-semibold ${totals.solde >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'}`}>
            Solde {totals.solde >= 0 ? 'à payer' : 'en trop'}
          </p>
          <p className={`text-2xl font-bold mt-1 ${totals.solde >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {fmtMAD(Math.abs(totals.solde))}
          </p>
        </div>
      </div>

      {/* Table + Export */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Extrait comptable</h3>
          <Button size="sm" variant="secondary" onClick={exportCSV} disabled={entries.length === 0}>
            <FileDown className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
        </div>

        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Aucun mouvement financier enregistré.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground bg-muted/30 border-b border-border">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Libellé</th>
                  <th className="py-2 px-3 text-right">Débit</th>
                  <th className="py-2 px-3 text-right">Crédit</th>
                  <th className="py-2 px-3 text-right">Solde</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const soldeAt = entries.slice(0, i + 1).reduce((s, x) => s + x.credit - x.debit, 0)
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="py-2 px-3">
                        <TypeBadge type={e.type} />
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-medium">{e.label}</div>
                        {e.meta && <div className="text-[11px] text-muted-foreground">{e.meta}</div>}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-red-600 dark:text-red-400">
                        {e.debit > 0 ? fmtMAD(e.debit) : ''}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {e.credit > 0 ? fmtMAD(e.credit) : ''}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono font-semibold ${soldeAt >= 0 ? 'text-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
                        {fmtMAD(soldeAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: FinanceEntry['type'] }) {
  const map = {
    salaire:  { label: '💼 Salaire', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    prime:    { label: '⭐ Prime',    cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    avance:   { label: '⚡ Avance',   cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    retenue:  { label: '📉 Retenue',  cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
    paiement: { label: '💸 Paiement', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  }
  const { label, cls } = map[type]
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${cls}`}>{label}</span>
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 3 — Congés & absences
═══════════════════════════════════════════════════════════════════ */
function CongesTab({ memberId }: { memberId: string }) {
  const q = useQuery({ queryKey: ['team-leaves', memberId], queryFn: () => teamMgmtApi.leaves(memberId) })

  const totals = useMemo(() => {
    const rows = q.data ?? []
    return {
      total: rows.length,
      approuves: rows.filter((r: any) => r.statut === 'Approuvé').length,
      jours: rows.filter((r: any) => r.statut === 'Approuvé').reduce((s: number, r: any) => s + Number(r.nb_jours || 0), 0),
    }
  }, [q.data])

  if (q.isLoading) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Chargement…</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatBox value={totals.total} label="Demandes" />
        <StatBox value={totals.approuves} label="Approuvées" tone="emerald" />
        <StatBox value={totals.jours} label="Jours pris" tone="blue" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        {(q.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Aucun congé enregistré.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground bg-muted/30 border-b border-border">
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Du</th>
                  <th className="py-2 px-3">Au</th>
                  <th className="py-2 px-3">Jours</th>
                  <th className="py-2 px-3">Statut</th>
                  <th className="py-2 px-3">Motif</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((l: any) => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 px-3 font-medium">{l.type_conge}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{fmtDate(l.date_debut)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{fmtDate(l.date_fin)}</td>
                    <td className="py-2 px-3 font-mono">{l.nb_jours}</td>
                    <td className="py-2 px-3"><LeaveStatusBadge status={l.statut} /></td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">{l.motif ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LeaveStatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; cls: string }> = {
    'Approuvé':   { icon: <CheckCircle2 className="w-3 h-3" />, cls: 'bg-emerald-500/10 text-emerald-600' },
    'Refusé':     { icon: <XCircle className="w-3 h-3" />,       cls: 'bg-red-500/10 text-red-600' },
    'En attente': { icon: <Clock className="w-3 h-3" />,          cls: 'bg-amber-500/10 text-amber-600' },
  }
  const s = map[status] ?? { icon: null, cls: 'bg-muted text-muted-foreground' }
  return <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${s.cls}`}>{s.icon} {status}</span>
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 4 — Projets & tâches assignés
═══════════════════════════════════════════════════════════════════ */
function ProjetsTab({ memberId, member, tenantBase }: { memberId: string; member: any; tenantBase: string }) {
  const q = useQuery({ queryKey: ['team-projects', memberId], queryFn: () => teamMgmtApi.projects(memberId) })
  const tasks = member.tasks ?? []

  return (
    <div className="space-y-4">
      {/* Projets */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Projets assignés ({q.data?.length ?? 0})</h3>
        </div>
        {q.isLoading ? (
          <div className="p-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline text-muted-foreground" /></div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Aucun projet assigné.</div>
        ) : (
          <div className="divide-y divide-border">
            {(q.data ?? []).map((p: any) => (
              <Link key={p.id} to={`${tenantBase}/projets/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/20 transition">
                <div className="w-1 h-10 rounded-full bg-gradient-to-b from-blue-500 to-cyan-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground truncate">{p.nom}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{p.role}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.client_nom ? `${p.client_nom} · ` : ''}{p.statut} · {p.progression}%
                    {p.date_fin_prevue ? ` · Livraison ${fmtDate(p.date_fin_prevue)}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-mono font-semibold">{fmtMAD(Number(p.budget))}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Budget</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Tâches */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tâches ({tasks.length})</h3>
        </div>
        {tasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Aucune tâche.</div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((t: any) => (
              <div key={t.id} className="p-3 hover:bg-muted/20">
                <div className="flex items-center gap-2">
                  <TaskStatusIcon status={t.status} />
                  <p className="font-medium text-sm flex-1 truncate">{t.title}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                    t.priority === 'urgent' ? 'bg-red-500/10 text-red-600' :
                    t.priority === 'high'   ? 'bg-amber-500/10 text-amber-600' :
                    t.priority === 'low'    ? 'bg-muted text-muted-foreground' :
                                              'bg-blue-500/10 text-blue-600'
                  }`}>{t.priority}</span>
                </div>
                {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                  {t.due_date && <span>Échéance {fmtDate(t.due_date)}</span>}
                  <span>Créée {fmtDate(t.created_at)}</span>
                  {t.completed_at && <span className="text-emerald-600">Terminée {fmtDate(t.completed_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskStatusIcon({ status }: { status: string }) {
  if (status === 'done')        return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
  if (status === 'in_progress') return <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />
  return <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 5 — Accès SOPs
═══════════════════════════════════════════════════════════════════ */
function AccessTab({ access }: { access: Array<{ sop_category: string; access_level: string; granted_at: string }> }) {
  if (access.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Aucun accès SOPs accordé pour l'instant.
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Accès accordés ({access.length})</h3>
      </div>
      <div className="divide-y divide-border">
        {access.map(a => (
          <div key={a.sop_category} className="p-3 flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">{sopCategoryLabel(a.sop_category)}</p>
              <p className="text-[11px] text-muted-foreground">Depuis {fmtDate(a.granted_at)}</p>
            </div>
            <AccessBadge level={a.access_level} />
          </div>
        ))}
      </div>
    </div>
  )
}

function AccessBadge({ level }: { level: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    read:     { label: '👁 Lecture',   cls: 'bg-blue-500/10 text-blue-600' },
    complete: { label: '✓ Compléter', cls: 'bg-emerald-500/10 text-emerald-600' },
    edit:     { label: '✏ Édition',   cls: 'bg-violet-500/10 text-violet-600' },
  }
  const s = map[level] ?? { label: level, cls: 'bg-muted text-muted-foreground' }
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 5 bis — Messagerie : avec qui cette personne peut échanger

   Par défaut, un employé ne joint que l'administration. Tout le reste
   se coche ici, une personne à la fois : c'est la réponse à « toutes
   les personnes ne doivent pas apparaître, seulement celles que j'ai
   sélectionnées ».

   Enregistrement immédiat, sans bouton : ces cases se cochent une par
   une, souvent en réaction à un besoin précis (« ouvre-lui l'accès à
   Ghita »), et un « Enregistrer » oublié laisserait l'accès fermé sans
   que personne ne s'en aperçoive.
═══════════════════════════════════════════════════════════════════ */
function MessagerieTab({ memberId, memberName }: { memberId: string; memberName: string }) {
  const qc = useQueryClient()
  const [justSaved, setJustSaved] = useState(false)

  /* Clé unique, réutilisée par la requête ET par la bascule optimiste :
     deux littéraux divergents ici, et la case se remettrait toute seule
     à sa position d'avant au premier rafraîchissement. */
  const cle = ['messages', 'contact-rules', memberId] as const

  const q = useQuery({
    queryKey: cle,
    queryFn:  () => messagesApi.contactRules(memberId),
  })

  const m = useMutation({
    mutationFn: (ids: string[]) => messagesApi.saveContactRules(memberId, ids),
    /* Bascule optimiste : la case répond au doigt, le serveur confirme
       derrière. En cas d'échec, on remet l'état précédent — une case
       qui reste cochée après un refus serait un mensonge. */
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: cle })
      const previous = qc.getQueryData<DmContactRules>(cle)
      qc.setQueryData<DmContactRules>(cle, old => (old ? { ...old, allowed: ids } : old))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData<DmContactRules>(cle, context.previous)
    },
    onSuccess: () => {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
      /* La liste des correspondants de CETTE personne change : on ne
         peut pas la rafraîchir à sa place, mais on invalide la nôtre au
         cas où l'autorisation nous concerne. */
      void qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })

  if (q.isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
  }
  if (q.isError) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Impossible de charger les autorisations.{' '}
        <button onClick={() => q.refetch()} className="text-blue-600 hover:underline">Réessayer</button>
      </div>
    )
  }

  const data = q.data!
  if (data.no_account) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <MessageCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          {memberName} n'a pas encore de compte : son invitation n'a pas été acceptée.
          Les autorisations de messagerie seront réglables dès sa première connexion.
        </p>
      </div>
    )
  }

  const allowed = new Set(data.allowed)
  const toggle = (p: DmPerson) => {
    if (p.toujours_autorise) return
    const next = new Set(allowed)
    if (next.has(p.user_id)) next.delete(p.user_id)
    else next.add(p.user_id)
    m.mutate([...next])
  }

  const administration = data.people.filter(p => p.toujours_autorise)
  const autres         = data.people.filter(p => !p.toujours_autorise)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-600" />
              Avec qui {memberName} peut échanger
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Dans sa messagerie, cette personne ne verra que les correspondants cochés ici.
              L'administration de l'espace reste toujours joignable — c'est la voie hiérarchique,
              elle ne se coupe pas.
            </p>
          </div>
          <span className={cn(
            'text-[11px] flex items-center gap-1.5 transition-opacity duration-200',
            m.isPending || justSaved ? 'opacity-100' : 'opacity-0',
            justSaved ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
          )}>
            {m.isPending
              ? <><Spinner className="w-3 h-3 animate-spin" /> Enregistrement…</>
              : <><Check className="w-3 h-3" /> Enregistré</>}
          </span>
        </div>
      </div>

      {administration.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="p-3 border-b border-border">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Administration — toujours joignable
            </h4>
          </div>
          <div className="divide-y divide-border">
            {administration.map(p => <PersonneLigne key={p.user_id} p={p} coche locked />)}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Le reste de l'équipe ({autres.filter(p => allowed.has(p.user_id)).length}/{autres.length} autorisé{autres.filter(p => allowed.has(p.user_id)).length > 1 ? 's' : ''})
          </h4>
          {autres.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => m.mutate(autres.map(p => p.user_id))}
                className="text-[11px] text-blue-600 hover:underline"
              >Tout autoriser</button>
              <button
                onClick={() => m.mutate([])}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >Tout retirer</button>
            </div>
          )}
        </div>
        {autres.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Personne d'autre dans cet espace pour l'instant.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {autres.map(p => (
              <PersonneLigne
                key={p.user_id}
                p={p}
                coche={allowed.has(p.user_id)}
                onToggle={() => toggle(p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PersonneLigne({ p, coche, locked, onToggle }: {
  p: DmPerson; coche: boolean; locked?: boolean; onToggle?: () => void
}) {
  const initiales = p.name.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onToggle}
      className={cn(
        'w-full p-3 flex items-center gap-3 text-left transition-colors',
        locked ? 'cursor-default' : 'hover:bg-muted/50',
      )}
    >
      <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white
                       text-[11px] font-bold flex items-center justify-center flex-shrink-0">
        {initiales || '?'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-foreground truncate">{p.name}</span>
        <span className="block text-[11px] text-muted-foreground truncate">
          {p.role || (p.kind === 'admin' ? 'Compte d\'administration' : 'Employé')} · {p.email}
        </span>
      </span>
      {locked ? (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-shrink-0">
          <Lock className="w-3 h-3" /> Toujours
        </span>
      ) : (
        <span className={cn(
          'w-10 h-5 rounded-full transition-all relative flex-shrink-0',
          coche ? 'bg-blue-600' : 'bg-border',
        )}>
          <span className={cn(
            'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all',
            coche ? 'right-0.5' : 'left-0.5',
          )} />
        </span>
      )}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 6 — Journal d'activité
═══════════════════════════════════════════════════════════════════ */
function ActivityTab({ memberId, initialActivity }: { memberId: string; initialActivity: any[] }) {
  const q = useQuery({
    queryKey: ['team-activity', memberId],
    queryFn: () => teamMgmtApi.activity(memberId, 200),
    initialData: initialActivity,
  })

  const items = q.data ?? []
  if (items.length === 0) {
    return <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Aucune activité enregistrée.</div>
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Journal ({items.length})</h3>
      </div>
      <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
        {items.map((a: any) => (
          <div key={a.id} className="p-3 flex items-start gap-3">
            <ActivityIcon type={a.action_type} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{humanizeAction(a.action_type)}</p>
              {a.action_details && Object.keys(a.action_details).length > 0 && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {JSON.stringify(a.action_details)}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {new Date(a.created_at).toLocaleString('fr-FR')}
                {a.ip_address && ` · ${a.ip_address}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4 flex-shrink-0'
  if (type === 'login')                return <User className={`${cls} text-emerald-500`} />
  if (type === 'invitation_sent')      return <Mail className={`${cls} text-blue-500`} />
  if (type === 'invitation_accepted')  return <CheckCircle2 className={`${cls} text-emerald-500`} />
  return <Activity className={`${cls} text-muted-foreground`} />
}

function humanizeAction(type: string) {
  const map: Record<string, string> = {
    login:                'Connexion',
    logout:               'Déconnexion',
    invitation_sent:      "Invitation envoyée",
    invitation_accepted:  'Invitation acceptée',
    password_reset:       'Réinitialisation de mot de passe',
    suspended:            'Compte suspendu',
    activated:            'Compte réactivé',
  }
  return map[type] ?? type
}
