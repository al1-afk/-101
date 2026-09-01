import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Package, Search, Trash2, Pencil, MoreHorizontal,
  Wrench, ArrowUpDown, ArrowDown, ArrowUp, Sparkles, Command,
  Boxes, Sigma, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { formatCurrency, cn } from '@/lib/utils'
import { produitsApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { produitsSchema } from '@/lib/importExportSchemas'

interface Produit {
  id: string
  created_at: string
  nom: string
  description: string
  prix_ht: number
  tva: number
  type: 'produit' | 'service'
  unite: string
}

const EMPTY = { nom: '', description: '', prix_ht: 0, tva: 20, type: 'service' as 'produit' | 'service', unite: 'projet' }

type SortKey = 'nom' | 'prix_ht' | 'tva' | 'created_at'
type SortDir = 'asc' | 'desc'

/* ─── Stat card ─── */
function StatCard({
  label, value, sub, icon: Icon, tint,
}: {
  label: string; value: string; sub: string; icon: React.ElementType
  tint: 'electric' | 'cyan' | 'violet' | 'emerald'
}) {
  const bgMap = {
    electric: 'bg-electric-500/10 text-electric-600',
    cyan:     'bg-cyan-500/10 text-cyan-600',
    violet:   'bg-violet-500/10 text-violet-600',
    emerald:  'bg-emerald-500/10 text-emerald-600',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="card-premium p-5 flex flex-col gap-3"
    >
      <div className="flex items-center gap-2.5">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', bgMap[tint])}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      </div>
      <p className="text-[24px] font-black tracking-[-0.02em] text-foreground leading-none">{value}</p>
      <p className="text-[11.5px] text-muted-foreground">{sub}</p>
    </motion.div>
  )
}

/* ─── Sortable header cell ─── */
function Th({
  label, sortKey, currentSort, onSort, className,
}: {
  label: string; sortKey?: SortKey; currentSort: { key: SortKey; dir: SortDir }
  onSort: (k: SortKey) => void; className?: string
}) {
  const isActive = sortKey && currentSort.key === sortKey
  return (
    <th
      className={cn(
        'text-left font-semibold text-[10.5px] uppercase tracking-[0.08em] px-4 py-3',
        'text-muted-foreground select-none',
        sortKey && 'cursor-pointer hover:text-foreground',
        className,
      )}
      onClick={() => sortKey && onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey && (
          isActive
            ? currentSort.dir === 'asc'
              ? <ArrowUp className="w-3 h-3 text-electric-500" />
              : <ArrowDown className="w-3 h-3 text-electric-500" />
            : <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
        )}
      </span>
    </th>
  )
}

/* ─── Page ─── */
export default function Produits() {
  const qc = useQueryClient()
  const { data: produits = [], isLoading } = useQuery<Produit[]>({
    queryKey: ['produits'],
    queryFn: () => produitsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Produit[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => produitsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produits'] }); toast.success('Article ajouté'); setShowForm(false); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => produitsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produits'] }); toast.success('Article supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => { for (const id of ids) await produitsApi.remove(id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produits'] }); toast.success('Sélection supprimée'); setSelected(new Set()) },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [search, setSearch]     = useState('')
  const [typeFilter, setType]   = useState<'all' | 'produit' | 'service'>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [sort, setSort]         = useState<{ key: SortKey; dir: SortDir }>({ key: 'created_at', dir: 'desc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const stats = useMemo(() => {
    const total    = produits.length
    const services = produits.filter(p => p.type === 'service').length
    const items    = produits.filter(p => p.type === 'produit').length
    const catalog  = produits.reduce((s, p) => s + p.prix_ht * (1 + p.tva / 100), 0)
    return { total, services, items, catalog }
  }, [produits])

  const filtered = useMemo(() => {
    let rows = produits.filter(p => !search || p.nom.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()))
    if (typeFilter !== 'all') rows = rows.filter(p => p.type === typeFilter)
    rows = [...rows].sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      const av = (a as any)[sort.key] ?? ''
      const bv = (b as any)[sort.key] ?? ''
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
    return rows
  }, [produits, search, typeFilter, sort])

  const toggleSort = (k: SortKey) => {
    setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' })
  }
  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(f => f.id)))
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8 max-w-[1600px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Commercial</span>
            <span className="text-slate-300">·</span>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-electric-600 dark:text-cyan-400">Catalogue</span>
          </div>
          <h1 className="text-[26px] sm:text-[30px] font-black tracking-[-0.03em] text-foreground leading-none">Articles</h1>
          <p className="text-[13px] text-muted-foreground mt-2">
            {produits.length} article{produits.length !== 1 ? 's' : ''} · gérez vos produits et services facturables.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={produitsSchema}
            data={produits}
            onImport={async (row) => { await create.mutateAsync(row as any) }}
          />
          <Button size="default" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Nouvel article
          </Button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Articles"    value={String(stats.total)}         sub="Total au catalogue"       icon={Package}    tint="electric" />
        <StatCard label="Services"    value={String(stats.services)}      sub="Prestations facturables"  icon={Wrench}     tint="cyan"     />
        <StatCard label="Produits"    value={String(stats.items)}         sub="Biens tangibles"          icon={Boxes}      tint="violet"   />
        <StatCard label="Valeur cat." value={formatCurrency(stats.catalog)} sub="Somme TTC unitaire"    icon={TrendingUp} tint="emerald"  />
      </div>

      {/* ── Filter bar ── */}
      <div className="card-premium p-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            placeholder="Rechercher un article, une description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-24 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-transparent
                       focus-visible:outline-none focus-visible:border-electric-500 focus-visible:bg-white dark:focus-visible:bg-navy-800
                       text-[13.5px] placeholder:text-slate-400 transition-all"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <span className="kbd">⌘</span><span className="kbd">K</span>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.04]">
          {(['all', 'service', 'produit'] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'px-3 h-8 rounded-md text-[12px] font-semibold transition-all',
                typeFilter === t
                  ? 'bg-white dark:bg-navy-700 text-electric-700 dark:text-cyan-300 shadow-sm'
                  : 'text-slate-500 hover:text-foreground',
              )}
            >
              {t === 'all' ? 'Tout' : t === 'service' ? 'Services' : 'Produits'}
            </button>
          ))}
        </div>

        <Button variant="premium" size="sm" className="hidden md:inline-flex">
          <Sparkles className="w-3.5 h-3.5" /> Suggérer avec IA
        </Button>
      </div>

      {/* ── Bulk action bar ── */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-center justify-between gap-3 p-3 pl-4 rounded-2xl border border-electric-500/25 bg-electric-500/[0.06]"
          >
            <div className="flex items-center gap-2 text-[13px]">
              <span className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center text-white text-[11px] font-bold">
                {selected.size}
              </span>
              <span className="font-semibold text-foreground">article{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
                Annuler
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => bulkRemove.mutate([...selected])}
                disabled={bulkRemove.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Smart table ── */}
      <div className="card-premium overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0">
            <thead className="bg-black/[0.02] dark:bg-white/[0.02] sticky top-0 z-10">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-electric-600 focus:ring-electric-500/40 cursor-pointer accent-electric-600"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll}
                  />
                </th>
                <Th label="Nom"      sortKey="nom"        currentSort={sort} onSort={toggleSort} />
                <Th label="Type"     currentSort={sort} onSort={toggleSort} />
                <Th label="Description" currentSort={sort} onSort={toggleSort} />
                <Th label="Prix HT"  sortKey="prix_ht"    currentSort={sort} onSort={toggleSort} className="text-right" />
                <Th label="TVA"      sortKey="tva"        currentSort={sort} onSort={toggleSort} className="text-right" />
                <Th label="Prix TTC" currentSort={sort} onSort={toggleSort} className="text-right" />
                <th className="w-12 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="p-0">
                        <div className="h-14 mx-4 my-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] animate-pulse" />
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {!isLoading && filtered.map((p, i) => {
                const isSel = selected.has(p.id)
                const isService = p.type === 'service'
                return (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 10) * 0.02 }}
                    className={cn(
                      'group border-t border-black/[0.05] dark:border-white/[0.05]',
                      'transition-colors',
                      isSel ? 'bg-electric-500/[0.06]' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]',
                    )}
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-300 text-electric-600 focus:ring-electric-500/40 cursor-pointer accent-electric-600"
                        checked={isSel}
                        onChange={() => toggleRow(p.id)}
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          isService ? 'bg-cyan-500/10 text-cyan-600' : 'bg-violet-500/10 text-violet-600',
                        )}>
                          {isService ? <Wrench className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-foreground truncate">{p.nom}</p>
                          <p className="text-[10.5px] text-muted-foreground uppercase tracking-wider">{p.unite || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant={isService ? 'cyan' : 'purple'} size="sm" className="capitalize">
                        {p.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 max-w-[280px]">
                      <p className="text-[12.5px] text-muted-foreground truncate">{p.description || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right text-[13px] text-muted-foreground tabular-nums">
                      {formatCurrency(p.prix_ht)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex items-center h-5 px-1.5 rounded-md bg-black/[0.04] dark:bg-white/[0.05] text-[10.5px] font-bold text-muted-foreground tabular-nums">
                        {p.tva}%
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[14px] font-bold text-foreground tabular-nums tracking-tight">
                        {formatCurrency(p.prix_ht * (1 + p.tva / 100))}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-electric-600"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-foreground"
                              title="Plus"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 rounded-xl">
                            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg">
                              <Pencil className="w-3.5 h-3.5" /> Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg">
                              <Package className="w-3.5 h-3.5" /> Dupliquer
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => remove.mutate(p.id)}
                              className="cursor-pointer gap-2 rounded-lg text-red-600 dark:text-red-400 focus:bg-red-500/10 focus:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-primary-soft ring-4 ring-electric-500/10 flex items-center justify-center mb-4">
              <Package className="w-7 h-7 text-electric-600" />
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              {search || typeFilter !== 'all' ? 'Aucun article ne correspond' : 'Votre catalogue est vide'}
            </p>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-sm">
              {search || typeFilter !== 'all'
                ? 'Essayez d\'ajuster votre recherche ou vos filtres.'
                : 'Créez votre premier produit ou service pour commencer à facturer.'}
            </p>
            {!search && typeFilter === 'all' && (
              <Button size="default" onClick={() => setShowForm(true)} className="mt-5">
                <Plus className="w-4 h-4" /> Ajouter un article
              </Button>
            )}
          </div>
        )}

        {/* Table footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-black/[0.05] dark:border-white/[0.05] text-[11.5px] text-muted-foreground">
            <span>{filtered.length} sur {produits.length} article{produits.length > 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1.5">
              <Command className="w-3 h-3" /> <span className="kbd">↑</span> <span className="kbd">↓</span> pour naviguer
            </span>
          </div>
        )}
      </div>

      {/* ── Floating action button (mobile) ── */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 md:hidden w-14 h-14 rounded-2xl bg-gradient-primary text-white shadow-glow-blue flex items-center justify-center z-30 active:scale-95 transition-transform"
        aria-label="Nouvel article"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ── Create dialog ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-primary-soft flex items-center justify-center">
                <Sigma className="w-5 h-5 text-electric-600" />
              </div>
              <div>
                <DialogTitle className="text-[17px] font-bold tracking-[-0.01em]">Nouvel article</DialogTitle>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">
                  Ajoutez un produit ou service à votre catalogue de facturation.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Nom de l'article <span className="text-red-500">*</span>
              </label>
              <AutocorrectInput
                value={form.nom}
                onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                placeholder="Ex : Installation fibre FTTH"
              />
            </div>

            <div>
              <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Description
              </label>
              <AutocorrectTextarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Détails visibles sur les devis et factures…"
                className="input-field resize-none h-20"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Prix HT (MAD)
                </label>
                <Input
                  type="number" step="0.01"
                  value={form.prix_ht}
                  onChange={e => setForm(p => ({ ...p, prix_ht: +e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  TVA
                </label>
                <Select value={String(form.tva)} onValueChange={v => setForm(p => ({ ...p, tva: +v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['0','7','10','14','20'].map(v => <SelectItem key={v} value={v}>{v}%</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Type
                </label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as 'produit' | 'service' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="produit">Produit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Unité
                </label>
                <AutocorrectInput
                  value={form.unite}
                  onChange={e => setForm(p => ({ ...p, unite: e.target.value }))}
                  placeholder="projet, mois, heure…"
                />
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] p-3 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Aperçu</p>
                <p className="text-[13px] font-semibold text-foreground truncate mt-0.5">{form.nom || 'Nom de l\'article'}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[10.5px] text-muted-foreground uppercase tracking-widest">Prix TTC</p>
                <p className="text-[15px] font-bold text-electric-600 dark:text-cyan-400 tabular-nums">
                  {formatCurrency(form.prix_ht * (1 + form.tva / 100))}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button disabled={create.isPending || !form.nom} onClick={() => create.mutate(form)}>
                {create.isPending ? 'Création…' : <><Plus className="w-4 h-4" /> Créer l'article</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
