import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { useCreatePrevision, useUpdatePrevision, CATEGORIES_REVENU, type Prevision } from '@/hooks/useFinance'
import { useClients } from '@/hooks/useClients'
import { useProjets } from '@/hooks/useProjets'
import { round2, toISODateLocal, type PrevisionSens, type PrevisionStatut } from '@/lib/finance/compute'
import type { BankAccountWithSolde } from '@/hooks/useBankAccounts'

const CATEGORIES_DEPENSE = [
  { key: 'transport',  label: 'Transport',   emoji: '🚗' },
  { key: 'nourriture', label: 'Nourriture',  emoji: '🍽️' },
  { key: 'maison',     label: 'Maison',      emoji: '🏠' },
  { key: 'aumone',     label: 'Aumône',      emoji: '🪙' },
  { key: 'projet',     label: 'Projet',      emoji: '🚀' },
  { key: 'autre',      label: 'Autre',       emoji: '🎯' },
]

/* Un revenu prévu peut être « facturé » ; une dépense prévue est
   simplement « prévue » tant qu'elle n'est pas payée. « En retard » se
   déduit de la date, il n'est donc pas proposé à la saisie. */
const STATUTS_SAISISSABLES: Record<PrevisionSens, Array<{ value: PrevisionStatut; label: string }>> = {
  revenu:  [{ value: 'prevu', label: 'Prévu' }, { value: 'facture', label: 'Facturé' }],
  depense: [{ value: 'prevu', label: 'Prévu' }, { value: 'facture', label: 'Engagé / facturé' }],
}

const empty = (sens: PrevisionSens) => ({
  montant: '',
  date_prevue: toISODateLocal(new Date()),
  bank_account_id: '',
  categorie: sens === 'revenu' ? 'prestation' : 'autre',
  source: '',
  client_id: '',
  projet_id: '',
  description: '',
  type: 'business' as 'personnel' | 'business',
  statut: 'prevu' as PrevisionStatut,
})

/**
 * Création / modification d'une prévision (revenu prévu ou dépense
 * prévue). Une prévision n'écrit RIEN sur les soldes : elle n'alimente
 * que le prévisionnel tant qu'elle n'est pas marquée comme réalisée.
 */
export function PrevisionDialog({
  open,
  sens,
  prevision,
  accounts,
  onClose,
}: {
  open: boolean
  sens: PrevisionSens
  prevision?: Prevision | null
  accounts: BankAccountWithSolde[]
  onClose: () => void
}) {
  const create = useCreatePrevision()
  const update = useUpdatePrevision()
  const { data: clients = [] } = useClients()
  const { data: projets = [] } = useProjets()

  const actifs = accounts.filter(a => a.actif !== false)
  const categories = sens === 'revenu' ? CATEGORIES_REVENU : CATEGORIES_DEPENSE
  const [form, setForm] = useState(empty(sens))

  useEffect(() => {
    if (!open) return
    if (prevision) {
      setForm({
        montant:         String(prevision.montant ?? ''),
        date_prevue:     prevision.date_prevue?.slice(0, 10) ?? toISODateLocal(new Date()),
        bank_account_id: prevision.bank_account_id ?? '',
        categorie:       prevision.categorie ?? (sens === 'revenu' ? 'prestation' : 'autre'),
        source:          prevision.source ?? '',
        client_id:       prevision.client_id ?? '',
        projet_id:       prevision.projet_id ?? '',
        description:     prevision.description ?? '',
        type:            prevision.type ?? 'business',
        statut:          (['prevu', 'facture'].includes(prevision.statut) ? prevision.statut : 'prevu') as PrevisionStatut,
      })
    } else {
      setForm({ ...empty(sens), bank_account_id: actifs[0]?.id ?? '' })
    }
  }, [open, prevision?.id, sens])

  const value = Number(String(form.montant).replace(',', '.'))
  const montantValide = Number.isFinite(value) && value > 0
  const pending = create.isPending || update.isPending
  const bloque = !montantValide || pending

  const submit = async () => {
    if (bloque) return
    const payload = {
      sens,
      montant:         round2(value),
      date_prevue:     form.date_prevue,
      bank_account_id: form.bank_account_id || null,
      categorie:       form.categorie || null,
      source:          form.source.trim() || null,
      client_id:       form.client_id || null,
      projet_id:       form.projet_id || null,
      description:     form.description.trim() || null,
      type:            form.type,
      statut:          form.statut,
    }
    if (prevision) await update.mutateAsync({ id: prevision.id, data: payload as any })
    else await create.mutateAsync(payload as any)
    onClose()
  }

  const titre = prevision
    ? (sens === 'revenu' ? 'Modifier le revenu prévu' : 'Modifier la dépense prévue')
    : (sens === 'revenu' ? '➕ Nouveau revenu prévu' : '➕ Nouvelle dépense prévue')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">💰 Montant (DH) *</label>
              <Input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={form.montant}
                onChange={e => setForm(p => ({ ...p, montant: e.target.value }))}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">📅 Date prévue</label>
              <Input
                type="date"
                value={form.date_prevue}
                onChange={e => setForm(p => ({ ...p, date_prevue: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">
              {sens === 'revenu' ? '🏦 Compte de destination prévu' : '🏦 Compte à débiter'}
            </label>
            <Select
              value={form.bank_account_id}
              onValueChange={v => setForm(p => ({ ...p, bank_account_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Choisir un compte" /></SelectTrigger>
              <SelectContent>
                {actifs.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.icon || '🏦'} {a.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">🏷️ Catégorie</label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, categorie: c.key }))}
                  className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-xs font-medium transition-all ${
                    form.categorie === c.key
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-background text-foreground border-border hover:border-blue-400'
                  }`}
                >
                  <span className="text-base leading-none">{c.emoji}</span>
                  <span className="truncate max-w-full">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">
                {sens === 'revenu' ? '👤 Client / Source' : '👤 Bénéficiaire / Source'}
              </label>
              <Input
                list="finance-sources"
                value={form.source}
                onChange={e => setForm(p => ({ ...p, source: e.target.value }))}
                placeholder={sens === 'revenu' ? 'Ex: Client X, Marketplace…' : 'Ex: Fournisseur, Loyer…'}
              />
              <datalist id="finance-sources">
                {clients.map(c => <option key={c.id} value={c.nom} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">🚀 Projet (facultatif)</label>
              <Select
                value={form.projet_id || '__none__'}
                onValueChange={v => setForm(p => ({ ...p, projet_id: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {projets.map(pr => (
                    <SelectItem key={pr.id} value={pr.id}>{pr.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">📌 Statut</label>
              <Select
                value={form.statut}
                onValueChange={v => setForm(p => ({ ...p, statut: v as PrevisionStatut }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUTS_SAISISSABLES[sens].map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">👤 Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'personnel', label: '👤 Perso' },
                  { value: 'business',  label: '💼 Business' },
                ].map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, type: t.value as 'personnel' | 'business' }))}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all ${
                      form.type === t.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-background text-foreground border-border hover:border-blue-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">📝 Description (optionnel)</label>
            <AutocorrectTextarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Détails…"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            Une prévision ne modifie aucun solde réel. Elle ne sera comptabilisée
            qu'au moment où vous la marquerez comme {sens === 'revenu' ? 'reçue' : 'payée'}.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button onClick={submit} disabled={bloque}>
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : (prevision ? 'Enregistrer' : 'Ajouter')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
