import { useState, useCallback } from 'react'
import { currentTenantIdForCache } from '@/lib/authToken'

export type AutoTrigger =
  | 'invoice_overdue'
  | 'quote_accepted'
  | 'domain_expiring'
  | 'subscription_expiring'
  | 'client_created'
  | 'payment_received'

export type AutoActionType =
  | 'send_whatsapp'
  | 'send_email'
  | 'create_task'
  | 'update_status'

export type AutoChannel = 'whatsapp' | 'email' | 'both'

export interface AutoAction {
  type:       AutoActionType
  template?:  string
  channel?:   AutoChannel
  title?:     string
  delay_days?: number
}

export interface AutoCondition {
  field: string
  op:    '>' | '<' | '=' | '>=' | '<='
  value: string | number
}

export interface AutoRule {
  id:             string
  label:          string
  description:    string
  enabled:        boolean
  trigger_type:   AutoTrigger
  trigger_config: Record<string, number | string>
  conditions:     AutoCondition[]
  actions:        AutoAction[]
  runs_total:     number
  last_run_at?:   string
  created_at:     string
}

export interface AutoLog {
  id:           string
  rule_id:      string
  rule_label:   string
  action_type:  AutoActionType
  status:       'success' | 'failed' | 'pending'
  entity_ref?:  string
  error?:       string
  executed_at:  string
}

/* Per-tenant keys — cleared on logout by purgeClientSession().
   Prefix starts with `automation_` which matches
   LOCAL_STORAGE_TENANT_PREFIXES in lib/session.ts. */
const rulesKey = () => `automation_rules_${currentTenantIdForCache()}`
const logsKey  = () => `automation_logs_${currentTenantIdForCache()}`

const DEFAULT_RULES: AutoRule[] = [
  {
    id: '1', label: 'Relance paiement — J+7',
    description: 'Email de rappel 7 jours après échéance de facture impayée',
    enabled: true, trigger_type: 'invoice_overdue',
    trigger_config: { delay_days: 7 },
    conditions: [],
    actions: [{ type: 'send_email', template: 'relance_paiement_1', channel: 'email' }],
    runs_total: 12, last_run_at: '2026-04-15T09:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '2', label: 'Relance urgente — J+15 (WhatsApp)',
    description: 'Message WhatsApp urgent 15 jours après échéance',
    enabled: true, trigger_type: 'invoice_overdue',
    trigger_config: { delay_days: 15 },
    conditions: [],
    actions: [{ type: 'send_whatsapp', template: 'relance_urgente', channel: 'whatsapp' }],
    runs_total: 7, last_run_at: '2026-04-14T09:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '3', label: 'Facture auto depuis devis accepté',
    description: "Génère une facture dès qu'un devis est marqué Accepté",
    enabled: true, trigger_type: 'quote_accepted',
    trigger_config: {},
    conditions: [],
    actions: [{ type: 'update_status' }],
    runs_total: 5, last_run_at: '2026-04-16T08:30:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '4', label: 'Alerte renouvellement domaine — J-30',
    description: 'Notification 30 jours avant expiration domaine',
    enabled: true, trigger_type: 'domain_expiring',
    trigger_config: { days_before: 30 },
    conditions: [],
    actions: [
      { type: 'send_email',    template: 'domaine_expiring', channel: 'both' },
      { type: 'create_task',   title: 'Renouveler le domaine', delay_days: 0 },
    ],
    runs_total: 3, last_run_at: '2026-04-10T09:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '5', label: 'Tâche suivi — Nouveau client',
    description: "Crée une tâche de suivi 3 jours après l'ajout d'un client",
    enabled: false, trigger_type: 'client_created',
    trigger_config: { delay_days: 3 },
    conditions: [],
    actions: [{ type: 'create_task', title: 'Suivi onboarding client', delay_days: 3 }],
    runs_total: 0,
    created_at: '2026-01-01T00:00:00Z',
  },
]

const DEFAULT_LOGS: AutoLog[] = [
  { id: 'l1', rule_id: '1', rule_label: 'Relance paiement — J+7',     action_type: 'send_email',    status: 'success', entity_ref: 'FAC-2026-003', executed_at: '2026-04-15T09:02:11Z' },
  { id: 'l2', rule_id: '2', rule_label: 'Relance urgente — J+15',     action_type: 'send_whatsapp', status: 'success', entity_ref: 'FAC-2026-001', executed_at: '2026-04-14T09:01:55Z' },
  { id: 'l3', rule_id: '3', rule_label: 'Facture auto depuis devis',   action_type: 'update_status', status: 'success', entity_ref: 'DEV-2026-004', executed_at: '2026-04-16T08:30:22Z' },
  { id: 'l4', rule_id: '1', rule_label: 'Relance paiement — J+7',     action_type: 'send_email',    status: 'failed',  entity_ref: 'FAC-2026-005', error: 'Email introuvable', executed_at: '2026-04-13T09:00:44Z' },
  { id: 'l5', rule_id: '4', rule_label: 'Alerte renouvellement domaine', action_type: 'create_task', status: 'success', entity_ref: 'nextgital.com',  executed_at: '2026-04-10T09:00:12Z' },
]

function loadRules(): AutoRule[] {
  try {
    const stored = localStorage.getItem(rulesKey())
    if (stored) return JSON.parse(stored)
  } catch {}
  return DEFAULT_RULES
}

function saveRules(rules: AutoRule[]) {
  try { localStorage.setItem(rulesKey(), JSON.stringify(rules)) } catch {}
}

function loadLogs(): AutoLog[] {
  try {
    const stored = localStorage.getItem(logsKey())
    if (stored) return JSON.parse(stored)
  } catch {}
  return DEFAULT_LOGS
}

function saveLogs(logs: AutoLog[]) {
  try { localStorage.setItem(logsKey(), JSON.stringify(logs)) } catch {}
}

export function useAutomations() {
  const [rules, setRulesState] = useState<AutoRule[]>(loadRules)
  const [logs,  setLogsState]  = useState<AutoLog[]>(loadLogs)

  const setRules = useCallback((updater: (prev: AutoRule[]) => AutoRule[]) => {
    setRulesState(prev => {
      const next = updater(prev)
      saveRules(next)
      return next
    })
  }, [])

  const addRule = useCallback((rule: Omit<AutoRule, 'id' | 'runs_total' | 'created_at'>) => {
    const newRule: AutoRule = {
      ...rule,
      id:         Date.now().toString(),
      runs_total: 0,
      created_at: new Date().toISOString(),
    }
    setRules(prev => [newRule, ...prev])
    return newRule
  }, [setRules])

  const updateRule = useCallback((id: string, patch: Partial<AutoRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }, [setRules])

  const deleteRule = useCallback((id: string) => {
    setRules(prev => prev.filter(r => r.id !== id))
  }, [setRules])

  const toggleRule = useCallback((id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }, [setRules])

  const addLog = useCallback((log: Omit<AutoLog, 'id' | 'executed_at'>) => {
    const newLog: AutoLog = {
      ...log,
      id:          Date.now().toString(),
      executed_at: new Date().toISOString(),
    }
    setLogsState(prev => {
      const next = [newLog, ...prev].slice(0, 200) // keep last 200 logs
      saveLogs(next)
      return next
    })
  }, [])

  const stats = {
    total:    rules.length,
    active:   rules.filter(r => r.enabled).length,
    runsTotal: rules.reduce((s, r) => s + r.runs_total, 0),
    successRate: logs.length > 0
      ? Math.round(logs.filter(l => l.status === 'success').length / logs.length * 100)
      : 100,
  }

  return { rules, logs, addRule, updateRule, deleteRule, toggleRule, addLog, stats }
}
