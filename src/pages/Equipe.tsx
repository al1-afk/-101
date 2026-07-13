import { useState, useMemo, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Briefcase, Mail, Phone, Edit2, Trash2, Loader2,
  Users, DollarSign, CalendarDays, Shield, UserPlus, Check, X,
  Lock, Eye, Pencil, Trash, Download, ShieldCheck, TrendingUp,
  ClipboardList, ChevronDown, AlertCircle, CheckCircle2, Clock,
  FileText, Banknote, Wallet, KeyRound, RotateCcw, Save, AlertTriangle,
  GraduationCap,
} from 'lucide-react'
import { StagiairesTab } from '@/components/equipe/StagiairesTab'
import TeamSpaceTab from '@/components/equipe/TeamSpaceTab'
import StatsTab     from '@/components/equipe/StatsTab'
import { tenantApi, teamMgmtApi, type TeamMemberAccess } from '@/lib/api'
import { ALL_MODULES } from '@/components/layout/Sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useTeam, useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember, type TeamMember } from '@/hooks/useTeam'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Badge }  from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatCurrency, formatDate, getInitials, cn } from '@/lib/utils'
import { congesApi, salairesPaiementsApi } from '@/lib/api'
import {
  ROLE_LABELS, ROLE_COLORS, ROLE_PERMISSIONS,
  type Role, type Module, type Action,
} from '@/lib/permissions'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { equipeSchema } from '@/lib/importExportSchemas'

/* ─── Config ─────────────────────────────────────────────────────── */
const STATUT_CONFIG = {
  actif:   { label: 'Actif',    variant: 'success'   as const, dot: 'bg-emerald-500' },
  inactif: { label: 'Inactif',  variant: 'secondary' as const, dot: 'bg-slate-400'   },
  conge:   { label: 'En congé', variant: 'warning'   as const, dot: 'bg-amber-500'   },
}

const DEPT_COLORS: Record<string, string> = {
  Tech:    'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20',
  Design:  'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/20',
  Ventes:  'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20',
  Admin:   'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20',
}

const MODULE_LABELS: Partial<Record<Module, string>> = {
  clients: 'Clients', prospects: 'Prospects / CRM', factures: 'Factures',
  devis: 'Devis', contrats: 'Contrats', paiements: 'Paiements',
  depenses: 'Dépenses', finances: 'Finances', equipe: 'Équipe',
  fournisseurs: 'Fournisseurs', domaines: 'Domaines', hebergements: 'Hébergements',
  produits: 'Produits', statistiques: 'Statistiques', automatisations: 'Automatisations',
  parametres: 'Paramètres', activite: "Journal d'activité", conseiller_ia: 'Conseiller IA',
}

const ACTION_ICONS: Record<Action, React.ElementType> = {
  view: Eye, create: Plus, edit: Pencil, delete: Trash, export: Download,
}

/* ─── Congés types ───────────────────────────────────────────────── */
type CongeType   = 'annuel' | 'maladie' | 'exceptionnel' | 'sans_solde'
type CongeStatut = 'en_attente' | 'approuve' | 'refuse'

interface CongeRequest {
  id:          string
  member_id:   string
  member_nom:  string
  type:        CongeType
  date_debut:  string
  date_fin:    string
  jours:       number
  statut:      CongeStatut
  notes:       string
  created_at:  string
}

const CONGE_TYPE_CONFIG: Record<CongeType, { label: string; color: string; bg: string }> = {
  annuel:       { label: 'Congé annuel',    color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-500/10'    },
  maladie:      { label: 'Maladie',         color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-500/10'      },
  exceptionnel: { label: 'Exceptionnel',    color: 'text-purple-600 dark:text-purple-400',bg: 'bg-purple-50 dark:bg-purple-500/10' },
  sans_solde:   { label: 'Sans solde',      color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-500/10'  },
}

const CONGE_STATUT_CONFIG: Record<CongeStatut, { label: string; icon: React.ElementType; color: string }> = {
  en_attente: { label: 'En attente', icon: Clock,         color: 'text-amber-600 dark:text-amber-400'   },
  approuve:   { label: 'Approuvé',  icon: CheckCircle2,  color: 'text-emerald-600 dark:text-emerald-400' },
  refuse:     { label: 'Refusé',    icon: X,             color: 'text-red-600 dark:text-red-400'          },
}

/* ─── Salaire types ──────────────────────────────────────────────── */
interface SalaireEntry {
  member_id:    string
  prime:        number
  avance:       number
  absent_jours: number
  note:         string
}

interface SalairePaiement extends SalaireEntry {
  id:    string
  year:  number
  month: number
}

/* ─── Workspace members ──────────────────────────────────────────── */
interface WorkspaceMember {
  id: string; email: string; role: Role; status: 'pending' | 'active'; invited: string
}
function getWorkspaceMembers(): WorkspaceMember[] {
  try { return JSON.parse(localStorage.getItem('workspace_members') || '[]') } catch { return [] }
}
function saveWorkspaceMembers(m: WorkspaceMember[]) {
  localStorage.setItem('workspace_members', JSON.stringify(m))
}

/* ═══════════════════════════════════════════════════════════════════
   MEMBER FORM
═══════════════════════════════════════════════════════════════════ */
function TeamMemberForm({ member, onClose }: { member?: TeamMember; onClose: () => void }) {
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
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (member) await update.mutateAsync({ id: member.id, ...form })
    else        await create.mutateAsync(form as any)
    onClose()
  }

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
              {Object.entries(STATUT_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
          {member ? 'Mettre à jour' : 'Ajouter'}
        </Button>
      </div>
    </form>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CONGES TAB
═══════════════════════════════════════════════════════════════════ */
function CongesTab({ members }: { members: TeamMember[] }) {
  const qc = useQueryClient()
  const { data: conges = [] } = useQuery<CongeRequest[]>({
    queryKey: ['conges'],
    queryFn: () => congesApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<CongeRequest[]>,
  })
  const createMut = useMutation({
    mutationFn: (data: Omit<CongeRequest, 'id' | 'created_at'>) => congesApi.create(data as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conges'] }); toast.success('Demande de congé enregistrée'); setShowForm(false); setForm({ member_id: '', type: 'annuel', date_debut: '', date_fin: '', notes: '' }) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: CongeStatut }) => congesApi.update(id, { statut } as any),
    onSuccess: (_, { statut }) => { qc.invalidateQueries({ queryKey: ['conges'] }); toast.success(statut === 'approuve' ? 'Congé approuvé' : 'Congé refusé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const removeMut = useMutation({
    mutationFn: (id: string) => congesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conges'] }); toast.success('Demande supprimée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    member_id: '', type: 'annuel' as CongeType,
    date_debut: '', date_fin: '', notes: '',
  })

  const computeJours = (debut: string, fin: string) => {
    if (!debut || !fin) return 0
    const d1 = new Date(debut), d2 = new Date(fin)
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)
  }

  const submitConge = (e: React.FormEvent) => {
    e.preventDefault()
    const member = members.find(m => m.id === form.member_id)
    if (!member) return
    createMut.mutate({
      member_id:  form.member_id,
      member_nom: `${member.prenom} ${member.nom}`,
      type:       form.type,
      date_debut: form.date_debut,
      date_fin:   form.date_fin,
      jours:      computeJours(form.date_debut, form.date_fin),
      statut:     'en_attente',
      notes:      form.notes,
    })
  }

  const pending    = conges.filter(c => c.statut === 'en_attente').length
  const totalJours = conges.filter(c => c.statut === 'approuve').reduce((s, c) => s + c.jours, 0)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="card-premium p-3 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-500" />
          <div><p className="text-lg font-bold">{pending}</p><p className="text-xs text-muted-foreground">En attente</p></div>
        </div>
        <div className="card-premium p-3 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <div><p className="text-lg font-bold">{conges.filter(c => c.statut === 'approuve').length}</p><p className="text-xs text-muted-foreground">Approuvés</p></div>
        </div>
        <div className="card-premium p-3 flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-blue-500" />
          <div><p className="text-lg font-bold">{totalJours}</p><p className="text-xs text-muted-foreground">Jours accordés</p></div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{conges.length} demande(s)</p>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> Nouvelle demande
        </Button>
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        <div className="table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Membre</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Période</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Jours</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Statut</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {conges.map(c => {
              const tc = CONGE_TYPE_CONFIG[c.type]
              const sc = CONGE_STATUT_CONFIG[c.statut]
              const Icon = sc.icon
              return (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{c.member_nom}</p>
                    {c.notes && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{c.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', tc.color, tc.bg)}>{tc.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(c.date_debut)} → {formatDate(c.date_fin)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold text-foreground">{c.jours}j</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className={cn('flex items-center gap-1.5 text-xs font-medium', sc.color)}>
                      <Icon className="w-3.5 h-3.5" />
                      {sc.label}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {c.statut === 'en_attente' && (
                        <>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                            onClick={() => updateMut.mutate({ id: c.id, statut: 'approuve' })} title="Approuver">
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                            onClick={() => updateMut.mutate({ id: c.id, statut: 'refuse' })} title="Refuser">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-red-400"
                        onClick={() => removeMut.mutate(c.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
        </div>
        {conges.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune demande de congé</p>
          </div>
        )}
      </div>

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-500" /> Nouvelle demande de congé
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitConge} className="space-y-4">
            <div className="space-y-1.5">
              <label className="form-label">Membre *</label>
              <Select value={form.member_id} onValueChange={v => setForm(p => ({ ...p, member_id: v }))} required>
                <SelectTrigger><SelectValue placeholder="Choisir un membre…" /></SelectTrigger>
                <SelectContent>
                  {members.filter(m => m.statut !== 'inactif').map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.prenom} {m.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Type de congé</label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as CongeType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONGE_TYPE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Date début *</label>
                <Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Date fin *</label>
                <Input type="date" value={form.date_fin} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))} required />
              </div>
            </div>
            {form.date_debut && form.date_fin && (
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                Durée : {computeJours(form.date_debut, form.date_fin)} jour(s)
              </p>
            )}
            <div className="space-y-1.5">
              <label className="form-label">Notes / Justification</label>
              <AutocorrectTextarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="input-field resize-none h-16" placeholder="Motif, documents joints…" />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button type="submit" disabled={!form.member_id || !form.date_debut || !form.date_fin}>
                Enregistrer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SALAIRES TAB
═══════════════════════════════════════════════════════════════════ */
function SalairesTab({ members, detailBase, onEditMember }: {
  members: TeamMember[]
  detailBase: string
  onEditMember?: (m: TeamMember) => void
}) {
  const qc    = useQueryClient()
  const now   = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [entries, setEntries] = useState<Record<string, SalairePaiement>>({})
  const [editing, setEditing] = useState<string | null>(null)

  const { data: allSalairesRaw } = useQuery<SalairePaiement[]>({
    queryKey: ['salaires_paiements'],
    queryFn: () => salairesPaiementsApi.list() as Promise<SalairePaiement[]>,
  })
  /* Stable reference for the effect dep — destructure-default `= []`
     creates a fresh array every render and would loop the effect. */
  const allSalaires = useMemo(() => allSalairesRaw ?? [], [allSalairesRaw])

  useEffect(() => {
    const forPeriod = allSalaires.filter(s => s.year === year && s.month === month)
    const map: Record<string, SalairePaiement> = {}
    forPeriod.forEach(s => { map[s.member_id] = s })
    setEntries(map)
    setEditing(null)
  }, [allSalaires, year, month])

  const saveMut = useMutation({
    mutationFn: (s: SalairePaiement) =>
      s.id
        ? salairesPaiementsApi.update(s.id, { prime: s.prime, avance: s.avance, absent_jours: s.absent_jours, note: s.note } as any)
        : salairesPaiementsApi.create({ member_id: s.member_id, year, month, prime: s.prime, avance: s.avance, absent_jours: s.absent_jours, note: s.note } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['salaires_paiements'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const loadPeriod = (y: number, m: number) => {
    setYear(y); setMonth(m); setEditing(null)
  }

  const getEntry = (id: string): SalairePaiement =>
    entries[id] ?? { id: '', member_id: id, year, month, prime: 0, avance: 0, absent_jours: 0, note: '' }

  const updateEntry = (id: string, patch: Partial<SalaireEntry>) => {
    setEntries(prev => ({ ...prev, [id]: { ...getEntry(id), ...patch } }))
  }

  const saveEntry = (id: string) => {
    saveMut.mutate(getEntry(id))
    setEditing(null)
  }

  const actifs = members.filter(m => m.statut === 'actif')

  const totaux = useMemo(() => {
    return actifs.reduce((acc, m) => {
      const e = getEntry(m.id)
      const retenue = e.absent_jours > 0 ? Math.round((m.salaire_base / 26) * e.absent_jours) : 0
      const net = m.salaire_base + e.prime - e.avance - retenue
      return { base: acc.base + m.salaire_base, prime: acc.prime + e.prime, avance: acc.avance + e.avance, net: acc.net + net }
    }, { base: 0, prime: 0, avance: 0, net: 0 })
  }, [actifs, entries])

  const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

  const exportCSV = () => {
    const rows = [
      ['Nom', 'Poste', 'Salaire Base', 'Prime', 'Avance', 'Absences', 'Retenue', 'Net'],
      ...actifs.map(m => {
        const e = getEntry(m.id)
        const retenue = Math.round((m.salaire_base / 26) * e.absent_jours)
        const net = m.salaire_base + e.prime - e.avance - retenue
        return [`${m.prenom} ${m.nom}`, m.poste ?? '', m.salaire_base, e.prime, e.avance, e.absent_jours, retenue, net]
      }),
      ['', '', totaux.base, totaux.prime, totaux.avance, '', '', totaux.net],
    ]
    const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `salaires_${year}_${String(month).padStart(2,'0')}.csv`
    a.click()
    toast.success('Export CSV téléchargé')
  }

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={v => loadPeriod(year, +v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => loadPeriod(+v, month)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { label: 'Masse salariale', value: formatCurrency(totaux.base), icon: Banknote, color: 'text-blue-500' },
          { label: 'Primes total',    value: formatCurrency(totaux.prime), icon: TrendingUp, color: 'text-emerald-500' },
          { label: 'Avances total',   value: formatCurrency(totaux.avance), icon: Wallet, color: 'text-amber-500' },
          { label: 'Net à payer',     value: formatCurrency(totaux.net), icon: DollarSign, color: 'text-purple-500' },
        ].map(k => (
          <div key={k.label} className="card-premium p-3 flex items-center gap-3">
            <k.icon className={cn('w-5 h-5 flex-shrink-0', k.color)} />
            <div><p className="text-sm font-bold text-foreground">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        <div className="table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Membre</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Salaire base</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Prime</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Avance</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Absences</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Retenue</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground font-bold">Net</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {actifs.map(m => {
              const e = getEntry(m.id)
              const retenue = Math.round((m.salaire_base / 26) * e.absent_jours)
              const net = m.salaire_base + e.prime - e.avance - retenue
              const isEditing = editing === m.id

              return (
                <tr key={m.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`${detailBase}/${m.id}`}
                        className="flex items-center gap-2 flex-1 min-w-0 group/name"
                        title="Voir l'historique du salarié"
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">
                          {getInitials(`${m.prenom} ${m.nom}`)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-xs group-hover/name:text-blue-600 dark:group-hover/name:text-blue-400 truncate">
                            {m.prenom} {m.nom}
                          </p>
                          {m.poste && <p className="text-[10px] text-muted-foreground truncate">{m.poste}</p>}
                        </div>
                      </Link>
                      {onEditMember && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); onEditMember(m) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex-shrink-0"
                          title="Modifier la fiche du salarié"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground">
                    {formatCurrency(m.salaire_base)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <Input type="number" value={e.prime || ''} onChange={ev => updateEntry(m.id, { prime: +ev.target.value })}
                        className="w-24 text-right h-7 text-xs" placeholder="0" />
                    ) : (
                      <span className={cn('text-xs font-medium', e.prime > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                        {e.prime > 0 ? `+${formatCurrency(e.prime)}` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <Input type="number" value={e.avance || ''} onChange={ev => updateEntry(m.id, { avance: +ev.target.value })}
                        className="w-24 text-right h-7 text-xs" placeholder="0" />
                    ) : (
                      <span className={cn('text-xs font-medium', e.avance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                        {e.avance > 0 ? `-${formatCurrency(e.avance)}` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <Input type="number" value={e.absent_jours || ''} onChange={ev => updateEntry(m.id, { absent_jours: +ev.target.value })}
                        className="w-16 text-center h-7 text-xs mx-auto" placeholder="0" />
                    ) : (
                      <span className={cn('text-xs font-medium', e.absent_jours > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                        {e.absent_jours > 0 ? `${e.absent_jours}j` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn('text-xs', retenue > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground')}>
                      {retenue > 0 ? `-${formatCurrency(retenue)}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-foreground">{formatCurrency(net)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="icon" className="w-7 h-7"
                      onClick={() => isEditing ? saveEntry(m.id) : setEditing(m.id)}
                      title={isEditing ? 'Sauvegarder' : 'Modifier'}>
                      {isEditing ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Pencil className="w-3.5 h-3.5" />}
                    </Button>
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            <tr className="bg-muted/40 font-semibold border-t-2 border-border">
              <td className="px-4 py-3 text-xs text-foreground">Total ({actifs.length} membres actifs)</td>
              <td className="px-4 py-3 text-right text-xs">{formatCurrency(totaux.base)}</td>
              <td className="px-4 py-3 text-right text-xs text-emerald-600 dark:text-emerald-400">{totaux.prime > 0 ? `+${formatCurrency(totaux.prime)}` : '—'}</td>
              <td className="px-4 py-3 text-right text-xs text-amber-600 dark:text-amber-400">{totaux.avance > 0 ? `-${formatCurrency(totaux.avance)}` : '—'}</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(totaux.net)}</td>
              <td className="px-4 py-3" />
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   INVITE FORM
═══════════════════════════════════════════════════════════════════ */
/* ─── SOP categories pour les permissions ─────────────────────── */
const SOP_CATEGORIES = [
  { key: 'whatsapp',    label: 'Scripts WhatsApp' },
  { key: 'quick',       label: 'Réponses rapides' },
  { key: 'sales',       label: 'Process Commercial' },
  { key: 'onboarding',  label: 'Onboarding Client' },
  { key: 'delivery',    label: 'Livraison Projet' },
  { key: 'support',     label: 'Support Client' },
  { key: 'marketing',   label: 'Marketing & Ads' },
  { key: 'faq',         label: 'FAQ Interne' },
  { key: 'ai',          label: 'IA & Automatisation' },
  { key: 'projets',     label: 'Chef de projet' },
  { key: 'dev',         label: 'Développeur' },
  { key: 'media_buyer', label: 'Media Buyer' },
  { key: 'prospection', label: 'Prospection' },
  { key: 'designer',    label: 'Designer / Graphiste' },
  { key: 'commercial',  label: 'Commercial' },
  { key: 'community_manager', label: 'Community Manager' },
]

type AccessLevel = 'read' | 'complete' | 'edit'

function InviteForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [firstName,   setFirstName]   = useState('')
  const [lastName,    setLastName]    = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [jobTitle,    setJobTitle]    = useState('')
  const [memberType,  setMemberType]  = useState<'employee' | 'trainer' | 'freelance'>('employee')
  /* Per-SOP-category access (sop_categories field of the invite payload) */
  const [sopAccess, setSopAccess] = useState<Record<string, AccessLevel | 'none'>>({})
  const [loading, setLoading] = useState(false)
  const [inviteSent, setInviteSent] = useState<{ maskedToken: string; expiresAt: string } | null>(null)

  const setCat = (cat: string, lvl: AccessLevel | 'none') => setSopAccess(p => ({ ...p, [cat]: lvl }))

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error('Prénom, nom et email sont requis'); return
    }
    setLoading(true)
    try {
      const sop_categories: TeamMemberAccess[] = Object.entries(sopAccess)
        .filter(([, lvl]) => lvl && lvl !== 'none')
        .map(([category, level]) => ({ category, level: level as AccessLevel }))

      const res = await teamMgmtApi.invite({
        first_name:    firstName.trim(),
        last_name:     lastName.trim(),
        email:         email.trim(),
        phone:         phone.trim() || undefined,
        job_title:     jobTitle.trim() || undefined,
        member_type:   memberType,
        sop_categories,
      })

      qc.invalidateQueries({ queryKey: ['team_members'] })
      qc.invalidateQueries({ queryKey: ['team', 'members'] })
      toast.success(`Invitation envoyée à ${email}`)
      setInviteSent({ maskedToken: res.masked_token, expiresAt: res.expires_at })
    } catch (err: any) {
      toast.error(err?.message ?? 'Erreur lors de l\'invitation')
    } finally {
      setLoading(false)
    }
  }

  /* ── Step 2 : invitation créée — on ne montre PAS le token en clair.
     Seule empreinte (4+4) affichée pour corrélation avec le journal d'audit. */
  if (inviteSent) {
    const expiresLabel = new Date(inviteSent.expiresAt).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Invitation envoyée</p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              Un email a été envoyé à <strong>{email}</strong>. Lien valable jusqu'au {expiresLabel}.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Empreinte token (audit)
          </p>
          <p className="font-mono text-sm">{inviteSent.maskedToken}</p>
          <p className="text-[11px] text-muted-foreground">
            Le lien complet ne quitte jamais le serveur pour des raisons de sécurité.
            Si l'email n'arrive pas, utilisez « Renvoyer l'invitation ».
          </p>
        </div>

        <div className="flex items-center justify-end pt-2">
          <Button onClick={onClose}>Terminer</Button>
        </div>
      </div>
    )
  }

  /* ── Step 1 : formulaire ── */
  return (
    <form onSubmit={handleInvite} className="space-y-4">
      {/* Identité */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="form-label">Prénom *</label>
          <AutocorrectInput value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Ahmed" required />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Nom *</label>
          <AutocorrectInput value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Tazi" required />
        </div>
        <div className="space-y-1.5 col-span-2">
          <label className="form-label">Email *</label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ahmed@nextgital.com" required />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Téléphone</label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="06XXXXXXXX" />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Poste</label>
          <AutocorrectInput value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Développeur Web" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <label className="form-label">Type</label>
          <Select value={memberType} onValueChange={v => setMemberType(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">👔 Salarié</SelectItem>
              <SelectItem value="freelance">💼 Freelance</SelectItem>
              <SelectItem value="trainer">🎓 Stagiaire</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Permissions SOP par catégorie */}
      <div className="rounded-lg border border-border p-3 bg-muted/30 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> Accès aux SOPs
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setSopAccess(Object.fromEntries(SOP_CATEGORIES.map(c => [c.key, 'read' as const])))}
              className="text-[10px] px-2 py-0.5 rounded bg-background border border-border hover:border-blue-400">
              Tout lire
            </button>
            <button type="button" onClick={() => setSopAccess({})}
              className="text-[10px] px-2 py-0.5 rounded bg-background border border-border hover:border-red-400">
              Tout effacer
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Définis pour chaque catégorie ce que le membre peut faire (lecture seule, marquer comme fait, ou éditer).
        </p>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {SOP_CATEGORIES.map(cat => {
            const lvl = sopAccess[cat.key] ?? 'none'
            return (
              <div key={cat.key} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate">{cat.label}</span>
                <Select value={lvl} onValueChange={v => setCat(cat.key, v as any)}>
                  <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucun —</SelectItem>
                    <SelectItem value="read">👁 Lecture</SelectItem>
                    <SelectItem value="complete">✓ Compléter</SelectItem>
                    <SelectItem value="edit">✏ Édition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Créer l'invitation
        </Button>
      </div>
    </form>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   INVITATIONS TAB
═══════════════════════════════════════════════════════════════════ */
function InvitationsTab() {
  const [wMembers, setWMembers] = useState<WorkspaceMember[]>(getWorkspaceMembers)
  const [showInvite, setShowInvite] = useState(false)

  const reload = () => setWMembers(getWorkspaceMembers())
  const revoke = (id: string) => {
    const updated = wMembers.filter(m => m.id !== id)
    saveWorkspaceMembers(updated); setWMembers(updated)
    toast.success('Invitation révoquée')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{wMembers.length} invitation(s)</p>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <UserPlus className="w-4 h-4" /> Inviter un collaborateur
        </Button>
      </div>
      {wMembers.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <UserPlus className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Aucune invitation envoyée</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Invitez des collaborateurs à accéder à votre espace</p>
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Rôle</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Invité le</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {wMembers.map(m => (
                <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-foreground">{m.email}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', ROLE_COLORS[m.role])}>{ROLE_LABELS[m.role]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={m.status === 'active' ? 'success' : 'warning'}>
                      {m.status === 'active' ? 'Actif' : 'En attente'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(m.invited.slice(0, 10))}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400" onClick={() => revoke(m.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <Dialog open={showInvite} onOpenChange={v => { setShowInvite(v); if (!v) reload() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-500" /> Inviter un collaborateur
            </DialogTitle>
          </DialogHeader>
          <InviteForm onClose={() => { setShowInvite(false); reload() }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PERMISSIONS MATRIX
═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   MEMBER ACCESS MANAGER — per-user fine-grained module access
═══════════════════════════════════════════════════════════════════ */
interface TenantMember {
  user_id: string
  email:   string
  name:    string | null
  role:    string
  status:  string
}

function MemberAccessManager() {
  const { role: currentRole, userId } = useAuth()
  const isAdmin = currentRole === 'admin'

  const { data: members = [], isLoading } = useQuery<TenantMember[]>({
    queryKey: ['tenant-members'],
    queryFn:  () => tenantApi.members(),
    staleTime: 1000 * 60,
  })

  const [editing, setEditing] = useState<TenantMember | null>(null)

  if (!isAdmin) {
    return (
      <div className="card-premium p-4 flex items-center gap-3 text-sm text-muted-foreground">
        <Lock className="w-4 h-4" />
        Seul un administrateur peut gérer les accès des membres.
      </div>
    )
  }

  return (
    <>
      <div className="card-premium p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-sm">Accès par membre</h3>
            <Badge variant="outline" className="text-[10px]">{members.length}</Badge>
          </div>
          <span className="text-[11px] text-muted-foreground italic">
            Définit les modules visibles dans le menu de chaque collaborateur
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-xs text-muted-foreground italic text-center py-4">
            Aucun membre enregistré.
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Membre</th>
                  <th className="text-left px-3 py-2">Rôle</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map(m => {
                  const isSelf = m.user_id === userId
                  return (
                    <tr key={m.user_id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium text-sm">{m.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold',
                          ROLE_COLORS[m.role as Role])}>
                          {ROLE_LABELS[m.role as Role] ?? m.role}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={m.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                          {m.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isSelf || m.role === 'admin'}
                          onClick={() => setEditing(m)}
                          title={isSelf ? 'Vous ne pouvez pas restreindre vos propres accès'
                                : m.role === 'admin' ? 'Les admins ont accès à tout'
                                : 'Gérer les accès'}
                        >
                          <KeyRound className="w-3.5 h-3.5" /> Gérer accès
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <MemberAccessDialog
          member={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function MemberAccessDialog({ member, onClose }: { member: TenantMember; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-member-access', member.user_id],
    queryFn:  () => tenantApi.getAccess(member.user_id),
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [overrideOn, setOverrideOn] = useState<boolean>(false)

  /* Initialize when fetched */
  useEffect(() => {
    if (!data) return
    if (data.allowed_modules) {
      setOverrideOn(true)
      setSelected(new Set(data.allowed_modules))
    } else {
      setOverrideOn(false)
      setSelected(new Set())
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => tenantApi.setAccess(
      member.user_id,
      overrideOn ? Array.from(selected) : null,
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-members'] })
      qc.invalidateQueries({ queryKey: ['tenant-member-access', member.user_id] })
      toast.success(`Accès mis à jour pour ${member.name ?? member.email}`)
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allOn  = () => setSelected(new Set(ALL_MODULES.map(m => m.key)))
  const allOff = () => setSelected(new Set())

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-500" />
            Accès de {member.name ?? member.email}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-border p-3 bg-muted/30">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideOn}
                  onChange={(e) => setOverrideOn(e.target.checked)}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm font-medium">Restreindre les accès de ce membre</span>
              </label>
              <p className="text-xs text-muted-foreground mt-1 ml-6">
                Si décoché, le membre voit tous les modules autorisés par son rôle ({ROLE_LABELS[member.role as Role] ?? member.role}).
                Sinon, seuls les modules cochés ci-dessous lui seront visibles dans le menu.
              </p>
            </div>

            {overrideOn && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {selected.size} / {ALL_MODULES.length} module(s) sélectionné(s)
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={allOn}>Tout cocher</Button>
                    <Button size="sm" variant="ghost" onClick={allOff}>Tout décocher</Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[400px] overflow-y-auto rounded-md border border-border p-3">
                  {ALL_MODULES.map(m => {
                    const checked = selected.has(m.key)
                    return (
                      <label
                        key={m.key}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm',
                          checked ? 'bg-blue-50 dark:bg-blue-950/30 text-foreground' : 'hover:bg-muted/40',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(m.key)}
                          className="w-4 h-4 rounded border-border"
                        />
                        <span className="flex-1 truncate">{m.label}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{m.key}</span>
                      </label>
                    )
                  })}
                </div>

                {selected.size === 0 && (
                  <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Aucun module sélectionné — ce membre ne verra que les paramètres dans le menu.
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
              {data?.allowed_modules && (
                <Button
                  variant="ghost"
                  onClick={() => { setOverrideOn(false); setSelected(new Set()) }}
                  title="Revenir au défaut basé sur le rôle"
                >
                  <RotateCcw className="w-4 h-4" /> Réinitialiser
                </Button>
              )}
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="w-4 h-4" /> Enregistrer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TEAM MEMBERS ACCESS MANAGER — manage SOP category access per team_member
═══════════════════════════════════════════════════════════════════ */
function TeamMembersAccessManager() {
  const qc = useQueryClient()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const detailBase = tenantSlug ? `/${tenantSlug}/equipe` : '/equipe'
  const [showArchive, setShowArchive] = useState(false)
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team', 'members'],
    queryFn:  () => teamMgmtApi.list(),
    staleTime: 1000 * 60,
  })
  const { data: archived = [] } = useQuery({
    queryKey: ['team', 'members', 'archived'],
    queryFn:  () => teamMgmtApi.listArchived(),
    staleTime: 1000 * 60,
    enabled:  showArchive,
  })
  const [editing, setEditing] = useState<any | null>(null)

  const restoreMut = useMutation({
    mutationFn: (id: string) => teamMgmtApi.restore(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['team', 'members'] })
      qc.invalidateQueries({ queryKey: ['team', 'members', 'archived'] })
      toast.success('Membre restauré — une invitation lui a été renvoyée')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const [resendInfo, setResendInfo] = useState<{ member: any; maskedToken: string; expiresAt: string } | null>(null)
  const resendMut = useMutation({
    mutationFn: (id: string) => teamMgmtApi.resend(id),
    onSuccess: (res, id) => {
      const member = members.find((m: any) => m.id === id)
      setResendInfo({ member, maskedToken: res.masked_token, expiresAt: res.expires_at })
      toast.success('Invitation renvoyée')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const permanentDeleteMut = useMutation({
    mutationFn: (id: string) => teamMgmtApi.permanentDelete(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['team', 'members', 'archived'] })
      toast.success('Membre supprimé définitivement')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    active:    { label: 'Actif',     cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    invited:   { label: 'Invité',    cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    suspended: { label: 'Suspendu',  cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
    archived:  { label: 'Archivé',   cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  }

  const TYPE_LABEL: Record<string, string> = {
    employee:  '👔 Salarié',
    freelance: '💼 Freelance',
    trainer:   '🎓 Stagiaire',
  }

  return (
    <>
      <div className="card-premium p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            <h3 className="font-semibold text-sm">Membres d'équipe</h3>
            <Badge variant="outline" className="text-[10px]">{members.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground italic hidden md:inline">
              Accès aux catégories SOP (connexion via /team-login)
            </span>
            <Button
              size="sm"
              variant={showArchive ? 'default' : 'secondary'}
              onClick={() => setShowArchive(v => !v)}
              className="gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {showArchive ? 'Fermer l\'archive' : 'Voir l\'archive'}
              {archived.length > 0 && !showArchive && (
                <span className="text-[10px] bg-slate-500/20 px-1.5 py-0.5 rounded">{archived.length}</span>
              )}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-xs text-muted-foreground italic text-center py-4">
            Aucun membre d'équipe. Va sur l'onglet <strong>Invitations</strong> pour en créer un.
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Membre</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="text-left px-3 py-2">Catégories</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((m: any) => {
                  const status = STATUS_BADGE[m.account_status] ?? STATUS_BADGE.invited
                  const catCount = m.access?.length ?? 0
                  return (
                    <tr key={m.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link to={`${detailBase}/${m.id}`} className="block group">
                          <div className="font-medium text-sm group-hover:text-blue-600 transition-colors">{m.first_name} {m.last_name}</div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {TYPE_LABEL[m.member_type] ?? m.member_type}
                        {m.job_title && <div className="text-[10px]">{m.job_title}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', status.cls)}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {catCount > 0
                          ? <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{catCount} catégorie{catCount > 1 ? 's' : ''}</span>
                          : <span className="text-xs text-amber-500">Aucun accès</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          {(m.account_status === 'invited' || m.account_status === 'suspended') && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => resendMut.mutate(m.id)}
                              disabled={resendMut.isPending}
                              title="Renvoyer l'invitation (nouveau lien 7 jours)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Renvoyer
                            </Button>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                            <KeyRound className="w-3.5 h-3.5" /> Gérer accès
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {resendInfo && (
          <ResendInviteDialog
            memberName={`${resendInfo.member?.first_name ?? ''} ${resendInfo.member?.last_name ?? ''}`.trim()}
            memberEmail={resendInfo.member?.email ?? ''}
            maskedToken={resendInfo.maskedToken}
            expiresAt={resendInfo.expiresAt}
            onClose={() => setResendInfo(null)}
          />
        )}

        {showArchive && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="w-4 h-4 text-slate-500" />
              <h4 className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">Archive</h4>
              <Badge variant="outline" className="text-[10px]">{archived.length}</Badge>
            </div>
            {archived.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-6">
                Aucun membre archivé.
              </p>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Membre</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-left px-3 py-2">Archivé le</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {archived.map((m: any) => (
                      <tr key={m.id} className="hover:bg-muted/30 opacity-80">
                        <td className="px-3 py-2">
                          <div className="font-medium text-sm">{m.first_name} {m.last_name}</div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {TYPE_LABEL[m.member_type] ?? m.member_type}
                          {m.job_title && <div className="text-[10px]">{m.job_title}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {m.updated_at ? formatDate(m.updated_at) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => restoreMut.mutate(m.id)}
                              disabled={restoreMut.isPending}
                              title="Restaurer ce membre et lui renvoyer une invitation"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Restaurer
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                if (confirm(`Supprimer définitivement ${m.first_name} ${m.last_name} ?\n\nCette action est irréversible — toutes les données du membre (accès SOP, tâches, historique) seront effacées.`)) {
                                  permanentDeleteMut.mutate(m.id)
                                }
                              }}
                              disabled={permanentDeleteMut.isPending}
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <TeamMemberAccessDialog member={editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function ResendInviteDialog({
  memberName: _memberName, memberEmail, maskedToken, expiresAt, onClose,
}: {
  memberName:  string
  memberEmail: string
  maskedToken: string
  expiresAt:   string
  onClose:     () => void
}) {
  const expiresLabel = new Date(expiresAt).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Invitation renvoyée
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40">
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              Un email vient d'être envoyé à <strong>{memberEmail}</strong>. Lien valable jusqu'au <strong>{expiresLabel}</strong>.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Empreinte token (audit)
            </p>
            <p className="font-mono text-sm">{maskedToken}</p>
            <p className="text-[11px] text-muted-foreground">
              Le lien complet ne quitte jamais le serveur (sécurité). Cette empreinte permet
              de corréler l'invitation avec le journal d'audit.
            </p>
          </div>
          <div className="flex justify-end pt-2 border-t border-border">
            <Button onClick={onClose}>Fermer</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            💡 Ce lien remplace tous les liens précédents. Les anciens emails d'invitation ne fonctionnent plus.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TeamMemberAccessDialog({ member, onClose }: { member: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['team', 'member', member.id],
    queryFn:  () => teamMgmtApi.get(member.id),
  })

  type AccessLevel = 'read' | 'complete' | 'edit'
  const [access, setAccess] = useState<Record<string, AccessLevel | 'none'>>({})

  useEffect(() => {
    if (!data?.access) return
    const initial: Record<string, AccessLevel | 'none'> = {}
    for (const a of data.access) initial[a.sop_category ?? a.category] = (a.access_level ?? a.level) as AccessLevel
    setAccess(initial)
  }, [data])

  const save = useMutation({
    mutationFn: () => {
      const entries: TeamMemberAccess[] = Object.entries(access)
        .filter(([, lvl]) => lvl && lvl !== 'none')
        .map(([category, level]) => ({ category, level: level as AccessLevel }))
      return teamMgmtApi.setAccess(member.id, entries)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', 'members'] })
      qc.invalidateQueries({ queryKey: ['team', 'member', member.id] })
      toast.success(`Accès mis à jour pour ${member.first_name} ${member.last_name}`)
      onClose()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const setCat = (key: string, lvl: AccessLevel | 'none') => setAccess(p => ({ ...p, [key]: lvl }))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-500" />
            Accès SOPs — {member.first_name} {member.last_name}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground -mt-2">
              Pour chaque catégorie SOP, choisis le niveau d'accès dans <strong>My Space</strong> du membre.
            </p>
            <div className="flex items-center gap-1 -mt-1">
              <button type="button" onClick={() => setAccess(Object.fromEntries(SOP_CATEGORIES.map(c => [c.key, 'read' as const])))}
                className="text-[10px] px-2 py-0.5 rounded bg-background border border-border hover:border-blue-400">
                Tout lire
              </button>
              <button type="button" onClick={() => setAccess(Object.fromEntries(SOP_CATEGORIES.map(c => [c.key, 'complete' as const])))}
                className="text-[10px] px-2 py-0.5 rounded bg-background border border-border hover:border-blue-400">
                Tout compléter
              </button>
              <button type="button" onClick={() => setAccess({})}
                className="text-[10px] px-2 py-0.5 rounded bg-background border border-border hover:border-red-400">
                Tout effacer
              </button>
            </div>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-2">
              {SOP_CATEGORIES.map(cat => {
                const lvl = access[cat.key] ?? 'none'
                return (
                  <div key={cat.key} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/40">
                    <span className="flex-1 truncate">{cat.label}</span>
                    <Select value={lvl} onValueChange={v => setCat(cat.key, v as any)}>
                      <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Aucun —</SelectItem>
                        <SelectItem value="read">👁 Lecture</SelectItem>
                        <SelectItem value="complete">✓ Compléter</SelectItem>
                        <SelectItem value="edit">✏ Édition</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Save className="w-3.5 h-3.5" /> Enregistrer
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PermissionsMatrix() {
  const roles   = Object.keys(ROLE_LABELS) as Role[]
  const modules = Object.keys(MODULE_LABELS) as Module[]
  const actions = ['view', 'create', 'edit', 'delete'] as Action[]

  return (
    <div className="card-premium p-4">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="w-4 h-4 text-blue-500" />
        <h3 className="font-semibold text-sm">Matrice des permissions</h3>
      </div>
      <div className="table-scroll">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-44">Module</th>
              {roles.map(r => (
                <th key={r} className="px-2 py-2 text-center">
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', ROLE_COLORS[r])}>{ROLE_LABELS[r]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {modules.map(mod => (
              <tr key={mod} className="hover:bg-muted/30 transition-colors">
                <td className="py-2 pr-4 font-medium text-foreground">{MODULE_LABELS[mod]}</td>
                {roles.map(r => {
                  const perms = ROLE_PERMISSIONS[r][mod]
                  return (
                    <td key={r} className="px-2 py-2 text-center">
                      {!perms?.view ? (
                        <X className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mx-auto" />
                      ) : (
                        <div className="flex items-center justify-center gap-0.5">
                          {actions.map(a => {
                            const Icon = ACTION_ICONS[a]
                            const granted = perms?.[a]
                            return (
                              <span key={a} title={`${a}: ${granted ? 'oui' : 'non'}`}
                                className={cn('w-4 h-4 rounded flex items-center justify-center',
                                  granted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-200 dark:text-slate-700')}>
                                <Icon className="w-2.5 h-2.5" />
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><Eye className="w-3 h-3 text-emerald-500" /> Voir</div>
        <div className="flex items-center gap-1.5"><Plus className="w-3 h-3 text-emerald-500" /> Créer</div>
        <div className="flex items-center gap-1.5"><Pencil className="w-3 h-3 text-emerald-500" /> Modifier</div>
        <div className="flex items-center gap-1.5"><Trash className="w-3 h-3 text-emerald-500" /> Supprimer</div>
        <div className="flex items-center gap-1.5"><X className="w-3.5 h-3.5 text-slate-400" /> Aucun accès</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════ */
export default function Equipe() {
  const { data: members = [], isLoading } = useTeam()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const detailBase = tenantSlug ? `/${tenantSlug}/equipe` : '/equipe'
  const createMember = useCreateTeamMember()
  const deleteMember = useDeleteTeamMember()
  const updateMember = useUpdateTeamMember()
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm]  = useState(false)
  const [editing, setEditing]    = useState<TeamMember | undefined>()

  const filtered = useMemo(() =>
    members.filter(m =>
      !search || [m.nom, m.prenom, m.poste, m.email, m.departement]
        .some(f => f?.toLowerCase().includes(search.toLowerCase()))
    ), [members, search])

  const stats = useMemo(() => ({
    actifs:         members.filter(m => m.statut === 'actif').length,
    conge:          members.filter(m => m.statut === 'conge').length,
    masseSalariale: members.filter(m => m.statut === 'actif').reduce((s, m) => s + m.salaire_base, 0),
    depts:          [...new Set(members.map(m => m.departement).filter(Boolean))].length,
  }), [members])

  const quickStatut = (m: TeamMember, statut: TeamMember['statut']) => {
    updateMember.mutate({ id: m.id, statut })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Équipe & Accès</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {members.length} membres · {stats.conge > 0 ? `${stats.conge} en congé · ` : ''}Masse salariale : {formatCurrency(stats.masseSalariale)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={equipeSchema}
            data={members}
            onImport={async (row) => { await createMember.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={() => { setEditing(undefined); setShowForm(true) }}>
            <Plus className="w-4 h-4" /> Ajouter un salarié
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Membres actifs', value: stats.actifs,    icon: Users,       color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-500/20'   },
          { label: 'En congé',       value: stats.conge,     icon: CalendarDays, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/20'  },
          { label: 'Masse salariale',value: formatCurrency(stats.masseSalariale), icon: DollarSign, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/20' },
          { label: 'Départements',   value: stats.depts,     icon: Briefcase,    color: 'text-purple-600 dark:text-purple-400',bg: 'bg-purple-500/20' },
        ].map(k => (
          <div key={k.label} className="card-premium p-4 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', k.bg)}>
              <k.icon className={cn('w-5 h-5', k.color)} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="salaires">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="conges">
            <CalendarDays className="w-4 h-4 mr-1.5" /> Congés
          </TabsTrigger>
          <TabsTrigger value="salaires">
            <Banknote className="w-4 h-4 mr-1.5" /> Salaires
          </TabsTrigger>
          <TabsTrigger value="stagiaires">
            <GraduationCap className="w-4 h-4 mr-1.5" /> Stagiaires
          </TabsTrigger>
          <TabsTrigger value="team-space">
            <ShieldCheck className="w-4 h-4 mr-1.5" /> Espace équipe
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <UserPlus className="w-4 h-4 mr-1.5" /> Invitations
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <ShieldCheck className="w-4 h-4 mr-1.5" /> Permissions
          </TabsTrigger>
          <TabsTrigger value="stats">
            <TrendingUp className="w-4 h-4 mr-1.5" /> Stats
          </TabsTrigger>
        </TabsList>

        {/* ── Congés ── */}
        <TabsContent value="conges" className="mt-4">
          <CongesTab members={members} />
        </TabsContent>

        {/* ── Salaires ── */}
        <TabsContent value="salaires" className="mt-4">
          <SalairesTab
            members={members}
            detailBase={detailBase}
            onEditMember={(m) => { setEditing(m); setShowForm(true) }}
          />
        </TabsContent>

        {/* ── Stagiaires ── */}
        <TabsContent value="stagiaires" className="mt-4">
          <StagiairesTab />
        </TabsContent>

        {/* ── Espace équipe (team_member accounts + SOP access) ── */}
        <TabsContent value="team-space" className="mt-4">
          <TeamSpaceTab />
        </TabsContent>

        {/* ── Invitations ── */}
        <TabsContent value="invitations" className="mt-4">
          <InvitationsTab />
        </TabsContent>

        {/* ── Permissions ── */}
        <TabsContent value="permissions" className="mt-4 space-y-6">
          <MemberAccessManager />
          <TeamMembersAccessManager />
          <PermissionsMatrix />
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <StatsTab />
        </TabsContent>
      </Tabs>

      {/* Member form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="relative">
            <DialogTitle>{editing ? 'Modifier le membre' : 'Ajouter un membre'}</DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="submit"
                form="team-member-form"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
              >
                {editing ? '💾 Enregistrer' : '➕ Créer'}
              </Button>
            </div>
          </DialogHeader>
          <TeamMemberForm member={editing} onClose={() => { setShowForm(false); setEditing(undefined) }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
