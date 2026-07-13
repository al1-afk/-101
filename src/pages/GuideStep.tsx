import { useMemo, useState } from 'react'
import { Link, useParams, Navigate } from 'react-router-dom'
import {
  ArrowLeft, Copy, Check, MessageCircle, Mail, AtSign, Phone,
  ClipboardList, Video, FileText, FileSignature, Rocket, BookOpen,
  CheckCircle2, Circle, ChevronRight, Sparkles, AlertCircle,
} from 'lucide-react'
import {
  useGuideSteps, useGuideTemplates, useGuideChecklists, useGuideChecklistState,
  useToggleChecklistItem, useDiscoveryQuestions, useLogTemplateRender,
  type GuideStep, type GuideTemplate,
} from '@/hooks/useGuides'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const ICONS: Record<string, React.ElementType> = {
  MessageCircle, ClipboardList, Video, FileText, FileSignature, Rocket,
}

const CHANNEL_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  whatsapp:  { icon: MessageCircle, label: 'WhatsApp',  color: 'emerald' },
  email:     { icon: Mail,          label: 'Email',     color: 'blue' },
  instagram: { icon: AtSign,     label: 'AtSign', color: 'pink' },
  sms:       { icon: Phone,         label: 'SMS',       color: 'violet' },
  general:   { icon: BookOpen,      label: 'Général',   color: 'slate' },
}

export default function GuideStepPage() {
  const { tenantSlug, stepKey } = useParams<{ tenantSlug: string; stepKey: string }>()
  const base = tenantSlug ? `/${tenantSlug}` : ''

  const { data: steps = [], isLoading: stepsLoading } = useGuideSteps()
  const { data: templates = [] } = useGuideTemplates()
  const { data: checklists = [] } = useGuideChecklists()
  const { data: state = [] } = useGuideChecklistState()
  const { data: questions = [] } = useDiscoveryQuestions()

  const toggleItem = useToggleChecklistItem()
  const logRender = useLogTemplateRender()

  const step = useMemo<GuideStep | undefined>(
    () => steps.find(s => s.step_key === stepKey),
    [steps, stepKey]
  )

  const stepTemplates = useMemo<GuideTemplate[]>(
    () => step ? templates.filter(t => t.step_id === step.id).sort((a, b) => a.ordre - b.ordre) : [],
    [step, templates]
  )

  const stepChecklists = useMemo(
    () => step ? checklists.filter(c => c.step_id === step.id).sort((a, b) => a.item_order - b.item_order) : [],
    [step, checklists]
  )

  if (stepsLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900/50" />
  }

  if (!step) {
    return <Navigate to={`${base}/guides`} replace />
  }

  const Icon = ICONS[step.icon ?? ''] ?? BookOpen
  const done = stepChecklists.filter(i =>
    state.find(s => s.checklist_item_id === i.id && s.is_checked)
  ).length
  const pct = stepChecklists.length > 0 ? Math.round((done / stepChecklists.length) * 100) : 0

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <Link
          to={`${base}/guides`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux 6 étapes
        </Link>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
          <div
            className="h-1.5 w-full"
            style={{ background: `linear-gradient(90deg, ${step.color_hex}, ${step.color_hex}aa)` }}
          />
          <div className="p-5 md:p-6">
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${step.color_hex}, ${step.color_hex}cc)`,
                  boxShadow: `0 8px 24px ${step.color_hex}40`,
                }}
              >
                <Icon className="w-7 h-7 text-white" />
              </div>

              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Étape {step.step_number} / 6
                </span>
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {step.title}
                </h1>
                {step.subtitle && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{step.subtitle}</p>
                )}
                {step.timer_label && (
                  <div className="inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    ⏱ {step.timer_label}
                  </div>
                )}
              </div>

              {stepChecklists.length > 0 && (
                <div className="text-right hidden md:block">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Progression</div>
                  <div className="text-3xl font-extrabold tabular-nums" style={{ color: step.color_hex }}>
                    {pct}%
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{done} / {stepChecklists.length}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Templates (messages copiables) */}
      {stepTemplates.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
            <Copy className="w-4 h-4" />
            Messages à copier ({stepTemplates.length})
          </h2>
          <div className="space-y-3">
            {stepTemplates.map(tpl => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onCopy={() => {
                  logRender.mutate({
                    template_id: tpl.id,
                    channel:     tpl.channel,
                    rendered_content: tpl.content,
                  })
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Checklists */}
      {stepChecklists.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Checklist ({done}/{stepChecklists.length})
          </h2>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
            {stepChecklists.map((item, idx) => {
              const checked = state.find(s => s.checklist_item_id === item.id && s.is_checked)
              const existing = state.find(s => s.checklist_item_id === item.id)
              const isChecked = !!checked

              return (
                <button
                  key={item.id}
                  onClick={() => toggleItem.mutate({ checklist_item_id: item.id, existing })}
                  disabled={toggleItem.isPending}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                    'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    idx > 0 && 'border-t border-slate-100 dark:border-slate-800',
                    isChecked && 'bg-emerald-50/30 dark:bg-emerald-950/10',
                  )}
                >
                  {isChecked ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm',
                      isChecked ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200',
                    )}>
                      {item.item_text}
                    </p>
                    {item.is_one_time && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50">
                        Configuration unique
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Questions de découverte (uniquement sur l'étape "formulaire") */}
      {step.step_key === 'formulaire' && questions.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Questions du formulaire ({questions.length})
          </h2>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className={cn(
                  'p-4',
                  idx > 0 && 'border-t border-slate-100 dark:border-slate-800',
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
                    style={{ background: `${step.color_hex}20`, color: step.color_hex }}
                  >
                    {q.question_order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {q.question_text}
                      {q.is_required && <span className="text-rose-500 ml-1">*</span>}
                    </p>
                    {q.question_why && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 italic">
                        💡 {q.question_why}
                      </p>
                    )}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {q.options.map((o, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          >
                            {o}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {q.input_type}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Recréer ce formulaire sur <strong>Tally.so</strong> (gratuit) puis copier le lien dans la checklist de l'étape 1.
            </span>
          </div>
        </section>
      )}

      {/* Navigation entre étapes */}
      <StepNavigation steps={steps} currentKey={step.step_key} base={base} />
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────── */

function TemplateCard({ template, onCopy }: { template: GuideTemplate; onCopy: () => void }) {
  const [copied, setCopied] = useState(false)
  const meta = CHANNEL_META[template.channel] ?? CHANNEL_META.general
  const ChannelIcon = meta.icon

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(template.content)
      setCopied(true)
      toast.success('Message copié dans le presse-papiers')
      onCopy()
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier — autorisez le clipboard')
    }
  }

  return (
    <div className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            `bg-${meta.color}-50 text-${meta.color}-600 dark:bg-${meta.color}-950/50 dark:text-${meta.color}-300`,
            // Tailwind ne sait pas faire d'interpolation dynamique → fallback via inline styles
          )}>
            <ChannelIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{template.label}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {meta.label}
            </div>
          </div>
        </div>
        <button
          onClick={copy}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
            copied
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
          )}
        >
          {copied ? <><Check className="w-3.5 h-3.5" /> Copié</> : <><Copy className="w-3.5 h-3.5" /> Copier</>}
        </button>
      </div>
      <div className="p-4">
        <pre className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
          {template.content}
        </pre>
        {Array.isArray(template.variables) && template.variables.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Variables :
            </span>
            {template.variables.map((v, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/50"
              >
                [{v}]
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StepNavigation({ steps, currentKey, base }: { steps: GuideStep[]; currentKey: string; base: string }) {
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number)
  const idx = sorted.findIndex(s => s.step_key === currentKey)
  const prev = idx > 0 ? sorted[idx - 1] : null
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {prev ? (
        <Link
          to={`${base}/guides/${prev.step_key}`}
          className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Étape {prev.step_number}
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{prev.title}</div>
          </div>
        </Link>
      ) : <div />}

      {next ? (
        <Link
          to={`${base}/guides/${next.step_key}`}
          className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700 transition-colors text-right"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Étape {next.step_number}
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{next.title}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </Link>
      ) : (
        <div className="flex items-center justify-center p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300">
          <Sparkles className="w-4 h-4 mr-2" />
          <span className="text-sm font-bold">Bravo, fin du playbook !</span>
        </div>
      )}
    </div>
  )
}
