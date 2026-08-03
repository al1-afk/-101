import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSettlePrevision, type Prevision } from '@/hooks/useFinance'
import { formatDH, round2, toISODateLocal } from '@/lib/finance/compute'
import type { BankAccountWithSolde } from '@/hooks/useBankAccounts'

/**
 * « Marquer comme reçu / payé ».
 *
 * Le serveur (POST /api/finance/previsions/:id/settle) fait tout dans UNE
 * transaction : création du revenu (ou de la dépense), mise à jour du
 * solde du compte via ce mouvement, passage de la prévision en
 * « reçu »/« payé » et conservation du lien entre les deux. La prévision
 * n'est jamais supprimée, et un second clic est rejeté par le verrou de
 * ligne — pas de double encaissement.
 */
export function SettlePrevisionDialog({
  prevision,
  accounts,
  onClose,
}: {
  prevision: Prevision | null
  accounts: BankAccountWithSolde[]
  onClose: () => void
}) {
  const settle = useSettlePrevision()
  const actifs = accounts.filter(a => a.actif !== false)
  const isRevenu = prevision?.sens === 'revenu'

  const [montant, setMontant] = useState('')
  const [date, setDate] = useState(toISODateLocal(new Date()))
  const [accountId, setAccountId] = useState('')

  useEffect(() => {
    if (!prevision) return
    setMontant(String(prevision.montant ?? ''))
    setDate(toISODateLocal(new Date()))
    setAccountId(prevision.bank_account_id ?? actifs[0]?.id ?? '')
  }, [prevision?.id])

  const value = Number(String(montant).replace(',', '.'))
  const montantValide = Number.isFinite(value) && value > 0
  const bloque = !prevision || !montantValide || !accountId || settle.isPending

  const ecart = prevision && montantValide ? round2(value - Number(prevision.montant)) : 0

  const submit = async () => {
    if (bloque || !prevision) return
    await settle.mutateAsync({
      id:               prevision.id,
      montant:          round2(value),
      date_realisation: date,
      bank_account_id:  accountId,
    })
    onClose()
  }

  return (
    <Dialog open={!!prevision} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            {isRevenu ? 'Marquer comme reçu' : 'Marquer comme payé'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              {isRevenu ? 'Revenu prévu' : 'Dépense prévue'}
              {prevision?.source ? ` — ${prevision.source}` : ''}
            </p>
            <p className="text-xl font-bold text-foreground">
              {formatDH(Number(prevision?.montant ?? 0))}
            </p>
            {prevision?.description && (
              <p className="text-xs text-muted-foreground mt-1">{prevision.description}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="form-label">
              💰 Montant réellement {isRevenu ? 'reçu' : 'payé'} (DH) *
            </label>
            <Input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={montant}
              onChange={e => setMontant(e.target.value)}
              autoFocus
            />
            {montantValide && ecart !== 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Écart avec la prévision : {ecart > 0 ? '+' : '−'}{formatDH(Math.abs(ecart))}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">📅 Date de {isRevenu ? 'réception' : 'paiement'}</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">🏦 Compte {isRevenu ? 'crédité' : 'débité'} *</label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Choisir un compte" /></SelectTrigger>
                <SelectContent>
                  {actifs.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.icon || '🏦'} {a.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            La prévision est conservée et reliée à la transaction créée : vous
            gardez la trace de ce qui était prévu et de ce qui a réellement été
            {isRevenu ? ' encaissé.' : ' payé.'}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button onClick={submit} disabled={bloque}>
              {settle.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : (isRevenu ? 'Confirmer l\'encaissement' : 'Confirmer le paiement')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
