import { useEffect, useState } from 'react'
import { Target, Save, Lock, Sparkles, Crown, Briefcase, TrendingUp, Clock, Repeat, Star } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTenantVision, useUpdateTenantVision, type TenantVision } from '@/hooks/useGuides'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { cn } from '@/lib/utils'

/* Classes input compatibles avec le design system du projet
   (basé sur src/components/ui/input.tsx) */
const INPUT_CLS = 'flex h-10 w-full rounded-lg px-3 py-2 text-base sm:text-sm border border-border bg-[var(--surface-input)] text-foreground placeholder:text-[#B4B2A9] dark:placeholder:text-slate-500 transition-all duration-150 focus-visible:outline-none focus-visible:border-[#378ADD] focus-visible:shadow-[0_0_0_3px_rgba(55,138,221,0.15)] disabled:cursor-not-allowed disabled:opacity-50'
const TEXTAREA_CLS = 'block w-full rounded-lg px-3 py-2 text-sm border border-border bg-[var(--surface-input)] text-foreground placeholder:text-[#B4B2A9] dark:placeholder:text-slate-500 transition-all duration-150 focus-visible:outline-none focus-visible:border-[#378ADD] focus-visible:shadow-[0_0_0_3px_rgba(55,138,221,0.15)] resize-y'

type Form = Partial<Pick<TenantVision,
  'primary_aim' | 'lifestyle_target' | 'why_statement' |
  'monthly_revenue_cap' | 'max_hours_week' | 'strategic_objective' |
  'monthly_target' | 'monthly_target_projets' | 'target_conversion_rate' |
  'target_workspaces' | 'target_avis_google'
>>

export default function Vision() {
  const { role, loading } = useAuth()
  const { data: vision, isLoading } = useTenantVision()
  const update = useUpdateTenantVision()

  const [form, setForm] = useState<Form>({})

  useEffect(() => {
    if (vision) {
      setForm({
        primary_aim:            vision.primary_aim,
        lifestyle_target:       vision.lifestyle_target,
        why_statement:          vision.why_statement,
        monthly_revenue_cap:    vision.monthly_revenue_cap,
        max_hours_week:         vision.max_hours_week,
        strategic_objective:    vision.strategic_objective,
        monthly_target:         vision.monthly_target,
        monthly_target_projets: vision.monthly_target_projets,
        target_conversion_rate: vision.target_conversion_rate,
        target_workspaces:      vision.target_workspaces,
        target_avis_google:     vision.target_avis_google,
      })
    }
  }, [vision])

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900/50" />
  }
  if (role !== 'admin') {
    return (
      <div className="rounded-2xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/20 p-8 text-center">
        <Lock className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-rose-900 dark:text-rose-100">Page réservée à l'administrateur</h2>
        <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">
          Le Primary Aim est une vision personnelle et confidentielle.
        </p>
      </div>
    )
  }

  const save = () => {
    update.mutate({ id: vision?.id, ...form })
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden border border-violet-200 dark:border-violet-800/50">
        <div className="h-1.5 bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500" />
        <div className="bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 p-6">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/30 flex-shrink-0">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Ma Vision
                </h1>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-950/80 dark:text-violet-300 dark:border-violet-800/50 inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Admin seulement
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 italic max-w-2xl">
                « Travaille SUR ta boîte, pas DANS ta boîte. » — Michael Gerber
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-2xl leading-relaxed">
                Ces informations définissent <strong>pourquoi tu construis l'entreprise</strong> — le style de vie visé,
                le plafond mensuel à partir duquel tu lèves le pied, et l'objectif stratégique du trimestre.
                Personne d'autre ne voit cette page.
              </p>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900/50" />
      ) : (
        <>
          {/* Section 1 — Primary Aim */}
          <Section
            icon={Sparkles}
            color="violet"
            title="1. Primary Aim — ma vision personnelle"
            subtitle="Le pourquoi profond, avant le business"
          >
            <Field label="Style de vie visé">
              <AutocorrectTextarea
                className={`${TEXTAREA_CLS} min-h-[80px]`}
                placeholder="Ex. Avoir 30 000 MAD/mois de récurrent, travailler 4 jours par semaine, voyager 6 semaines/an…"
                value={form.lifestyle_target ?? ''}
                onChange={e => setForm(f => ({ ...f, lifestyle_target: e.target.value }))}
              />
            </Field>
            <Field label="Why statement — pourquoi je fais ça">
              <AutocorrectTextarea
                className={`${TEXTAREA_CLS} min-h-[100px]`}
                placeholder="Ex. Bâtir un système qui tourne sans moi pour libérer du temps avec ma famille et apprendre…"
                value={form.why_statement ?? ''}
                onChange={e => setForm(f => ({ ...f, why_statement: e.target.value }))}
              />
            </Field>
            <Field label="Primary Aim (synthèse en 1 phrase)">
              <input
                type="text"
                className={INPUT_CLS}
                placeholder="Ex. Liberté temps + impact local Maroc + sécurité financière"
                value={form.primary_aim ?? ''}
                onChange={e => setForm(f => ({ ...f, primary_aim: e.target.value }))}
              />
            </Field>
          </Section>

          {/* Section 2 — Cap mensuel + heures */}
          <Section
            icon={Crown}
            color="amber"
            title="2. Cap mensuel — quand je dis stop"
            subtitle="Une fois atteint, le dashboard affiche « Objectif atteint »"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Cap mensuel (DH)">
                <div className="relative">
                  <input
                    type="number"
                    className={`${INPUT_CLS} pl-10`}
                    placeholder="50000"
                    value={form.monthly_revenue_cap ?? ''}
                    onChange={e => setForm(f => ({ ...f, monthly_revenue_cap: e.target.value === '' ? null : Number(e.target.value) }))}
                  />
                  <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  À partir de ce CA, tu peux refuser des projets pour préserver ton temps.
                </p>
              </Field>
              <Field label="Heures max par semaine">
                <div className="relative">
                  <input
                    type="number"
                    className={`${INPUT_CLS} pl-10`}
                    placeholder="35"
                    value={form.max_hours_week ?? ''}
                    onChange={e => setForm(f => ({ ...f, max_hours_week: e.target.value === '' ? null : Number(e.target.value) }))}
                  />
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
              </Field>
            </div>
          </Section>

          {/* Section 3 — Objectif stratégique */}
          <Section
            icon={Target}
            color="blue"
            title="3. Objectif stratégique du trimestre"
            subtitle="Revu chaque 1er Jan, Avr, Juil, Oct"
          >
            <Field label="Objectif principal (1 phrase)">
              <AutocorrectTextarea
                className={`${TEXTAREA_CLS} min-h-[80px]`}
                placeholder="Ex. Atteindre 5 abonnements SaaS actifs et 30 000 MAD/mois de récurrent d'ici fin Q3."
                value={form.strategic_objective ?? ''}
                onChange={e => setForm(f => ({ ...f, strategic_objective: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="CA cible / mois (DH)">
                <input
                  type="number"
                  className={INPUT_CLS}
                  placeholder="30000"
                  value={form.monthly_target ?? ''}
                  onChange={e => setForm(f => ({ ...f, monthly_target: e.target.value === '' ? null : Number(e.target.value) }))}
                />
              </Field>
              <Field label="Projets / mois">
                <input
                  type="number"
                  className={INPUT_CLS}
                  placeholder="4"
                  value={form.monthly_target_projets ?? ''}
                  onChange={e => setForm(f => ({ ...f, monthly_target_projets: e.target.value === '' ? null : Number(e.target.value) }))}
                />
              </Field>
              <Field label="Conversion (%)">
                <input
                  type="number"
                  step="0.1"
                  className={INPUT_CLS}
                  placeholder="40"
                  value={form.target_conversion_rate ?? ''}
                  onChange={e => setForm(f => ({ ...f, target_conversion_rate: e.target.value === '' ? null : Number(e.target.value) }))}
                />
              </Field>
              <Field label="Workspaces SaaS">
                <div className="relative">
                  <input
                    type="number"
                    className={`${INPUT_CLS} pl-9`}
                    placeholder="5"
                    value={form.target_workspaces ?? ''}
                    onChange={e => setForm(f => ({ ...f, target_workspaces: e.target.value === '' ? null : Number(e.target.value) }))}
                  />
                  <Repeat className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
              </Field>
            </div>
            <Field label="Avis Google cible">
              <div className="relative max-w-[200px]">
                <input
                  type="number"
                  className={`${INPUT_CLS} pl-9`}
                  placeholder="100"
                  value={form.target_avis_google ?? ''}
                  onChange={e => setForm(f => ({ ...f, target_avis_google: e.target.value === '' ? null : Number(e.target.value) }))}
                />
                <Star className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </Field>
          </Section>

          {/* Save bar */}
          <div className="sticky bottom-4 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Briefcase className="w-4 h-4" />
              Tes réponses sont sauvegardées dans <span className="font-mono">tenant_vision</span> (admin seulement)
            </div>
            <button
              onClick={save}
              disabled={update.isPending}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all',
                'bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-md hover:shadow-lg disabled:opacity-60',
              )}
            >
              <Save className="w-4 h-4" />
              {update.isPending ? 'Sauvegarde…' : 'Sauvegarder ma vision'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────── */

function Section({
  icon: Icon, color, title, subtitle, children,
}: {
  icon:     React.ElementType
  color:    string
  title:    string
  subtitle: string
  children: React.ReactNode
}) {
  const colors: Record<string, string> = {
    violet: 'from-violet-500 to-purple-600 shadow-violet-500/30',
    amber:  'from-amber-500 to-orange-600 shadow-amber-500/30',
    blue:   'from-blue-500 to-cyan-600 shadow-blue-500/30',
  }
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
      <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg flex-shrink-0',
          colors[color] ?? colors.blue,
        )}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  )
}
