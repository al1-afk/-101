/**
 * Cœur pur (sans dépendance pg/express) de la génération de devis IA.
 *
 * Regroupe tout ce qui est testable de façon isolée :
 *   - nettoyage / anti-injection des contenus prospect,
 *   - construction de l'instantané envoyé à l'IA,
 *   - extraction + validation stricte du JSON renvoyé par l'IA,
 *   - calcul des prix (HT / TVA / TTC) — l'IA ne calcule jamais le prix.
 *
 * Ce module est importé par server/routes/aiQuote.ts ET par les tests
 * (server/lib/aiQuoteCore.test.ts).
 */
import { isValidTemplateKey, titreForKey } from './prestationCatalog'

export const PROMPT_VERSION = process.env.AI_QUOTE_PROMPT_VERSION || 'v1'

/* ─── Limites (perf + coût + sécurité) ─────────────────────────────── */
export const MAX_NOTE_LEN   = 1500   // par note/activité
export const MAX_LOGS       = 40     // activités les plus récentes
export const MAX_TOTAL_CHARS = 16_000 // enveloppe globale du contexte

/* ─── Types ─────────────────────────────────────────────────────────── */
export interface SnapshotLog {
  type: string
  message: string
  auteur?: string | null
  duration_minutes?: number | null
  created_at?: string
}

export interface ProspectInput {
  id: string
  nom: string | null
  entreprise: string | null
  email: string | null
  telephone: string | null
  statut: string | null
  source: string | null
  valeur_estimee: number | null
  notes: string | null
  responsable: string | null
  created_at?: string | null
}

export interface QuoteOptions {
  projectType?: string
  language?: 'fr' | 'ar' | 'fr_ar'
  detail?: 'court' | 'standard' | 'detaille'
  priceMode?: 'auto' | 'manuel' | 'sur_devis'
  includeHosting?: boolean
  includeMaintenance?: boolean
  includeTraining?: boolean
  includeSocial?: boolean
  includeSeo?: boolean
  includeAiAssistant?: boolean
  includePaymentTerms?: boolean
  includeExclusions?: boolean
}

/* ─── Nettoyage & anti-injection ───────────────────────────────────── */

/**
 * Nettoie un texte issu du prospect avant de l'envoyer à l'IA :
 *   - retire le HTML (les notes peuvent contenir du markup collé),
 *   - normalise les espaces / retours ligne,
 *   - neutralise les tentatives grossières d'injection de prompt en
 *     préfixant les lignes suspectes (le contenu reste lisible mais ne
 *     peut plus se faire passer pour une instruction système).
 *   - tronque à `maxLen`.
 */
export function sanitizeText(input: unknown, maxLen = MAX_NOTE_LEN): string {
  let s = String(input ?? '')
  // Retire les balises HTML et les caractères de contrôle.
  s = s.replace(/<[^>]*>/g, ' ')
  // eslint-disable-next-line no-control-regex -- suppression volontaire des caractères de contrôle
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  // Normalise les espaces horizontaux (garde les \n).
  s = s.replace(/[ \t\f\v]+/g, ' ')
  s = s.replace(/\n{3,}/g, '\n\n').trim()

  // Anti-injection : désamorce les formulations qui essaient de piloter l'IA.
  const INJECTION_RE = /\b(ignore (?:les |all |previous |above )|oublie (?:les |tout)|disregard|system prompt|tu es maintenant|you are now|nouvelles? instructions?|new instructions?|assistant\s*:|role\s*:\s*system)\b/gi
  s = s.replace(INJECTION_RE, (m) => `《${m}》`)

  if (s.length > maxLen) s = s.slice(0, maxLen) + '…'
  return s
}

/** Construit l'instantané nettoyé (stocké + envoyé à l'IA). */
export function buildSnapshot(
  prospect: ProspectInput,
  logs: SnapshotLog[],
  options: QuoteOptions,
): {
  prospect: Record<string, unknown>
  activities: Array<{ type: string; message: string; auteur: string | null; duration_minutes: number | null }>
  activityCounts: Record<string, number>
  options: QuoteOptions
} {
  const activityCounts: Record<string, number> = {}
  for (const l of logs) activityCounts[l.type] = (activityCounts[l.type] ?? 0) + 1

  // Tri récent → ancien, cap au nombre max, nettoyage.
  const activities = [...logs]
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, MAX_LOGS)
    .map(l => ({
      type: sanitizeText(l.type, 40),
      message: sanitizeText(l.message, MAX_NOTE_LEN),
      auteur: l.auteur ? sanitizeText(l.auteur, 80) : null,
      duration_minutes: typeof l.duration_minutes === 'number' ? l.duration_minutes : null,
    }))

  return {
    prospect: {
      nom:            sanitizeText(prospect.nom, 200),
      entreprise:     sanitizeText(prospect.entreprise, 200),
      ville:          '',
      email:          prospect.email ? sanitizeText(prospect.email, 200) : '',
      telephone:      prospect.telephone ? sanitizeText(prospect.telephone, 60) : '',
      statut:         sanitizeText(prospect.statut, 40),
      source:         sanitizeText(prospect.source, 80),
      valeur_estimee: typeof prospect.valeur_estimee === 'number' ? prospect.valeur_estimee : null,
      responsable:    sanitizeText(prospect.responsable, 120),
      notes:          sanitizeText(prospect.notes, MAX_NOTE_LEN),
      created_at:     prospect.created_at ?? null,
    },
    activities,
    activityCounts,
    options,
  }
}

/* ─── Extraction JSON robuste ──────────────────────────────────────── */
export function extractJson(raw: string): unknown {
  if (!raw || !raw.trim()) throw new Error('Réponse IA vide')
  let s = raw.trim()
  // Retire d'éventuelles clôtures markdown ```json … ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  // À défaut, isole le premier objet {...} le plus englobant.
  if (s[0] !== '{') {
    const start = s.indexOf('{')
    const end   = s.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) throw new Error('Aucun objet JSON trouvé')
    s = s.slice(start, end + 1)
  }
  return JSON.parse(s)
}

/* ─── Helpers de coercition ────────────────────────────────────────── */
const str  = (v: unknown, max = 2000): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max)
const arr  = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const asRec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})
const strArr = (v: unknown, maxItems = 30, maxLen = 400): string[] =>
  arr(v).map(x => str(x, maxLen)).filter(Boolean).slice(0, maxItems)
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return dflt
  return Math.max(lo, Math.min(hi, n))
}
const numOrNull = (v: unknown): number | null => {
  // null / '' / [] doivent rester null (pas 0) : distinguer « pas de budget »
  // de « budget de 0 ». Number(null|''|[]) vaut 0 → on les écarte d'abord.
  if (v == null || v === '' || Array.isArray(v)) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const boolOr = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt)

const SOURCES = new Set(['note', 'call', 'prospect', 'email', 'manual', 'appel'])
const PRIORITIES = new Set(['required', 'recommended', 'optional'])

/* ─── Validation de l'ANALYSE (section 9 du cahier des charges) ─────── */
export interface ValidatedAnalysis {
  prospectSummary: {
    prospectName: string; companyName: string; sector: string
    city: string; projectType: string; projectSummary: string
  }
  confirmedInformation: Array<{ key: string; value: string; source: string }>
  inferredInformation: Array<{ key: string; value: string; reason: string; confidence: number }>
  missingInformation: Array<{ field: string; question: string; required: boolean }>
  requirements: Array<{ name: string; description: string; priority: string; source: string }>
  suggestedTemplateKeys: string[]
  suggestedProjectType: string
  pricingHints: {
    budgetMin: number | null; budgetMax: number | null; currency: string
    budgetSource: string; requiresManualValidation: boolean
  }
  suggestedTimeline: { value: number | null; unit: string; isConfirmed: boolean }
  confidenceScore: number
  warnings: string[]
}

export function validateAnalysis(input: unknown): ValidatedAnalysis {
  const o  = asRec(input)
  const ps = asRec(o.prospectSummary)
  const ph = asRec(o.pricingHints)
  const tl = asRec(o.suggestedTimeline)
  const unit = str(tl.unit, 10)

  return {
    prospectSummary: {
      prospectName:   str(ps.prospectName, 200),
      companyName:    str(ps.companyName, 200),
      sector:         str(ps.sector, 200),
      city:           str(ps.city, 120),
      projectType:    str(ps.projectType, 120),
      projectSummary: str(ps.projectSummary, 1500),
    },
    confirmedInformation: arr(o.confirmedInformation).slice(0, 40).map(asRec).map((x) => {
      const src = str(x.source, 20)
      return { key: str(x.key, 120), value: str(x.value, 600), source: SOURCES.has(src) ? src : 'note' }
    }).filter(x => x.key || x.value),
    inferredInformation: arr(o.inferredInformation).slice(0, 40).map(asRec).map((x) => ({
      key:        str(x.key, 120),
      value:      str(x.value, 600),
      reason:     str(x.reason, 400),
      confidence: clampInt(x.confidence, 0, 100, 50),
    })).filter(x => x.key || x.value),
    missingInformation: arr(o.missingInformation).slice(0, 40).map((x) => {
      // Accepte soit une chaîne, soit un objet {field,question,required}.
      if (typeof x === 'string') return { field: str(x, 200), question: '', required: false }
      const it = asRec(x)
      return { field: str(it.field, 200), question: str(it.question, 400), required: boolOr(it.required, false) }
    }).filter(x => x.field || x.question),
    requirements: arr(o.requirements).slice(0, 40).map((x) => {
      if (typeof x === 'string') return { name: str(x, 300), description: '', priority: 'recommended', source: '' }
      const it = asRec(x)
      const pr = str(it.priority, 20)
      return {
        name:        str(it.name, 300),
        description: str(it.description, 600),
        priority:    PRIORITIES.has(pr) ? pr : 'recommended',
        source:      str(it.source, 40),
      }
    }).filter(x => x.name),
    suggestedTemplateKeys: strArr(o.suggestedTemplateKeys ?? o.suggestedTemplateTypes, 20, 60)
      .filter(isValidTemplateKey),
    suggestedProjectType: str(o.suggestedProjectType ?? ps.projectType, 40),
    pricingHints: {
      budgetMin: numOrNull(ph.budgetMin),
      budgetMax: numOrNull(ph.budgetMax),
      currency:  str(ph.currency, 8) || 'MAD',
      budgetSource: str(ph.budgetSource, 200),
      requiresManualValidation: boolOr(ph.requiresManualValidation, true),
    },
    suggestedTimeline: {
      value: numOrNull(tl.value),
      unit:  ['days', 'weeks', 'months'].includes(unit) ? unit : 'weeks',
      isConfirmed: boolOr(tl.isConfirmed, false),
    },
    confidenceScore: clampInt(o.confidenceScore, 0, 100, 40),
    warnings: strArr(o.warnings, 20, 300),
  }
}

/* ─── Validation de la PARTIE IA de la génération ──────────────────── */
export interface ValidatedGenerationAi {
  objet: string
  introduction: string
  objective: string
  templateKeys: string[]
  sectionNotes: Record<string, string>
  quantities: Record<string, number>
  variables: Record<string, string>
  conditions: string[]
  exclusions: string[]
  clientRequirements: string[]
  paymentTerms: string[]
  timeline: { text: string; startCondition: string }
  validityDays: number
  questionsToConfirm: string[]
  assumptions: string[]
  confidenceScore: number
  warnings: string[]
}

export function validateGenerationAi(input: unknown): ValidatedGenerationAi {
  const o  = asRec(input)
  const tl = asRec(o.timeline)

  const sectionNotes: Record<string, string> = {}
  for (const [k, v] of Object.entries(asRec(o.sectionNotes))) {
    if (isValidTemplateKey(k)) sectionNotes[k] = str(v, 600)
  }
  const quantities: Record<string, number> = {}
  for (const [k, v] of Object.entries(asRec(o.quantities))) {
    if (isValidTemplateKey(k)) quantities[k] = clampInt(v, 1, 100000, 1)
  }
  const variables: Record<string, string> = {}
  for (const [k, v] of Object.entries(asRec(o.variables))) {
    if (/^\[[A-Z0-9_]+\]$/.test(k)) variables[k] = str(v, 200)
  }

  return {
    objet:        str(o.objet, 400),
    introduction: str(o.introduction, 2000),
    objective:    str(o.objective ?? o.objectif, 1500),
    templateKeys: strArr(o.templateKeys ?? o.sections ?? o.suggestedTemplateKeys, 30, 60).filter(isValidTemplateKey),
    sectionNotes,
    quantities,
    variables,
    conditions:         strArr(o.conditions, 30, 400),
    exclusions:         strArr(o.exclusions, 30, 400),
    clientRequirements: strArr(o.clientRequirements, 30, 400),
    paymentTerms:       strArr(o.paymentTerms, 12, 300),
    timeline: {
      text:           str(tl.text ?? o.timelineText, 600),
      startCondition: str(tl.startCondition, 400) || 'Réception de l’acompte et des éléments nécessaires',
    },
    validityDays:       clampInt(o.validityDays, 1, 365, 30),
    questionsToConfirm: strArr(o.questionsToConfirm, 30, 400),
    assumptions:        strArr(o.assumptions, 30, 400),
    confidenceScore:    clampInt(o.confidenceScore, 0, 100, 50),
    warnings:           strArr(o.warnings, 20, 300),
  }
}

/* ─── Calcul des prix (le backend, jamais l'IA) ────────────────────── */
export interface PriceGridEntry { unitPriceHt: number; vatRate: number; source: 'grille' | 'defaut' }
export type PriceGrid = Record<string, PriceGridEntry>

export interface QuoteSection {
  key: string
  type: string
  titre: string
  quantite: number
  unitPriceHt: number
  vatRate: number
  priceSource: 'grille' | 'defaut' | 'manuel' | 'a_definir'
  requiresValidation: boolean
  note: string
}

export interface Pricing {
  subtotalHt: number
  discountType: string | null
  discountValue: number
  totalHt: number
  vatRate: number
  vatAmount: number
  totalTtc: number
  currency: string
  requiresValidation: boolean
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Construit les sections tarifées à partir des clés résolues et de la
 * grille tarifaire (prestation_models). Prix = grille, sinon 0 (« à
 * définir » → nécessite validation). L'IA n'intervient jamais ici.
 */
export function buildSections(
  keys: string[],
  grid: PriceGrid,
  ai: Pick<ValidatedGenerationAi, 'sectionNotes' | 'quantities'>,
  opts: { priceMode?: string } = {},
): QuoteSection[] {
  const surDevis = opts.priceMode === 'sur_devis'
  return keys.filter(isValidTemplateKey).map((key) => {
    const g = grid[key]
    const unit = surDevis ? 0 : (g ? g.unitPriceHt : 0)
    const priceSource: QuoteSection['priceSource'] =
      surDevis ? 'a_definir' : g && g.unitPriceHt > 0 ? g.source : 'a_definir'
    return {
      key,
      type: key,
      titre: titreForKey(key),
      quantite: ai.quantities[key] ?? 1,
      unitPriceHt: round2(unit),
      vatRate: g ? g.vatRate : 20,
      priceSource,
      requiresValidation: priceSource === 'a_definir' || unit <= 0,
      note: ai.sectionNotes[key] ?? '',
    }
  })
}

export function computePricing(
  sections: QuoteSection[],
  opts: { vatEnabled?: boolean; vatRate?: number; currency?: string; discountValue?: number } = {},
): Pricing {
  const { vatEnabled = true, currency = 'MAD', discountValue = 0 } = opts
  const subtotalHt = round2(sections.reduce((s, x) => s + x.quantite * x.unitPriceHt, 0))
  const discount   = round2(Math.max(0, discountValue))
  const totalHt    = round2(Math.max(0, subtotalHt - discount))
  // TVA calculée LIGNE PAR LIGNE : chaque prestation garde son propre taux
  // (les modèles de la grille peuvent avoir des tva_defaut différents). On ne
  // prend surtout pas le taux de la 1re ligne pour tout le devis.
  const vatAmount  = vatEnabled
    ? round2(sections.reduce((s, x) => s + x.quantite * x.unitPriceHt * ((x.vatRate || 0) / 100), 0))
    : 0
  // Taux « affiché » : uniforme si toutes les lignes tarifées partagent le même
  // taux, sinon taux effectif (blended). opts.vatRate force l'affichage si fourni.
  const pricedRates = [...new Set(sections.filter(s => s.unitPriceHt > 0).map(s => s.vatRate))]
  const vatRate = !vatEnabled ? 0
    : opts.vatRate != null ? opts.vatRate
    : pricedRates.length <= 1 ? (pricedRates[0] ?? sections[0]?.vatRate ?? 20)
    : round2(totalHt > 0 ? (vatAmount / totalHt) * 100 : 20)
  const totalTtc   = round2(totalHt + vatAmount)
  return {
    subtotalHt,
    discountType: discount > 0 ? 'amount' : null,
    discountValue: discount,
    totalHt,
    vatRate,
    vatAmount,
    totalTtc,
    currency,
    requiresValidation: sections.some(s => s.requiresValidation),
  }
}
