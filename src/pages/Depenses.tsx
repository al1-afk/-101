import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Trash2, Loader2 } from 'lucide-react'
import { useDepenses, useCreateDepense, useDeleteDepense } from '@/hooks/useDepenses'
import { useBankAccounts } from '@/hooks/useBankAccounts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatDate } from '@/lib/utils'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { depensesSchema } from '@/lib/importExportSchemas'
import { BankAccountsBanner } from '@/components/finance/BankAccountsBanner'

const CATEGORIES = [
  { key: 'transport', label: 'Transport', emoji: '🚗' },
  { key: 'nourriture', label: 'Nourriture', emoji: '🍽️' },
  { key: 'maison', label: 'Maison', emoji: '🏠' },
  { key: 'aumone', label: 'Aumône / Sadaqa', emoji: '🪙' },
  { key: 'projet', label: 'Projet', emoji: '🚀' },
  { key: 'autre', label: 'Autre', emoji: '🎯' },
]

const CAT_COLORS: Record<string, string> = {
  transport: '#ef4444',
  nourriture: '#6366f1',
  maison: '#f97316',
  aumone: '#eab308',
  projet: '#8b5cf6',
  autre: '#06b6d4',
}

function formatDH(n: number) {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`
}

function getWeekBounds() {
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1); mon.setHours(0,0,0,0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999)
  return { mon, sun }
}

function StatCard({ label, emoji, value, color, sub }: { label: string; emoji: string; value: number; color: string; sub?: string }) {
  return (
    <div className="card-premium p-4">
      <p className="text-xs text-muted-foreground mb-1">{emoji} {label}</p>
      <p className={`text-xl font-extrabold ${color}`}>{formatDH(value)}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

export default function Depenses() {
  const { data: depenses = [], isLoading } = useDepenses()
  const { data: bankAccounts = [] } = useBankAccounts()
  const createDepense = useCreateDepense()
  const deleteDepense = useDeleteDepense()

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const [viewMonth, setViewMonth] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)
  const [form, setForm] = useState({
    montant: '' as string | number,
    date_depense: todayStr,
    categorie: 'autre',
    type: 'personnel' as 'personnel' | 'business',
    description: '',
    bank_account_id: '' as string,
  })

  /* Auto-sélectionne le premier compte quand la liste arrive, pour éviter
     que l'utilisateur enregistre une dépense sans compte assigné. */
  const activeAccounts = useMemo(() => bankAccounts.filter(a => a.actif !== false), [bankAccounts])
  useEffect(() => {
    if (activeAccounts.length > 0 && !form.bank_account_id) {
      setForm(p => ({ ...p, bank_account_id: activeAccounts[0].id }))
    }
  }, [activeAccounts, form.bank_account_id])

  const accountsById = useMemo(() => {
    const m = new Map<string, typeof bankAccounts[number]>()
    bankAccounts.forEach(a => m.set(a.id, a))
    return m
  }, [bankAccounts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const montant = Number(form.montant)
    if (!montant || montant <= 0) return
    await createDepense.mutateAsync({
      ...form,
      montant,
      bank_account_id: form.bank_account_id || null,
    } as any)
    setForm(p => ({ ...p, montant: '', description: '' }))
  }

  const stats = useMemo(() => {
    const todayTotal = depenses
      .filter(d => d.date_depense === todayStr)
      .reduce((s, d) => s + d.montant, 0)

    const { mon, sun } = getWeekBounds()
    const weekTotal = depenses.filter(d => {
      const dt = new Date(d.date_depense)
      return dt >= mon && dt <= sun
    }).reduce((s, d) => s + d.montant, 0)

    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    const monthTotal = depenses
      .filter(d => d.date_depense.startsWith(currentMonthStr))
      .reduce((s, d) => s + d.montant, 0)

    const daysElapsed = today.getDate()
    const avgPerDay = daysElapsed > 0 ? monthTotal / daysElapsed : 0

    const byCat = CATEGORIES.map(c => ({
      ...c,
      value: depenses
        .filter(d => d.date_depense.startsWith(currentMonthStr) && d.categorie === c.key)
        .reduce((s, d) => s + d.montant, 0),
    })).filter(x => x.value > 0)

    const topCat = byCat.length > 0 ? byCat.reduce((a, b) => (a.value > b.value ? a : b)) : null

    return { todayTotal, weekTotal, monthTotal, avgPerDay, topCat }
  }, [depenses, todayStr, today])

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const tableDeps = useMemo(
    () => dateRange.preset === 'all'
      ? null
      : depenses.filter(d => dateMatch(d.date_depense)),
    [depenses, dateRange.preset, dateMatch]
  )

  const monthData = useMemo(() => {
    const monthStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}`
    const monthDeps = depenses.filter(d => d.date_depense.startsWith(monthStr))
    const total = monthDeps.reduce((s, d) => s + d.montant, 0)

    const byCat = CATEGORIES.map(c => ({
      name: c.label,
      key: c.key,
      emoji: c.emoji,
      value: monthDeps.filter(d => d.categorie === c.key).reduce((s, d) => s + d.montant, 0),
    })).filter(x => x.value > 0)

    const personnel = monthDeps.filter(d => d.type === 'personnel').reduce((s, d) => s + d.montant, 0)
    const business = monthDeps.filter(d => d.type === 'business').reduce((s, d) => s + d.montant, 0)
    const typeData = [
      { name: 'Personnel', value: personnel },
      { name: 'Business', value: business },
    ].filter(x => x.value > 0)

    return { total, byCat, typeData, monthDeps }
  }, [depenses, viewMonth])

  const monthLabel = new Date(viewMonth.year, viewMonth.month, 1)
    .toLocaleString('fr-FR', { month: 'long', year: 'numeric' })

  const prevMonth = () =>
    setViewMonth(p => ({
      year: p.month === 0 ? p.year - 1 : p.year,
      month: p.month === 0 ? 11 : p.month - 1,
    }))
  const nextMonth = () =>
    setViewMonth(p => ({
      year: p.month === 11 ? p.year + 1 : p.year,
      month: p.month === 11 ? 0 : p.month + 1,
    }))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="card-premium p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0 text-2xl">
          💰
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground">Suivi des dépenses</h1>
          <p className="text-sm text-muted-foreground">
            Suivez, analysez et comprenez vos dépenses personnelles et professionnelles
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ImportExportButtons
            schema={depensesSchema}
            data={depenses}
            onImport={async (row) => { await createDepense.mutateAsync(row as any) }}
          />
        </div>
      </div>

      {/* Comptes bancaires — soldes temps réel */}
      <BankAccountsBanner />

      {/* Form + Stats side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add expense form */}
        <div className="card-premium p-6">
          <h2 className="section-title mb-5">+ Ajouter une dépense</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Amount */}
            <div className="space-y-1.5">
              <label className="form-label">💰 Montant (DH) *</label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.montant}
                  onChange={e => setForm(p => ({ ...p, montant: e.target.value }))}
                  placeholder="0"
                  className="pr-12"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                  DH
                </span>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="form-label">📅 Date</label>
              <Input
                type="date"
                value={form.date_depense}
                onChange={e => setForm(p => ({ ...p, date_depense: e.target.value }))}
              />
            </div>

            {/* Compte source */}
            <div className="space-y-1.5">
              <label className="form-label">🏦 Payé depuis</label>
              {activeAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Aucun compte enregistré — ajoute un compte dans la section "Mes comptes" ci-dessus pour lier la dépense.
                </p>
              ) : (
                <Select
                  value={form.bank_account_id}
                  onValueChange={v => setForm(p => ({ ...p, bank_account_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un compte" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.icon || '🏦'} {a.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="form-label">🏷️ Catégorie</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, categorie: c.key }))}
                    className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-medium transition-all ${
                      form.categorie === c.key
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-background text-foreground border-border hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
                    }`}
                  >
                    <span className="text-lg leading-none">{c.emoji}</span>
                    <span>{c.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="form-label">👤 Type</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: 'personnel', label: '👤 Personnel' },
                  { value: 'business', label: '💼 Business' },
                ].map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, type: t.value as 'personnel' | 'business' }))}
                    className={`py-2.5 px-4 rounded-xl border text-sm font-medium transition-all ${
                      form.type === t.value
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-background text-foreground border-border hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <label className="form-label">📝 Note (optionnel)</label>
              <AutocorrectTextarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Détails de la dépense..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              />
            </div>

            <Button type="submit" className="w-full" disabled={createDepense.isPending}>
              {createDepense.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                '💾'
              )}{' '}
              Enregistrer la dépense
            </Button>
          </form>
        </div>

        {/* Statistics */}
        <div className="space-y-4">
          <div>
            <h2 className="section-title mb-3">📊 Statistiques</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                emoji="📅"
                label="Aujourd'hui"
                value={stats.todayTotal}
                color="text-foreground"
                sub="— vs hier"
              />
              <StatCard
                emoji="📆"
                label="Cette semaine"
                value={stats.weekTotal}
                color="text-blue-600 dark:text-blue-400"
                sub={stats.weekTotal === 0 ? '↘ -100% vs sem. préc.' : undefined}
              />
              <StatCard
                emoji="🗓️"
                label="Ce mois"
                value={stats.monthTotal}
                color="text-purple-600 dark:text-purple-400"
                sub="↗ +100% vs mois préc."
              />
              <StatCard
                emoji="📈"
                label="Moyenne / jour"
                value={stats.avgPerDay}
                color="text-orange-600 dark:text-orange-400"
                sub="↗ +100% vs mois préc."
              />
            </div>
          </div>

          {stats.topCat && (
            <div className="card-premium p-4 bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
              <p className="text-xs text-muted-foreground mb-1">🏆 Catégorie la plus coûteuse ce mois</p>
              <p className="font-semibold text-foreground">
                {stats.topCat.emoji} {stats.topCat.label} — {formatDH(stats.topCat.value)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Visual breakdown */}
      <div className="card-premium p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="section-title">📊 Répartition visuelle</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium capitalize min-w-32 text-center">{monthLabel}</span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Total{' '}
          <span className="capitalize">{monthLabel}</span> :{' '}
          <span className="font-semibold text-foreground">{formatDH(monthData.total)}</span>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* By category */}
          <div>
            <p className="text-sm font-medium text-center mb-2 text-muted-foreground">Par catégorie</p>
            {monthData.byCat.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={monthData.byCat}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {monthData.byCat.map((entry, i) => (
                        <Cell key={i} fill={CAT_COLORS[entry.key] || '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: any) => [`${Number(v).toLocaleString('fr-FR')} DH`]}
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                  {monthData.byCat.map(c => {
                    const pct = monthData.total > 0 ? ((c.value / monthData.total) * 100).toFixed(1) : '0'
                    return (
                      <span key={c.key} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span
                          className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                          style={{ backgroundColor: CAT_COLORS[c.key] || '#64748b' }}
                        />
                        {c.emoji} {c.name} {formatDH(c.value)} ({pct}%)
                      </span>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                Aucune dépense
              </div>
            )}
          </div>

          {/* Personnel vs Business */}
          <div>
            <p className="text-sm font-medium text-center mb-2 text-muted-foreground">Personnel vs Business</p>
            {monthData.typeData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={monthData.typeData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#f97316" />
                    </Pie>
                    <Tooltip
                      formatter={(v: any) => [`${Number(v).toLocaleString('fr-FR')} DH`]}
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex gap-4 justify-center mt-1">
                  {monthData.typeData.map((t, i) => {
                    const pct = monthData.total > 0 ? ((t.value / monthData.total) * 100).toFixed(1) : '0'
                    return (
                      <span key={t.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span
                          className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                          style={{ backgroundColor: i === 0 ? '#3b82f6' : '#f97316' }}
                        />
                        {t.name === 'Personnel' ? '👤' : '💼'} {t.name}: {formatDH(t.value)} ({pct}%)
                      </span>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                Aucune dépense
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Date filter + table */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Expense table */}
      <div className="card-premium overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="section-title capitalize">
            Dépenses{tableDeps === null ? ` — ${monthLabel}` : ''}
          </h2>
          <span className="text-sm text-muted-foreground">
            {(tableDeps ?? monthData.monthDeps).length} entrée(s)
          </span>
        </div>
        <div className="table-scroll">
        <table className="w-full">
          <thead className="table-header">
            <tr>
              <th>Note</th>
              <th>Catégorie</th>
              <th>Compte</th>
              <th>Type</th>
              <th>Date</th>
              <th>Montant</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400 mx-auto" />
                </td>
              </tr>
            ) : (tableDeps ?? monthData.monthDeps).length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  {tableDeps === null ? 'Aucune dépense ce mois' : 'Aucune dépense sur cette période'}
                </td>
              </tr>
            ) : (
              (tableDeps ?? monthData.monthDeps).map(d => {
                const cat = CATEGORIES.find(c => c.key === d.categorie)
                const acc = d.bank_account_id ? accountsById.get(d.bank_account_id) : null
                return (
                  <tr key={d.id} className="table-row group">
                    <td className="text-foreground font-medium">{d.description || '—'}</td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <span>{cat?.emoji ?? '🎯'}</span>
                        <span className="text-muted-foreground text-sm">{cat?.label ?? d.categorie}</span>
                      </span>
                    </td>
                    <td>
                      {acc ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border"
                          style={{
                            borderColor: (acc.couleur ?? '#3b82f6') + '55',
                            color: acc.couleur ?? '#3b82f6',
                            backgroundColor: (acc.couleur ?? '#3b82f6') + '11',
                          }}
                        >
                          <span>{acc.icon || '🏦'}</span>
                          <span className="truncate max-w-[9rem]">{acc.nom}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge-pill ${
                          d.type === 'business' ? 'badge-info' : 'badge-neutral'
                        }`}
                      >
                        {d.type === 'business' ? 'Business' : 'Personnel'}
                      </span>
                    </td>
                    <td className="text-muted-foreground">{formatDate(d.date_depense)}</td>
                    <td className="font-semibold text-red-600 dark:text-red-400">{formatDH(d.montant)}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          if (confirm('Supprimer cette dépense ?')) deleteDepense.mutate(d.id)
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
