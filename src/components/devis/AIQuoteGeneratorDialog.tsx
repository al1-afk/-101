/**
 * AIQuoteGeneratorDialog — génération d'un devis par IA depuis un prospect.
 *
 * Flux : Sources & options → Analyse du besoin → Aperçu (éditable) → Création
 * d'un brouillon. Le devis créé réutilise ENTIÈREMENT le système existant
 * (Prestation / DevisNotesData / éditeur / PDF) : aucun système parallèle.
 *
 *  - L'IA ne calcule pas les prix : ils viennent du backend (grille).
 *  - Rien n'est envoyé au client automatiquement.
 *  - Le devis reste brouillon, lié au prospect, avec un marqueur « IA à valider ».
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Sparkles, Loader2, X, ArrowLeft, CheckCircle2, AlertTriangle,
  FileText, Wand2, HelpCircle, Info, Check,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import type { Prospect } from '@/hooks/useProspects'
import { useDevis, useCreateDevis, type Devis } from '@/hooks/useDevis'
import { useAddProspectLog } from '@/hooks/useProspectLogs'
import {
  getTemplateByKey, buildPrestationFromTemplate, type TemplateVars,
} from '@/lib/prestationTemplates'
import {
  DEFAULT_BANK, type Prestation, type DescriptionBlock, type DevisNotesData,
} from '@/pages/Devis'
import {
  aiQuoteApi, type QuoteAiOptions, type QuoteContext,
  type QuoteAnalysis, type QuoteProposal, type QuoteSection,
} from '@/lib/aiQuoteApi'

type Step = 'setup' | 'analysis' | 'preview'

const PROJECT_TYPE_LABELS: Record<string, string> = {
  auto: 'Détection auto', website: 'Site vitrine', ecommerce: 'E-commerce',
  booking: 'Réservation', webapp: 'Application web', mobileapp: 'Application mobile',
  crm: 'CRM', erp: 'ERP', marketing: 'Marketing digital', seo: 'Référencement SEO', other: 'Autre',
}
const DETAIL_LABELS: Record<string, string> = { court: 'Court', standard: 'Standard', detaille: 'Détaillé' }
const LANG_LABELS: Record<string, string> = { fr: 'Français', ar: 'Arabe', fr_ar: 'FR + Arabe' }
const PRICE_LABELS: Record<string, string> = { auto: 'Grille auto', manuel: 'Manuel', sur_devis: 'Sur devis' }

const OPTION_LIST: Array<{ key: keyof QuoteAiOptions; label: string }> = [
  { key: 'includeHosting',     label: 'Hébergement' },
  { key: 'includeMaintenance', label: 'Maintenance' },
  { key: 'includeTraining',    label: 'Formation' },
  { key: 'includeSocial',      label: 'Réseaux sociaux' },
  { key: 'includeSeo',         label: 'SEO' },
  { key: 'includeAiAssistant', label: 'Assistant IA' },
  { key: 'includePaymentTerms', label: 'Conditions de paiement' },
  { key: 'includeExclusions',  label: 'Exclusions' },
]

/* ── Petits contrôles réutilisables ────────────────────────────────── */
function Chips({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: Array<[string, string]>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([val, label]) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
            value === val ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}>
          {label}
        </button>
      ))}
    </div>
  )
}

function OptToggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors ${
        on ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500/50 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'
      }`}>
      <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
        on ? 'bg-blue-600 border-blue-600' : 'border-muted-foreground/40'
      }`}>
        {on && <Check className="w-3 h-3 text-white" />}
      </span>
      {label}
    </button>
  )
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(3, Math.min(100, score))}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{score}%</span>
    </div>
  )
}

export default function AIQuoteGeneratorDialog({ open, onClose, prospect }: {
  open: boolean; onClose: () => void; prospect: Prospect
}) {
  const navigate = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { data: allDevis = [] } = useDevis()
  const createDevis = useCreateDevis()
  const addLog = useAddProspectLog()

  const [step, setStep] = useState<Step>('setup')
  const [context, setContext] = useState<QuoteContext | null>(null)
  const [ctxLoading, setCtxLoading] = useState(false)
  const [options, setOptions] = useState<QuoteAiOptions>({
    projectType: 'auto', language: 'fr', detail: 'standard', priceMode: 'auto',
    includePaymentTerms: true, includeExclusions: true,
  })
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)

  const [generationId, setGenerationId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<QuoteAnalysis | null>(null)
  const [proposal, setProposal] = useState<QuoteProposal | null>(null)
  const [sections, setSections] = useState<QuoteSection[]>([])
  const [objet, setObjet] = useState('')
  const [introduction, setIntroduction] = useState('')

  /* Réinitialise à l'ouverture + charge le contexte. */
  useEffect(() => {
    if (!open) return
    setStep('setup'); setAnalysis(null); setProposal(null); setSections([])
    setGenerationId(null); setObjet(''); setIntroduction('')
    setCtxLoading(true)
    aiQuoteApi.context(prospect.id)
      .then(setContext)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Impossible de charger les sources'))
      .finally(() => setCtxLoading(false))
  }, [open, prospect.id])

  const toggleOpt = (k: keyof QuoteAiOptions) =>
    setOptions(o => ({ ...o, [k]: !o[k] }))

  /* ── Analyse ── */
  const runAnalyze = async () => {
    setAnalyzing(true)
    try {
      const r = await aiQuoteApi.analyze(prospect.id, options)
      setAnalysis(r.analysis)
      setGenerationId(r.generationId)
      if (r.analysis.suggestedProjectType && (!options.projectType || options.projectType === 'auto')) {
        setOptions(o => ({ ...o, projectType: r.analysis.suggestedProjectType }))
      }
      setStep('analysis')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'La génération a échoué. Aucune modification enregistrée.')
    } finally {
      setAnalyzing(false)
    }
  }

  /* ── Génération de la proposition ── */
  const runGenerate = async () => {
    if (!analysis) return
    setGenerating(true)
    try {
      const r = await aiQuoteApi.generate({
        prospectId: prospect.id, generationId, analysis, options,
      })
      setProposal(r.proposal)
      setGenerationId(r.generationId)
      setSections(r.proposal.sections)
      setObjet(r.proposal.objet)
      setIntroduction(r.proposal.introduction)
      setStep('preview')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'La génération a échoué. Aucune modification enregistrée.')
    } finally {
      setGenerating(false)
    }
  }

  /* ── Recalcul local des totaux (l'utilisateur peut éditer prix/quantités) ── */
  const totals = useMemo(() => {
    const ht = sections.reduce((s, x) => s + x.quantite * x.unitPriceHt, 0)
    const vatRate = options.priceMode === 'sur_devis' ? 0 : (proposal?.pricing.vatRate || 20)
    const tva = vatRate > 0 ? ht * (vatRate / 100) : 0
    return { ht, vatRate, tva, ttc: ht + tva }
  }, [sections, options.priceMode, proposal])

  const updateSection = (idx: number, field: 'quantite' | 'unitPriceHt', val: number) =>
    setSections(s => s.map((x, i) => i === idx ? { ...x, [field]: Math.max(0, val) } : x))
  const removeSection = (idx: number) =>
    setSections(s => s.filter((_, i) => i !== idx))

  /* ── Création du devis brouillon (réutilise le système existant) ── */
  const createDraft = async () => {
    if (!proposal || sections.length === 0) { toast.error('Aucune prestation à enregistrer'); return }
    setCreating(true)
    try {
      const vars: TemplateVars = { ...proposal.variables }
      const sectionPrestations: Prestation[] = sections.map((sec, i) => {
        const tpl = getTemplateByKey(sec.key)
        const base: Prestation = tpl
          ? buildPrestationFromTemplate(tpl, vars)
          : { id: `s${i}`, titre: sec.titre, description: [], quantite: 1, prix_unitaire: 0, showQuantite: true, showPrixUnit: true }
        const description: DescriptionBlock[] = [...base.description]
        if (sec.note.trim()) {
          description.push({ id: `note-${i}`, type: 'paragraph', content: sec.note.trim() })
        }
        return { ...base, id: String(i + 1), description, quantite: sec.quantite, prix_unitaire: sec.unitPriceHt }
      })

      /* Prestation d'introduction NON tarifée : rend l'objet + l'introduction +
         l'objectif VISIBLES dans le modèle « default » et l'éditeur (le champ
         `objet` n'est lu que par le modèle Executive). Prix 0 + showPrixUnit
         false → n'impacte pas le total HT. */
      const leadBlocks: DescriptionBlock[] = []
      if (introduction.trim()) leadBlocks.push({ id: 'ai-intro', type: 'paragraph', content: introduction.trim() })
      if (proposal.objective?.trim()) leadBlocks.push({ id: 'ai-obj', type: 'paragraph', content: `Objectif : ${proposal.objective.trim()}` })
      const leadPrestation: Prestation[] = leadBlocks.length
        ? [{ id: 'ai-lead', titre: objet.trim() || 'Objet de la proposition', description: leadBlocks, quantite: 1, prix_unitaire: 0, showQuantite: false, showPrixUnit: false }]
        : []
      const prestations: Prestation[] = [...leadPrestation, ...sectionPrestations]

      const conditions = [
        ...proposal.conditions,
        ...(options.includePaymentTerms ? proposal.paymentTerms : []),
        proposal.timeline?.text ? `Délai : ${proposal.timeline.text}` : '',
        ...(options.includeExclusions !== false ? proposal.exclusions.map(e => `Non compris : ${e}`) : []),
        ...proposal.clientRequirements.map(c => `À fournir par le client : ${c}`),
      ].filter(Boolean)

      const objetText = [
        objet.trim(),
        introduction.trim(),
        proposal.objective?.trim() ? `Objectif : ${proposal.objective.trim()}` : '',
      ].filter(Boolean).join('\n\n')

      const notesData: DevisNotesData & { aiMeta?: unknown } = {
        prestations: prestations.map(p => ({
          titre: p.titre, description: p.description, quantite: p.quantite,
          prix_unitaire: p.prix_unitaire, showQuantite: p.showQuantite, showPrixUnit: p.showPrixUnit,
        })),
        conditions,
        bankInfo: DEFAULT_BANK,
        signature: null,
        template: 'default',
        objet: objetText || undefined,
        currency: (proposal.currency as DevisNotesData['currency']) || 'MAD',
        aiMeta: {
          generated: true,
          validated: false,
          generationId,
          confidence: proposal.confidenceScore,
          questionsToConfirm: proposal.questionsToConfirm,
          warnings: proposal.warnings,
          assumptions: proposal.assumptions,
          generatedAt: new Date().toISOString(),
        },
      }

      const year = new Date().getFullYear()
      const maxSeq = allDevis
        .filter(x => x.numero?.startsWith(`DEV-${year}-`))
        .reduce((max, x) => {
          const m = x.numero.match(/DEV-\d{4}-(\d+)/)
          return m ? Math.max(max, parseInt(m[1], 10)) : max
        }, 0)
      const numero = `DEV-${year}-${String(maxSeq + 1).padStart(3, '0')}`
      const today = new Date().toISOString().slice(0, 10)
      const expiration = new Date(Date.now() + (proposal.validityDays || 30) * 864e5).toISOString().slice(0, 10)
      const clientNom = prospect.entreprise || prospect.nom || ''

      /* prospect_id n'existe pas sur le type Devis (colonne DB ajoutée par la
         migration 078) : on l'ajoute au payload et on caste via unknown. */
      const payload = {
        numero,
        client_id: null,
        client_nom: clientNom,
        prospect_id: prospect.id,
        statut: 'brouillon' as const,
        date_emission: today,
        date_expiration: expiration,
        montant_ht: totals.ht,
        tva: totals.vatRate,
        montant_ttc: totals.ttc,
        notes: JSON.stringify(notesData),
      }
      const created = await createDevis.mutateAsync(payload as unknown as Omit<Devis, 'id' | 'created_at'>)
      const devisId: string | undefined = created?.id
      // Traçabilité : relie la génération au devis (best-effort).
      if (generationId && devisId) {
        aiQuoteApi.link(generationId, devisId).catch(() => {})
      }
      // Timeline prospect.
      addLog.mutate({
        prospect_id: prospect.id,
        type: 'note',
        auteur: prospect.responsable || 'IA',
        message: `Devis ${numero} généré par IA (brouillon, à valider). ` +
          `Montant HT ${formatCurrency(totals.ht)} · confiance ${proposal.confidenceScore}%`,
      })

      toast.success('Le devis IA a été créé comme brouillon. Vérifiez les informations et les prix avant validation.')
      onClose()
      if (devisId && tenantSlug) navigate(`/${tenantSlug}/devis?edit=${devisId}`)
      else navigate(`/${tenantSlug}/devis`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la création du devis')
    } finally {
      setCreating(false)
    }
  }

  const busy = analyzing || generating || creating
  const aiUnavailable = context && (!context.aiConfigured || !context.aiEnabled)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !busy) onClose() }}>
      <DialogContent className="max-w-2xl w-[96vw] p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-gradient-to-r from-blue-600/10 to-violet-600/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">Génération du devis par intelligence artificielle</h2>
              <p className="text-[11px] text-muted-foreground truncate">{prospect.nom}{prospect.entreprise ? ` · ${prospect.entreprise}` : ''}</p>
            </div>
          </div>
          <button onClick={() => !busy && onClose()} className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-40" disabled={busy}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-border bg-muted/20">
          {(['setup', 'analysis', 'preview'] as Step[]).map((s, i) => {
            const labels = ['Sources', 'Analyse', 'Aperçu']
            const active = step === s
            const done = (['setup', 'analysis', 'preview'] as Step[]).indexOf(step) > i
            return (
              <div key={s} className="flex items-center gap-1.5 text-[11px]">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'
                }`}>{done ? <Check className="w-3 h-3" /> : i + 1}</span>
                <span className={active ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{labels[i]}</span>
                {i < 2 && <span className="w-4 h-px bg-border mx-1" />}
              </div>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ═══ STEP SETUP ═══ */}
          {step === 'setup' && (
            <div className="space-y-4">
              {ctxLoading ? (
                <div className="py-10 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : (
                <>
                  {/* Sources summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Notes', value: context?.counts.notes ?? 0 },
                      { label: 'Appels', value: context?.counts.appels ?? 0 },
                      { label: 'Activités', value: context?.counts.activites ?? 0 },
                      { label: 'Modèles', value: context?.templatesAvailable ?? 0 },
                    ].map(c => (
                      <div key={c.label} className="rounded-lg border border-border p-2.5 text-center">
                        <p className="text-lg font-bold text-foreground tabular-nums">{c.value}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className={`flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 ${
                    context?.priceGridAvailable ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500'
                  }`}>
                    <Info className="w-3.5 h-3.5 flex-shrink-0" />
                    {context?.priceGridAvailable
                      ? `Grille tarifaire disponible (${context?.priceGridCount} modèles tarifés).`
                      : "Grille tarifaire non renseignée : le devis sera créé sans prix (à définir)."}
                  </div>

                  {aiUnavailable && (
                    <div className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      Service IA non disponible (non configuré ou désactivé). Contactez un administrateur.
                    </div>
                  )}

                  {/* Options */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-1.5">Type de projet</p>
                      <Chips value={options.projectType ?? 'auto'} onChange={v => setOptions(o => ({ ...o, projectType: v }))}
                        options={Object.entries(PROJECT_TYPE_LABELS)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1.5">Langue</p>
                        <Chips value={options.language ?? 'fr'} onChange={v => setOptions(o => ({ ...o, language: v as QuoteAiOptions['language'] }))}
                          options={Object.entries(LANG_LABELS)} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1.5">Détail</p>
                        <Chips value={options.detail ?? 'standard'} onChange={v => setOptions(o => ({ ...o, detail: v as QuoteAiOptions['detail'] }))}
                          options={Object.entries(DETAIL_LABELS)} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-1.5">Prix</p>
                        <Chips value={options.priceMode ?? 'auto'} onChange={v => setOptions(o => ({ ...o, priceMode: v as QuoteAiOptions['priceMode'] }))}
                          options={Object.entries(PRICE_LABELS)} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-1.5">Options à inclure</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {OPTION_LIST.map(o => (
                          <OptToggle key={o.key} label={o.label} on={!!options[o.key]} onClick={() => toggleOpt(o.key)} />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP ANALYSIS ═══ */}
          {step === 'analysis' && analysis && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Niveau de confiance</p>
                </div>
                <ConfidenceBar score={analysis.confidenceScore} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditableField label="Type de projet" value={analysis.prospectSummary.projectType}
                  onChange={v => setAnalysis(a => a && ({ ...a, prospectSummary: { ...a.prospectSummary, projectType: v } }))} />
                <EditableField label="Secteur" value={analysis.prospectSummary.sector}
                  onChange={v => setAnalysis(a => a && ({ ...a, prospectSummary: { ...a.prospectSummary, sector: v } }))} />
                <EditableField label="Ville" value={analysis.prospectSummary.city}
                  onChange={v => setAnalysis(a => a && ({ ...a, prospectSummary: { ...a.prospectSummary, city: v } }))} />
                <EditableField label="Entreprise" value={analysis.prospectSummary.companyName}
                  onChange={v => setAnalysis(a => a && ({ ...a, prospectSummary: { ...a.prospectSummary, companyName: v } }))} />
              </div>

              {analysis.prospectSummary.projectSummary && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">Résumé du besoin</p>
                  <p className="text-xs text-foreground leading-relaxed">{analysis.prospectSummary.projectSummary}</p>
                </div>
              )}

              <ListBlock title="Informations confirmées" icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                items={analysis.confirmedInformation.map(c => `${c.key ? c.key + ' : ' : ''}${c.value}`)} />
              <ListBlock title="Informations supposées (à confirmer)" icon={<HelpCircle className="w-3.5 h-3.5 text-amber-600" />}
                items={analysis.inferredInformation.map(c => `${c.key ? c.key + ' : ' : ''}${c.value} (${c.confidence}%)`)} />
              <ListBlock title="Besoins identifiés" icon={<FileText className="w-3.5 h-3.5 text-blue-600" />}
                items={analysis.requirements.map(r => r.name + (r.priority === 'required' ? ' (requis)' : ''))} />
              <ListBlock title="Informations manquantes / questions" icon={<AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                items={[
                  ...analysis.missingInformation.map(m => m.question || m.field),
                ]} />

              {(analysis.pricingHints.budgetMin != null || analysis.pricingHints.budgetMax != null) && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-xs text-blue-800 dark:text-blue-300">
                  Budget détecté : {analysis.pricingHints.budgetMin ?? '?'} – {analysis.pricingHints.budgetMax ?? '?'} {analysis.pricingHints.currency}
                  {analysis.pricingHints.requiresManualValidation && ' · à valider manuellement'}
                </div>
              )}

              {analysis.warnings.length > 0 && (
                <ListBlock title="Avertissements" icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />} items={analysis.warnings} />
              )}
            </div>
          )}

          {/* ═══ STEP PREVIEW ═══ */}
          {step === 'preview' && proposal && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted-foreground">Objet du devis</label>
                <Input value={objet} onChange={e => setObjet(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted-foreground">Introduction</label>
                <textarea value={introduction} onChange={e => setIntroduction(e.target.value)}
                  rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs leading-relaxed resize-y" />
              </div>

              {/* Sections / prestations */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Prestations ({sections.length})</p>
                <div className="space-y-1.5">
                  {sections.map((sec, i) => (
                    <div key={`${sec.key}-${i}`} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{sec.titre}</p>
                        {sec.requiresValidation && (
                          <span className="text-[10px] text-amber-600 font-medium">Prix à définir</span>
                        )}
                        {sec.note && <p className="text-[10px] text-muted-foreground truncate">{sec.note}</p>}
                      </div>
                      <input type="number" min={1} value={sec.quantite}
                        onChange={e => updateSection(i, 'quantite', parseInt(e.target.value || '1', 10))}
                        className="w-12 h-8 text-xs text-center rounded border border-border bg-background" title="Quantité" />
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} value={sec.unitPriceHt}
                          onChange={e => updateSection(i, 'unitPriceHt', parseFloat(e.target.value || '0'))}
                          className="w-24 h-8 text-xs text-right rounded border border-border bg-background px-2" title="Prix unitaire HT" />
                        <span className="text-[10px] text-muted-foreground">HT</span>
                      </div>
                      <button onClick={() => removeSection(i)} className="text-muted-foreground hover:text-red-500 p-1" title="Retirer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totaux */}
              <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span className="font-semibold tabular-nums">{formatCurrency(totals.ht)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">TVA ({totals.vatRate}%)</span><span className="tabular-nums">{formatCurrency(totals.tva)}</span></div>
                <div className="flex justify-between text-sm font-bold border-t border-border pt-1 mt-1"><span>Total TTC</span><span className="tabular-nums">{formatCurrency(totals.ttc)}</span></div>
                {proposal.pricing.requiresValidation && (
                  <p className="text-[10px] text-amber-600 pt-1">Certains prix ne sont pas définis — vérifiez avant validation.</p>
                )}
              </div>

              {proposal.questionsToConfirm.length > 0 && (
                <ListBlock title="À confirmer avec le client" icon={<HelpCircle className="w-3.5 h-3.5 text-amber-600" />} items={proposal.questionsToConfirm} />
              )}
              {proposal.warnings.length > 0 && (
                <ListBlock title="Avertissements" icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />} items={proposal.warnings} />
              )}
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" /> Après création, le devis s'ouvre dans l'éditeur : vous pourrez tout modifier avant de l'envoyer.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <Button variant="ghost" size="sm" className="text-xs"
            onClick={() => {
              if (step === 'preview') setStep('analysis')
              else if (step === 'analysis') setStep('setup')
              else onClose()
            }} disabled={busy}>
            {step === 'setup' ? <><X className="w-3.5 h-3.5 mr-1" /> Annuler</> : <><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Retour</>}
          </Button>

          {step === 'setup' && (
            <Button size="sm" className="text-xs bg-gradient-to-r from-blue-600 to-violet-600 text-white"
              onClick={runAnalyze} disabled={analyzing || ctxLoading || !!aiUnavailable}>
              {analyzing ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Analyse…</> : <><Wand2 className="w-3.5 h-3.5 mr-1" /> Analyser le besoin</>}
            </Button>
          )}
          {step === 'analysis' && (
            <Button size="sm" className="text-xs bg-gradient-to-r from-blue-600 to-violet-600 text-white"
              onClick={runGenerate} disabled={generating}>
              {generating ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Génération…</> : <><Sparkles className="w-3.5 h-3.5 mr-1" /> Générer le devis</>}
            </Button>
          )}
          {step === 'preview' && (
            <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={createDraft} disabled={creating}>
              {creating ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Création…</> : <><FileText className="w-3.5 h-3.5 mr-1" /> Créer le brouillon</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Sous-composants d'affichage ───────────────────────────────────── */
function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-muted-foreground">{label}</label>
      <Input value={value} onChange={e => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  )
}

function ListBlock({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  const clean = items.map(s => s.trim()).filter(Boolean)
  if (clean.length === 0) return null
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1.5">{icon}{title}</p>
      <ul className="space-y-1">
        {clean.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0 mt-1.5" />{it}
          </li>
        ))}
      </ul>
    </div>
  )
}
