import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccountMonthlyHistory, type BankAccountWithSolde } from '@/hooks/useBankAccounts'
import { useCreateRevenu } from '@/hooks/useFinance'
import { formatDate } from '@/lib/utils'
import { formatDH, round2, toISODateLocal, type MovementType } from '@/lib/finance/compute'
import { ArrowDownRight, ArrowUpRight, Plus, Loader2, X, SlidersHorizontal, ArrowLeftRight } from 'lucide-react'

/* Icône par nature de mouvement — le journal doit se lire sans légende. */
const MOVEMENT_ICON: Record<MovementType, string> = {
  revenu:            '💰',
  paiement:          '💳',
  depense:           '💸',
  transfert_entrant: '🔄',
  transfert_sortant: '🔄',
  ajustement:        '⚖️',
}

export function AccountDetailDialog({
  accountId,
  onClose,
  onAdjust,
  onTransfer,
}: {
  accountId: string | null
  onClose: () => void
  onAdjust?: (account: BankAccountWithSolde) => void
  onTransfer?: (account: BankAccountWithSolde) => void
}) {
  const { history, movements, account, solde: soldeActuel } = useAccountMonthlyHistory(accountId, 12)
  const createRevenu = useCreateRevenu()
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [deposit, setDeposit] = useState({
    montant: '' as string | number,
    date:    toISODateLocal(new Date()),
    notes:   '',
  })

  const devise = account?.devise ?? 'MAD'

  const resetDeposit = () => setDeposit({
    montant: '',
    date:    toISODateLocal(new Date()),
    notes:   '',
  })

  const submitDeposit = async () => {
    if (!accountId || createRevenu.isPending) return
    const montant = Number(String(deposit.montant).replace(',', '.'))
    if (!Number.isFinite(montant) || montant <= 0) return
    /* Un dépôt EST un revenu encaissé : il alimente la même table que le
       formulaire « Ajouter un revenu », donc les statistiques et le solde
       restent cohérents quel que soit le point d'entrée. */
    await createRevenu.mutateAsync({
      montant:         round2(montant),
      date_revenu:     deposit.date,
      bank_account_id: accountId,
      categorie:       'apport',
      source:          deposit.notes || 'Dépôt manuel',
      description:     deposit.notes || 'Dépôt manuel',
      type:            'business',
    })
    resetDeposit()
    setShowDepositForm(false)
  }

  return (
    <Dialog open={!!accountId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{account?.icon || '🏦'}</span>
            <span>{account?.nom || 'Compte'}</span>
          </DialogTitle>
        </DialogHeader>

        {!account ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Compte introuvable.</p>
        ) : (
          <div className="space-y-6">
            {/* Solde actuel + bouton dépôt */}
            <div className="p-4 rounded-xl border border-border bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Solde actuel</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{formatDH(soldeActuel, devise)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Solde initial : {formatDH(Number(account.solde_initial || 0), devise)}
                  </p>
                </div>
                {!showDepositForm && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" onClick={() => setShowDepositForm(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Ajouter un dépôt
                    </Button>
                    {onAdjust && (
                      <Button size="sm" variant="secondary" onClick={() => onAdjust({ ...(account as any), solde: soldeActuel } as BankAccountWithSolde)}>
                        <SlidersHorizontal className="w-4 h-4 mr-1" /> Modifier le solde
                      </Button>
                    )}
                    {onTransfer && (
                      <Button size="sm" variant="secondary" onClick={() => onTransfer({ ...(account as any), solde: soldeActuel } as BankAccountWithSolde)}>
                        <ArrowLeftRight className="w-4 h-4 mr-1" /> Transférer
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {showDepositForm && (
                <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">💰 Nouveau dépôt sur ce compte</p>
                    <button
                      onClick={() => { setShowDepositForm(false); resetDeposit() }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="form-label">Montant ({devise === 'MAD' ? 'DH' : devise}) *</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={deposit.montant}
                        onChange={e => setDeposit(p => ({ ...p, montant: e.target.value }))}
                        placeholder="0"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="form-label">Date</label>
                      <Input
                        type="date"
                        value={deposit.date}
                        onChange={e => setDeposit(p => ({ ...p, date: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="form-label">Note (optionnel)</label>
                    <Input
                      value={deposit.notes}
                      onChange={e => setDeposit(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Ex: Virement client X, Salaire, Remboursement…"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { setShowDepositForm(false); resetDeposit() }}>
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      onClick={submitDeposit}
                      disabled={createRevenu.isPending || !(Number(deposit.montant) > 0)}
                    >
                      {createRevenu.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : `+ ${Number(deposit.montant || 0).toLocaleString('fr-FR')} ${devise === 'MAD' ? 'DH' : devise}`}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Historique mensuel */}
            <div>
              <h3 className="section-title mb-3">📈 Solde à la fin de chaque mois</h3>
              {history.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={history} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickFormatter={v => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e293b' }}
                        formatter={(v: any) => [formatDH(Number(v), devise), 'Solde fin de mois']}
                      />
                      <Line
                        type="monotone"
                        dataKey="solde"
                        stroke={account.couleur || '#3b82f6'}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: account.couleur || '#3b82f6' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                    {history.slice().reverse().map(h => (
                      <div key={h.month} className="p-2 rounded-lg border border-border bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase">{h.label}</p>
                        <p className="text-sm font-semibold text-foreground">{formatDH(h.solde, devise)}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Aucun historique.</p>
              )}
            </div>

            {/* Mouvements récents */}
            <div>
              <h3 className="section-title mb-3">
                📜 Mouvements ({movements.length})
              </h3>
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aucun mouvement sur ce compte pour l'instant.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto border border-border rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="table-header">
                      <tr>
                        <th className="text-left">Date</th>
                        <th className="text-left">Libellé</th>
                        <th className="text-right">Montant</th>
                        <th className="text-right">Solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => {
                        const entree = m.entree > 0
                        return (
                          <tr key={m.key} className="border-t border-border">
                            <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{formatDate(m.date)}</td>
                            <td className="py-2 px-3 text-foreground truncate max-w-xs">
                              <span className="text-xs text-muted-foreground mr-1.5">
                                {MOVEMENT_ICON[m.type]}
                              </span>
                              {m.label}
                            </td>
                            <td className={`py-2 px-3 text-right font-semibold whitespace-nowrap ${
                              entree
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                              <span className="inline-flex items-center gap-0.5">
                                {entree
                                  ? <ArrowUpRight className="w-3.5 h-3.5" />
                                  : <ArrowDownRight className="w-3.5 h-3.5" />}
                                {entree ? '+' : '−'}{formatDH(entree ? m.entree : m.sortie, devise)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                              {m.solde === null ? '—' : formatDH(m.solde, devise)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
