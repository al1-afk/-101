/**
 * Lectures brutes du module financier (revenus, prévisions, transferts,
 * ajustements) + types partagés.
 *
 * Fichier séparé de `useFinance.ts` pour une raison précise : le calcul
 * du solde d'un compte (useBankAccounts) a besoin de ces listes, tandis
 * que `useFinance` a besoin des comptes. Isoler les requêtes ici évite
 * un import circulaire entre les deux.
 */
import { useQuery } from '@tanstack/react-query'
import { revenusApi, previsionsApi, transfertsApi, ajustementsApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import type { PrevisionSens, PrevisionStatut } from '@/lib/finance/compute'

/* ── Types ───────────────────────────────────────────────────────── */
export interface Revenu {
  id:              string
  tenant_id?:      string
  montant:         number
  date_revenu:     string
  bank_account_id: string | null
  categorie:       string
  source:          string | null
  client_id:       string | null
  projet_id:       string | null
  description:     string | null
  type:            'personnel' | 'business'
  prevision_id:    string | null
  created_at:      string
}

export interface Prevision {
  id:               string
  tenant_id?:       string
  sens:             PrevisionSens
  montant:          number
  date_prevue:      string
  bank_account_id:  string | null
  categorie:        string | null
  source:           string | null
  client_id:        string | null
  projet_id:        string | null
  description:      string | null
  type:             'personnel' | 'business'
  statut:           PrevisionStatut
  montant_realise:  number | null
  date_realisation: string | null
  revenu_id:        string | null
  depense_id:       string | null
  created_at:       string
}

export interface Transfert {
  id:                    string
  montant:               number
  date_transfert:        string
  compte_source_id:      string
  compte_destination_id: string
  note:                  string | null
  created_at:            string
}

export interface Ajustement {
  id:              string
  bank_account_id: string
  ancien_solde:    number
  nouveau_solde:   number
  difference:      number
  motif:           'depenses_non_enregistrees' | 'revenus_non_enregistres' | 'correction' | 'autre'
  note:            string | null
  date_ajustement: string
  created_at:      string
}

export const K_REVENUS     = 'revenus'
export const K_PREVISIONS  = 'previsions_financieres'
export const K_TRANSFERTS  = 'transferts_comptes'
export const K_AJUSTEMENTS = 'bank_account_adjustments'

/* ── Requêtes ────────────────────────────────────────────────────── */
export function useRevenus() {
  return useQuery<Revenu[]>({
    queryKey: [K_REVENUS, currentTenantIdForCache()],
    queryFn:  () => revenusApi.list({ orderBy: 'date_revenu', order: 'desc' }) as Promise<Revenu[]>,
    staleTime: 1000 * 60 * 3,
  })
}

export function usePrevisions() {
  return useQuery<Prevision[]>({
    queryKey: [K_PREVISIONS, currentTenantIdForCache()],
    queryFn:  () => previsionsApi.list({ orderBy: 'date_prevue', order: 'asc' }) as Promise<Prevision[]>,
    staleTime: 1000 * 60 * 3,
  })
}

export function useTransferts() {
  return useQuery<Transfert[]>({
    queryKey: [K_TRANSFERTS, currentTenantIdForCache()],
    queryFn:  () => transfertsApi.list({ orderBy: 'date_transfert', order: 'desc' }) as Promise<Transfert[]>,
    staleTime: 1000 * 60 * 3,
  })
}

export function useAjustements() {
  return useQuery<Ajustement[]>({
    queryKey: [K_AJUSTEMENTS, currentTenantIdForCache()],
    queryFn:  () => ajustementsApi.list({ orderBy: 'date_ajustement', order: 'desc' }) as Promise<Ajustement[]>,
    staleTime: 1000 * 60 * 3,
  })
}
