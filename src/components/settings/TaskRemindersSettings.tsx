/**
 * Réglages « Rappels de tâches » — Paramètres → Notifications.
 *
 * Trois décisions, et une seule mérite une explication :
 *   · quand être prévenu (les défauts, appliqués aux tâches qui ne
 *     précisent rien) ;
 *   · à quelle heure est due une tâche datée sans heure — sans ce
 *     repère, « 30 minutes avant » n'aurait aucun point d'ancrage ;
 *   · par quels canaux.
 *
 * L'activation des notifications navigateur est volontairement traitée
 * à part, avec un bouton de test : c'est la seule chaîne qui peut casser
 * en silence (autorisation refusée, service worker absent, clés VAPID
 * manquantes côté serveur), et on ne le découvrirait qu'en manquant un
 * rappel. L'état affiché dit toujours ce qui bloque.
 */
import { useEffect, useState } from 'react'
import {
  Bell, BellRing, Loader2, Save, Mail, Monitor, Smartphone, Send, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { OFFSET_CHOICES } from '@/components/taches/ReminderPicker'
import {
  useTaskReminderPrefs, useSaveTaskReminderPrefs, usePushSubscription, usePushDevices,
} from '@/hooks/useTaskReminders'
import { sendTestPush } from '@/lib/pushClient'
import type { TaskReminderPrefs } from '@/lib/api'

export default function TaskRemindersSettings() {
  const { prefs, isLoading } = useTaskReminderPrefs()
  const save = useSaveTaskReminderPrefs()
  const push = usePushSubscription()
  const { data: devices = [] } = usePushDevices()

  const [form, setForm] = useState<TaskReminderPrefs>(prefs)
  const [testing, setTesting] = useState(false)

  /* Les données serveur font autorité à chaque rafraîchissement. */
  useEffect(() => { setForm(prefs) }, [prefs])

  const toggleOffset = (min: number) => {
    setForm(f => ({
      ...f,
      default_offsets: f.default_offsets.includes(min)
        ? f.default_offsets.filter(m => m !== min)
        : [...f.default_offsets, min].sort((a, b) => b - a),
    }))
  }

  const runTest = async () => {
    setTesting(true)
    try {
      const res = await sendTestPush()
      toast.success(`Notification envoyée sur ${res.delivered} appareil(s)`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Envoi impossible')
    } finally {
      setTesting(false)
    }
  }

  const pushReady = push.status?.state === 'ready'
  const pushBlocked = push.status && push.status.state !== 'ready' && push.status.state !== 'available'

  return (
    <div className="card-premium p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <BellRing className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            Rappels de tâches
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Être prévenu <strong>avant</strong> l'échéance — pas après.
          </p>
        </div>
        <Button size="sm" onClick={() => save.mutate(form)} disabled={save.isPending || isLoading}>
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </Button>
      </div>

      {/* ── Quand ─────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-foreground mb-2">
          Me prévenir par défaut
        </label>
        <div className="flex flex-wrap gap-2">
          {OFFSET_CHOICES.map(o => {
            const active = form.default_offsets.includes(o.min)
            return (
              <button
                key={o.min}
                type="button"
                onClick={() => toggleOffset(o.min)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                  active
                    ? 'bg-gradient-primary text-white border-transparent'
                    : 'border-border bg-[var(--surface-input)] text-foreground hover:border-electric-500/40',
                )}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          S'applique aux tâches qui ne précisent rien. Chaque tâche peut avoir ses propres rappels,
          ou n'en avoir aucun.
          {form.default_offsets.length === 0 && (
            <strong className="text-amber-600 dark:text-amber-400"> Aucun rappel par défaut : seules les tâches réglées à la main te préviendront.</strong>
          )}
        </p>
      </div>

      {/* ── Heure de référence ────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-foreground mb-1.5">
          Heure supposée d'une tâche sans heure
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="time"
            className="w-32"
            value={(form.default_due_time ?? '09:00:00').slice(0, 5)}
            onChange={e => setForm(f => ({ ...f, default_due_time: e.target.value }))}
          />
          <span className="text-xs text-muted-foreground">
            « 1 jour avant » se calcule à partir de cette heure.
          </span>
        </div>
      </div>

      {/* ── Canaux ────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-foreground mb-2">Par quels canaux</label>
        <div className="space-y-2">
          <Channel
            icon={Bell} label="Cloche dans l'application"
            hint="Garde une trace consultable, même si l'email part en spam."
            checked={form.inapp_enabled}
            onChange={v => setForm(f => ({ ...f, inapp_enabled: v }))}
          />
          <Channel
            icon={Mail} label="Email"
            hint="Le filet pour ce qui ne doit pas être manqué."
            checked={form.email_enabled}
            onChange={v => setForm(f => ({ ...f, email_enabled: v }))}
          />
          <Channel
            icon={Monitor} label="Notification navigateur"
            hint="Chrome et PWA installée sur Mac — même application fermée."
            checked={form.push_enabled}
            onChange={v => setForm(f => ({ ...f, push_enabled: v }))}
          />
        </div>
      </div>

      {/* ── Appareils ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" /> Cet appareil
            </p>
            <p className={cn(
              'text-[11px] mt-1 flex items-center gap-1.5',
              pushReady ? 'text-emerald-600 dark:text-emerald-400'
                : pushBlocked ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground',
            )}>
              {pushReady ? <CheckCircle2 className="w-3 h-3" />
                : pushBlocked ? <AlertTriangle className="w-3 h-3" /> : null}
              {push.status?.reason ?? 'Vérification…'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {pushReady ? (
              <>
                <Button size="sm" variant="secondary" onClick={runTest} disabled={testing}>
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Tester
                </Button>
                <Button size="sm" variant="ghost" onClick={push.disable} disabled={push.busy}>
                  Désactiver
                </Button>
              </>
            ) : (
              <Button
                size="sm" onClick={push.enable}
                disabled={push.busy || push.status?.state === 'unsupported' || push.status?.state === 'no-sw'}
              >
                {push.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                Activer sur cet appareil
              </Button>
            )}
          </div>
        </div>

        {devices.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Appareils abonnés ({devices.length})
            </p>
            {devices.map(d => (
              <div key={d.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate">{d.label ?? 'Appareil'}</span>
                <span className="shrink-0 ml-2">
                  vu le {new Date(d.last_seen_at).toLocaleDateString('fr-FR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Channel({
  icon: Icon, label, hint, checked, onChange,
}: {
  icon: React.ElementType
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border px-3 py-2 hover:border-electric-500/30 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 rounded border-border"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {label}
        </span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">{hint}</span>
      </span>
    </label>
  )
}
