import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Bot, Sparkles, MapPin, Mail, MessageCircle, Clock, ShieldCheck,
  Zap, AlertCircle, CheckCircle2, Loader2, PlayCircle, LineChart, Save, Plus, X, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useAutopilotConfig, useSaveAutopilotConfig, useRunAutopilotNow,
  useOutboundSectors, useOutboundTemplates, useOutboundIntegrationsStatus,
} from '@/hooks/useOutbound'
import { isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'
import type { AutopilotConfig } from '@/lib/outboundApi'

const SERVICE_PRESETS = [
  { label: '⚙️  ERP sur-mesure',       value: 'ERP sur-mesure (gestion complète : clients, factures, projets, stock, RH)' },
  { label: '🤖  Modules IA',           value: 'Modules IA (assistant, classification auto, génération de contenu)' },
  { label: '🌐  Site web performant',  value: 'Site web performant (vitrine, e-commerce, prise de RDV) livré en 2 semaines' },
  { label: '📣  Marketing IA',         value: 'Marketing digital + prospection auto (Google Ads, SEO local, emailing)' },
]

export default function OutboundAutopilot() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)

  const { data: cfg, isLoading } = useAutopilotConfig()
  const { data: sectors = [] } = useOutboundSectors()
  const { data: templates = [] } = useOutboundTemplates('whatsapp')
  const { data: status } = useOutboundIntegrationsStatus()
  const save = useSaveAutopilotConfig()
  const runNow = useRunAutopilotNow()

  const [form, setForm] = useState<Partial<AutopilotConfig>>({})
  const [newCity, setNewCity] = useState('')

  useEffect(() => {
    if (cfg && !form.tenant_id) setForm({ ...cfg })
  }, [cfg]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeSectors = sectors.filter(s => s.actif !== false && !s.parent_id)
  const cities = useMemo(() => (form.cities ?? []) as string[], [form.cities])
  const suggestedCities: string[] = (cfg?.default_cities_suggestion ?? []) as string[]

  const set = <K extends keyof AutopilotConfig>(k: K, v: AutopilotConfig[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const addCity = (name: string) => {
    const n = name.trim()
    if (!n) return
    if (cities.includes(n)) return
    set('cities', [...cities, n])
    setNewCity('')
  }
  const removeCity = (name: string) => set('cities', cities.filter(c => c !== name))

  const canSave = !!(form.keyword?.trim() || form.sector_id)
  const wantsEmail = !!form.channel_email
  const wantsWA    = !!form.channel_whatsapp

  const missingRequirements: string[] = []
  if (!status?.google_places) missingRequirements.push('Google Places (GOOGLE_PLACES_API_KEY)')
  if (wantsEmail && !status?.anthropic && status?.ai_provider !== 'openai') missingRequirements.push('Provider IA (Claude ou OpenAI)')
  if (wantsEmail && !status?.smtp && !status?.resend) missingRequirements.push('SMTP ou Resend')
  if (wantsWA && !status?.whatsapp) missingRequirements.push('WhatsApp Cloud')
  if (wantsWA && !form.whatsapp_template_id) missingRequirements.push('Template WhatsApp')

  if (!canManageAll) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          L'Autopilot est réservé aux admins et managers.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground text-sm p-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement de la configuration…
      </div>
    )
  }

  const submit = async () => {
    if (!canSave) return
    await save.mutateAsync({
      ...form,
      /* Toujours envoyer un array côté transport */
      cities: cities as any,
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <h1 className="page-title flex items-center gap-2">
            <Bot className="w-6 h-6 text-violet-600" />
            Autopilot Outbound
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 border border-violet-500/30">Beta</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Choisis un secteur, active — le système cherche, écrit et envoie tout seul chaque matin.
            {' '}<Link to={`/${tenantSlug}/outbound/autopilot/monitor`} className="text-sky-600 hover:underline">Voir le monitor</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/${tenantSlug}/outbound/autopilot/email-preview`}>
            <Button variant="secondary" size="sm">
              <Eye className="w-3.5 h-3.5" /> Aperçu email
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            {runNow.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Lancer maintenant
          </Button>
          <Button size="sm" onClick={submit} disabled={!canSave || save.isPending}>
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer
          </Button>
        </div>
      </div>

      {/* Prérequis */}
      {missingRequirements.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Prérequis manquants : {missingRequirements.join(' · ')}. Configure-les dans{' '}
              <Link to={`/${tenantSlug}/outbound/settings`} className="underline">Paramètres</Link>.
            </span>
          </p>
        </div>
      )}

      {/* Toggle global */}
      <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
        <label className="flex items-center gap-4 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.enabled}
            onChange={e => set('enabled', e.target.checked)}
            className="w-5 h-5 accent-violet-600"
          />
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-600" />
              Autopilot activé
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {form.enabled
                ? `Le prochain run démarre chaque jour à ${String(form.run_hour_utc ?? 7).padStart(2, '0')}:00 UTC.`
                : 'Désactivé — aucune recherche ni envoi automatique.'}
            </p>
          </div>
          {cfg?.last_run_status && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              cfg.last_run_status === 'ok'      ? 'bg-emerald-500/15 text-emerald-600' :
              cfg.last_run_status === 'partial' ? 'bg-amber-500/15 text-amber-600' :
                                                  'bg-red-500/15 text-red-600'
            }`}>
              Dernier run : {cfg.last_run_status}
            </span>
          )}
        </label>
      </div>

      {/* Ciblage */}
      <section className="rounded-2xl border border-border bg-[var(--surface-card)] p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <MapPin className="w-4 h-4 text-sky-600" /> Ciblage
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Mot-clé (métier / activité)
            </label>
            <Input
              value={form.keyword ?? ''}
              onChange={e => set('keyword', e.target.value)}
              placeholder='Ex : "boulangerie", "cabinet dentaire", "auto-école"'
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Ou secteur du catalogue
            </label>
            <Select
              value={form.sector_id || '__none__'}
              onValueChange={v => set('sector_id', v === '__none__' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {activeSectors.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.couleur }} />
                      {s.nom}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Villes à balayer ({cities.length})
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {cities.map(c => (
              <span key={c} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-700 border border-sky-500/30">
                {c}
                <button type="button" onClick={() => removeCity(c)} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCity}
              onChange={e => setNewCity(e.target.value)}
              placeholder="Ajouter une ville (ex. Oujda)"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCity(newCity) } }}
              className="flex-1"
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => addCity(newCity)}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {suggestedCities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestedCities.filter(c => !cities.includes(c)).slice(0, 12).map(c => (
                <button
                  key={c} type="button" onClick={() => addCity(c)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-sky-500/40 hover:text-foreground"
                >+ {c}</button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Rythme & limites */}
      <section className="rounded-2xl border border-border bg-[var(--surface-card)] p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" /> Rythme & limites
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Prospects max / jour">
            <Input type="number" min={1} max={500} value={form.daily_prospect_limit ?? 50}
              onChange={e => set('daily_prospect_limit', Number(e.target.value))} />
          </Field>
          <Field label="Recherches max / jour">
            <Input type="number" min={1} max={200} value={form.daily_search_limit ?? 30}
              onChange={e => set('daily_search_limit', Number(e.target.value))} />
          </Field>
          <Field label="Pause entre envois (sec)">
            <Input type="number" min={30} max={3600} value={form.send_interval_seconds ?? 180}
              onChange={e => set('send_interval_seconds', Number(e.target.value))} />
          </Field>
          <Field label="Heure de lancement (UTC)">
            <Input type="number" min={0} max={23} value={form.run_hour_utc ?? 7}
              onChange={e => set('run_hour_utc', Number(e.target.value))} />
          </Field>
          <Field label="Fenêtre — début">
            <Input type="time" value={form.send_window_start ?? '09:00'}
              onChange={e => set('send_window_start', e.target.value)} />
          </Field>
          <Field label="Fenêtre — fin">
            <Input type="time" value={form.send_window_end ?? '18:00'}
              onChange={e => set('send_window_end', e.target.value)} />
          </Field>
        </div>
      </section>

      {/* Canaux */}
      <section className="rounded-2xl border border-border bg-[var(--surface-card)] p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-600" /> Canaux d'envoi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
            wantsEmail ? 'border-blue-500/40 bg-blue-500/5' : 'border-border'}`}>
            <input type="checkbox" checked={wantsEmail}
              onChange={e => set('channel_email', e.target.checked)}
              className="w-4 h-4 accent-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" /> Email
              </p>
              <p className="text-[11px] text-muted-foreground">Corps personnalisé par IA + signature du tenant.</p>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
            wantsWA ? 'border-green-500/40 bg-green-500/5' : 'border-border'}`}>
            <input type="checkbox" checked={wantsWA}
              onChange={e => set('channel_whatsapp', e.target.checked)}
              className="w-4 h-4 accent-green-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
              </p>
              <p className="text-[11px] text-muted-foreground">Template pré-approuvé Meta (marketing).</p>
            </div>
          </label>
        </div>

        {wantsWA && (
          <Field label="Template WhatsApp (Meta approved)">
            <Select
              value={form.whatsapp_template_id || '__none__'}
              onValueChange={v => set('whatsapp_template_id', v === '__none__' ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Choisir un template WhatsApp…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {templates
                  .filter(t => t.actif && t.whatsapp_template_name)
                  .map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nom} · {t.whatsapp_template_name} ({t.whatsapp_template_language ?? 'ar'})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </section>

      {/* Génération IA */}
      <section className="rounded-2xl border border-border bg-[var(--surface-card)] p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" /> Génération IA
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Langue">
            <Select value={form.language ?? 'fr'} onValueChange={v => set('language', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">🇫🇷 Français</SelectItem>
                <SelectItem value="ar">🇲🇦 العربية</SelectItem>
                <SelectItem value="en">🇬🇧 English</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ton">
            <Select value={form.tone ?? 'professionnel'} onValueChange={v => set('tone', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professionnel">Professionnel</SelectItem>
                <SelectItem value="chaleureux">Chaleureux</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Service à mettre en avant">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            {SERVICE_PRESETS.map(p => (
              <button key={p.label} type="button"
                onClick={() => set('service_focus', p.value)}
                className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                  form.service_focus === p.value
                    ? 'border-violet-500 bg-violet-500/10 shadow-sm'
                    : 'border-border hover:border-violet-500/40'
                }`}
              >{p.label}</button>
            ))}
          </div>
          <Input
            value={form.service_focus ?? ''}
            onChange={e => set('service_focus', e.target.value)}
            placeholder="Ou saisis un service personnalisé (ex : audit SEO, refonte site, etc.)"
          />
        </Field>
      </section>

      {/* Filtres qualité + RGPD */}
      <section className="rounded-2xl border border-border bg-[var(--surface-card)] p-5 space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" /> Filtres qualité & RGPD
        </h2>
        <Toggle label="Ignorer les prospects sans email"
          value={!!form.require_email} onChange={v => set('require_email', v)} />
        <Toggle label="Ignorer les prospects sans site web"
          value={!!form.require_website} onChange={v => set('require_website', v)} />
        <Toggle label="Ignorer les prospects sans téléphone"
          value={!!form.require_phone} onChange={v => set('require_phone', v)} />
        <Toggle label="Respecter le drapeau « Ne plus contacter »"
          value={!!form.respect_ne_plus_contacter} onChange={v => set('respect_ne_plus_contacter', v)} />
      </section>

      {/* CTA final */}
      <div className="flex flex-wrap items-center gap-3 justify-between pt-2">
        <p className="text-[11px] text-muted-foreground">
          Estimation quotidienne : ~{form.daily_prospect_limit ?? 50} prospects · pause {form.send_interval_seconds ?? 180}s entre envois.
        </p>
        <div className="flex items-center gap-2">
          <Link to={`/${tenantSlug}/outbound/autopilot/monitor`}>
            <Button variant="secondary" size="sm">
              <LineChart className="w-3.5 h-3.5" /> Voir le monitor
            </Button>
          </Link>
          <Button size="sm" onClick={submit} disabled={!canSave || save.isPending}>
            {save.isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enregistrement…</>
              : <><CheckCircle2 className="w-3.5 h-3.5" /> Enregistrer</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-emerald-600" />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  )
}
