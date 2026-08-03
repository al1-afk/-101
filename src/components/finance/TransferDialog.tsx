import { useEffect, useState } from 'react'
import { ArrowRight, Loader2, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateTransfert } from '@/hooks/useFinance'
import { formatDH, round2, toISODateLocal } from '@/lib/finance/compute'
import type { BankAccountWithSolde } from '@/hooks/useBankAccounts'

/**
 * Virement interne entre deux de mes comptes.
 *
 * Ce n'est ni un revenu ni une dépense : le patrimoine total ne bouge
 * pas. Une seule ligne en base porte le débit ET le crédit — il ne peut
 * donc jamais y avoir un compte débité sans que l'autre soit crédité.
 */
export function TransferDialog({
  open,
  onClose,
  accounts,
  defaultSourceId,
}: {
  open: boolean
  onClose: () => void
  accounts: BankAccountWithSolde[]
  defaultSourceId?: string | null
}) {
  const createTransfert = useCreateTransfert()
  const actifs = accounts.filter(a => a.actif !== false)

  const [source, setSource] = useState('')
  const [dest, setDest] = useState('')
  const [montant, setMontant] = useState('')
  const [date, setDate] = useState(toISODateLocal(new Date()))
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    const src = defaultSourceId || actifs[0]?.id || ''
    setSource(src)
    setDest(actifs.find(a => a.id !== src)?.id ?? '')
    setMontant('')
    setDate(toISODateLocal(new Date()))
    setNote('')
  }, [open, defaultSourceId])

  const srcAccount  = actifs.find(a => a.id === source)
  const destAccount = actifs.find(a => a.id === dest)
  const value = Number(String(montant).replace(',', '.'))
  const montantValide = Number.isFinite(value) && value > 0

  const memeCompte = !!source && source === dest
  const soldeInsuffisant = !!srcAccount && montantValide && value > srcAccount.solde

  const bloque = !source || !dest || memeCompte || !montantValide || createTransfert.isPending

  const submit = async () => {
    if (bloque) return
    await createTransfert.mutateAsync({
      compte_source_id:      source,
      compte_destination_id: dest,
      montant:               round2(value),
      date_transfert:        date,
      note:                  note.trim() || null,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🔄 Transférer entre comptes</DialogTitle>
        </DialogHeader>

        {actifs.length < 2 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Il faut au moins deux comptes actifs pour effectuer un transfert.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="form-label">💰 Montant (DH) *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={montant}
                onChange={e => setMontant(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 sm:items-end">
              <div className="space-y-1.5">
                <label className="form-label">Depuis</label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue placeholder="Compte source" /></SelectTrigger>
                  <SelectContent>
                    {actifs.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.icon || '🏦'} {a.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden sm:flex items-center justify-center pb-2.5">
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Vers</label>
                <Select value={dest} onValueChange={setDest}>
                  <SelectTrigger><SelectValue placeholder="Compte destination" /></SelectTrigger>
                  <SelectContent>
                    {actifs.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.icon || '🏦'} {a.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {srcAccount && (
              <p className="text-xs text-muted-foreground">
                Solde de {srcAccount.nom} : <span className="font-medium text-foreground">
                  {formatDH(srcAccount.solde, srcAccount.devise)}
                </span>
                {montantValide && (
                  <> → <span className="font-medium text-foreground">
                    {formatDH(round2(srcAccount.solde - value), srcAccount.devise)}
                  </span></>
                )}
                {destAccount && montantValide && (
                  <> · {destAccount.nom} : <span className="font-medium text-foreground">
                    {formatDH(round2(destAccount.solde + value), destAccount.devise)}
                  </span></>
                )}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Note (optionnel)</label>
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: alimentation caisse" />
              </div>
            </div>

            {memeCompte && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Le compte source et le compte de destination doivent être différents.
              </p>
            )}
            {soldeInsuffisant && (
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Le solde de {srcAccount?.nom} deviendra négatif. Le transfert reste possible.
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Un transfert n'est ni un revenu ni une dépense : votre patrimoine total reste identique.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
              <Button onClick={submit} disabled={bloque}>
                {createTransfert.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : 'Confirmer le transfert'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
