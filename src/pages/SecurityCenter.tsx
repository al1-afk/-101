/* ═══════════════════════════════════════════════════════════════════
   ADMINISTRATION → CENTRE DE SÉCURITÉ

   Répond en un écran à : combien de personnes utilisent la plateforme,
   qui est connecté, qui a tenté de se connecter, quelles activités
   suspectes ont été détectées, quelles requêtes ont été bloquées, et
   quelle IP / quel compte est concerné.

   Sécurité de cette page :
     - elle n'affiche QUE ce que le backend accepte de renvoyer ; le
       droit d'accès est vérifié serveur (requireSecurityMonitoring).
       Un non-admin qui force l'URL voit un écran « accès refusé » —
       le masquage du menu n'est qu'un confort ;
     - toutes les valeurs venant des requêtes (User-Agent, endpoint,
       email, raison) sont rendues en TEXTE par React, jamais en HTML :
       aucun `dangerouslySetInnerHTML` ici. Elles sont en plus tronquées
       à l'affichage pour éviter qu'un UA d'un kilomètre casse la table.
   ═══════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts'
import {
  Shield, Users, UserX, AlertTriangle, Ban, Siren, Activity, Search,
  Loader2, RefreshCw, Globe, Monitor, Clock, CheckCircle2, X, BellRing,
} from 'lucide-react'
import {
  securityApi, type SecurityPeriod, type SecuritySeverity, type SecurityStatus,
  type OnlineUser, type SecurityEventRow, type LoginRow, type SecurityAlertRow,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/* ── Formatage ───────────────────────────────────────────────────── */
const fmtDateTime = (s: string | null) => {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return '—' }
}
const fmtHour = (s: string) => {
  try { return new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit' }) }
  catch { return '' }
}
const fmtAgo = (s: string | null) => {
  if (!s) return '—'
  const ms = Date.now() - new Date(s).getTime()
  if (Number.isNaN(ms)) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.floor(h / 24)} j`
}
/** User-Agent lisible — on n'affiche jamais la chaîne brute complète. */
const shortUA = (ua: string | null): string => {
  if (!ua) return '—'
  let b = 'Navigateur', o = 'OS'
  if (/Edg\//.test(ua)) b = 'Edge'
  else if (/Chrome/.test(ua)) b = 'Chrome'
  else if (/Firefox/.test(ua)) b = 'Firefox'
  else if (/Safari/.test(ua)) b = 'Safari'
  if (/iPhone|iPad|iOS/.test(ua)) o = 'iOS'
  else if (/Android/.test(ua))   o = 'Android'
  else if (/Windows/.test(ua))   o = 'Windows'
  else if (/Mac OS X|Macintosh/.test(ua)) o = 'macOS'
  else if (/Linux/.test(ua))     o = 'Linux'
  return `${b} · ${o}`
}
const clip = (s: string | null, n = 60) =>
  !s ? '—' : (s.length > n ? `${s.slice(0, n)}…` : s)

/* ── Libellés métier ─────────────────────────────────────────────── */
const EVENT_LABELS: Record<string, string> = {
  login_failed:                  'Connexion échouée',
  login_failed_burst:            'Rafale d\'échecs',
  login_blocked_lockout:         'Compte verrouillé',
  account_disabled_login:        'Compte désactivé',
  password_changed:              'Mot de passe changé',
  password_reset_completed:      'Mot de passe réinitialisé',
  logout:                        'Déconnexion',
  unauthorized:                  'Non authentifié',
  refresh_rejected:              'Refresh refusé',
  token_reuse_detected:          'Token rejoué',
  permission_denied:             'Permission refusée',
  tenant_scope_denied:           'Accès hors périmètre',
  security_center_access_denied: 'Accès Centre de sécurité refusé',
  rate_limit:                    'Limite de requêtes',
  upload_rejected:               'Upload refusé',
  forbidden_file_type:           'Fichier interdit',
  path_traversal_blocked:        'Traversée de répertoire',
  invalid_input:                 'Entrée invalide',
  admin_sensitive_action:        'Action administrative',
  login_success:                 'Connexion réussie',
  challenge_sent:                'Code 2FA envoyé',
  verify_success:                '2FA validé',
  verify_failed:                 '2FA échoué',
  trusted_skip:                  'Appareil de confiance',
  password_ok:                   'Mot de passe validé',
  approved:                      'Approuvé par admin',
  rejected:                      'Refusé par admin',
}
const eventLabel = (t: string) => EVENT_LABELS[t] ?? t

const SEVERITY_STYLE: Record<SecuritySeverity, string> = {
  info:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  low:      'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}
const STATUS_STYLE: Record<SecurityStatus, string> = {
  normal:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  suspicious: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  blocked:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  confirmed:  'bg-red-600 text-white',
}
const STATUS_LABEL: Record<SecurityStatus, string> = {
  normal: 'Normal', suspicious: 'Suspect', blocked: 'Bloqué', confirmed: 'Confirmé',
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${className}`}>
      {children}
    </span>
  )
}

/* ── Carte de statistique ────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, tone, hint }: {
  icon: React.ElementType; label: string; value: number | string
  tone: 'blue' | 'amber' | 'red' | 'emerald' | 'violet'; hint?: string
}) {
  const tones = {
    blue:    'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    amber:   'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    red:     'bg-red-500/15 text-red-600 dark:text-red-400',
    emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    violet:  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  }
  return (
    <div className="card-premium p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground/70 truncate">{hint}</p>}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════ */
type Tab = 'overview' | 'online' | 'logins' | 'events' | 'alerts'

export default function SecurityCenter() {
  const [tab, setTab]       = useState<Tab>('overview')
  const [period, setPeriod] = useState<SecurityPeriod>('24h')
  const [ipDetail, setIpDetail] = useState<string | null>(null)
  const qc = useQueryClient()

  const overview = useQuery({
    queryKey: ['security', 'overview', period],
    queryFn:  () => securityApi.overview(period),
    /* Quasi temps réel sans marteler le serveur : 30 s. */
    refetchInterval: 30_000,
    retry: false,
  })

  const denied = (overview.error as Error | null)?.message?.includes('Accès refusé')

  if (denied) {
    return (
      <div className="card-premium p-8 text-center space-y-3">
        <Shield className="w-10 h-10 mx-auto text-red-500" />
        <h1 className="text-lg font-bold text-foreground">Accès refusé</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Le Centre de sécurité est réservé aux administrateurs et aux comptes
          disposant de la permission <code className="font-mono">SECURITY_MONITORING_READ</code>.
          Cette tentative d'accès a été journalisée.
        </p>
      </div>
    )
  }

  const cards = overview.data?.cards

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── En-tête ── */}
      <div className="card-premium p-5 flex flex-wrap items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl font-bold text-foreground">Centre de sécurité</h1>
          <p className="text-sm text-muted-foreground">
            Surveillance des connexions, des accès refusés et des activités suspectes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={v => setPeriod(v as SecurityPeriod)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Aujourd'hui (24 h)</SelectItem>
              <SelectItem value="7d">7 derniers jours</SelectItem>
              <SelectItem value="30d">30 derniers jours</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="secondary" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['security'] })}
          >
            <RefreshCw className={`w-4 h-4 ${overview.isFetching ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* ── Cartes ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon={Users}         tone="emerald" label="Utilisateurs en ligne" value={cards?.online_users ?? '—'} />
        <StatCard icon={UserX}         tone="amber"   label={`Connexions échouées`} value={cards?.failed_logins ?? '—'} hint={`sur ${overview.data?.periodHours ?? 24} h`} />
        <StatCard icon={AlertTriangle} tone="amber"   label="Événements suspects"   value={cards?.suspicious ?? '—'} />
        <StatCard icon={Ban}           tone="red"     label="Requêtes bloquées"     value={cards?.blocked ?? '—'} />
        <StatCard icon={Siren}         tone="red"     label="Événements HIGH/CRITICAL" value={cards?.severe ?? '—'} />
        <StatCard icon={BellRing}      tone="violet"  label="Alertes ouvertes"      value={cards?.open_alerts ?? '—'} />
      </div>

      {/* ── Onglets ── */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {([
          ['overview', 'Vue d\'ensemble', Activity],
          ['online',   'Utilisateurs en ligne', Users],
          ['logins',   'Historique connexions', Clock],
          ['events',   'Événements', AlertTriangle],
          ['alerts',   'Alertes', BellRing],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab data={overview.data} loading={overview.isLoading} onSelectIp={setIpDetail} />}
      {tab === 'online'   && <OnlineTab   onSelectIp={setIpDetail} />}
      {tab === 'logins'   && <LoginsTab   period={period} onSelectIp={setIpDetail} />}
      {tab === 'events'   && <EventsTab   period={period} onSelectIp={setIpDetail} />}
      {tab === 'alerts'   && <AlertsTab   onSelectIp={setIpDetail} />}

      <IpDetailDialog ip={ipDetail} onClose={() => setIpDetail(null)} />
    </div>
  )
}

/* ═══ Vue d'ensemble ═══════════════════════════════════════════════ */
function OverviewTab({ data, loading, onSelectIp }: {
  data: Awaited<ReturnType<typeof securityApi.overview>> | undefined
  loading: boolean
  onSelectIp: (ip: string) => void
}) {
  if (loading) return <Loading />
  if (!data) return <Empty label="Aucune donnée" />

  const loginData = data.loginSeries.map(d => ({ ...d, label: fmtHour(d.bucket) }))
  const eventData = data.eventSeries.map(d => ({ ...d, label: fmtHour(d.bucket) }))

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Connexions */}
        <div className="card-premium p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Connexions ({data.periodHours} h)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={loginData}>
              <defs>
                <linearGradient id="gOk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gKo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <RTooltip />
              <Area type="monotone" dataKey="success" name="Réussies" stroke="#10b981" fill="url(#gOk)" />
              <Area type="monotone" dataKey="failed"  name="Échouées" stroke="#ef4444" fill="url(#gKo)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Événements par heure */}
        <div className="card-premium p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Événements de sécurité par heure
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={eventData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <RTooltip />
              <Bar dataKey="total"  name="Total"         fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="severe" name="HIGH/CRITICAL" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Top IP */}
        <div className="card-premium p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4" /> Top IP — événements non normaux
          </h3>
          {!data.topIps.length && <Empty label="Aucune IP suspecte sur la période" />}
          <div className="space-y-1">
            {data.topIps.map(ip => (
              <button
                key={ip.ip_address}
                onClick={() => onSelectIp(ip.ip_address)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors"
              >
                <span className="font-mono text-xs text-foreground">{ip.ip_address}</span>
                <span className="flex items-center gap-2">
                  {ip.severe > 0 && <Badge className={SEVERITY_STYLE.high}>{ip.severe} graves</Badge>}
                  <Badge className="bg-muted text-muted-foreground">{ip.events} évén.</Badge>
                  <span className="text-[11px] text-muted-foreground">{fmtAgo(ip.last_seen)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Répartition par type */}
        <div className="card-premium p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Répartition par type d'événement</h3>
          {!data.topEvents.length && <Empty label="Aucun événement sur la période" />}
          <div className="space-y-1">
            {data.topEvents.map(e => (
              <div key={e.event_type} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span className="text-foreground">{eventLabel(e.event_type)}</span>
                <Badge className="bg-muted text-muted-foreground">{e.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Diagnostic proxy — fiabilité des IP affichées */}
      <div className="card-premium p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">Résolution des adresses IP</p>
        <p>
          Proxys de confiance : <strong>{data.proxy.hops}</strong> ·
          {' '}Profondeur X-Forwarded-For observée : <strong>{data.proxy.forwardedDepth}</strong> ·
          {' '}Votre IP telle que vue par le serveur : <strong className="font-mono">{data.proxy.resolvedIp ?? 'inconnue'}</strong>
        </p>
        <p className="mt-1">
          Seule l'adresse écrite par le dernier proxy de confiance (Traefik) est retenue —
          un en-tête <code className="font-mono">X-Forwarded-For</code> envoyé par un client est ignoré.
          {data.proxy.forwardedDepth > data.proxy.hops && (
            <strong className="text-amber-600 dark:text-amber-400">
              {' '}Chaîne plus longue que le nombre de hops déclaré : vérifiez TRUST_PROXY_HOPS.
            </strong>
          )}
        </p>
      </div>
    </div>
  )
}

/* ═══ Utilisateurs en ligne ════════════════════════════════════════ */
function OnlineTab({ onSelectIp }: { onSelectIp: (ip: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['security', 'online'],
    queryFn:  () => securityApi.online(),
    refetchInterval: 20_000,
    retry: false,
  })

  if (isLoading) return <Loading />
  const users: OnlineUser[] = data?.users ?? []

  return (
    <div className="card-premium overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <strong className="text-foreground">{data?.onlineCount ?? 0}</strong>
          <span className="text-muted-foreground">en ligne</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <strong className="text-foreground">{data?.idleCount ?? 0}</strong>
          <span className="text-muted-foreground">inactifs</span>
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto">
          En ligne = activité &lt; {Math.round((data?.thresholds.onlineSeconds ?? 120) / 60)} min ·
          {' '}inactif jusqu'à {Math.round((data?.thresholds.idleSeconds ?? 900) / 60)} min
        </span>
      </div>
      <div className="table-scroll">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th>Utilisateur</th><th>Rôle</th><th>Statut</th>
              <th>Connecté depuis</th><th>Dernière activité</th>
              <th>Sessions</th><th>IP</th><th>Navigateur</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} className="border-t border-border">
                <td className="py-2.5">
                  <p className="font-medium text-foreground">{u.name}</p>
                  <p className="text-[11px] text-muted-foreground">{u.email}</p>
                </td>
                <td><Badge className="bg-muted text-muted-foreground">{u.role}</Badge></td>
                <td>
                  <Badge className={u.state === 'online'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}>
                    {u.state === 'online' ? 'En ligne' : 'Inactif'}
                  </Badge>
                </td>
                <td className="text-muted-foreground text-xs">{fmtDateTime(u.login_at)}</td>
                <td className="text-muted-foreground text-xs">{fmtAgo(u.last_seen_at)}</td>
                <td className="text-xs">
                  <span className="text-foreground">{u.sessions}</span>
                  <span className="text-muted-foreground"> · {u.active_tokens} jeton(s)</span>
                </td>
                <td>
                  {u.ip_address
                    ? <button onClick={() => onSelectIp(u.ip_address!)}
                              className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        {u.ip_address}
                      </button>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="text-xs text-muted-foreground">
                  <span title={u.user_agent ?? ''}>{shortUA(u.user_agent)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <Empty label="Personne n'est connecté actuellement" icon={Monitor} />}
      </div>
    </div>
  )
}

/* ═══ Historique des connexions ════════════════════════════════════ */
function LoginsTab({ period, onSelectIp }: { period: SecurityPeriod; onSelectIp: (ip: string) => void }) {
  const [email, setEmail]     = useState('')
  const [ip, setIp]           = useState('')
  const [outcome, setOutcome] = useState<'all' | 'success' | 'failed'>('all')
  const [page, setPage]       = useState(0)
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['security', 'logins', period, email, ip, outcome, page],
    queryFn:  () => securityApi.logins({
      period, limit, offset: page * limit,
      email:   email.trim() || undefined,
      ip:      ip.trim()    || undefined,
      outcome: outcome === 'all' ? undefined : outcome,
    }),
    retry: false,
  })

  const rows: LoginRow[] = data?.rows ?? []

  return (
    <div className="space-y-3">
      <div className="card-premium p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Filtrer par email…"
                 value={email} onChange={e => { setEmail(e.target.value); setPage(0) }} />
        </div>
        <Input className="h-9 w-[180px]" placeholder="Adresse IP…"
               value={ip} onChange={e => { setIp(e.target.value); setPage(0) }} />
        <Select value={outcome} onValueChange={v => { setOutcome(v as typeof outcome); setPage(0) }}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les résultats</SelectItem>
            <SelectItem value="success">Réussies</SelectItem>
            <SelectItem value="failed">Échouées</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="card-premium overflow-hidden">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th>Date</th><th>Événement</th><th>Utilisateur</th>
                <th>IP</th><th>Méthode</th><th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.created_at}-${i}`} className="border-t border-border">
                  <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                  <td className="text-foreground">{eventLabel(r.event)}</td>
                  <td>
                    <p className="text-foreground text-xs">{r.user_name ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground">{clip(r.email, 34)}</p>
                  </td>
                  <td>
                    {r.ip_address
                      ? <button onClick={() => onSelectIp(r.ip_address!)}
                                className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          {r.ip_address}
                        </button>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-xs text-muted-foreground">{r.method ?? '—'}</td>
                  <td>
                    <Badge className={r.success
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}>
                      {r.success ? 'Succès' : 'Échec'}
                    </Badge>
                    {r.reason && <span className="ml-2 text-[11px] text-muted-foreground">{clip(r.reason, 28)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isLoading && <Loading />}
          {!isLoading && !rows.length && <Empty label="Aucune connexion sur la période" />}
        </div>
        <Pager page={page} setPage={setPage} hasMore={!!data?.hasMore} count={rows.length} />
      </div>
    </div>
  )
}

/* ═══ Événements de sécurité ═══════════════════════════════════════ */
function EventsTab({ period, onSelectIp }: { period: SecurityPeriod; onSelectIp: (ip: string) => void }) {
  const [severity, setSeverity] = useState<'all' | SecuritySeverity>('all')
  const [status,   setStatus]   = useState<'all' | SecurityStatus>('all')
  const [type,     setType]     = useState<string>('all')
  const [ip,       setIp]       = useState('')
  const [page,     setPage]     = useState(0)
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['security', 'events', period, severity, status, type, ip, page],
    queryFn:  () => securityApi.events({
      period, limit, offset: page * limit,
      severity: severity === 'all' ? undefined : severity,
      status:   status   === 'all' ? undefined : status,
      type:     type     === 'all' ? undefined : type,
      ip:       ip.trim() || undefined,
    }),
    refetchInterval: 60_000,
    retry: false,
  })

  const rows: SecurityEventRow[] = data?.rows ?? []
  const types = data?.filters?.types ?? []

  return (
    <div className="space-y-3">
      <div className="card-premium p-3 flex flex-wrap items-center gap-2">
        <Select value={severity} onValueChange={v => { setSeverity(v as typeof severity); setPage(0) }}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Sévérité" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sévérités</SelectItem>
            <SelectItem value="info">INFO</SelectItem>
            <SelectItem value="low">LOW</SelectItem>
            <SelectItem value="medium">MEDIUM</SelectItem>
            <SelectItem value="high">HIGH</SelectItem>
            <SelectItem value="critical">CRITICAL</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={v => { setStatus(v as typeof status); setPage(0) }}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="suspicious">Suspect</SelectItem>
            <SelectItem value="blocked">Bloqué</SelectItem>
            <SelectItem value="confirmed">Confirmé</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={v => { setType(v); setPage(0) }}>
          <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {types.map(t => <SelectItem key={t} value={t}>{eventLabel(t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-9 w-[180px]" placeholder="Adresse IP…"
               value={ip} onChange={e => { setIp(e.target.value); setPage(0) }} />
      </div>

      <div className="card-premium overflow-hidden">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th>Date</th><th>Utilisateur</th><th>IP</th><th>Événement</th>
                <th>Endpoint</th><th>Sévérité</th><th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                  <td>
                    <p className="text-foreground text-xs">{r.user_name ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground">{clip(r.email, 30)}</p>
                  </td>
                  <td>
                    {r.ip_address
                      ? <button onClick={() => onSelectIp(r.ip_address!)}
                                className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          {r.ip_address}
                        </button>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td>
                    <p className="text-foreground text-xs">{eventLabel(r.event_type)}</p>
                    {r.reason && <p className="text-[11px] text-muted-foreground">{clip(r.reason, 32)}</p>}
                  </td>
                  <td className="text-[11px] font-mono text-muted-foreground">
                    {r.http_method ? `${r.http_method} ` : ''}{clip(r.endpoint, 40)}
                    {r.http_status ? <span className="ml-1 opacity-70">({r.http_status})</span> : null}
                  </td>
                  <td><Badge className={SEVERITY_STYLE[r.severity]}>{r.severity.toUpperCase()}</Badge></td>
                  <td><Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {isLoading && <Loading />}
          {!isLoading && !rows.length && <Empty label="Aucun événement sur la période" />}
        </div>
        <Pager page={page} setPage={setPage} hasMore={!!data?.hasMore} count={rows.length} />
      </div>
    </div>
  )
}

/* ═══ Alertes ══════════════════════════════════════════════════════ */
function AlertsTab({ onSelectIp }: { onSelectIp: (ip: string) => void }) {
  const [status, setStatus] = useState<'open' | 'acknowledged' | 'resolved'>('open')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['security', 'alerts', status],
    queryFn:  () => securityApi.alerts({ status }),
    refetchInterval: 30_000,
    retry: false,
  })

  const ack = useMutation({
    mutationFn: (id: string) => securityApi.acknowledgeAlert(id),
    onSuccess: () => {
      toast.success('Alerte acquittée')
      qc.invalidateQueries({ queryKey: ['security'] })
    },
    onError: () => toast.error('Impossible d\'acquitter cette alerte'),
  })

  const rows: SecurityAlertRow[] = data?.rows ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(['open', 'acknowledged', 'resolved'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              status === s ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'open' ? 'Ouvertes' : s === 'acknowledged' ? 'Acquittées' : 'Résolues'}
          </button>
        ))}
      </div>

      {isLoading && <Loading />}
      {!isLoading && !rows.length && <Empty label="Aucune alerte" icon={CheckCircle2} />}

      <div className="space-y-2">
        {rows.map(a => (
          <div key={a.id} className="card-premium p-4 flex flex-wrap items-start gap-3">
            <Badge className={SEVERITY_STYLE[a.severity]}>{a.severity.toUpperCase()}</Badge>
            <div className="flex-1 min-w-[240px]">
              <p className="text-sm font-semibold text-foreground">{a.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {a.occurrences} occurrence{a.occurrences > 1 ? 's' : ''} ·
                {' '}première {fmtDateTime(a.first_seen_at)} · dernière {fmtAgo(a.last_seen_at)}
                {a.ip_address && (
                  <>
                    {' · '}
                    <button onClick={() => onSelectIp(a.ip_address!)}
                            className="font-mono text-blue-600 dark:text-blue-400 hover:underline">
                      {a.ip_address}
                    </button>
                  </>
                )}
                {a.user_name && ` · ${a.user_name}`}
              </p>
              {a.acknowledged_at && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Acquittée par {a.acknowledged_by_name ?? 'un administrateur'} le {fmtDateTime(a.acknowledged_at)}
                </p>
              )}
            </div>
            {a.status === 'open' && (
              <Button size="sm" variant="secondary"
                      disabled={ack.isPending}
                      onClick={() => ack.mutate(a.id)}>
                <CheckCircle2 className="w-4 h-4" /> Acquitter
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ Détail d'une IP ══════════════════════════════════════════════ */
function IpDetailDialog({ ip, onClose }: { ip: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['security', 'ip', ip],
    queryFn:  () => securityApi.ipDetail(ip!, '30d'),
    enabled:  !!ip,
    retry: false,
  })

  return (
    <Dialog open={!!ip} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="font-mono">{ip}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading && <Loading />}
        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MiniStat label="Événements"        value={data.summary?.events ?? 0} />
              <MiniStat label="Suspects"          value={data.summary?.suspicious ?? 0} />
              <MiniStat label="Bloqués"           value={data.summary?.blocked ?? 0} />
              <MiniStat label="HIGH/CRITICAL"     value={data.summary?.severe ?? 0} />
              <MiniStat label="Connexions OK"     value={data.logins?.success ?? 0} />
              <MiniStat label="Connexions KO"     value={data.logins?.failed ?? 0} />
              <MiniStat label="Première activité" value={fmtDateTime(data.summary?.first_seen ?? data.logins?.first_seen ?? null)} small />
              <MiniStat label="Dernière activité" value={fmtDateTime(data.summary?.last_seen ?? data.logins?.last_seen ?? null)} small />
            </div>

            <Section title="Utilisateurs associés">
              {!data.users.length && <Empty label="Aucun utilisateur identifié" />}
              {data.users.map(u => (
                <div key={u.user_id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span>
                    <span className="text-foreground">{u.name}</span>
                    <span className="text-muted-foreground text-xs"> · {u.email}</span>
                  </span>
                  <Badge className="bg-muted text-muted-foreground">{u.events} évén.</Badge>
                </div>
              ))}
            </Section>

            <Section title="Endpoints concernés">
              {!data.endpoints.length && <Empty label="Aucun endpoint enregistré" />}
              {data.endpoints.map((e, i) => (
                <div key={`${e.endpoint}-${i}`} className="flex items-center justify-between px-3 py-1.5">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {e.http_method} {clip(e.endpoint, 52)}
                  </span>
                  <Badge className="bg-muted text-muted-foreground">{e.count}</Badge>
                </div>
              ))}
            </Section>

            <Section title="Derniers événements">
              {!data.events.length && <Empty label="Aucun événement" />}
              {data.events.map(e => (
                <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground whitespace-nowrap">{fmtDateTime(e.created_at)}</span>
                  <span className="text-foreground flex-1 truncate">{eventLabel(e.event_type)}</span>
                  <Badge className={SEVERITY_STYLE[e.severity]}>{e.severity.toUpperCase()}</Badge>
                  <Badge className={STATUS_STYLE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                </div>
              ))}
            </Section>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}><X className="w-4 h-4" /> Fermer</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Petits composants partagés ──────────────────────────────────── */
function MiniStat({ label, value, small }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-2.5">
      <p className={`font-bold text-foreground ${small ? 'text-[11px]' : 'text-lg'}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-foreground mb-1">{title}</h4>
      <div className="rounded-xl border border-border divide-y divide-border">{children}</div>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function Empty({ label, icon: Icon = Activity }: { label: string; icon?: React.ElementType }) {
  return (
    <div className="py-8 text-center">
      <Icon className="w-8 h-8 mx-auto text-muted-foreground opacity-30 mb-2" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function Pager({ page, setPage, hasMore, count }: {
  page: number; setPage: (n: number) => void; hasMore: boolean; count: number
}) {
  if (page === 0 && !hasMore) return null
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs">
      <span className="text-muted-foreground">
        Page <strong className="text-foreground">{page + 1}</strong> · {count} lignes
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted/60 disabled:opacity-40"
        >
          ← Préc.
        </button>
        <button
          onClick={() => setPage(page + 1)}
          disabled={!hasMore}
          className="px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted/60 disabled:opacity-40"
        >
          Suiv. →
        </button>
      </div>
    </div>
  )
}
