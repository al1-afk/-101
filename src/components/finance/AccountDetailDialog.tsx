import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccountMonthlyHistory } from '@/hooks/useBankAccounts'
import { useCreatePaiement } from '@/hooks/usePaiements'
import { formatDate } from '@/lib/utils'
import { ArrowDownRight, ArrowUpRight, Plus, Loader2, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

function formatDH(n: number, devise = 'MAD') {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${devise === 'MAD' ? 'DH' : devise}`
}

export function AccountDetailDialog({
  accountId,
  onClose,
}: {
  accountId: string | null
  onClose: () => void
}) {
  const { history, movements, account } = useAccountMonthlyHistory(accountId, 12)
  const createPaiement = useCreatePaiement()
  const qc = useQueryClient()
  const [showDepositForm, setShowDepositForm] = useState(false)
  const [deposit, setDeposit] = useState({
    montant: '' as string | number,
    date:    new Date().toISOString().slice(0, 10),
    notes:   '',
  })

  const soldeActuel = history.length > 0 ? history[history.length - 1].solde : 0
  const devise = account?.devise ?? 'MAD'

  const resetDeposit = () => setDeposit({
    montant: '',
    date:    new Date().toISOString().slice(0, 10),
    notes:   '',
  })

  const submitDeposit = async () => {
    if (!accountId) return
    const montant = Number(deposit.montant)
    if (!montant || montant <= 0) return
    await createPaiement.mutateAsync({
      /* Dépôt manuel : pas de facture ni de client, juste une entrée d'argent. */
      reference:       `DEPOT-${Date.now()}`,
      facture_id:      null,
      contrat_id:      null,
      client_id:       null,
      date:            deposit.date,
      montant,
      type_paiement:   'autre',
      methode:         'virement',
      status:          'paye',
      notes:           deposit.notes || 'Dépôt manuel',
      bank_account_id: accountId,
    } as any)
    /* Rafraîchit à la fois la liste de paiements ET les comptes bancaires. */
    qc.invalidateQueries({ queryKey: ['paiements'] })
    qc.invalidateQueries({ queryKey: ['bank_accounts'] })
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
                  <Button size="sm" onClick={() => setShowDepositForm(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Ajouter un dépôt
                  </Button>
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
                      disabled={createPaiement.isPending || !Number(deposit.montant)}
                    >
                      {createPaiement.isPending
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
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={`${m.source}-${m.id}`} className="border-t border-border">
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{formatDate(m.date)}</td>
                          <td className="py-2 px-3 text-foreground truncate max-w-xs">
                            <span className="text-xs text-muted-foreground mr-1.5">
                              {m.source === 'paiement' ? '💰' : '💸'}
                            </span>
                            {m.label}
                          </td>
                          <td className={`py-2 px-3 text-right font-semibold whitespace-nowrap ${
                            m.type === 'entree'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            <span className="inline-flex items-center gap-0.5">
                              {m.type === 'entree'
                                ? <ArrowUpRight className="w-3.5 h-3.5" />
                                : <ArrowDownRight className="w-3.5 h-3.5" />}
                              {m.type === 'entree' ? '+' : '−'}{formatDH(m.montant, devise)}
                            </span>
                          </td>
                        </tr>
                      ))}
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
