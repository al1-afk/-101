import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  outboundApi,
  type OutboundProspect, type OutboundActivity, type OutboundActivityType,
  type OutboundFollowUp, type OutboundSector, type OutboundSource,
  type OutboundCampaign, type OutboundTemplate, type OutboundTeamMember,
  type OutboundStats,
} from '@/lib/outboundApi'
import { currentTenantIdForCache } from '@/lib/authToken'

/* ─── Query keys ───────────────────────────────────────────────── */
const K = {
  prospects:  (tid: string, q?: Record<string, string>) => ['outbound', 'prospects', tid, q ?? {}] as const,
  prospect:   (id: string) => ['outbound', 'prospect', id] as const,
  activities: (id: string) => ['outbound', 'activities', id] as const,
  followUps:  (tid: string, q?: Record<string, string>) => ['outbound', 'follow-ups', tid, q ?? {}] as const,
  sectors:    (tid: string) => ['outbound', 'sectors', tid] as const,
  sources:    (tid: string) => ['outbound', 'sources', tid] as const,
  campaigns:  (tid: string) => ['outbound', 'campaigns', tid] as const,
  templates:  (tid: string, canal?: string) => ['outbound', 'templates', tid, canal ?? ''] as const,
  team:       (tid: string) => ['outbound', 'team', tid] as const,
  stats:      (tid: string) => ['outbound', 'stats', tid] as const,
  mySettings: (tid: string) => ['outbound', 'my-settings', tid] as const,
}

const tid = () => currentTenantIdForCache()
const invAll = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['outbound'] })

/* ─── PROSPECTS ────────────────────────────────────────────────── */
export function useOutboundProspects(query?: Record<string, string>) {
  return useQuery<OutboundProspect[]>({
    queryKey: K.prospects(tid(), query),
    queryFn:  () => outboundApi.listProspects(query),
    staleTime: 30_000,
  })
}

export function useOutboundProspect(id: string | null) {
  return useQuery<OutboundProspect>({
    queryKey: K.prospect(id ?? ''),
    enabled:  !!id,
    queryFn:  () => outboundApi.getProspect(id!),
  })
}

export function useCreateOutboundProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<OutboundProspect>) => outboundApi.createProspect(data),
    onSuccess: () => { invAll(qc); toast.success('Prospect ajouté') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateOutboundProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<OutboundProspect> & { id: string }) =>
      outboundApi.updateProspect(id, data),
    onSuccess: () => { invAll(qc); toast.success('Prospect mis à jour') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteOutboundProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => outboundApi.deleteProspect(id),
    onSuccess: () => { invAll(qc); toast.success('Prospect supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useConvertOutboundToCrm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => outboundApi.convertProspect(id),
    onSuccess: () => {
      invAll(qc)
      qc.invalidateQueries({ queryKey: ['prospects'] })
      toast.success('Prospect converti en CRM')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

/* ─── ACTIVITIES ────────────────────────────────────────────────── */
export function useOutboundActivities(prospectId: string | null) {
  return useQuery<OutboundActivity[]>({
    queryKey: K.activities(prospectId ?? ''),
    enabled:  !!prospectId,
    queryFn:  () => outboundApi.listActivities(prospectId!),
  })
}

export function useAddOutboundActivity(prospectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { type: OutboundActivityType; message: string; metadata?: any }) =>
      outboundApi.addActivity(prospectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.activities(prospectId) })
      qc.invalidateQueries({ queryKey: ['outbound', 'prospects'] })
      qc.invalidateQueries({ queryKey: ['outbound', 'prospect', prospectId] })
      toast.success('Activité enregistrée')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

/* ─── FOLLOW-UPS ────────────────────────────────────────────────── */
export function useOutboundFollowUps(query?: Record<string, string>) {
  return useQuery<OutboundFollowUp[]>({
    queryKey: K.followUps(tid(), query),
    queryFn:  () => outboundApi.listFollowUps(query),
  })
}

export function useCreateFollowUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<OutboundFollowUp> & { prospect_id: string; titre: string; date_prevue: string }) =>
      outboundApi.createFollowUp(data),
    onSuccess: () => { invAll(qc); toast.success('Relance programmée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateFollowUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<OutboundFollowUp> & { id: string }) =>
      outboundApi.updateFollowUp(id, data),
    onSuccess: () => { invAll(qc); toast.success('Relance mise à jour') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteFollowUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => outboundApi.deleteFollowUp(id),
    onSuccess: () => { invAll(qc); toast.success('Relance supprimée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

/* ─── SECTORS / SOURCES / CAMPAIGNS / TEMPLATES ─────────────────── */
export function useOutboundSectors() {
  return useQuery<OutboundSector[]>({
    queryKey: K.sectors(tid()),
    queryFn:  () => outboundApi.listSectors(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateSector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<OutboundSector>) => outboundApi.createSector(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'sectors'] }); toast.success('Secteur ajouté') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
export function useUpdateSector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<OutboundSector> & { id: string }) => outboundApi.updateSector(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'sectors'] }) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
export function useDeleteSector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => outboundApi.deleteSector(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'sectors'] }); toast.success('Secteur supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useOutboundSources() {
  return useQuery<OutboundSource[]>({
    queryKey: K.sources(tid()),
    queryFn:  () => outboundApi.listSources(),
    staleTime: 5 * 60 * 1000,
  })
}
export function useCreateSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<OutboundSource>) => outboundApi.createSource(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'sources'] }); toast.success('Source ajoutée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
export function useUpdateSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<OutboundSource> & { id: string }) => outboundApi.updateSource(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'sources'] }) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
export function useDeleteSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => outboundApi.deleteSource(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'sources'] }); toast.success('Source supprimée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useOutboundCampaigns() {
  return useQuery<OutboundCampaign[]>({
    queryKey: K.campaigns(tid()),
    queryFn:  () => outboundApi.listCampaigns(),
  })
}
export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<OutboundCampaign>) => outboundApi.createCampaign(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'campaigns'] }); toast.success('Campagne créée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
export function useUpdateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<OutboundCampaign> & { id: string }) => outboundApi.updateCampaign(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'campaigns'] }) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
export function useDeleteCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => outboundApi.deleteCampaign(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'campaigns'] }); toast.success('Campagne supprimée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useOutboundTemplates(canal?: string) {
  return useQuery<OutboundTemplate[]>({
    queryKey: K.templates(tid(), canal),
    queryFn:  () => outboundApi.listTemplates(canal),
  })
}
export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<OutboundTemplate>) => outboundApi.createTemplate(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'templates'] }); toast.success('Modèle créé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<OutboundTemplate> & { id: string }) => outboundApi.updateTemplate(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'templates'] }) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => outboundApi.deleteTemplate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'templates'] }); toast.success('Modèle supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

/* ─── TEAM ──────────────────────────────────────────────────────── */
export function useOutboundTeam() {
  return useQuery<OutboundTeamMember[]>({
    queryKey: K.team(tid()),
    queryFn:  () => outboundApi.listTeam(),
  })
}

export function useUpdateTeamSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, ...data }: { userId: string } & Record<string, any>) =>
      outboundApi.updateTeamSettings(userId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outbound', 'team'] }); toast.success('Paramètres enregistrés') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

/* ─── STATS ─────────────────────────────────────────────────────── */
export function useOutboundStats() {
  return useQuery<OutboundStats>({
    queryKey: K.stats(tid()),
    queryFn:  () => outboundApi.stats(),
    staleTime: 60_000,
  })
}

export function useOutboundMySettings() {
  return useQuery<any>({
    queryKey: K.mySettings(tid()),
    queryFn:  () => outboundApi.mySettings(),
  })
}

/* ─── MARKETING AUTOMATION ─────────────────────────────────────── */

export function useOutboundIntegrationsStatus() {
  return useQuery({
    queryKey: ['outbound', 'integrations-status', tid()],
    queryFn:  () => outboundApi.integrationsStatus(),
    staleTime: 30_000,
  })
}

export function useEnrichGooglePlaces() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof outboundApi.enrichGooglePlaces>[0]) =>
      outboundApi.enrichGooglePlaces(data),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['outbound', 'prospects'] })
      qc.invalidateQueries({ queryKey: ['outbound', 'stats'] })
      toast.success(`${r.imported} prospects importés, ${r.skipped} déjà présents`)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur enrichissement'),
  })
}

export function useVerifyProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => outboundApi.verifyProspect(id),
    onSuccess: (r, id) => {
      qc.invalidateQueries({ queryKey: ['outbound', 'prospect', id] })
      qc.invalidateQueries({ queryKey: ['outbound', 'activities', id] })
      const label = r.email.status === 'valid' ? 'Email valide' :
                    r.email.status === 'invalid' ? 'Email invalide' :
                    r.email.status === 'risky' ? 'Email à risque' : 'Statut inconnu'
      toast.success(`${label} · Tél ${r.phone.valid ? 'valide' : 'invalide'}`)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur vérification'),
  })
}

export function useAiGenerateForProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof outboundApi.aiGenerateForProspect>[1]) =>
      outboundApi.aiGenerateForProspect(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['outbound', 'prospect', id] })
      toast.success('Draft IA généré')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur IA'),
  })
}

export function useSendProspectEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string; subject?: string; body?: string
      sender_name?: string; sender_role?: string; sender_company?: string
      sender_phone?: string; sender_website?: string; sender_logo?: string
    }) => outboundApi.sendProspectEmail(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['outbound', 'prospect', id] })
      qc.invalidateQueries({ queryKey: ['outbound', 'activities', id] })
      qc.invalidateQueries({ queryKey: ['outbound', 'prospects'] })
      toast.success('Email envoyé')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Envoi échoué'),
  })
}

export function useSendProspectWhatsApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; template_id: string; variables?: string[] }) =>
      outboundApi.sendProspectWhatsApp(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['outbound', 'prospect', id] })
      qc.invalidateQueries({ queryKey: ['outbound', 'activities', id] })
      qc.invalidateQueries({ queryKey: ['outbound', 'prospects'] })
      toast.success('WhatsApp envoyé')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Envoi échoué'),
  })
}
