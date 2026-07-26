/**
 * Client frontend du module « Génération de devis IA ».
 * Tout passe par le backend `/api/ai-quote/*` — la clé IA n'est jamais
 * exposée au navigateur.
 */
import { api } from './api'

/* ─── Types partagés avec le backend (server/lib/aiQuoteCore.ts) ────── */
export interface QuoteAiOptions {
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

export interface QuoteContext {
  prospect: {
    id: string; nom: string | null; entreprise: string | null
    email: string | null; telephone: string | null; statut: string | null
    source: string | null; valeur_estimee: number | null; hasNotes: boolean
  }
  counts: { notes: number; appels: number; emails: number; activites: number }
  templatesAvailable: number
  priceGridAvailable: boolean
  priceGridCount: number
  aiConfigured: boolean
  aiEnabled: boolean
}

export interface QuoteAnalysis {
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

export interface QuoteSection {
  key: string; type: string; titre: string; quantite: number
  unitPriceHt: number; vatRate: number
  priceSource: 'grille' | 'defaut' | 'manuel' | 'a_definir'
  requiresValidation: boolean; note: string
}

export interface QuotePricing {
  subtotalHt: number; discountType: string | null; discountValue: number
  totalHt: number; vatRate: number; vatAmount: number; totalTtc: number
  currency: string; requiresValidation: boolean
}

export interface QuoteProposal {
  objet: string
  introduction: string
  objective: string
  sections: QuoteSection[]
  variables: Record<string, string>
  conditions: string[]
  exclusions: string[]
  clientRequirements: string[]
  paymentTerms: string[]
  timeline: { text: string; startCondition: string }
  validityDays: number
  questionsToConfirm: string[]
  assumptions: string[]
  pricing: QuotePricing
  currency: string
  confidenceScore: number
  warnings: string[]
  priceMode: string
}

export interface AnalyzeResponse {
  generationId: string | null
  analysis: QuoteAnalysis
  provider: string
  model: string
  sources: { activities: number; notes: Record<string, number> }
}

export interface GenerateResponse {
  generationId: string | null
  proposal: QuoteProposal
  provider: string
  model: string
}

export interface QuoteAiStatus {
  enabled: boolean
  configured: boolean
  provider: string | null
  model: string | null
  promptVersion: string
  projectTypes: string[]
}

export const aiQuoteApi = {
  status:  () => api.get<QuoteAiStatus>('/api/ai-quote/status'),

  context: (prospectId: string) =>
    api.get<QuoteContext>(`/api/ai-quote/context/${prospectId}`),

  analyze: (prospectId: string, options: QuoteAiOptions) =>
    api.post<AnalyzeResponse>('/api/ai-quote/analyze', { prospectId, options }),

  generate: (params: {
    prospectId: string
    generationId?: string | null
    analysis: QuoteAnalysis
    options: QuoteAiOptions
  }) => api.post<GenerateResponse>('/api/ai-quote/generate', params),

  link: (generationId: string, quoteId: string) =>
    api.post<{ success: boolean; id: string; quoteId: string }>(`/api/ai-quote/${generationId}/link`, { quoteId }),
}
