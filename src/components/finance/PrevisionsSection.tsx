import { useMemo, useState } from 'react'
import {
  Plus, Pencil, Trash2, CheckCircle2, Ban, RotateCcw, CalendarClock, CalendarX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useDeletePrevision, useCancelPrevision, useReopenPrevision, type Prevision,
} from '@/hooks/useFinance'
import {
  formatDH, effectiveStatut, isPrevisionActive, totalPrevisions,
  type PrevisionSens, type PrevisionStatut,
} from '@/lib/finance/compute'
import { formatDate } from '@/lib/utils'
import type { BankAccountWithSolde } from '@/hooks/useBankAccounts'
import { PrevisionDialog } from './PrevisionDialog'
import { SettlePrevisionDialog } from './SettlePrevisionDialog'

const STATUT_BADGE: Record<PrevisionStatut, { label: string; cls: string }> = {
  prevu:     { label: 'Prévu',     cls: 'badge-neutral' },
  facture:   { label: 'Facturé',   cls: 'badge-info' },
  en_retard: { label: 'En retard', cls: 'badge-warning' },
  recu:      { label: 'Reçu',      cls: 'badge-success' },
  paye:      { label: 'Payé',      cls: 'badge-success' },
  annule:    { label: 'Annulé',    cls: 'badge-danger' },
}

/**
 * Revenus prévus & dépenses prévues.
 *
 * Chaque prévision est un élément indépendant : le total actif se
 * recalcule tout seul (10 000 + 801 + 172 = 10 973 DH). Rien ici ne
 * touche à un solde réel — c'est « Marquer comme reçu/payé » qui
 * transforme une prévision en mouvement d'argent.
 */
export function PrevisionsSection({
  previsions,
  accounts,
}: {
  previsions: Prevision[]
  accounts: BankAccountWithSolde[]
}) {
  const [dialog, setDialog] = useState<{ sens: PrevisionSens; prevision?: Prevision | null } | null>(null)
  const [settling, setSettling] = useState<Prevision | null>(null)

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PrevisionPanel
          sens="revenu"
          previsions={previsions}
          accounts={accounts}
          onAdd={() => setDialog({ sens: 'revenu' })}
          onEdit={p => setDialog({ sens: 'revenu', prevision: p })}
          onSettle={setSettling}
        />
        <PrevisionPanel
          sens="depense"
          previsions={previsions}
          accounts={accounts}
          onAdd={() => setDialog({ sens: 'depense' })}
          onEdit={p => setDialog({ sens: 'depense', prevision: p })}
          onSettle={setSettling}
        />
      </div>

      <PrevisionDialog
        open={!!dialog}
        sens={dialog?.sens ?? 'revenu'}
        prevision={dialog?.prevision ?? null}
        accounts={accounts}
        onClose={() => setDialog(null)}
      />
      <SettlePrevisionDialog
        prevision={settling}
        accounts={accounts}
        onClose={() => setSettling(null)}
      />
    </>
  )
}

function PrevisionPanel({
  sens, previsions, accounts, onAdd, onEdit, onSettle,
}: {
  sens: PrevisionSens
  previsions: Prevision[]
  accounts: BankAccountWithSolde[]
  onAdd: () => void
  onEdit: (p: Prevision) => void
  onSettle: (p: Prevision) => void
}) {
  const del    = useDeletePrevision()
  const cancel = useCancelPrevision()
  const reopen = useReopenPrevision()
  const [showSoldees, setShowSoldees] = useState(false)

  const accountsById = useMemo(() => {
    const m = new Map<string, BankAccountWithSolde>()
    accounts.forEach(a => m.set(a.id, a))
    return m
  }, [accounts])

  const { actives, soldees, total } = useMemo(() => {
    const mine = previsions.filter(p => p.sens === sens)
    const byDate = (a: Prevision, b: Prevision) => (a.date_prevue < b.date_prevue ? -1 : 1)
    return {
      actives: mine.filter(isPrevisionActive).sort(byDate),
      soldees: mine.filter(p => !isPrevisionActive(p)).sort((a, b) => (a.date_prevue < b.date_prevue ? 1 : -1)),
      total:   totalPrevisions(mine, sens),
    }
  }, [previsions, sens])

  const isRevenu = sens === 'revenu'
  const Icon = isRevenu ? CalendarClock : CalendarX
  const accent = isRevenu
    ? 'text-violet-600 dark:text-violet-400'
    : 'text-amber-600 dark:text-amber-400'
  const accentBg = isRevenu ? 'bg-violet-500/15' : 'bg-amber-500/15'

  const items = showSoldees ? [...actives, ...soldees] : actives

  return (
    <div className="card-premium p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-9 h-9 rounded-lg ${accentBg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${accent}`} />
          </div>
          <div className="min-w-0">
            <h2 className="section-title truncate">
              {isRevenu ? 'Revenus prévus' : 'Dépenses prévues'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Total actif : <span className={`font-semibold ${accent}`}>{formatDH(total)}</span>
              {actives.length > 0 && ` — ${actives.length} ligne(s)`}
            </p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={onAdd} className="flex-shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-border rounded-xl">
          <p className="text-sm text-muted-foreground">
            {isRevenu
              ? 'Aucun revenu prévu. Ajoutez ce que vous attendez pour voir votre solde prévisionnel.'
              : 'Aucune dépense prévue. Ajoutez vos échéances à venir (loyer, abonnements, factures…).'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-0.5">
          {items.map(p => {
            const statut = effectiveStatut(p)
            const badge = STATUT_BADGE[statut] ?? STATUT_BADGE.prevu
            const acc = p.bank_account_id ? accountsById.get(p.bank_account_id) : null
            const active = isPrevisionActive(p)
            return (
              <div
                key={p.id}
                className={`group rounded-xl border p-3 transition-colors ${
                  active
                    ? 'border-border bg-background hover:border-blue-400'
                    : 'border-border bg-muted/40 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-base font-bold tabular-nums ${active ? accent : 'text-muted-foreground line-through'}`}>
                      {formatDH(Number(p.montant))}
                    </p>
                    <p className="text-sm text-foreground truncate">
                      {p.source || p.description || (isRevenu ? 'Revenu prévu' : 'Dépense prévue')}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>📅 {formatDate(p.date_prevue)}</span>
                      {acc && <span>{acc.icon || '🏦'} {acc.nom}</span>}
                      {p.montant_realise != null && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Réalisé : {formatDH(Number(p.montant_realise))}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={`badge-pill ${badge.cls} flex-shrink-0`}>{badge.label}</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  {active && (
                    <Button
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => onSettle(p)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      {isRevenu ? 'Marquer comme reçu' : 'Marquer comme payé'}
                    </Button>
                  )}
                  {active && (
                    <>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => onEdit(p)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Modifier
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={cancel.isPending}
                        onClick={() => {
                          if (confirm(`Annuler cette ${isRevenu ? 'prévision de revenu' : 'dépense prévue'} ? Elle restera dans l'historique mais ne comptera plus dans le prévisionnel.`)) {
                            cancel.mutate(p.id)
                          }
                        }}
                      >
                        <Ban className="w-3.5 h-3.5 mr-1" /> Annuler
                      </Button>
                    </>
                  )}
                  {p.statut === 'annule' && (
                    <Button
                      variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                      disabled={reopen.isPending}
                      onClick={() => reopen.mutate(p.id)}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Rouvrir
                    </Button>
                  )}
                  {(p.statut === 'recu' || p.statut === 'paye') && (
                    <span className="text-[11px] text-muted-foreground">
                      Réalisée le {formatDate(p.date_realisation ?? p.date_prevue)} — supprimez la
                      transaction liée dans l'historique pour la rouvrir.
                    </span>
                  )}
                  {p.statut !== 'recu' && p.statut !== 'paye' && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 ml-auto text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={del.isPending}
                      onClick={() => {
                        if (confirm('Supprimer définitivement cette prévision ?')) del.mutate(p.id)
                      }}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {soldees.length > 0 && (
        <button
          onClick={() => setShowSoldees(s => !s)}
          className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showSoldees
            ? 'Masquer les prévisions soldées'
            : `Afficher les ${soldees.length} prévision(s) soldée(s) / annulée(s)`}
        </button>
      )}
    </div>
  )
}
