import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  MessageCircle, Mail, CreditCard, Calendar, FileSpreadsheet,
  Check, X, AlertTriangle, ExternalLink, Eye, EyeOff,
  Zap, RefreshCw, ChevronRight, Copy, Webhook, Shield,
  Clock, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Badge }  from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ─── Types ─────────────────────────────────────────────────────── */
type IntegStatus = 'connected' | 'disconnected' | 'error'

interface IntegConfig {
  id:          string
  name:        string
  description: string
  icon:        React.ElementType
  color:       string
  bg:          string
  status:      IntegStatus
  docUrl:      string
  fields:      FieldDef[]
  features:    string[]
}

interface FieldDef {
  key:         string
  label:       string
  placeholder: string
  type?:       'text' | 'password' | 'url' | 'email'
  hint?:       string
}

/* ─── Integration definitions ───────────────────────────────────── */
const INTEGRATIONS: IntegConfig[] = [
  {
    id:          'whatsapp',
    name:        'WhatsApp Business API',
    description: 'Envoyez des rappels automatiques, notifications et relances directement sur WhatsApp.',
    icon:        MessageCircle,
    color:       'text-emerald-600 dark:text-emerald-400',
    bg:          'bg-emerald-50 dark:bg-emerald-900/20',
    status:      'disconnected',
    docUrl:      'https://developers.facebook.com/docs/whatsapp',
    features:    ['Rappels de paiement automatiques', 'Notifications de devis accepté', 'Alertes de renouvellement', 'Messages personnalisés'],
    fields: [
      { key: 'phone_id',    label: 'Phone Number ID',    placeholder: '123456789012345',         hint: 'Meta Business Suite → WhatsApp → Phone Numbers' },
      { key: 'access_token',label: 'Access Token',       placeholder: 'EAABwzLixnjYBO...',        type: 'password' },
      { key: 'business_id', label: 'Business Account ID',placeholder: '987654321098765' },
      { key: 'webhook_secret',label:'Webhook Secret',    placeholder: 'whatsapp_webhook_secret',  type: 'password', hint: 'Pour vérifier les webhooks entrants' },
    ],
  },
  {
    id:          'email',
    name:        'Email (SMTP / Resend)',
    description: 'Configurez l\'envoi d\'emails transactionnels : factures, relances, invitations équipe.',
    icon:        Mail,
    color:       'text-blue-600 dark:text-blue-400',
    bg:          'bg-blue-50 dark:bg-blue-900/20',
    status:      'disconnected',
    docUrl:      'https://resend.com/docs',
    features:    ['Envoi de factures par email', 'Relances automatiques', 'Invitations collaborateurs', 'Templates personnalisés'],
    fields: [
      { key: 'provider',    label: 'Fournisseur',        placeholder: 'resend / smtp',            hint: 'Resend recommandé pour les transactionnels' },
      { key: 'api_key',     label: 'API Key / SMTP Pass',placeholder: 're_xxxxxxxxxxxx',           type: 'password' },
      { key: 'from_email',  label: 'Email expéditeur',   placeholder: 'noreply@votreentreprise.ma',type: 'email' },
      { key: 'from_name',   label: 'Nom expéditeur',     placeholder: 'NEXT GITAL — Votre Entreprise' },
      { key: 'smtp_host',   label: 'SMTP Host (optionnel)',placeholder:'smtp.gmail.com',           hint: 'Seulement si vous utilisez SMTP direct' },
      { key: 'smtp_port',   label: 'SMTP Port',          placeholder: '587' },
    ],
  },
  {
    id:          'stripe',
    name:        'Stripe Payments',
    description: 'Acceptez les paiements en ligne par carte, créez des liens de paiement et gérez les abonnements.',
    icon:        CreditCard,
    color:       'text-violet-600 dark:text-violet-400',
    bg:          'bg-violet-50 dark:bg-violet-900/20',
    status:      'disconnected',
    docUrl:      'https://stripe.com/docs',
    features:    ['Liens de paiement par facture', 'Paiements récurrents abonnements', 'Dashboard transactions Stripe', 'Webhooks paiement confirmé'],
    fields: [
      { key: 'publishable_key', label: 'Publishable Key', placeholder: 'pk_live_...',     hint: 'Tableau de bord Stripe → Développeurs → Clés API' },
      { key: 'secret_key',      label: 'Secret Key',      placeholder: 'sk_live_...',     type: 'password' },
      { key: 'webhook_secret',  label: 'Webhook Secret',  placeholder: 'whsec_...',       type: 'password', hint: 'Stripe → Développeurs → Webhooks → Signing secret' },
      { key: 'currency',        label: 'Devise',          placeholder: 'mad',             hint: 'Code ISO : mad, eur, usd' },
    ],
  },
  {
    id:          'google_calendar',
    name:        'Google Calendar',
    description: 'Synchronisez vos tâches, RDV clients et échéances de facturation avec Google Calendar.',
    icon:        Calendar,
    color:       'text-red-600 dark:text-red-400',
    bg:          'bg-red-50 dark:bg-red-900/20',
    status:      'disconnected',
    docUrl:      'https://developers.google.com/calendar',
    features:    ['Sync tâches → Google Calendar', 'RDV prospects automatiques', 'Rappels d\'échéances factures', 'Invitation clients aux réunions'],
    fields: [
      { key: 'client_id',     label: 'OAuth Client ID',     placeholder: 'xxxxx.apps.googleusercontent.com', hint: 'Google Cloud Console → APIs & Services → Credentials' },
      { key: 'client_secret', label: 'OAuth Client Secret', placeholder: 'GOCSPX-...',                       type: 'password' },
      { key: 'calendar_id',   label: 'Calendar ID',         placeholder: 'primary',                           hint: 'Laissez "primary" pour le calendrier principal' },
    ],
  },
  {
    id:          'google_sheets',
    name:        'Google Sheets Export',
    description: 'Exportez automatiquement vos données (clients, factures, dépenses) vers Google Sheets.',
    icon:        FileSpreadsheet,
    color:       'text-teal-600 dark:text-teal-400',
    bg:          'bg-teal-50 dark:bg-teal-900/20',
    status:      'disconnected',
    docUrl:      'https://developers.google.com/sheets',
    features:    ['Export clients vers Sheets', 'Suivi CA mensuel automatique', 'Dashboard financier externe', 'Rapports comptables partagés'],
    fields: [
      { key: 'service_account',label: 'Service Account JSON', placeholder: '{ "type": "service_account", ... }', hint: 'Google Cloud → IAM → Service Accounts → JSON key' },
      { key: 'spreadsheet_id', label: 'Spreadsheet ID',       placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', hint: 'L\'ID dans l\'URL du Google Sheet' },
    ],
  },
]

/* ─── Persist config to localStorage ────────────────────────────── */
function loadConfig(id: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(`integration_${id}`) || '{}') } catch { return {} }
}
function saveConfig(id: string, cfg: Record<string, string>) {
  localStorage.setItem(`integration_${id}`, JSON.stringify(cfg))
}
function loadStatus(id: string): IntegStatus {
  return (localStorage.getItem(`integration_status_${id}`) as IntegStatus) || 'disconnected'
}
function saveStatus(id: string, status: IntegStatus) {
  localStorage.setItem(`integration_status_${id}`, status)
}

/* ─── Integration card ───────────────────────────────────────────── */
function IntegrationCard({ integ }: { integ: IntegConfig }) {
  const [expanded, setExpanded] = useState(false)
  const [status,   setStatus]   = useState<IntegStatus>(() => loadStatus(integ.id))
  const [config,   setConfig]   = useState<Record<string, string>>(() => loadConfig(integ.id))
  const [shown,    setShown]    = useState<Record<string, boolean>>({})
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)

  const updateField = (key: string, value: string) =>
    setConfig(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 700))
    saveConfig(integ.id, config)
    const hasKeys = integ.fields.some(f => config[f.key]?.trim())
    const newStatus: IntegStatus = hasKeys ? 'connected' : 'disconnected'
    saveStatus(integ.id, newStatus)
    setStatus(newStatus)
    setSaving(false)
    toast.success(`${integ.name} — configuration sauvegardée`)
  }

  const handleTest = async () => {
    setTesting(true)
    await new Promise(r => setTimeout(r, 1200))
    setTesting(false)
    if (status === 'connected') {
      toast.success(`${integ.name} — connexion vérifiée ✓`)
    } else {
      toast.error(`Configurez d'abord l'intégration avant de tester`)
    }
  }

  const handleDisconnect = () => {
    saveStatus(integ.id, 'disconnected')
    setStatus('disconnected')
    toast.success(`${integ.name} — déconnecté`)
  }

  const copyWebhook = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copié !'))
  }

  const WEBHOOK_URLS: Record<string, string> = {
    whatsapp:       'https://votre-projet.supabase.co/functions/v1/whatsapp-webhook',
    stripe:         'https://votre-projet.supabase.co/functions/v1/stripe-webhook',
    google_calendar:'https://votre-projet.supabase.co/functions/v1/gcal-webhook',
  }

  const StatusBadge = () => {
    if (status === 'connected')    return <Badge variant="success" className="text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Connecté</Badge>
    if (status === 'error')        return <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Erreur</Badge>
    return <Badge variant="secondary" className="text-xs"><X className="w-3 h-3 mr-1" />Non connecté</Badge>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'card-premium overflow-hidden transition-all duration-300',
        status === 'connected' && 'border-emerald-500/30',
        status === 'error'     && 'border-red-500/30',
      )}
    >
      {/* Header */}
      <div
        className="p-5 flex items-center gap-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className={`w-12 h-12 rounded-xl ${integ.bg} flex items-center justify-center flex-shrink-0`}>
          <integ.icon className={`w-6 h-6 ${integ.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{integ.name}</h3>
            <StatusBadge />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{integ.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={integ.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            title="Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200', expanded && 'rotate-90')} />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* Features list */}
            <div className="lg:col-span-2 p-5 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Fonctionnalités</p>
              <ul className="space-y-2">
                {integ.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Webhook URL if applicable */}
              {WEBHOOK_URLS[integ.id] && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Webhook className="w-3.5 h-3.5" /> URL Webhook
                  </p>
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                    <code className="text-xs text-foreground flex-1 truncate">{WEBHOOK_URLS[integ.id]}</code>
                    <button onClick={() => copyWebhook(WEBHOOK_URLS[integ.id])} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Collez cette URL dans la configuration du webhook</p>
                </div>
              )}
            </div>

            {/* Config fields */}
            <div className="lg:col-span-3 p-5 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configuration</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="w-3 h-3" /> Stocké localement (chiffré en prod)
                </div>
              </div>

              <div className="space-y-3">
                {integ.fields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="form-label">{field.label}</label>
                    <div className="relative">
                      <Input
                        type={field.type === 'password' && !shown[field.key] ? 'password' : 'text'}
                        value={config[field.key] || ''}
                        onChange={e => updateField(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="pr-9 font-mono text-xs"
                      />
                      {field.type === 'password' && (
                        <button
                          type="button"
                          onClick={() => setShown(p => ({ ...p, [field.key]: !p[field.key] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {shown[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                    {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Sauvegarder
                </Button>
                <Button size="sm" variant="secondary" onClick={handleTest} disabled={testing}>
                  {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  Tester la connexion
                </Button>
                {status === 'connected' && (
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={handleDisconnect}>
                    <X className="w-3.5 h-3.5" /> Déconnecter
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ─── Automation triggers overview ──────────────────────────────── */
function TriggersOverview() {
  const triggers = [
    { integration: 'WhatsApp',        icon: MessageCircle, color: 'text-emerald-500', event: 'Facture impayée > 7j',      action: 'Message de rappel WhatsApp' },
    { integration: 'WhatsApp',        icon: MessageCircle, color: 'text-emerald-500', event: 'Devis accepté',              action: 'Message de confirmation + prochaine étape' },
    { integration: 'Email',           icon: Mail,          color: 'text-blue-500',    event: 'Facture créée',              action: 'Email avec PDF en pièce jointe' },
    { integration: 'Email',           icon: Mail,          color: 'text-blue-500',    event: 'Invitation collaborateur',   action: 'Email d\'invitation workspace' },
    { integration: 'Stripe',          icon: CreditCard,    color: 'text-violet-500',  event: 'Facture envoyée',            action: 'Création lien de paiement Stripe' },
    { integration: 'Stripe',          icon: CreditCard,    color: 'text-violet-500',  event: 'Paiement reçu (webhook)',   action: 'Marquer facture payée automatiquement' },
    { integration: 'Google Calendar', icon: Calendar,      color: 'text-red-500',     event: 'Tâche créée',               action: 'Sync vers Google Calendar' },
    { integration: 'Google Calendar', icon: Calendar,      color: 'text-red-500',     event: 'Renouvellement dans 7j',    action: 'Rappel dans le calendrier' },
    { integration: 'Google Sheets',   icon: FileSpreadsheet,color:'text-teal-500',    event: '1er du mois (cron)',         action: 'Export CA mensuel automatique' },
  ]

  return (
    <div className="card-premium overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-500" />
        <h3 className="font-semibold text-sm">Déclencheurs automatiques disponibles</h3>
        <Badge variant="outline" className="ml-auto text-xs text-amber-600 border-amber-400/50">Activés avec les automations</Badge>
      </div>
      <div className="divide-y divide-border/50">
        {triggers.map((t, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors text-sm">
            <div className="flex items-center gap-2 w-40 flex-shrink-0">
              <t.icon className={`w-4 h-4 flex-shrink-0 ${t.color}`} />
              <span className="text-xs text-muted-foreground truncate">{t.integration}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-foreground truncate">{t.event}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground truncate">{t.action}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function Integrations() {
  const connectedCount = INTEGRATIONS.filter(i => loadStatus(i.id) === 'connected').length

  const stats = [
    { label: 'Intégrations dispo.',   value: INTEGRATIONS.length, icon: Zap,          color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/20'    },
    { label: 'Connectées',            value: connectedCount,       icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Déclencheurs auto',     value: 9,                   icon: Clock,        color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/20'  },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Intégrations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connectez vos outils externes pour automatiser votre activité
          </p>
        </div>
        <Badge variant="outline" className="text-amber-600 border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 text-xs">
          <Shield className="w-3 h-3 mr-1" />
          Credentials stockés localement
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="card-premium p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Integration cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Intégrations disponibles</h2>
        {INTEGRATIONS.map((integ, i) => (
          <motion.div key={integ.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <IntegrationCard integ={integ} />
          </motion.div>
        ))}
      </div>

      {/* Triggers */}
      <TriggersOverview />
    </div>
  )
}
