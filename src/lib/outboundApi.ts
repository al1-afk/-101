/* ─────────────────────────────────────────────────────────────────
   NEXT GITAL — API client OUTBOUND MARKETING
   Séparé du CRM Prospects (Inbound).
───────────────────────────────────────────────────────────────── */
import { api } from './api'

export type OutboundStatut =
  | 'a_contacter' | 'contacte' | 'en_conversation' | 'rdv_pris' | 'interesse'
  | 'proposition_envoyee' | 'ne_repond_pas' | 'refuse' | 'non_qualifie' | 'converti'

export type OutboundPriorite = 'basse' | 'normale' | 'haute' | 'urgente'
export type OutboundCanal    = 'email' | 'whatsapp' | 'telephone' | 'linkedin' | 'sms' | null

export interface OutboundProspect {
  id: string
  tenant_id: string
  nom_contact: string | null
  prenom_contact: string | null
  entreprise: string
  fonction: string | null
  taille_entreprise: string | null
  description: string | null
  secteur_id: string | null
  sous_secteur_id: string | null
  telephone: string | null
  whatsapp: string | null
  email: string | null
  email_secondaire: string | null
  site_web: string | null
  linkedin_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  google_maps_url: string | null
  adresse: string | null
  ville: string | null
  region: string | null
  pays: string | null
  source_id: string | null
  source_libre: string | null
  campaign_id: string | null
  statut: OutboundStatut
  priorite: OutboundPriorite
  niveau_interet: number
  canal_prefere: OutboundCanal
  nb_tentatives: number
  valeur_potentielle: number
  service_propose: string | null
  motif_perte: string | null
  motif_refus: string | null
  ne_plus_contacter: boolean
  date_dernier_contact: string | null
  date_prochaine_relance: string | null
  last_activity_at: string | null
  owner_id: string
  assigned_to_id: string
  created_by_id: string
  notes: string | null
  tags: string[]
  converted_to_crm: boolean
  converted_at: string | null
  converted_by_id: string | null
  crm_prospect_id: string | null
  /* Marketing automation (migration 068) */
  email_verified?: boolean
  email_verified_at?: string | null
  email_verification_status?: 'valid' | 'invalid' | 'risky' | 'unknown' | null
  phone_verified?: boolean
  ai_draft_email_subject?: string | null
  ai_draft_email_body?: string | null
  ai_draft_whatsapp?: string | null
  ai_generated_at?: string | null
  ai_generated_lang?: 'fr' | 'ar' | 'en' | null
  google_place_id?: string | null
  enriched_from?: 'google_places' | 'manual' | 'csv' | 'api' | null
  enriched_at?: string | null
  created_at: string
  updated_at: string
}

export interface OutboundSector {
  id: string
  tenant_id: string
  nom: string
  parent_id: string | null
  couleur: string
  icone: string | null
  actif: boolean
  ordre: number
  created_at: string
}

export interface OutboundSource {
  id: string
  tenant_id: string
  nom: string
  slug: string | null
  icone: string | null
  actif: boolean
  ordre: number
  created_at: string
}

export interface OutboundCampaign {
  id: string
  tenant_id: string
  nom: string
  description: string | null
  objectif: string | null
  secteur_id: string | null
  cible_prospects: number
  cible_contacts: number
  date_debut: string | null
  date_fin: string | null
  statut: 'brouillon' | 'active' | 'pausee' | 'terminee' | 'archivee'
  created_at: string
}

export interface OutboundTemplate {
  id: string
  tenant_id: string
  nom: string
  canal: 'email' | 'whatsapp' | 'sms' | 'linkedin' | 'autre'
  objet: string | null
  corps: string
  langue: string
  variables: string[]
  actif: boolean
  usage_count: number
  whatsapp_template_name?: string | null
  whatsapp_template_language?: 'ar' | 'fr' | 'en' | null
  created_at: string
}

export type OutboundActivityType =
  | 'creation' | 'statut' | 'note' | 'edit'
  | 'appel' | 'email' | 'whatsapp' | 'linkedin' | 'sms'
  | 'rdv' | 'conversion' | 'assignment' | 'follow_up'

export interface OutboundActivity {
  id: string
  prospect_id: string
  type: OutboundActivityType
  message: string
  metadata: Record<string, any>
  auteur_id: string
  auteur_nom: string | null
  created_at: string
}

export interface OutboundFollowUp {
  id: string
  prospect_id: string
  assigned_to_id: string
  titre: string
  description: string | null
  canal: OutboundCanal
  date_prevue: string
  statut: 'a_faire' | 'fait' | 'annule' | 'reporte'
  fait_a: string | null
  created_by_id: string
  created_at: string
  updated_at: string
  /* Joined from prospects */
  entreprise?: string
  nom_contact?: string | null
  prenom_contact?: string | null
}

export interface OutboundTeamMember {
  user_id: string
  role: string
  email: string
  name: string | null
  avatar_url: string | null
  outbound_actif: boolean | null
  secteurs_autorises: string[] | null
  villes_autorisees: string[] | null
  sources_autorisees: string[] | null
  campagnes_accessibles: string[] | null
  objectif_prospects_mois: number | null
  objectif_contacts_mois: number | null
  objectif_rdv_mois: number | null
  objectif_conversions_mois: number | null
  total_prospects: number
  a_contacter: number
  conversions: number
}

export interface OutboundStats {
  totals: {
    total: number
    conversions: number
    a_contacter: number
    pipeline: number
    pipeline_valeur: number
  }
  by_statut: { statut: OutboundStatut; count: number }[]
  by_day:    { jour: string; count: number }[]
  by_owner:  { user_id: string; name: string; total: number; conversions: number }[]
  relances_dues: number
}

/* ── Constantes (labels UI) ─────────────────────────────────────── */
export const OUTBOUND_STATUS: {
  id: OutboundStatut; label: string; accent: string; dot: string
}[] = [
  { id: 'a_contacter',         label: 'À contacter',       accent: '#64748B', dot: 'bg-slate-400' },
  { id: 'contacte',            label: 'Contacté',          accent: '#0EA5E9', dot: 'bg-sky-500' },
  { id: 'en_conversation',     label: 'En conversation',   accent: '#3B82F6', dot: 'bg-blue-500' },
  { id: 'rdv_pris',            label: 'RDV pris',          accent: '#8B5CF6', dot: 'bg-violet-500' },
  { id: 'interesse',           label: 'Intéressé',         accent: '#10B981', dot: 'bg-emerald-500' },
  { id: 'proposition_envoyee', label: 'Proposition',       accent: '#F59E0B', dot: 'bg-amber-500' },
  { id: 'ne_repond_pas',       label: 'Ne répond pas',     accent: '#94A3B8', dot: 'bg-slate-400' },
  { id: 'refuse',              label: 'Refusé',            accent: '#EF4444', dot: 'bg-red-500' },
  { id: 'non_qualifie',        label: 'Non qualifié',      accent: '#78716C', dot: 'bg-stone-500' },
  { id: 'converti',            label: 'Converti CRM',      accent: '#059669', dot: 'bg-emerald-600' },
]

export const OUTBOUND_PIPELINE_STAGES: OutboundStatut[] = [
  'a_contacter','contacte','en_conversation','rdv_pris','interesse','proposition_envoyee'
]

export const PRIORITE_LABELS: Record<OutboundPriorite, { label: string; color: string }> = {
  basse:   { label: 'Basse',   color: '#94A3B8' },
  normale: { label: 'Normale', color: '#3B82F6' },
  haute:   { label: 'Haute',   color: '#F59E0B' },
  urgente: { label: 'Urgente', color: '#EF4444' },
}

/* ── API helpers ────────────────────────────────────────────────── */
export const outboundApi = {
  /* Prospects */
  listProspects: (query?: Record<string, string>) => {
    const qs = query ? '?' + new URLSearchParams(query).toString() : ''
    return api.get<OutboundProspect[]>(`/api/outbound/prospects${qs}`)
  },
  getProspect:    (id: string) => api.get<OutboundProspect>(`/api/outbound/prospects/${id}`),
  createProspect: (data: Partial<OutboundProspect>) =>
    api.post<OutboundProspect>('/api/outbound/prospects', data),
  updateProspect: (id: string, data: Partial<OutboundProspect>) =>
    api.patch<OutboundProspect>(`/api/outbound/prospects/${id}`, data),
  deleteProspect: (id: string) =>
    api.delete<{ success: boolean }>(`/api/outbound/prospects/${id}`),
  convertProspect: (id: string) =>
    api.post<{ success: boolean; outbound: OutboundProspect; crm: any }>(
      `/api/outbound/prospects/${id}/convert`, {}),

  /* Activities */
  listActivities: (prospectId: string) =>
    api.get<OutboundActivity[]>(`/api/outbound/prospects/${prospectId}/activities`),
  addActivity: (prospectId: string, data: { type: OutboundActivityType; message: string; metadata?: any }) =>
    api.post<OutboundActivity>(`/api/outbound/prospects/${prospectId}/activities`, data),

  /* Follow-ups */
  listFollowUps: (query?: Record<string, string>) => {
    const qs = query ? '?' + new URLSearchParams(query).toString() : ''
    return api.get<OutboundFollowUp[]>(`/api/outbound/follow-ups${qs}`)
  },
  createFollowUp: (data: Partial<OutboundFollowUp> & { prospect_id: string; titre: string; date_prevue: string }) =>
    api.post<OutboundFollowUp>('/api/outbound/follow-ups', data),
  updateFollowUp: (id: string, data: Partial<OutboundFollowUp>) =>
    api.patch<OutboundFollowUp>(`/api/outbound/follow-ups/${id}`, data),
  deleteFollowUp: (id: string) =>
    api.delete<{ success: boolean }>(`/api/outbound/follow-ups/${id}`),

  /* Sectors */
  listSectors:   () => api.get<OutboundSector[]>('/api/outbound/sectors'),
  createSector:  (data: Partial<OutboundSector>) => api.post<OutboundSector>('/api/outbound/sectors', data),
  updateSector:  (id: string, data: Partial<OutboundSector>) => api.patch<OutboundSector>(`/api/outbound/sectors/${id}`, data),
  deleteSector:  (id: string) => api.delete<{ success: boolean }>(`/api/outbound/sectors/${id}`),

  /* Sources */
  listSources:   () => api.get<OutboundSource[]>('/api/outbound/sources'),
  createSource:  (data: Partial<OutboundSource>) => api.post<OutboundSource>('/api/outbound/sources', data),
  updateSource:  (id: string, data: Partial<OutboundSource>) => api.patch<OutboundSource>(`/api/outbound/sources/${id}`, data),
  deleteSource:  (id: string) => api.delete<{ success: boolean }>(`/api/outbound/sources/${id}`),

  /* Campaigns */
  listCampaigns:   () => api.get<OutboundCampaign[]>('/api/outbound/campaigns'),
  createCampaign:  (data: Partial<OutboundCampaign>) => api.post<OutboundCampaign>('/api/outbound/campaigns', data),
  updateCampaign:  (id: string, data: Partial<OutboundCampaign>) => api.patch<OutboundCampaign>(`/api/outbound/campaigns/${id}`, data),
  deleteCampaign:  (id: string) => api.delete<{ success: boolean }>(`/api/outbound/campaigns/${id}`),

  /* Templates */
  listTemplates:   (canal?: string) => api.get<OutboundTemplate[]>(`/api/outbound/templates${canal ? `?canal=${canal}` : ''}`),
  createTemplate:  (data: Partial<OutboundTemplate>) => api.post<OutboundTemplate>('/api/outbound/templates', data),
  updateTemplate:  (id: string, data: Partial<OutboundTemplate>) => api.patch<OutboundTemplate>(`/api/outbound/templates/${id}`, data),
  deleteTemplate:  (id: string) => api.delete<{ success: boolean }>(`/api/outbound/templates/${id}`),

  /* Team */
  listTeam:           () => api.get<OutboundTeamMember[]>('/api/outbound/team'),
  updateTeamSettings: (userId: string, data: any) =>
                       api.patch<any>(`/api/outbound/team/${userId}/settings`, data),

  /* Stats */
  stats: () => api.get<OutboundStats>('/api/outbound/stats'),

  /* Mes settings (agent) */
  mySettings: () => api.get<any>('/api/outbound/me/settings'),

  /* ── MARKETING AUTOMATION ─────────────────────────────────── */
  integrationsStatus: () => api.get<{
    google_places: boolean
    anthropic: boolean
    ai_provider: 'claude' | 'openai' | null
    ai_model: string
    whatsapp: boolean
    whatsapp_provider: 'gupshup' | 'meta' | null
    smtp: boolean
    resend: boolean
  }>('/api/outbound/integrations/status'),

  testAi: () => api.post<{
    success: boolean
    provider: 'claude' | 'openai' | null
    model?: string
    duration_ms: number
    sample?: { subject: string; body: string }
    error?: string
  }>('/api/outbound/integrations/test-ai', {}),

  enrichGooglePlaces: (data: {
    query: string; limit?: number; sector_id?: string; campaign_id?: string; assigned_to_id?: string
  }) => api.post<{
    imported: number; skipped: number;
    results: Array<{
      id: string; entreprise: string;
      telephone: string|null; whatsapp: string|null; email: string|null;
      ville: string|null; site_web: string|null;
    }>
  }>('/api/outbound/enrich/google-places', data),

  verifyProspect: (id: string) => api.post<{
    prospect: { id: string; email_verified: boolean; email_verification_status: string; phone_verified: boolean }
    email: { status: 'valid'|'invalid'|'risky'|'unknown'; reason: string }
    phone: { valid: boolean; e164: string|null }
  }>(`/api/outbound/prospects/${id}/verify`, {}),

  aiGenerateForProspect: (id: string, data: {
    channel: 'email'|'whatsapp'
    language?: 'fr'|'ar'|'en'
    tone?: 'professionnel'|'chaleureux'|'direct'
    template_id?: string
    sender_pitch?: string
    sender_company?: string
    sender_name?: string
    service_focus?: string
  }) => api.post<
    | { channel: 'email'; draft: { subject: string; body: string } }
    | { channel: 'whatsapp'; draft: { body: string } }
  >(`/api/outbound/prospects/${id}/ai-generate`, data),

  sendProspectEmail: (id: string, data?: {
    subject?: string; body?: string
    sender_name?: string; sender_role?: string; sender_company?: string
    sender_phone?: string; sender_website?: string; sender_logo?: string
  }) =>
    api.post<{ success: boolean; to: string; subject: string }>(
      `/api/outbound/prospects/${id}/send-email`, data ?? {}),

  sendProspectWhatsApp: (id: string, data: { template_id: string; variables?: string[] }) =>
    api.post<{ success: boolean; wamid: string; to: string }>(
      `/api/outbound/prospects/${id}/send-whatsapp`, data),
}
