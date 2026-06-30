import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Zap, MessageSquare, Mail, FileText, Globe, CheckSquare,
  Plus, Trash2, Edit2, Play, Clock, Settings2, Check,
  RefreshCw, Send, Receipt, Activity, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useAutomations,
  type AutoRule, type AutoTrigger, type AutoChannel, type AutoLog,
} from '@/hooks/useAutomations'

/* ─── Display config ─────────────────────────────────────────────── */
const TRIGGER_CONFIG: Record<AutoTrigger, {
  icon: React.ElementType; color: string; bg: string; label: string
}> = {
  invoice_overdue:         { icon: Receipt,     color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20',   label: 'Relance Paiement'    },
  quote_accepted:          { icon: FileText,    color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',       label: 'Devis Accepté'       },
  domain_expiring:         { icon: Globe,       color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20',   label: 'Domaines'            },
  subscription_expiring:   { icon: RefreshCw,   color: 'text-cyan-500',   bg: 'bg-cyan-50 dark:bg-cyan-900/20',       label: 'Abonnements'         },
  client_created:          { icon: CheckSquare, color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20',     label: 'Nouveau Client'      },
  payment_received:        { icon: Receipt,     color: 'text-emerald-500',bg: 'bg-emerald-50 dark:bg-emerald-900/20', label: 'Paiement Reçu'       },
}

const CHANNEL_CONFIG: Record<AutoChannel, { label: string; icon: React.ElementType; color: string }> = {
  whatsapp: { label: 'WhatsApp',         icon: MessageSquare, color: 'text-green-600'  },
  email:    { label: 'Email',            icon: Mail,          color: 'text-blue-600'   },
  both:     { label: 'WhatsApp + Email', icon: Send,          color: 'text-purple-600' },
}

const ACTION_LABELS: Record<string, string> = {
  send_whatsapp: 'Envoyer WhatsApp',
  send_email:    'Envoyer Email',
  create_task:   'Créer une tâche',
  update_status: 'Mettre à jour statut',
}

const LOG_STATUS_CFG = {
  success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', label: 'Succès' },
  failed:  { icon: XCircle,      color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-900/20',         label: 'Erreur' },
  pending: { icon: AlertCircle,  color: 'text-amber-500',   bg: 'bg-amber-50 dark:bg-amber-900/20',     label: 'En cours' },
}

type Tab = 'rules' | 'logs'

/* ─── Page ───────────────────────────────────────────────────────── */
export default function Automatisations() {
  const { rules, logs, addRule, updateRule, deleteRule, toggleRule, addLog, stats } = useAutomations()
  const [activeTab,  setActiveTab]  = useState<Tab>('rules')
  const [showNew,    setShowNew]    = useState(false)
  const [editRule,   setEditRule]   = useState<AutoRule | null>(null)
  const [newTrigger, setNewTrigger] = useState<AutoTrigger>('invoice_overdue')
  const [form,       setForm]       = useState<Partial<AutoRule>>({
    label: '', description: '', trigger_type: 'invoice_overdue',
    trigger_config: { delay_days: 7 }, conditions: [], actions: [],
    enabled: true,
  })
  const [simulating, setSimulating] = useState<string | null>(null)

  async function simulate(rule: AutoRule) {
    setSimulating(rule.id)
    await new Promise(r => setTimeout(r, 1400))
    updateRule(rule.id, {
      last_run_at: new Date().toISOString(),
      runs_total:  rule.runs_total + 1,
    })
    addLog({
      rule_id:    rule.id,
      rule_label: rule.label,
      action_type: rule.actions[0]?.type ?? 'send_email',
      status:      'success',
      entity_ref:  'SIMULATION',
    })
    setSimulating(null)
    toast.success(`Simulation réussie — "${rule.label}"`)
    setActiveTab('logs')
  }

  function handleDelete(id: string) {
    deleteRule(id)
    toast.success('Règle supprimée')
  }

  function handleToggle(id: string, label: string, enabled: boolean) {
    toggleRule(id)
    toast(enabled ? `⏸ "${label}" désactivée` : `✅ "${label}" activée`)
  }

  function openNew() {
    setForm({
      label: '', description: '', trigger_type: newTrigger,
      trigger_config: { delay_days: 7 }, conditions: [], actions: [],
      enabled: true,
    })
    setShowNew(true)
  }

  function openEdit(rule: AutoRule) {
    setEditRule(rule)
    setForm({ ...rule })
  }

  function saveNew() {
    if (!form.label?.trim()) { toast.error('Donnez un nom à la règle'); return }
    addRule({
      label:          form.label!,
      description:    form.description ?? '',
      enabled:        form.enabled ?? true,
      trigger_type:   form.trigger_type ?? 'invoice_overdue',
      trigger_config: form.trigger_config ?? {},
      conditions:     form.conditions ?? [],
      actions:        form.actions ?? [],
    })
    setShowNew(false)
    toast.success('Règle créée et sauvegardée')
  }

  function saveEdit() {
    if (!editRule) return
    updateRule(editRule.id, form)
    setEditRule(null)
    toast.success('Règle mise à jour')
  }

  // Group rules by trigger
  const grouped = Object.keys(TRIGGER_CONFIG).reduce((acc, key) => {
    acc[key as AutoTrigger] = rules.filter(r => r.trigger_type === key)
    return acc
  }, {} as Record<AutoTrigger, AutoRule[]>)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" />
            Automatisations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Moteur d'exécution · Règles persistantes · Journal d'activité
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4" /> Nouvelle règle
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Règles actives',     value: stats.active,                   icon: Zap,       color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Total règles',       value: stats.total,                    icon: Settings2, color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20'     },
          { label: 'Exécutions totales', value: stats.runsTotal,                icon: RefreshCw, color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-900/20'   },
          { label: 'Taux de succès',     value: `${stats.successRate}%`,        icon: Activity,  color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
        ].map(s => (
          <div key={s.label} className="card-premium p-4 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
              <s.icon className={cn('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl w-fit">
        {([
          { id: 'rules', label: 'Règles',          icon: Zap      },
          { id: 'logs',  label: `Journal (${logs.length})`, icon: Activity },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Rules ── */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          {(Object.keys(TRIGGER_CONFIG) as AutoTrigger[]).map(trigger => {
            const cfg   = TRIGGER_CONFIG[trigger]
            const items = grouped[trigger] ?? []
            if (!items.length) return null
            return (
              <div key={trigger} className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center', cfg.bg)}>
                    <cfg.icon className={cn('w-3.5 h-3.5', cfg.color)} />
                  </div>
                  {cfg.label}
                </div>
                <div className="space-y-2">
                  {items.map(rule => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      simulating={simulating === rule.id}
                      onToggle={() => handleToggle(rule.id, rule.label, rule.enabled)}
                      onSimulate={() => simulate(rule)}
                      onEdit={() => openEdit(rule)}
                      onDelete={() => handleDelete(rule.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
          {rules.length === 0 && (
            <div className="card-premium p-12 text-center">
              <Zap className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Aucune règle configurée. Créez votre première automatisation.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Logs ── */}
      {activeTab === 'logs' && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="section-title">Journal d'exécution</h2>
            <span className="text-xs text-muted-foreground">{logs.length} entrée{logs.length > 1 ? 's' : ''}</span>
          </div>
          {logs.length === 0 ? (
            <div className="py-12 text-center">
              <Activity className="w-10 h-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Aucune exécution enregistrée</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {logs.map(log => <LogRow key={log.id} log={log} />)}
            </div>
          )}
        </div>
      )}

      {/* ── New rule dialog ── */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nouvelle règle d'automatisation</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Déclencheur</label>
              <Select
                value={newTrigger}
                onValueChange={v => {
                  const t = v as AutoTrigger
                  setNewTrigger(t)
                  setForm(prev => ({ ...prev, trigger_type: t }))
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice_overdue">Facture impayée après délai</SelectItem>
                  <SelectItem value="quote_accepted">Devis accepté</SelectItem>
                  <SelectItem value="domain_expiring">Domaine proche expiration</SelectItem>
                  <SelectItem value="subscription_expiring">Abonnement proche expiration</SelectItem>
                  <SelectItem value="client_created">Nouveau client créé</SelectItem>
                  <SelectItem value="payment_received">Paiement reçu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <RuleFormFields form={form} setForm={setForm} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Annuler</Button>
              <Button size="sm" onClick={saveNew}><Check className="w-4 h-4 mr-1" />Créer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit rule dialog ── */}
      <Dialog open={!!editRule} onOpenChange={v => { if (!v) setEditRule(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Modifier la règle</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <RuleFormFields form={form} setForm={setForm} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditRule(null)}>Annuler</Button>
              <Button size="sm" onClick={saveEdit}><Check className="w-4 h-4 mr-1" />Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── RuleCard ───────────────────────────────────────────────────── */
function RuleCard({
  rule, simulating, onToggle, onSimulate, onEdit, onDelete,
}: {
  rule: AutoRule; simulating: boolean
  onToggle: () => void; onSimulate: () => void
  onEdit: () => void; onDelete: () => void
}) {
  const cfg = TRIGGER_CONFIG[rule.trigger_type]
  const primaryAction = rule.actions[0]
  const channel = primaryAction?.channel

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('card-premium p-4 flex items-center gap-4 transition-opacity', !rule.enabled && 'opacity-50')}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', cfg.bg)}>
        <cfg.icon className={cn('w-5 h-5', cfg.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{rule.label}</span>
          {channel && <ChannelBadge channel={channel} />}
          {primaryAction && (
            <span className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {ACTION_LABELS[primaryAction.type] ?? primaryAction.type}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{rule.description}</p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          {rule.last_run_at && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Dernière: {new Date(rule.last_run_at).toLocaleDateString('fr-FR')}
            </span>
          )}
          <span className="flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            {rule.runs_total} exécution{rule.runs_total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline" size="sm" className="h-8 px-3 text-xs"
          disabled={simulating} onClick={onSimulate}
        >
          {simulating
            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />Exécution…</>
            : <><Play className="w-3.5 h-3.5 mr-1" />Tester</>}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <button
          onClick={onToggle}
          className={cn(
            'relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0',
            rule.enabled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600',
          )}
        >
          <span className={cn(
            'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200',
            rule.enabled ? 'left-[18px]' : 'left-0.5',
          )} />
        </button>
        <Button
          variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </motion.div>
  )
}

/* ─── LogRow ─────────────────────────────────────────────────────── */
function LogRow({ log }: { log: AutoLog }) {
  const cfg  = LOG_STATUS_CFG[log.status]
  const Icon = cfg.icon
  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', cfg.bg)}>
        <Icon className={cn('w-4 h-4', cfg.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{log.rule_label}</p>
        <p className="text-xs text-muted-foreground">
          {ACTION_LABELS[log.action_type] ?? log.action_type}
          {log.entity_ref ? ` · ${log.entity_ref}` : ''}
          {log.error ? ` · ⚠ ${log.error}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
          {cfg.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(log.executed_at).toLocaleString('fr-FR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
          })}
        </span>
      </div>
    </div>
  )
}

/* ─── ChannelBadge ───────────────────────────────────────────────── */
function ChannelBadge({ channel }: { channel: AutoChannel }) {
  const cfg = CHANNEL_CONFIG[channel]
  return (
    <span className={cn('flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800', cfg.color)}>
      <cfg.icon className="w-3 h-3" />{cfg.label}
    </span>
  )
}

/* ─── RuleFormFields ─────────────────────────────────────────────── */
function RuleFormFields({
  form, setForm,
}: {
  form: Partial<AutoRule>
  setForm: React.Dispatch<React.SetStateAction<Partial<AutoRule>>>
}) {
  const set = <K extends keyof AutoRule>(k: K, v: AutoRule[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const setConfig = (k: string, v: number | string) =>
    setForm(prev => ({ ...prev, trigger_config: { ...prev.trigger_config, [k]: v } }))

  const setAction = (actionType: string, channel?: AutoChannel) =>
    setForm(prev => ({ ...prev, actions: [{ type: actionType as any, channel }] }))

  const trigger = form.trigger_type

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Nom de la règle</label>
        <AutocorrectInput
          placeholder="Ex: Relance 7 jours"
          value={form.label ?? ''}
          onChange={e => set('label', e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Description</label>
        <AutocorrectInput
          placeholder="Description courte..."
          value={form.description ?? ''}
          onChange={e => set('description', e.target.value)}
        />
      </div>

      {(trigger === 'invoice_overdue' || trigger === 'domain_expiring' || trigger === 'subscription_expiring') && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {trigger === 'invoice_overdue' ? 'Délai après échéance (j)' : 'Jours avant expiration'}
            </label>
            <Input
              type="number" min={1} max={180}
              value={(form.trigger_config?.delay_days ?? form.trigger_config?.days_before ?? 7) as number}
              onChange={e => setConfig(trigger === 'invoice_overdue' ? 'delay_days' : 'days_before', +e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Canal d'envoi</label>
            <Select
              value={form.actions?.[0]?.channel ?? 'email'}
              onValueChange={v => setAction(form.actions?.[0]?.type ?? 'send_email', v as AutoChannel)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="both">WhatsApp + Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {trigger === 'client_created' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Délai après création (j)</label>
            <Input
              type="number" min={0} max={30}
              value={(form.trigger_config?.delay_days ?? 0) as number}
              onChange={e => setConfig('delay_days', +e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Action</label>
            <Select
              value={form.actions?.[0]?.type ?? 'create_task'}
              onValueChange={v => setAction(v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="create_task">Créer une tâche</SelectItem>
                <SelectItem value="send_email">Envoyer un email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {trigger === 'quote_accepted' && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
          <FileText className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Quand un devis est marqué <strong>Accepté</strong>, une facture identique sera générée automatiquement.</span>
        </div>
      )}

      {trigger === 'payment_received' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Action après paiement</label>
          <Select
            value={form.actions?.[0]?.type ?? 'send_email'}
            onValueChange={v => setAction(v, form.actions?.[0]?.channel)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="send_email">Envoyer reçu par email</SelectItem>
              <SelectItem value="send_whatsapp">Envoyer reçu WhatsApp</SelectItem>
              <SelectItem value="create_task">Créer tâche de livraison</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
