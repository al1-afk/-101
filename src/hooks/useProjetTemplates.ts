/**
 * Templates de projet personnalisés (par tenant), stockés en DB.
 * Coexistent avec les 6 templates intégrés en dur (PROJET_TEMPLATES).
 *
 * Convention pour distinguer les deux côté UI :
 *   - built-in template.key = string court ('wordpress', 'seo', ...)
 *   - custom template.key   = 'custom:' + row.id (UUID)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projetTemplatesApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import type { ProjetTemplate } from '@/lib/projetTemplates'
import { toast } from 'sonner'

export interface CustomProjetTemplate {
  id:          string
  tenant_id:   string
  label:       string
  emoji:       string | null
  description: string | null
  groups:      { category: string; tasks: { title: string; priority?: string; prompt?: string; recurrence?: unknown }[] }[]
  created_at:  string
  updated_at:  string
}

const KEY = 'projet_templates'
const tk = () => [KEY, currentTenantIdForCache()] as const

/** Convert a DB row into the shape the picker UI already understands. */
export function rowToTemplate(r: CustomProjetTemplate): ProjetTemplate {
  return {
    key:         `custom:${r.id}`,
    label:       r.label,
    emoji:       r.emoji || '📋',
    description: r.description || '',
    groups:      Array.isArray(r.groups) ? r.groups as any : [],
  }
}

export function useCustomTemplates() {
  return useQuery<CustomProjetTemplate[]>({
    queryKey: tk(),
    queryFn:  () => projetTemplatesApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<CustomProjetTemplate[]>,
    staleTime: 60_000,
  })
}

export function useCreateCustomTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Pick<CustomProjetTemplate, 'label' | 'emoji' | 'description' | 'groups'>) =>
      projetTemplatesApi.create(data) as Promise<CustomProjetTemplate>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Template créé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateCustomTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<CustomProjetTemplate> & { id: string }) =>
      projetTemplatesApi.update(id, data) as Promise<CustomProjetTemplate>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Template mis à jour') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteCustomTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projetTemplatesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Template supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
