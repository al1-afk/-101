import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bankAccountsApi, paiementsApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'
import { useDepenses } from './useDepenses'
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
  solde: number
  total_entrees: number
  total_sorties: number
}

interface PaiementRow {
  id:              string
  montant:         number
  bank_account_id: string | null
  date_paiement:   string
  notes:           string | null
  reference:       string | null
}

export interface AccountMovement {
  id:      string
  date:    string       // YYYY-MM-DD
  type:    'entree' | 'sortie'
  montant: number
  label:   string
  source:  'paiement' | 'depense'
}

const KEY = 'bank_accounts'
const KEY_PAI = 'paiements'

export function useBankAccounts() {
  return useQuery<BankAccount[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => bankAccountsApi.list({ orderBy: 'created_at', order: 'asc' }) as Promise<BankAccount[]>,
    staleTime: 1000 * 60 * 3,
  })
}

/* Solde live : solde_initial + Σ paiements entrants - Σ dépenses sortantes.
   Calculé côté client à partir des mêmes hooks que la page utilise déjà,
   pour éviter d'ajouter une route serveur dédiée à la vue. */
export function useBankAccountsWithSolde() {
  const accountsQ = useBankAccounts()
  const { data: depenses = [] } = useDepenses()
  const paiementsQ = useQuery<PaiementRow[]>({
    queryKey: [KEY_PAI, currentTenantIdForCache()],
    queryFn:  () => paiementsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<PaiementRow[]>,
    staleTime: 1000 * 60 * 3,
  })

  const enriched = useMemo<BankAccountWithSolde[]>(() => {
    const accounts = accountsQ.data ?? []
    const paiements = paiementsQ.data ?? []
    return accounts.map(a => {
      const total_entrees = paiements
        .filter(p => p.bank_account_id === a.id)
        .reduce((s, p) => s + Number(p.montant || 0), 0)
      const total_sorties = depenses
        .filter(d => (d as any).bank_account_id === a.id)
        .reduce((s, d) => s + Number(d.montant || 0), 0)
      return {
        ...a,
        total_entrees,
        total_sorties,
        solde: Number(a.solde_initial || 0) + total_entrees - total_sorties,
      }
    })
  }, [accountsQ.data, paiementsQ.data, depenses])

  return {
    data: enriched,
    isLoading: accountsQ.isLoading || paiementsQ.isLoading,
    totalSolde: enriched.reduce((s, a) => s + a.solde, 0),
  }
}

/* Historique mensuel du solde d'un compte : renvoie un tableau ordonné
   [{ month:'2026-02', solde: 1234 }, …] jusqu'au mois courant.
   Solde à la fin du mois M = solde_initial + Σ paiements(date <= fin M)
                                            − Σ dépenses(date <= fin M) */
export function useAccountMonthlyHistory(accountId: string | null, monthsBack = 12) {
  const { data: depenses = [] } = useDepenses()
  const paiementsQ = useQuery<PaiementRow[]>({
    queryKey: [KEY_PAI, currentTenantIdForCache()],
    queryFn:  () => paiementsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<PaiementRow[]>,
    staleTime: 1000 * 60 * 3,
  })
  const { data: accounts = [] } = useBankAccounts()

  return useMemo(() => {
    if (!accountId) return { history: [], movements: [] }
    const account = accounts.find(a => a.id === accountId)
    if (!account) return { history: [], movements: [] }

    const paiements = (paiementsQ.data ?? []).filter(p => p.bank_account_id === accountId)
    const accountDepenses = depenses.filter(d => (d as any).bank_account_id === accountId)

    /* Mouvements unifiés triés du plus récent au plus ancien. */
    const movements: AccountMovement[] = [
      ...paiements.map(p => ({
        id:      p.id,
        date:    p.date_paiement,
        type:    'entree' as const,
        montant: Number(p.montant || 0),
        label:   p.notes || p.reference || 'Paiement encaissé',
        source:  'paiement' as const,
      })),
      ...accountDepenses.map(d => ({
        id:      d.id,
        date:    d.date_depense,
        type:    'sortie' as const,
        montant: Number(d.montant || 0),
        label:   d.description || d.categorie || 'Dépense',
        source:  'depense' as const,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1))

    /* Solde à la fin de chaque mois, monthsBack mois en arrière. */
    const now = new Date()
    const history: Array<{ month: string; label: string; solde: number }> = []
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0) // dernier jour du mois
      const endStr = d.toISOString().slice(0, 10)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const totalPai = paiements
        .filter(p => p.date_paiement && p.date_paiement <= endStr)
        .reduce((s, p) => s + Number(p.montant || 0), 0)
      const totalDep = accountDepenses
        .filter(x => x.date_depense && x.date_depense <= endStr)
        .reduce((s, x) => s + Number(x.montant || 0), 0)
      history.push({
        month: monthKey,
        label: d.toLocaleString('fr-FR', { month: 'short', year: '2-digit' }),
        solde: Number(account.solde_initial || 0) + totalPai - totalDep,
      })
    }

    return { history, movements, account }
  }, [accountId, accounts, paiementsQ.data, depenses, monthsBack])
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
