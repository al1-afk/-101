import { useEffect, useMemo, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateAjustement, MOTIFS_AJUSTEMENT } from '@/hooks/useFinance'
import { formatDH, round2, toISODateLocal } from '@/lib/finance/compute'
import type { BankAccountWithSolde } from '@/hooks/useBankAccounts'

/* Au-delà de ce seuil, l'écart est trop gros pour être un simple oubli :
   on demande une confirmation explicite avant d'écrire. */
const SEUIL_ABSOLU  = 1000   // DH
const SEUIL_RELATIF = 0.20   // 20 % du solde actuel

/**
 * Ajustement manuel — synchronise le solde de l'app avec l'argent
 * réellement disponible.
 *
 * Ce n'est NI un revenu NI une dépense : seul l'écart est enregistré,
 * dans un journal en ajout seul (`bank_account_adjustments`). L'ancien
 * solde affiché ici est indicatif — c'est le serveur qui relit le solde
 * réel au moment de l'écriture, pour que deux onglets ouverts ne
 * puissent pas produire un écart faux.
 */
export function AdjustBalanceDialog({
  account,
  onClose,
}: {
  account: BankAccountWithSolde | null
  onClose: () => void
}) {
  const createAjustement = useCreateAjustement()
  const [nouveauSolde, setNouveauSolde] = useState('')
  const [motif, setMotif] = useState<string>('correction')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(toISODateLocal(new Date()))
  const [confirmed, setConfirmed] = useState(false)

  const devise = account?.devise ?? 'MAD'
  const ancienSolde = account?.solde ?? 0

  useEffect(() => {
    if (account) {
      setNouveauSolde('')
      setMotif('correction')
      setNote('')
      setDate(toISODateLocal(new Date()))
      setConfirmed(false)
    }
  }, [account?.id])

  const parsed = nouveauSolde.trim() === '' ? null : Number(nouveauSolde.replace(',', '.'))
  const valide = parsed !== null && Number.isFinite(parsed)
  const difference = valide ? round2(parsed - ancienSolde) : 0

  const ajustementImportant = useMemo(() => {
    if (!valide || difference === 0) return false
    const seuilRelatif = Math.abs(ancienSolde) * SEUIL_RELATIF
    return Math.abs(difference) >= Math.max(SEUIL_ABSOLU, seuilRelatif)
  }, [valide, difference, ancienSolde])

  const bloque = !account || !valide || difference === 0
    || (ajustementImportant && !confirmed) || createAjustement.isPending

  const submit = async () => {
    if (bloque || !account) return
    await createAjustement.mutateAsync({
      bank_account_id: account.id,
      nouveau_solde:   round2(parsed as number),
      motif,
      note:            note.trim() || null,
      date_ajustement: date,
    })
    onClose()
  }

  return (
    <Dialog open={!!account} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{account?.icon || '🏦'}</span>
            Ajuster le solde — {account?.nom}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Solde actuel</p>
            <p className="text-2xl font-bold text-foreground">{formatDH(ancienSolde, devise)}</p>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Nouveau solde ({devise === 'MAD' ? 'DH' : devise}) *</label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={nouveauSolde}
              onChange={e => { setNouveauSolde(e.target.value); setConfirmed(false) }}
              placeholder={String(ancienSolde)}
              autoFocus
            />
          </div>

          {/* Différence — calculée, jamais saisie */}
          <div className={`rounded-xl border p-3 ${
            !valide || difference === 0
              ? 'border-border bg-muted/30'
              : difference > 0
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/10'
                : 'border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10'
          }`}>
            <p className="text-xs text-muted-foreground">Différence</p>
            <p className={`text-lg font-bold ${
              !valide || difference === 0
                ? 'text-muted-foreground'
                : difference > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
            }`}>
              {!valide ? '—' : `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${formatDH(Math.abs(difference), devise)}`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Un ajustement n'est ni un revenu ni une dépense : il corrige le solde sans fausser vos statistiques.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Motif</label>
            <Select value={motif} onValueChange={setMotif}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOTIFS_AJUSTEMENT.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Note (optionnel)</label>
              <Input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Ex: retrait non saisi"
              />
            </div>
          </div>

          {ajustementImportant && (
            <label className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/10 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-amber-600"
              />
              <span className="text-xs text-foreground">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-600" />
                Ajustement important ({formatDH(Math.abs(difference), devise)}). Je confirme vouloir
                modifier le solde de ce compte.
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button onClick={submit} disabled={bloque}>
              {createAjustement.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : "Confirmer l'ajustement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
