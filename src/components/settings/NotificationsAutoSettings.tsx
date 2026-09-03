/**
 * Paramètres → Notifications → « Notifications et rapports automatiques ».
 *
 * Pilote le scheduler serveur (server/lib/reportScheduler.ts) :
 * activation, fuseau horaire, heures d'envoi, seuils métier et
 * destinataires. Affiche aussi le résultat du dernier envoi de chaque
 * type — c'est la seule façon de savoir, sans ouvrir les logs, que le
 * système tourne vraiment.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  BellRing, Clock, Mail, Save, Send, Eye, Loader2, CheckCircle2, AlertTriangle, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notificationsApi, type NotificationSettings, type ReportKind } from '@/lib/api'
import { cn } from '@/lib/utils'

const TIMEZONES = [
  'Africa/Casablanca', 'Europe/Paris', 'Europe/Madrid', 'Europe/London',
  'Africa/Algiers', 'Africa/Tunis', 'Africa/Cairo', 'America/Montreal', 'UTC',
]

const WEEKDAYS = [
  { value: 1, label: 'Lundi' },   { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },{ value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },{ value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
]

const HOURS = Array.from({ length: 24 }, (_, h) => h)

interface Block {
  kind:      ReportKind
  icon:      string
  title:     string
  desc:      string
  enabledKey: keyof NotificationSettings
  hourKey:   keyof NotificationSettings
}

/* Catégories d'e-mails déclenchés par un événement — miroir de
   notification_settings.email_kinds (migration 096). Les rapports
   planifiés gardent leurs propres interrupteurs, plus bas. */
const EMAIL_KINDS: Array<{ key: string; icon: string; label: string; desc: string }> = [
  { key: 'projet_message',   icon: '💬', label: 'Messages de discussion',
    desc: "À chaque message publié sur le fil d'un projet." },
  { key: 'tache_creee',      icon: '✅', label: 'Tâche ajoutée par un membre',
    desc: "Quand un employé ajoute une tâche à sa propre liste." },
  { key: 'tache_validation', icon: '🔍', label: 'Tâche à valider',
    desc: "Quand un membre marque une tâche comme terminée." },
  { key: 'prospect_nouveau', icon: '🎯', label: 'Nouveau prospect',
    desc: 'À la création d\'un prospect dans le CRM.' },
  { key: 'paiement_recu',    icon: '💰', label: 'Paiement reçu',
    desc: "À l'enregistrement d'un paiement." },
  { key: 'devis_accepte',    icon: '📄', label: 'Devis accepté',
    desc: "Quand un devis passe au statut accepté." },
  { key: 'expiration',       icon: '🌐', label: 'Expiration domaine / hébergement',
    desc: 'Rappels à 30, 14, 7 et 1 jour, puis le jour même.' },
]

const BLOCKS: Block[] = [
  {
    kind: 'tasks_overdue', icon: '⏰',
    title: 'Alerte tâches en retard ou non terminées',
    desc: "Chaque jour : les tâches dont l'échéance est dépassée, celles à rendre aujourd'hui, celles qui attendent votre validation et celles qui n'ont plus bougé.",
    enabledKey: 'tasks_alert_enabled', hourKey: 'tasks_alert_hour',
  },
  {
    kind: 'clients_to_contact', icon: '📞',
    title: 'Alerte clients et prospects à contacter',
    desc: "Chaque jour : les relances échues, les prospects jamais appelés, les clients sans aucun contact enregistré et ceux dont on est sans nouvelle.",
    enabledKey: 'contacts_alert_enabled', hourKey: 'contacts_alert_hour',
  },
  {
    kind: 'daily_report', icon: '📊',
    title: 'Rapport quotidien',
    desc: 'Tâches réalisées dans la journée, tâches en attente, clients à contacter et actions prioritaires.',
    enabledKey: 'daily_report_enabled', hourKey: 'daily_report_hour',
  },
  {
    kind: 'weekly_report', icon: '🗓️',
    title: 'Rapport hebdomadaire',
    desc: 'Bilan des 7 derniers jours : réalisé par personne, retards, contacts traités ou non, résultats commerciaux et prochaines actions.',
    enabledKey: 'weekly_report_enabled', hourKey: 'weekly_report_hour',
  },
]

/* Interrupteur visuel — même rendu que les autres bascules de la page. */
function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        'w-10 h-5 rounded-full transition-all relative shrink-0',
        on ? 'bg-blue-600' : 'bg-border',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <div className={cn('w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all', on ? 'right-0.5' : 'left-0.5')} />
    </button>
  )
}

export default function NotificationsAutoSettings() {
  const qc = useQueryClient()
  const [draft, setDraft]   = useState<NotificationSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyKind, setBusyKind] = useState<ReportKind | null>(null)
  const [preview, setPreview] = useState<{ kind: ReportKind; subject: string; html: string } | null>(null)
  const [recipientsText, setRecipientsText] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications', 'settings'],
    queryFn:  () => notificationsApi.settings(),
    staleTime: 30_000,
  })

  const { data: runsData } = useQuery({
    queryKey: ['notifications', 'runs'],
    queryFn:  () => notificationsApi.runs(),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!data?.settings) return
    setDraft(data.settings)
    setRecipientsText((data.settings.recipients ?? []).join(', '))
  }, [data])

  const lastByKind = useMemo(() => {
    const map = new Map<string, NonNullable<typeof runsData>['last'][number]>()
    for (const r of runsData?.last ?? []) map.set(r.kind, r)
    return map
  }, [runsData])

  const dirty = useMemo(() => {
    if (!draft || !data?.settings) return false
    const original = data.settings
    const sameRecipients =
      recipientsText.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).join('|')
      === (original.recipients ?? []).join('|')
    return !sameRecipients || (Object.keys(original) as Array<keyof NotificationSettings>)
      .some(k => k !== 'recipients' && k !== 'updated_at' && draft[k] !== original[k])
  }, [draft, data, recipientsText])

  if (isLoading) {
    return (
      <div className="card-premium p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement de la configuration…
      </div>
    )
  }

  if (error || !draft) {
    const msg = (error as Error | undefined)?.message ?? ''
    return (
      <div className="card-premium p-6 space-y-2">
        <h2 className="section-title flex items-center gap-2">
          <BellRing className="w-4 h-4 text-blue-600" /> Notifications et rapports automatiques
        </h2>
        <p className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {msg.includes('086')
            ? "La migration 086 n'est pas encore appliquée sur cette base. Lancez-la, puis rechargez la page."
            : `Configuration indisponible${msg ? ` — ${msg}` : ''}.`}
        </p>
      </div>
    )
  }

  const set = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) =>
    setDraft(d => (d ? { ...d, [key]: value } : d))

  const save = async () => {
    setSaving(true)
    try {
      const recipients = recipientsText.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      const res = await notificationsApi.saveSettings({ ...draft, recipients })
      setDraft(res.settings)
      setRecipientsText((res.settings.recipients ?? []).join(', '))
      await qc.invalidateQueries({ queryKey: ['notifications', 'settings'] })
      toast.success('Configuration enregistrée — les envois suivent ce planning.')
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const sendNow = async (kind: ReportKind) => {
    setBusyKind(kind)
    try {
      const res = await notificationsApi.runNow(kind)
      if (res.empty) toast.info('Rien à signaler pour le moment — aucun email envoyé.')
      else toast.success('Envoyé. Vérifiez votre boîte mail et la cloche de notifications.')
      await qc.invalidateQueries({ queryKey: ['notifications'] })
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Envoi impossible')
    } finally {
      setBusyKind(null)
    }
  }

  const openPreview = async (kind: ReportKind) => {
    setBusyKind(kind)
    try {
      const res = await notificationsApi.preview(kind)
      setPreview({ kind, subject: res.subject, html: res.html })
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Aperçu indisponible')
    } finally {
      setBusyKind(null)
    }
  }

  const clock = data?.clock

  return (
    <div className="card-premium p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <BellRing className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Notifications et rapports automatiques
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Le serveur envoie ces messages tout seul, tous les jours, même application fermée.
            Chaque envoi part une seule fois par jour : redémarrer le serveur ne provoque pas de doublon.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{draft.enabled ? 'Actif' : 'En pause'}</span>
          <Toggle on={draft.enabled} onClick={() => set('enabled', !draft.enabled)} />
        </div>
      </div>

      {/* Fuseau + heure locale + canaux */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="form-label flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Fuseau horaire</label>
          <Select value={draft.timezone} onValueChange={v => set('timezone', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[...new Set([draft.timezone, ...TIMEZONES])].map(tz => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clock && (
            <p className="text-[11px] text-muted-foreground">
              Il est actuellement <strong>{clock.local_time}</strong> dans ce fuseau.
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="form-label flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Destinataires</label>
          <Input
            value={recipientsText}
            onChange={e => setRecipientsText(e.target.value)}
            placeholder="Laisser vide = tous les administrateurs de l'espace"
          />
          <p className="text-[11px] text-muted-foreground">
            Plusieurs adresses séparées par des virgules. Les notifications dans l'application
            restent visibles par tous les administrateurs.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Toggle on={draft.email_enabled} onClick={() => set('email_enabled', !draft.email_enabled)} />
          Envoi par email
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Toggle on={draft.inapp_enabled} onClick={() => set('inapp_enabled', !draft.inapp_enabled)} />
          Notification dans l'application (cloche)
        </label>
      </div>

      {/* Quelles catégories partent vraiment par email */}
      <div className={cn('space-y-2', !draft.email_enabled && 'opacity-50 pointer-events-none')}>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quels emails recevoir</h3>
          <p className="text-xs text-muted-foreground">
            Une catégorie décochée reste visible dans la cloche et en notification
            navigateur — elle ne part simplement plus par email.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {EMAIL_KINDS.map(k => {
            const on = (draft.email_kinds ?? []).includes(k.key)
            return (
              <label
                key={k.key}
                className="flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer hover:border-blue-300 transition-colors"
              >
                <Toggle
                  on={on}
                  onClick={() => set(
                    'email_kinds',
                    (on
                      ? (draft.email_kinds ?? []).filter(x => x !== k.key)
                      : [...(draft.email_kinds ?? []), k.key]) as never,
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {k.icon} {k.label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{k.desc}</span>
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Les 4 envois */}
      <div className="space-y-3">
        {BLOCKS.map(b => {
          const on   = draft[b.enabledKey] as boolean
          const hour = draft[b.hourKey] as number
          const last = lastByKind.get(b.kind)
          return (
            <div key={b.kind} className={cn(
              'rounded-xl border p-4 space-y-3 transition-colors',
              on && draft.enabled ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/10' : 'border-border bg-muted/40',
            )}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{b.icon} {b.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
                </div>
                <Toggle on={on} onClick={() => set(b.enabledKey, !on as never)} disabled={!draft.enabled} />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label className="form-label">Heure d'envoi</label>
                  <Select value={String(hour)} onValueChange={v => set(b.hourKey, Number(v) as never)}>
                    <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOURS.map(h => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {b.kind === 'weekly_report' && (
                  <div className="space-y-1">
                    <label className="form-label">Jour</label>
                    <Select value={String(draft.weekly_report_weekday)} onValueChange={v => set('weekly_report_weekday', Number(v))}>
                      <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map(d => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {b.kind === 'tasks_overdue' && (
                  <div className="space-y-1">
                    <label className="form-label">Tâche « sans mouvement » après</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={1} max={365} className="w-[86px]"
                        value={draft.tasks_stale_days}
                        onChange={e => set('tasks_stale_days', Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                      />
                      <span className="text-xs text-muted-foreground">jours</span>
                    </div>
                  </div>
                )}

                {b.kind === 'clients_to_contact' && (
                  <>
                    <div className="space-y-1">
                      <label className="form-label">Relancer un client après</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min={1} max={365} className="w-[86px]"
                          value={draft.contact_delay_days}
                          onChange={e => set('contact_delay_days', Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                        />
                        <span className="text-xs text-muted-foreground">jours sans contact</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="form-label">Délai de grâce nouveau prospect</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min={0} max={90} className="w-[86px]"
                          value={draft.new_lead_grace_days}
                          onChange={e => set('new_lead_grace_days', Math.max(0, Math.min(90, Number(e.target.value) || 0)))}
                        />
                        <span className="text-xs text-muted-foreground">jours</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" size="sm" className="gap-1.5"
                          disabled={busyKind === b.kind}
                          onClick={() => openPreview(b.kind)}>
                    {busyKind === b.kind ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    Aperçu
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5"
                          disabled={busyKind === b.kind}
                          onClick={() => sendNow(b.kind)}>
                    <Send className="w-3.5 h-3.5" /> Envoyer maintenant
                  </Button>
                </div>
              </div>

              {last && (
                <p className="text-[11px] flex items-center gap-1.5 text-muted-foreground">
                  {last.status === 'ok'    && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  {last.status === 'empty' && <Info className="w-3.5 h-3.5 text-slate-400" />}
                  {last.status === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                  Dernier passage : {new Date(last.started_at).toLocaleString('fr-FR')} —{' '}
                  {last.status === 'ok'    ? `${last.emails_sent} email(s) envoyé(s)`
                    : last.status === 'empty' ? 'rien à signaler'
                    : last.status === 'error' ? 'échec (voir les journaux serveur)'
                    : 'en cours'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </Button>
        {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Modifications non enregistrées</span>}
      </div>

      {/* Aperçu du rendu réel de l'email */}
      <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{preview?.subject}</DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe
              title="Aperçu du rapport"
              srcDoc={preview.html}
              className="w-full h-[65vh] rounded-lg border border-border bg-white"
              sandbox=""
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
