import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Settings, User, Bell, Shield, Globe, Save, RefreshCcw, Check, Eye, EyeOff, Download, Smartphone, CheckCircle2, MonitorSmartphone, Apple, Code2, Copy, KeyRound, ExternalLink, Library } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import NotificationsAutoSettings from '@/components/settings/NotificationsAutoSettings'
import TaskRemindersSettings from '@/components/settings/TaskRemindersSettings'
import MessagesNotifSettings from '@/components/settings/MessagesNotifSettings'

const LS = {
  company:  'gestiq_company',
  activity: 'gestiq_activity',
  country:  'gestiq_country',
  currency: 'gestiq_currency',
  fullname: 'gestiq_fullname',
  role:     'gestiq_role',
  onboarding: 'gestiq_onboarding_done',
}

function get(key: string, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

function save(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch {}
}

const ACTIVITIES = ['Agence Web / Digital','Développement Logiciel','Conseil & Formation','Commerce','Immobilier','Santé','Juridique','Autre']
const COUNTRIES  = ['Maroc','France','Belgique','Canada','Tunisie','Algérie','Sénégal','Autre']
const CURRENCIES = ['MAD','EUR','USD','XOF','TND']
const ROLES      = ['Dirigeant / Fondateur','Directeur commercial','Comptable','Manager','Commercial','Assistante']

const NOTIFICATIONS = [
  { label: 'Renouvellements domaines (30j avant)',   key: 'notif_domains'   },
  { label: 'Factures impayées (7j après échéance)',  key: 'notif_invoices'  },
  { label: 'Prospects sans relance (14j)',            key: 'notif_prospects' },
  { label: 'Rapport mensuel automatique',             key: 'notif_report'    },
  { label: 'Alertes abonnements',                    key: 'notif_subs'      },
]

function getNotifState() {
  const defaults: Record<string, boolean> = {
    notif_domains: true, notif_invoices: true, notif_prospects: true,
    notif_report: false, notif_subs: true,
  }
  const result: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(defaults)) {
    try { result[k] = localStorage.getItem(k) !== null ? localStorage.getItem(k) === 'true' : v }
    catch { result[k] = v }
  }
  return result
}

export default function Parametres() {
  const [profile, setProfile] = useState({
    fullname:  get(LS.fullname, 'NEXT GITAL Admin'),
    role:      get(LS.role,     ''),
    email:     'info@nextgital.com',
    telephone: '0661000000',
  })

  const [entreprise, setEntreprise] = useState({
    company:  get(LS.company,  'NEXT GITAL Agency'),
    activity: get(LS.activity, ''),
    country:  get(LS.country,  'Maroc'),
    currency: get(LS.currency, 'MAD'),
    adresse:  '',
    tva_defaut: '20',
  })

  const [notifs, setNotifs] = useState<Record<string, boolean>>(getNotifState)
  const [onboardingReset, setOnboardingReset] = useState(false)

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false })

  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [appInstalled, setAppInstalled] = useState(false)
  const isIOS = typeof navigator !== 'undefined'
    && /iphone|ipad|ipod/i.test(navigator.userAgent)
    && !(window as any).MSStream

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true
    if (standalone) setAppInstalled(true)

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    const onInstalled = () => {
      setAppInstalled(true)
      setInstallPrompt(null)
      toast.success('Application installée')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    try {
      installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted') toast.success('Installation lancée')
      setInstallPrompt(null)
    } catch {
      toast.error('Installation impossible')
    }
  }

  const saveProfile = () => {
    save(LS.fullname, profile.fullname)
    save(LS.role,     profile.role)
    toast.success('Profil mis à jour')
  }

  const saveEntreprise = () => {
    save(LS.company,  entreprise.company)
    save(LS.activity, entreprise.activity)
    save(LS.country,  entreprise.country)
    save(LS.currency, entreprise.currency)
    toast.success('Paramètres entreprise sauvegardés')
  }

  const toggleNotif = (key: string) => {
    setNotifs(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(key, String(next[key])) } catch {}
      return next
    })
    toast.success('Préférence mise à jour')
  }

  const changePassword = async () => {
    if (!pwForm.current || !pwForm.next) return toast.error('Remplissez tous les champs')
    if (pwForm.next.length < 6) return toast.error('Le nouveau mot de passe doit contenir au moins 6 caractères')
    if (pwForm.next !== pwForm.confirm) return toast.error('Les mots de passe ne correspondent pas')
    setPwLoading(true)
    try {
      await api.post('/api/auth/change-password', { currentPassword: pwForm.current, newPassword: pwForm.next })
      toast.success('Mot de passe mis à jour avec succès')
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur lors du changement de mot de passe')
    } finally {
      setPwLoading(false)
    }
  }

  const resetOnboarding = () => {
    try { localStorage.removeItem(LS.onboarding) } catch {}
    setOnboardingReset(true)
    toast.success('Onboarding réinitialisé — rechargez la page pour le relancer')
  }

  return (
    <div className="space-y-6 animate-fade-in pb-6 max-w-4xl">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Paramètres
          </h1>
          <p className="page-sub">Configuration de votre espace NEXT GITAL</p>
        </div>
      </div>

      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil">Profil</TabsTrigger>
          <TabsTrigger value="entreprise">Entreprise</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="securite">Sécurité</TabsTrigger>
          <TabsTrigger value="application">Application</TabsTrigger>
          <TabsTrigger value="integrations">Intégrations</TabsTrigger>
        </TabsList>

        {/* ── Profil ── */}
        <TabsContent value="profil">
          <div className="card-premium p-6 space-y-5">
            <h2 className="section-title flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Informations personnelles
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label">Nom complet</label>
                <AutocorrectInput value={profile.fullname} onChange={e => setProfile(p => ({ ...p, fullname: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Email</label>
                <Input type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Téléphone</label>
                <Input value={profile.telephone} onChange={e => setProfile(p => ({ ...p, telephone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Rôle</label>
                <Select value={profile.role} onValueChange={v => setProfile(p => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={saveProfile} className="gap-1.5"><Save className="w-4 h-4" />Sauvegarder</Button>
          </div>
        </TabsContent>

        {/* ── Entreprise ── */}
        <TabsContent value="entreprise">
          <div className="card-premium p-6 space-y-5">
            <h2 className="section-title flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Configuration entreprise
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label">Raison sociale</label>
                <AutocorrectInput value={entreprise.company} onChange={e => setEntreprise(p => ({ ...p, company: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Secteur d'activité</label>
                <Select value={entreprise.activity} onValueChange={v => setEntreprise(p => ({ ...p, activity: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITIES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Pays</label>
                <Select value={entreprise.country} onValueChange={v => setEntreprise(p => ({ ...p, country: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Devise par défaut</label>
                <Select value={entreprise.currency} onValueChange={v => setEntreprise(p => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Adresse</label>
                <AutocorrectInput value={entreprise.adresse} onChange={e => setEntreprise(p => ({ ...p, adresse: e.target.value }))} placeholder="Oujda, Maroc" />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">TVA par défaut (%)</label>
                <Input value={entreprise.tva_defaut} onChange={e => setEntreprise(p => ({ ...p, tva_defaut: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={saveEntreprise} className="gap-1.5"><Save className="w-4 h-4" />Sauvegarder</Button>
              <Button
                variant="outline"
                onClick={resetOnboarding}
                disabled={onboardingReset}
                className="gap-1.5 text-muted-foreground"
              >
                {onboardingReset
                  ? <><Check className="w-4 h-4 text-emerald-500" /> Réinitialisé</>
                  : <><RefreshCcw className="w-4 h-4" /> Réinitialiser l'onboarding</>
                }
              </Button>
              <Button asChild variant="outline" className="gap-1.5">
                <Link to="modeles-prestations">
                  <Library className="w-4 h-4" /> Modèles de prestations (devis)
                </Link>
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Notifications ── */}
        <TabsContent value="notifications" className="space-y-4">
          {/* Notifs système (son + navigateur) */}
          <SystemNotificationsPanel />

          {/* Messagerie privée : par quels canaux être prévenu d'un message */}
          <MessagesNotifSettings />

          {/* Envois automatiques pilotés par le serveur (alertes + rapports) */}
          <NotificationsAutoSettings />

          {/* Rappels AVANT l'échéance des tâches (cloche + email + navigateur) */}
          <TaskRemindersSettings />

          <div className="card-premium p-6 space-y-4">
            <h2 className="section-title flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Règles métier
            </h2>
            {NOTIFICATIONS.map(n => (
              <div key={n.key} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm text-foreground">{n.label}</span>
                <button
                  onClick={() => toggleNotif(n.key)}
                  className={`w-10 h-5 rounded-full transition-all relative ${notifs[n.key] ? 'bg-blue-600' : 'bg-border'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${notifs[n.key] ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Sécurité ── */}
        <TabsContent value="securite">
          <div className="card-premium p-6 space-y-5">
            <h2 className="section-title flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Changer le mot de passe
            </h2>
            <div className="space-y-4 max-w-sm">
              <div className="space-y-1.5">
                <label className="form-label">Mot de passe actuel</label>
                <div className="relative">
                  <Input
                    type={showPw.current ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={pwForm.current}
                    onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                    className="pr-9"
                  />
                  <button type="button" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(p => ({ ...p, current: !p.current }))}>
                    {showPw.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Nouveau mot de passe</label>
                <div className="relative">
                  <Input
                    type={showPw.next ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={pwForm.next}
                    onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                    className="pr-9"
                  />
                  <button type="button" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(p => ({ ...p, next: !p.next }))}>
                    {showPw.next ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pwForm.next && pwForm.next.length < 6 && (
                  <p className="text-xs text-red-500">Au moins 6 caractères requis</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Confirmer le nouveau mot de passe</label>
                <div className="relative">
                  <Input
                    type={showPw.confirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={pwForm.confirm}
                    onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                    className="pr-9"
                  />
                  <button type="button" className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => setShowPw(p => ({ ...p, confirm: !p.confirm }))}>
                    {showPw.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                  <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
                )}
              </div>
            </div>
            <Button onClick={changePassword} disabled={pwLoading} className="gap-1.5">
              <Save className="w-4 h-4" />
              {pwLoading ? 'Enregistrement…' : 'Mettre à jour le mot de passe'}
            </Button>
          </div>
        </TabsContent>

        {/* ── Application ── */}
        <TabsContent value="application">
          <div className="card-premium p-6 space-y-5">
            <h2 className="section-title flex items-center gap-2">
              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Installer l'application
            </h2>
            <p className="text-sm text-muted-foreground">
              Installez NEXT GITAL sur votre appareil pour y accéder en un clic, même hors ligne, comme une application native.
            </p>

            {appInstalled ? (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Application installée</p>
                  <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Vous utilisez NEXT GITAL en mode application.</p>
                </div>
              </div>
            ) : isIOS ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/40">
                  <Apple className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Installation sur iPhone / iPad</p>
                    <ol className="text-xs text-blue-700/90 dark:text-blue-300/90 space-y-1 list-decimal list-inside">
                      <li>Ouvrez ce site dans <strong>Safari</strong></li>
                      <li>Touchez l'icône <strong>Partager</strong> en bas de l'écran</li>
                      <li>Sélectionnez <strong>« Sur l'écran d'accueil »</strong></li>
                      <li>Confirmez en touchant <strong>Ajouter</strong></li>
                    </ol>
                  </div>
                </div>
              </div>
            ) : installPrompt ? (
              <Button onClick={handleInstall} className="gap-2">
                <Download className="w-4 h-4" />
                Installer NEXT GITAL
              </Button>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-muted rounded-lg border border-border">
                <MonitorSmartphone className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Installation manuelle</p>
                  <p className="text-xs text-muted-foreground">
                    Votre navigateur n'a pas encore proposé l'installation. Sur Chrome / Edge, cherchez l'icône <Smartphone className="inline w-3.5 h-3.5 mx-0.5" /> dans la barre d'adresse, ou ouvrez le menu et choisissez <strong>« Installer NEXT GITAL »</strong>.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avantages</p>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Lancement en un clic depuis le bureau ou l'écran d'accueil</li>
                <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Fonctionne sans connexion Internet (données mises en cache)</li>
                <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Interface plein écran sans barres du navigateur</li>
                <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Mises à jour automatiques en arrière-plan</li>
              </ul>
            </div>
          </div>
        </TabsContent>

        {/* ── Intégrations ── */}
        <TabsContent value="integrations">
          <WidgetIntegration />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ── Panneau : notifications système (son + browser push) ──────────── */
function SystemNotificationsPanel() {
  const [sound, setSound] = useState<'on' | 'off'>(() => {
    try { return (localStorage.getItem('gestiq_notif_sound') as 'on' | 'off') ?? 'on' } catch { return 'on' }
  })
  const [push, setPush] = useState<'on' | 'off'>(() => {
    try { return (localStorage.getItem('gestiq_browser_notifs') as 'on' | 'off') ?? 'on' } catch { return 'on' }
  })
  const [perm, setPerm] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  )

  const toggleSound = (v: 'on' | 'off') => {
    setSound(v)
    try { localStorage.setItem('gestiq_notif_sound', v) } catch {}
    if (v === 'on') {
      /* Petit test sonore pour confirmer */
      import('@/lib/notificationSound').then(m => m.playNotificationSound())
    }
  }
  const togglePush = async (v: 'on' | 'off') => {
    setPush(v)
    try { localStorage.setItem('gestiq_browser_notifs', v) } catch {}
    if (v === 'on' && 'Notification' in window && Notification.permission === 'default') {
      const result = await Notification.requestPermission()
      setPerm(result)
    }
  }

  const Toggle = ({ value, onClick }: { value: 'on' | 'off'; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`w-10 h-5 rounded-full transition-all relative ${value === 'on' ? 'bg-blue-600' : 'bg-border'}`}
    >
      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${value === 'on' ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  )

  return (
    <div className="card-premium p-6 space-y-4">
      <h2 className="section-title flex items-center gap-2">
        <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        Notifications système
      </h2>
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <div>
          <p className="text-sm font-medium text-foreground">🔔 Son de notification</p>
          <p className="text-[11px] text-muted-foreground">Un bip discret à chaque nouvelle notification</p>
        </div>
        <Toggle value={sound} onClick={() => toggleSound(sound === 'on' ? 'off' : 'on')} />
      </div>
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <div>
          <p className="text-sm font-medium text-foreground">🖥️ Notifications navigateur</p>
          <p className="text-[11px] text-muted-foreground">
            Notification système même si l'onglet est en arrière-plan
            {perm === 'denied' && <span className="text-red-600 dark:text-red-400 ml-1">• Bloqué par le navigateur</span>}
            {perm === 'default' && <span className="text-amber-600 dark:text-amber-400 ml-1">• Permission non demandée</span>}
            {perm === 'granted' && <span className="text-emerald-600 dark:text-emerald-400 ml-1">• Autorisé</span>}
          </p>
        </div>
        <Toggle value={push} onClick={() => togglePush(push === 'on' ? 'off' : 'on')} />
      </div>
    </div>
  )
}

/* ── Widget Lead — generates a workspace key and shows the embed snippet ── */
function WidgetIntegration() {
  const [key, setKey]       = useState<string>('')
  const [loading, setLoad]  = useState(false)
  const [source, setSource] = useState('Landing nextgital.ma')
  const [color, setColor]   = useState('#2563eb')

  const apiBase = (import.meta as any).env?.VITE_API_URL || window.location.origin
  const widgetSrc = apiBase.replace(/\/+$/, '') + '/widget.js'

  const generate = async () => {
    setLoad(true)
    try {
      const r = await api.get<{ key: string }>('/api/public/widget-key')
      setKey(r.key)
      toast.success('Clé générée')
    } catch (e: any) {
      toast.error('Génération impossible : ' + (e?.message ?? 'erreur'))
    } finally { setLoad(false) }
  }

  const snippet = key
    ? `<script src="${widgetSrc}"
        data-workspace="${key}"
        data-api="${apiBase.replace(/\/+$/, '')}"
        data-source="${source.replace(/"/g, '&quot;')}"
        data-color="${color}">
</script>`
    : ''

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Copié dans le presse-papier'))
      .catch(() => toast.error('Copie impossible'))
  }

  return (
    <div className="space-y-6">
      <div className="card-premium p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Widget de capture de leads
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Collez le code ci-dessous sur n'importe quelle page de votre site (Landing,
              page contact, etc.). Le formulaire qui s'affiche envoie chaque soumission
              directement dans <b>CRM &gt; Prospects</b> de cet espace de travail.
            </p>
          </div>
          <Button onClick={generate} disabled={loading} className="gap-1.5">
            {loading
              ? <><RefreshCcw className="w-4 h-4 animate-spin" /> …</>
              : key
                ? <><KeyRound className="w-4 h-4" /> Régénérer la clé</>
                : <><KeyRound className="w-4 h-4" /> Générer une clé</>}
          </Button>
        </div>

        {key && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label">Étiquette source <span className="text-muted-foreground">(facultatif)</span></label>
                <AutocorrectInput value={source} onChange={e => setSource(e.target.value)} placeholder="Landing nextgital.ma" />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Couleur d'accent</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={e => setColor(e.target.value)}
                    className="w-10 h-10 rounded-md border border-[var(--surface-card-border)] bg-transparent cursor-pointer" />
                  <Input value={color} onChange={e => setColor(e.target.value)} className="flex-1" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="form-label">Clé d'atelier (sensible)</label>
                <button onClick={() => copy(key)}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Copier
                </button>
              </div>
              <code className="block text-xs p-3 rounded-md bg-slate-100 dark:bg-slate-900/40 break-all border border-[var(--surface-card-border)]">
                {key}
              </code>
              <p className="text-xs text-muted-foreground">
                Conservez-la. N'importe qui ayant cette clé peut soumettre un lead à votre espace
                (rate-limit : 10/min). Régénérez si elle est compromise.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="form-label">Code à coller sur votre site</label>
                <button onClick={() => copy(snippet)}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Copier
                </button>
              </div>
              <pre className="text-xs p-3 rounded-md bg-slate-100 dark:bg-slate-900/40 overflow-x-auto border border-[var(--surface-card-border)] whitespace-pre">
{snippet}
              </pre>
            </div>

            <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 text-xs space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> Personnalisation supplémentaire
              </p>
              <ul className="space-y-1 text-muted-foreground">
                <li><code>data-target="#mon-conteneur"</code> — injecter le formulaire dans un élément existant</li>
                <li><code>data-fields="name,email,phone,company,message"</code> — choisir les champs affichés</li>
                <li><code>data-heading="Demande de devis"</code> — changer le titre</li>
                <li><code>data-button-text="Envoyer ma demande"</code> — texte du bouton</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
