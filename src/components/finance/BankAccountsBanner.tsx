import { useState } from 'react'
import { Plus, Wallet, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useBankAccountsWithSolde,
  useCreateBankAccount,
  useDeleteBankAccount,
  type BankAccountWithSolde,
} from '@/hooks/useBankAccounts'
import { AccountDetailDialog } from './AccountDetailDialog'

const TYPE_PRESETS = [
  { value: 'banque', label: 'Banque',   icon: '🏦', couleur: '#3b82f6' },
  { value: 'wallet', label: 'Wallet',   icon: '💳', couleur: '#8b5cf6' },
  { value: 'cash',   label: 'Espèces',  icon: '💵', couleur: '#10b981' },
  { value: 'autre',  label: 'Autre',    icon: '🎯', couleur: '#f97316' },
] as const

const SUGGESTED_ICONS = ['🏦','💳','💵','💰','🪙','🏛️','📱','🌐']

function formatDH(n: number, devise = 'MAD') {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${devise === 'MAD' ? 'DH' : devise}`
}

export function BankAccountsBanner() {
  const { data: accounts, isLoading, totalSolde } = useBankAccountsWithSolde()
  const createAccount = useCreateBankAccount()
  const deleteAccount = useDeleteBankAccount()
  const [showForm, setShowForm] = useState(false)
  const [openAccountId, setOpenAccountId] = useState<string | null>(null)
  const [form, setForm] = useState({
    nom: '',
    type: 'banque' as 'banque' | 'wallet' | 'cash' | 'autre',
    icon: '🏦',
    couleur: '#3b82f6',
    devise: 'MAD',
    solde_initial: '' as string | number,
    iban: '',
  })

  const resetForm = () => setForm({
    nom: '', type: 'banque', icon: '🏦', couleur: '#3b82f6',
    devise: 'MAD', solde_initial: '', iban: '',
  })

  const handleSubmit = async () => {
    if (!form.nom.trim()) return
    await createAccount.mutateAsync({
      nom:           form.nom.trim(),
      type:          form.type,
      icon:          form.icon,
      couleur:       form.couleur,
      devise:        form.devise,
      solde_initial: Number(form.solde_initial) || 0,
      iban:          form.iban.trim() || null,
      actif:         true,
    })
    resetForm()
    setShowForm(false)
  }

  const pickPreset = (t: typeof TYPE_PRESETS[number]['value']) => {
    const preset = TYPE_PRESETS.find(p => p.value === t)!
    setForm(p => ({ ...p, type: t, icon: preset.icon, couleur: preset.couleur }))
  }

  return (
    <div className="card-premium p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="section-title">Mes comptes</h2>
            <p className="text-xs text-muted-foreground">
              Total : <span className="font-semibold text-foreground">{formatDH(totalSolde)}</span>
              {accounts.length > 0 && ` — ${accounts.length} compte(s)`}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nouveau compte
        </Button>
      </div>

      {isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-border rounded-xl">
          <p className="text-sm text-muted-foreground">
            Aucun compte pour l'instant. Ajoute ton premier compte pour suivre tes soldes en temps réel.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Ex : CIH Perso, CIH Entreprise, Payoneer, PayPal, Barid Bank, Espèces…
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              onClick={() => setOpenAccountId(a.id)}
              onDelete={() => {
                if (confirm(`Supprimer le compte "${a.nom}" ? Les dépenses/paiements liés seront conservés mais dissociés.`)) {
                  deleteAccount.mutate(a.id)
                }
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau compte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="form-label">Type</label>
              <div className="grid grid-cols-4 gap-2">
                {TYPE_PRESETS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => pickPreset(p.value)}
                    className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-xs font-medium transition-all ${
                      form.type === p.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-background text-foreground border-border hover:border-blue-400'
                    }`}
                  >
                    <span className="text-lg leading-none">{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Nom du compte *</label>
              <Input
                value={form.nom}
                onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                placeholder="Ex: CIH Perso, Payoneer, Cash…"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Solde initial</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.solde_initial}
                  onChange={e => setForm(p => ({ ...p, solde_initial: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Devise</label>
                <Select value={form.devise} onValueChange={v => setForm(p => ({ ...p, devise: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MAD">MAD (Dirham)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                    <SelectItem value="USD">USD (Dollar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Icône</label>
              <div className="flex gap-1.5 flex-wrap">
                {SUGGESTED_ICONS.map(ic => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, icon: ic }))}
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center text-lg transition-all ${
                      form.icon === ic
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-border hover:border-blue-400'
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">IBAN / N° de compte (optionnel)</label>
              <Input
                value={form.iban}
                onChange={e => setForm(p => ({ ...p, iban: e.target.value }))}
                placeholder="MA64…"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button
                onClick={handleSubmit}
                disabled={createAccount.isPending || !form.nom.trim()}
              >
                {createAccount.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer le compte'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AccountDetailDialog
        accountId={openAccountId}
        onClose={() => setOpenAccountId(null)}
      />
    </div>
  )
}

function AccountCard({
  account,
  onDelete,
  onClick,
}: {
  account: BankAccountWithSolde
  onDelete: () => void
  onClick: () => void
}) {
  const bg = account.couleur ?? '#3b82f6'
  return (
    <div
      onClick={onClick}
      className="relative rounded-xl p-3 border border-border bg-gradient-to-br from-background to-muted/40 hover:shadow-md hover:border-blue-400 transition-all group cursor-pointer"
      style={{ borderLeft: `4px solid ${bg}` }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
        aria-label="Supprimer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl leading-none">{account.icon || '🏦'}</span>
        <span className="text-xs font-medium text-foreground truncate">{account.nom}</span>
      </div>
      <p className="text-lg font-bold text-foreground">
        {formatDH(account.solde, account.devise)}
      </p>
      {(account.total_entrees > 0 || account.total_sorties > 0) && (
        <p className="text-[10px] text-muted-foreground mt-1 truncate">
          {account.total_entrees > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">
              +{formatDH(account.total_entrees, account.devise)}
            </span>
          )}
          {account.total_entrees > 0 && account.total_sorties > 0 && ' · '}
          {account.total_sorties > 0 && (
            <span className="text-red-500">
              −{formatDH(account.total_sorties, account.devise)}
            </span>
          )}
        </p>
      )}
      <p className="text-[10px] text-blue-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        Voir l'historique →
      </p>
    </div>
  )
}
