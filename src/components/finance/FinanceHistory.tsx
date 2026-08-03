import { useMemo, useState } from 'react'
import { Trash2, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  buildMovements, buildPrevisionEntries, formatDH,
  type FinanceData, type MovementType,
} from '@/lib/finance/compute'
import { formatDate } from '@/lib/utils'
import { useDeleteRevenu, useDeleteTransfert } from '@/hooks/useFinance'
import { useDeleteDepense } from '@/hooks/useDepenses'
import type { BankAccountWithSolde } from '@/hooks/useBankAccounts'

const TYPE_META: Record<MovementType | 'revenu_prevu' | 'depense_prevue', { label: string; emoji: string; cls: string }> = {
  revenu:            { label: 'Revenu',        emoji: '💰', cls: 'badge-success' },
  paiement:          { label: 'Revenu',        emoji: '💳', cls: 'badge-success' },
  depense:           { label: 'Dépense',       emoji: '💸', cls: 'badge-danger' },
  transfert_entrant: { label: 'Transfert',     emoji: '🔄', cls: 'badge-info' },
  transfert_sortant: { label: 'Transfert',     emoji: '🔄', cls: 'badge-info' },
  ajustement:        { label: 'Ajustement',    emoji: '⚖️', cls: 'badge-warning' },
  revenu_prevu:      { label: 'Revenu prévu',  emoji: '📈', cls: 'badge-neutral' },
  depense_prevue:    { label: 'Dépense prévue', emoji: '📉', cls: 'badge-neutral' },
}

const FILTRES = [
  { value: 'tous',        label: 'Tous les mouvements' },
  { value: 'revenu',      label: 'Revenus' },
  { value: 'depense',     label: 'Dépenses' },
  { value: 'transfert',   label: 'Transferts' },
  { value: 'ajustement',  label: 'Ajustements' },
  { value: 'prevision',   label: 'Prévisions' },
]

const PAGE = 40

/**
 * Historique financier unifié — la réponse à « pourquoi ce solde a-t-il
 * changé ? ».
 *
 * La colonne Solde est le solde du compte APRÈS le mouvement, reconstitué
 * en déroulant les mouvements depuis le solde initial. Les lignes
 * prévisionnelles (affichées à la demande) n'ont volontairement pas de
 * solde : elles ne se sont pas encore produites.
 */
export function FinanceHistory({
  data,
  accounts,
}: {
  data: FinanceData
  accounts: BankAccountWithSolde[]
}) {
  const [accountId, setAccountId] = useState<string>('tous')
  const [filtre, setFiltre] = useState<string>('tous')
  const [limit, setLimit] = useState(PAGE)

  const deleteRevenu    = useDeleteRevenu()
  const deleteDepense   = useDeleteDepense()
  const deleteTransfert = useDeleteTransfert()

  const accountsById = useMemo(() => {
    const m = new Map<string, BankAccountWithSolde>()
    accounts.forEach(a => m.set(a.id, a))
    return m
  }, [accounts])

  const rows = useMemo(() => {
    const scope = accountId === 'tous' ? null : accountId
    const movements = filtre === 'prevision' ? [] : buildMovements(data, scope)
    const filtered = movements.filter(m => {
      if (filtre === 'tous') return true
      if (filtre === 'revenu')     return m.type === 'revenu' || m.type === 'paiement'
      if (filtre === 'depense')    return m.type === 'depense'
      if (filtre === 'transfert')  return m.type === 'transfert_entrant' || m.type === 'transfert_sortant'
      if (filtre === 'ajustement') return m.type === 'ajustement'
      return true
    })

    if (filtre !== 'tous' && filtre !== 'prevision') return filtered.map(m => ({ kind: 'reel' as const, m }))

    const previsions = (filtre === 'tous' || filtre === 'prevision')
      ? buildPrevisionEntries(data.previsions, scope)
      : []

    /* Les prévisions se glissent dans le fil chronologique, mais restent
       visuellement distinctes (statut + solde « — »). */
    const merged = [
      ...filtered.map(m => ({ kind: 'reel' as const, m })),
      ...previsions.map(p => ({ kind: 'prevision' as const, p })),
    ].sort((a, b) => {
      const da = a.kind === 'reel' ? a.m.date : a.p.date
      const db = b.kind === 'reel' ? b.m.date : b.p.date
      return da < db ? 1 : da > db ? -1 : 0
    })
    return merged
  }, [data, accountId, filtre])

  const visible = rows.slice(0, limit)

  return (
    <div className="card-premium overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-slate-500/15 flex items-center justify-center">
            <History className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <h2 className="section-title">Historique financier</h2>
            <p className="text-xs text-muted-foreground">{rows.length} mouvement(s)</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={accountId} onValueChange={v => { setAccountId(v); setLimit(PAGE) }}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous les comptes</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.icon || '🏦'} {a.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtre} onValueChange={v => { setFiltre(v); setLimit(PAGE) }}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTRES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="table-scroll">
        <table className="w-full">
          <thead className="table-header">
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Compte</th>
              <th className="text-right">Entrée</th>
              <th className="text-right">Sortie</th>
              <th className="text-right">Solde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  Aucun mouvement sur cette sélection.
                </td>
              </tr>
            ) : visible.map(row => {
              if (row.kind === 'prevision') {
                const meta = TYPE_META[row.p.type]
                const acc = row.p.account_id ? accountsById.get(row.p.account_id) : null
                return (
                  <tr key={row.p.key} className="table-row group opacity-70">
                    <td className="text-muted-foreground whitespace-nowrap">{formatDate(row.p.date)}</td>
                    <td><span className={`badge-pill ${meta.cls}`}>{meta.emoji} {meta.label}</span></td>
                    <td className="text-foreground italic">{row.p.label}</td>
                    <td className="text-muted-foreground text-xs">{acc ? `${acc.icon || '🏦'} ${acc.nom}` : '—'}</td>
                    <td className="text-right text-muted-foreground italic tabular-nums">
                      {row.p.type === 'revenu_prevu' ? formatDH(row.p.montant) : '—'}
                    </td>
                    <td className="text-right text-muted-foreground italic tabular-nums">
                      {row.p.type === 'depense_prevue' ? formatDH(row.p.montant) : '—'}
                    </td>
                    <td className="text-right text-muted-foreground">—</td>
                    <td></td>
                  </tr>
                )
              }

              const m = row.m
              const meta = TYPE_META[m.type]
              const acc = m.account_id ? accountsById.get(m.account_id) : null
              const contre = m.contre_partie_id ? accountsById.get(m.contre_partie_id) : null
              const supprimable = m.type === 'revenu' || m.type === 'depense'
                || m.type === 'transfert_entrant' || m.type === 'transfert_sortant'

              return (
                <tr key={m.key} className="table-row group">
                  <td className="text-muted-foreground whitespace-nowrap">{formatDate(m.date)}</td>
                  <td><span className={`badge-pill ${meta.cls}`}>{meta.emoji} {meta.label}</span></td>
                  <td className="text-foreground">
                    {m.label}
                    {contre && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({m.type === 'transfert_entrant' ? 'depuis' : 'vers'} {contre.nom})
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground text-xs whitespace-nowrap">
                    {acc ? `${acc.icon || '🏦'} ${acc.nom}` : '—'}
                  </td>
                  <td className="text-right font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                    {m.entree > 0 ? formatDH(m.entree) : '—'}
                  </td>
                  <td className="text-right font-semibold text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">
                    {m.sortie > 0 ? formatDH(m.sortie) : '—'}
                  </td>
                  <td className="text-right font-medium text-foreground tabular-nums whitespace-nowrap">
                    {m.solde === null ? '—' : formatDH(m.solde)}
                  </td>
                  <td>
                    {supprimable && (
                      <Button
                        variant="ghost" size="icon"
                        className="w-7 h-7 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Supprimer le mouvement"
                        onClick={() => {
                          if (m.type === 'revenu') {
                            if (confirm('Supprimer ce revenu ? Le solde du compte sera recalculé.')) {
                              deleteRevenu.mutate(m.id)
                            }
                          } else if (m.type === 'depense') {
                            if (confirm('Supprimer cette dépense ? Le solde du compte sera recalculé.')) {
                              deleteDepense.mutate(m.id)
                            }
                          } else if (confirm('Annuler ce transfert ? Les deux comptes seront recalculés.')) {
                            deleteTransfert.mutate(m.id)
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.length > visible.length && (
        <div className="p-3 border-t border-border text-center">
          <Button variant="secondary" size="sm" onClick={() => setLimit(l => l + PAGE)}>
            Afficher {Math.min(PAGE, rows.length - visible.length)} mouvement(s) de plus
          </Button>
        </div>
      )}
    </div>
  )
}
