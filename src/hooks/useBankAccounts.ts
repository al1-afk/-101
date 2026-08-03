import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bankAccountsApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'
import { useDepenses } from './useDepenses'
import { usePaiements } from './usePaiements'
import { useRevenus, useTransferts, useAjustements } from './useFinanceQueries'
import {
  computeAccountBalances, computeMonthlyHistory, buildMovements,
  type FinanceData, type Movement,
} from '@/lib/finance/compute'
import { useMemo } from 'react'

export interface BankAccount {
  id:             string
  tenant_id?:     string
  nom:            string
  type:           'banque' | 'wallet' | 'cash' | 'autre'
  icon:           string | null
  couleur:        string | null
  devise:         string
  solde_initial:  number
  iban:           string | null
  notes:          string | null
  actif:          boolean
  created_at:     string
  updated_at?:    string
}

export interface BankAccountWithSolde extends BankAccount {
  solde:                     number
  total_entrees:             number
  total_sorties:             number
  total_transferts_entrants: number
  total_transferts_sortants: number
  total_ajustements:         number
}

/** Mouvement d'un compte (ré-export du type partagé). */
export type AccountMovement = Movement

const KEY = 'bank_accounts'

export function useBankAccounts() {
  return useQuery<BankAccount[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => bankAccountsApi.list({ orderBy: 'created_at', order: 'asc' }) as Promise<BankAccount[]>,
    staleTime: 1000 * 60 * 3,
  })
}

/**
 * Rassemble les listes qui composent un solde. Les mêmes requêtes sont
 * partagées (React Query dédoublonne par clé) : aucun appel réseau
 * supplémentaire par rapport aux écrans qui les affichent déjà.
 */
function useFinanceSources(): { data: FinanceData; isLoading: boolean } {
  const accountsQ    = useBankAccounts()
  const depensesQ    = useDepenses()
  const paiementsQ   = usePaiements()
  const revenusQ     = useRevenus()
  const transfertsQ  = useTransferts()
  const ajustementsQ = useAjustements()

  const isLoading = accountsQ.isLoading || depensesQ.isLoading || paiementsQ.isLoading
    || revenusQ.isLoading

  return useMemo(() => ({
    data: {
      accounts:    accountsQ.data    ?? [],
      depenses:    depensesQ.data    ?? [],
      paiements:   paiementsQ.data   ?? [],
      revenus:     revenusQ.data     ?? [],
      transferts:  transfertsQ.data  ?? [],
      ajustements: ajustementsQ.data ?? [],
    },
    isLoading,
  }), [
    accountsQ.data, depensesQ.data, paiementsQ.data,
    revenusQ.data, transfertsQ.data, ajustementsQ.data, isLoading,
  ])
}

/* Solde réel d'un compte :
     solde_initial
   + paiements encaissés + revenus + transferts entrants + ajustements
   − dépenses − transferts sortants
   La formule vit dans @/lib/finance/compute (testée) et dans la vue SQL
   bank_accounts_with_solde — jamais recopiée à la main ici. */
export function useBankAccountsWithSolde() {
  const { data, isLoading } = useFinanceSources()

  const enriched = useMemo<BankAccountWithSolde[]>(() => {
    const balances = computeAccountBalances(data)
    return (data.accounts ?? []).map(a => {
      const b = balances.get(a.id)
      return {
        ...(a as BankAccount),
        solde:                     b?.solde ?? Number(a.solde_initial || 0),
        total_entrees:             b?.total_entrees ?? 0,
        total_sorties:             b?.total_sorties ?? 0,
        total_transferts_entrants: b?.total_transferts_entrants ?? 0,
        total_transferts_sortants: b?.total_transferts_sortants ?? 0,
        total_ajustements:         b?.total_ajustements ?? 0,
      }
    })
  }, [data])

  return {
    data: enriched,
    isLoading,
    totalSolde: enriched.reduce((s, a) => s + a.solde, 0),
  }
}

/**
 * Historique mensuel du solde d'un compte + journal de ses mouvements
 * (revenus, paiements encaissés, dépenses, transferts, ajustements).
 */
export function useAccountMonthlyHistory(accountId: string | null, monthsBack = 12) {
  const { data } = useFinanceSources()

  return useMemo(() => {
    const account = (data.accounts ?? []).find(a => a.id === accountId) as BankAccount | undefined
    if (!accountId || !account) {
      return { history: [], movements: [] as Movement[], account: undefined, solde: 0 }
    }
    return {
      history:   computeMonthlyHistory(data, accountId, monthsBack),
      movements: buildMovements(data, accountId),
      account,
      /* Le solde courant vient du calcul de référence, pas du dernier point
         de l'historique mensuel : un mouvement daté dans le futur compte
         dans le solde réel mais pas dans le point « fin du mois en cours ». */
      solde:     computeAccountBalances(data).get(accountId)?.solde ?? 0,
    }
  }, [accountId, data, monthsBack])
}

export function useCreateBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<BankAccount>) =>
      bankAccountsApi.create(data as any) as Promise<BankAccount>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Compte créé')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BankAccount> }) =>
      bankAccountsApi.update(id, data) as Promise<BankAccount>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Compte mis à jour')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bankAccountsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Compte supprimé')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
