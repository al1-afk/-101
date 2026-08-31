import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Shield, ShieldCheck, UserCheck, Mail, Loader2, Check, X, RefreshCw,
  KeyRound, Trash2, Clock, MapPin, Monitor, Users,
} from 'lucide-react'
import { admin2faApi, type AdminUser, type Pending2FA, type LoginHistoryRow } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import SessionsTab from '@/components/securite/SessionsTab'
import AuditTab from '@/components/securite/AuditTab'

/* ── Formatage utilitaires ────────────────────────────────────── */
const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return s }
}
const shortUA = (ua: string): string => {
  if (!ua) return '—'
  let b = 'Navigateur', o = 'OS'
  if (/Edg\//.test(ua)) b = 'Edge'
  else if (/Chrome/.test(ua)) b = 'Chrome'
  else if (/Safari/.test(ua)) b = 'Safari'
  else if (/Firefox/.test(ua)) b = 'Firefox'
  if (/iPhone|iPad|iOS/.test(ua)) o = 'iOS'
  else if (/Android/.test(ua))   o = 'Android'
  else if (/Windows/.test(ua))   o = 'Windows'
  else if (/Mac OS X|Macintosh/.test(ua)) o = 'macOS'
  else if (/Linux/.test(ua))     o = 'Linux'
  return `${b} · ${o}`
}
const modeLabel: Record<string, string> = {
  email:          '📧 Email auto',
  admin_manual:   '🔑 Code admin',
  admin_approval: '✅ Approbation admin',
}
const modeShort: Record<string, string> = {
  email:          'Email',
  admin_manual:   'Manuel',
  admin_approval: 'Approbation',
}

export default function AdminSecurity() {
  const [tab, setTab] = useState<
    'pending' | 'users' | 'sessions' | 'history' | 'audit'
  >('pending')

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card-premium p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground">Sécurité &amp; connexions</h1>
          <p className="text-sm text-muted-foreground">
            Approuvez les demandes en attente, gérez le 2FA et les sessions, consultez l'historique et le journal d'audit.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {([
          { key: 'pending',  label: 'Demandes en attente', icon: Clock },
          { key: 'users',    label: 'Utilisateurs',        icon: Users },
          { key: 'sessions', label: 'Sessions & appareils', icon: Monitor },
          { key: 'history',  label: 'Historique',          icon: ShieldCheck },
          { key: 'audit',    label: "Journal d'audit",     icon: KeyRound },
        ] as const).map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 -mb-px border-b-2 text-sm font-medium flex items-center gap-2 transition-colors ${
                active
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'pending'  && <PendingTab />}
      {tab === 'users'    && <UsersTab />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'history'  && <HistoryTab />}
      {tab === 'audit'    && <AuditTab />}
    </div>
  )
}

/* ─── Onglet 1 : demandes de connexion en attente ───────────────── */
function PendingTab() {
  const qc = useQueryClient()
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', '2fa', 'pending'],
    queryFn:  () => admin2faApi.pending(),
    refetchInterval: 5000,
  })
  const approve = useMutation({
    mutationFn: (id: string) => admin2faApi.approve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin','2fa','pending'] }); toast.success('Demande approuvée') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const reject = useMutation({
    mutationFn: (id: string) => admin2faApi.reject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin','2fa','pending'] }); toast.success('Demande rejetée') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const [codeModal, setCodeModal] = useState<{ id: string; code: string; user: string } | null>(null)
  const genCode = useMutation({
    mutationFn: (row: Pending2FA) => admin2faApi.generateCode(row.id).then(r => ({ ...r, row })),
    onSuccess: (data) => {
      setCodeModal({ id: data.row.id, code: data.code, user: data.row.user_name || data.row.email })
      qc.invalidateQueries({ queryKey: ['admin','2fa','pending'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  return (
    <div className="card-premium overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="section-title">Demandes en cours ({data.length})</h2>
        <button onClick={() => refetch()} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {data.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Aucune demande en attente.'}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {data.map((row: Pending2FA) => {
            const expiringSoon = new Date(row.expires_at).getTime() - Date.now() < 2 * 60 * 1000
            return (
              <div key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {row.user_name} <span className="text-muted-foreground font-normal">· {row.email}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> {modeLabel[row.method] ?? row.method}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {row.ip_address}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Monitor className="w-3 h-3" /> {shortUA(row.user_agent)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {fmtDate(row.created_at)}
                    </span>
                    {expiringSoon && (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">expire bientôt</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {row.method === 'admin_manual' && !row.has_code && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => genCode.mutate(row)}
                      disabled={genCode.isPending}
                    >
                      <KeyRound className="w-3.5 h-3.5 mr-1" /> Générer un code
                    </Button>
                  )}
                  {row.method === 'admin_approval' && (
                    <Button
                      size="sm"
                      onClick={() => approve.mutate(row.id)}
                      disabled={approve.isPending}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> Approuver
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    onClick={() => reject.mutate(row.id)}
                    disabled={reject.isPending}
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Rejeter
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal : code manuel généré (affiché UNE SEULE FOIS) */}
      <Dialog open={!!codeModal} onOpenChange={(o) => { if (!o) setCodeModal(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-blue-600" /> Code généré pour {codeModal?.user}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Communiquez ce code à l'utilisateur (WhatsApp, téléphone, en personne).
              <strong> Ce code ne sera plus affiché.</strong>
            </p>
            <div className="p-6 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-center">
              <p className="text-4xl font-black tracking-[0.4em] text-blue-700 dark:text-blue-300 font-mono">
                {codeModal?.code}
              </p>
              <p className="text-[11px] text-muted-foreground mt-3">Valide 10 minutes</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  if (codeModal) {
                    navigator.clipboard.writeText(codeModal.code)
                    toast.success('Code copié')
                  }
                }}
              >
                Copier
              </Button>
              <Button className="flex-1" onClick={() => setCodeModal(null)}>Fermer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Onglet 2 : gestion des utilisateurs (mode 2FA + trusted devices) ─ */
function UsersTab() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['admin', '2fa', 'users'],
    queryFn:  () => admin2faApi.users(),
  })
  const setMode = useMutation({
    mutationFn: ({ userId, mode }: { userId: string; mode: 'email'|'admin_manual'|'admin_approval' }) =>
      admin2faApi.setMode(userId, mode),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin','2fa','users'] }); toast.success('Mode 2FA mis à jour') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const revoke = useMutation({
    mutationFn: (userId: string) => admin2faApi.revokeAllDevices(userId),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['admin','2fa','users'] }); toast.success(`${r.revoked} appareil(s) révoqué(s)`) },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  return (
    <div className="card-premium overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="section-title">Utilisateurs ({data.length})</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choisissez le mode de vérification par utilisateur. La révocation force une ré-2FA à la prochaine connexion.
        </p>
      </div>
      <div className="table-scroll">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Mode 2FA</th>
              <th className="text-center">Appareils</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Aucun utilisateur</td></tr>
            ) : data.map((u: AdminUser) => (
              <tr key={u.id} className="table-row">
                <td>
                  <p className="font-medium text-foreground">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td><span className="badge-pill badge-info">{u.role}</span></td>
                <td>
                  <Select
                    value={u.twofa_mode}
                    onValueChange={(v) => setMode.mutate({ userId: u.id, mode: v as any })}
                  >
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">📧 Envoi auto par email</SelectItem>
                      <SelectItem value="admin_manual">🔑 Code fourni par l'admin</SelectItem>
                      <SelectItem value="admin_approval">✅ Approbation directe par l'admin</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="text-center">
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted">
                    <Monitor className="w-3 h-3" /> {u.trusted_devices_count}
                  </span>
                </td>
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:bg-red-500/10"
                    disabled={u.trusted_devices_count === 0 || revoke.isPending}
                    onClick={() => {
                      if (confirm(`Révoquer tous les appareils de "${u.name}" ? La prochaine connexion demandera un 2FA complet.`)) {
                        revoke.mutate(u.id)
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Révoquer les appareils
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── Onglet 3 : historique des connexions ──────────────────────── */
function HistoryTab() {
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', '2fa', 'history'],
    queryFn:  () => admin2faApi.history(200),
    refetchInterval: 15000,
  })

  const eventLabel: Record<string, { label: string; color: string; Icon: any }> = {
    password_ok:      { label: 'Mot de passe OK',       color: 'text-blue-500',    Icon: KeyRound },
    challenge_sent:   { label: 'Challenge envoyé',      color: 'text-indigo-500',  Icon: Mail },
    verify_success:   { label: '2FA validé',            color: 'text-emerald-500', Icon: ShieldCheck },
    verify_failed:    { label: 'Code incorrect',        color: 'text-red-500',     Icon: X },
    approved:         { label: 'Approuvé par admin',    color: 'text-emerald-500', Icon: UserCheck },
    rejected:         { label: 'Rejeté par admin',      color: 'text-red-500',     Icon: X },
    trusted_skip:     { label: 'Appareil de confiance', color: 'text-slate-400',   Icon: Check },
  }

  return (
    <div className="card-premium overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="section-title">Historique récent ({data.length})</h2>
        <button onClick={() => refetch()} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="table-scroll max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="table-header sticky top-0 bg-background">
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Événement</th>
              <th>Mode</th>
              <th>IP</th>
              <th>Navigateur</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Aucun événement.'}
              </td></tr>
            ) : data.map((row: LoginHistoryRow) => {
              const conf = eventLabel[row.event] ?? { label: row.event, color: 'text-muted-foreground', Icon: Shield }
              const Icon = conf.Icon
              return (
                <tr key={row.id} className="table-row">
                  <td className="whitespace-nowrap text-muted-foreground">{fmtDate(row.created_at)}</td>
                  <td>
                    <p className="font-medium text-foreground">{row.user_name ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground">{row.email}</p>
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${conf.color}`}>
                      <Icon className="w-3.5 h-3.5" /> {conf.label}
                    </span>
                  </td>
                  <td className="text-xs text-muted-foreground">{modeShort[row.method] ?? row.method}</td>
                  <td className="text-xs font-mono text-muted-foreground">{row.ip_address}</td>
                  <td className="text-xs text-muted-foreground truncate max-w-[16rem]">{shortUA(row.user_agent)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
