/**
 * Hooks du module financier — revenus, prévisions, transferts, ajustements.
 *
 * Les LECTURES passent par le CRUD générique (`tableApi`, cf.
 * useFinanceQueries), comme le reste de l'app. Les ÉCRITURES qui déplacent
 * de l'argent passent par `financeApi` (/api/finance) : le serveur y
 * garantit l'atomicité, calcule lui-même l'ancien solde d'un ajustement et
 * refuse les doublons grâce à l'`op_id` — un double-clic ne crée jamais
 * deux transactions.
 */
import { useMemo } from 'react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { previsionsApi, revenusApi, financeApi, newOpId } from '@/lib/api'
import { toast } from 'sonner'
import { useBankAccounts } from './useBankAccounts'
import { useDepenses } from './useDepenses'
import { usePaiements } from './usePaiements'
import {
  useRevenus, usePrevisions, useTransferts, useAjustements,
  K_REVENUS, K_PREVISIONS, K_TRANSFERTS, K_AJUSTEMENTS,
  type Revenu, type Prevision,
} from './useFinanceQueries'
import type { FinanceData, PrevisionSens, PrevisionStatut } from '@/lib/finance/compute'

export * from './useFinanceQueries'

/* ── Référentiels UI ─────────────────────────────────────────────── */
export const MOTIFS_AJUSTEMENT = [
  { value: 'depenses_non_enregistrees', label: 'Dépenses non enregistrées' },
  { value: 'revenus_non_enregistres',   label: 'Revenus non enregistrés' },
  { value: 'correction',                label: 'Correction' },
  { value: 'autre',                     label: 'Autre' },
] as const

export const STATUTS_PREVISION: Array<{ value: PrevisionStatut; label: string; sens?: PrevisionSens }> = [
  { value: 'prevu',     label: 'Prévu' },
  { value: 'facture',   label: 'Facturé' },
  { value: 'en_retard', label: 'En retard' },
  { value: 'recu',      label: 'Reçu',  sens: 'revenu' },
  { value: 'paye',      label: 'Payé',  sens: 'depense' },
  { value: 'annule',    label: 'Annulé' },
]

export const CATEGORIES_REVENU = [
  { key: 'vente',         label: 'Vente',         emoji: '🛒' },
  { key: 'prestation',    label: 'Prestation',    emoji: '🧑‍💻' },
  { key: 'abonnement',    label: 'Abonnement',    emoji: '🔁' },
  { key: 'remboursement', label: 'Remboursement', emoji: '↩️' },
  { key: 'apport',        label: 'Apport',        emoji: '💼' },
  { key: 'autre',         label: 'Autre',         emoji: '🎯' },
]

/* Un mouvement d'argent change potentiellement TOUS les écrans financiers
   (soldes, stats, historique) : on rafraîchit l'ensemble d'un bloc plutôt
   que de laisser un widget afficher un chiffre périmé. */
function invalidateFinance(qc: QueryClient) {
  for (const key of [K_REVENUS, K_PREVISIONS, K_TRANSFERTS, K_AJUSTEMENTS,
                     'bank_accounts', 'depenses', 'paiements']) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}

const errMsg = (e: any) => e?.message ?? 'Erreur'

/**
 * Toutes les données financières en un objet — c'est ce que consomment
 * les fonctions pures de `@/lib/finance/compute`.
 */
export function useFinanceData(): FinanceData & { isLoading: boolean } {
  const accountsQ    = useBankAccounts()
  const depensesQ    = useDepenses()
  const paiementsQ   = usePaiements()
  const revenusQ     = useRevenus()
  const previsionsQ  = usePrevisions()
  const transfertsQ  = useTransferts()
  const ajustementsQ = useAjustements()

  const isLoading = accountsQ.isLoading || depensesQ.isLoading || paiementsQ.isLoading
    || revenusQ.isLoading || previsionsQ.isLoading

  return useMemo(() => ({
    accounts:    accountsQ.data    ?? [],
    depenses:    depensesQ.data    ?? [],
    paiements:   paiementsQ.data   ?? [],
    revenus:     revenusQ.data     ?? [],
    previsions:  previsionsQ.data  ?? [],
    transferts:  transfertsQ.data  ?? [],
    ajustements: ajustementsQ.data ?? [],
    isLoading,
  }), [
    accountsQ.data, depensesQ.data, paiementsQ.data, revenusQ.data,
    previsionsQ.data, transfertsQ.data, ajustementsQ.data, isLoading,
  ]) as FinanceData & { isLoading: boolean }
}

/* ── Revenus ─────────────────────────────────────────────────────── */
export function useCreateRevenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Revenu> & { op_id?: string }) =>
      financeApi.createRevenu({ op_id: newOpId(), ...data }),
    onSuccess: () => { invalidateFinance(qc); toast.success('Revenu enregistré') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

export function useDeleteRevenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteRevenu(id),
    onSuccess: () => { invalidateFinance(qc); toast.success('Revenu supprimé') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

export function useUpdateRevenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Revenu> }) =>
      revenusApi.update(id, data as any),
    onSuccess: () => { invalidateFinance(qc); toast.success('Revenu mis à jour') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

/* ── Prévisions ──────────────────────────────────────────────────── */
export function useCreatePrevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Prevision> & { op_id?: string }) =>
      previsionsApi.create({ op_id: newOpId(), ...data } as any),
    onSuccess: (_d, vars) => {
      invalidateFinance(qc)
      toast.success(vars.sens === 'depense' ? 'Dépense prévue ajoutée' : 'Revenu prévu ajouté')
    },
    onError: (e: any) => toast.error(errMsg(e)),
  })
}

export function useUpdatePrevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Prevision> }) =>
      previsionsApi.update(id, data as any),
    onSuccess: () => { invalidateFinance(qc); toast.success('Prévision mise à jour') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

export function useDeletePrevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => previsionsApi.remove(id),
    onSuccess: () => { invalidateFinance(qc); toast.success('Prévision supprimée') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

/** « Marquer comme reçu / payé » — crée la transaction ET solde la prévision. */
export function useSettlePrevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string
      montant: number
      date_realisation: string
      bank_account_id: string | null
      op_id?: string
    }) => financeApi.settlePrevision(id, { op_id: newOpId(), ...data }),
    onSuccess: (res) => {
      invalidateFinance(qc)
      toast.success(res?.sens === 'depense' ? 'Dépense payée enregistrée' : 'Revenu encaissé enregistré')
    },
    onError: (e: any) => toast.error(errMsg(e)),
  })
}

export function useCancelPrevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => financeApi.cancelPrevision(id),
    onSuccess: () => { invalidateFinance(qc); toast.success('Prévision annulée') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

export function useReopenPrevision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => financeApi.reopenPrevision(id),
    onSuccess: () => { invalidateFinance(qc); toast.success('Prévision rouverte') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

/* ── Transferts ──────────────────────────────────────────────────── */
export function useCreateTransfert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      compte_source_id: string
      compte_destination_id: string
      montant: number
      date_transfert: string
      note?: string | null
      op_id?: string
    }) => financeApi.createTransfert({ op_id: newOpId(), ...data }),
    onSuccess: () => { invalidateFinance(qc); toast.success('Transfert effectué') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

export function useDeleteTransfert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => financeApi.deleteTransfert(id),
    onSuccess: () => { invalidateFinance(qc); toast.success('Transfert annulé') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}

/* ── Ajustements de solde ────────────────────────────────────────── */
export function useCreateAjustement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      bank_account_id: string
      nouveau_solde: number
      motif: string
      note?: string | null
      date_ajustement: string
      op_id?: string
    }) => financeApi.createAjustement({ op_id: newOpId(), ...data }),
    onSuccess: () => { invalidateFinance(qc); toast.success('Solde ajusté') },
    onError:   (e: any) => toast.error(errMsg(e)),
  })
}
