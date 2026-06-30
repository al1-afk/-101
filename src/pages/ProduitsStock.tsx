import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, Trash2, Pencil, Package, Tags, Boxes, ArrowLeftRight,
  Truck, AlertTriangle, X, TrendingUp, TrendingDown, RefreshCw,
  ReceiptText, ShoppingCart, Eye, Ban, Minus, Printer, ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useStockCategories,  useCreateStockCategory,  useUpdateStockCategory,  useDeleteStockCategory,
  useStockSuppliers,   useCreateStockSupplier,  useUpdateStockSupplier,  useDeleteStockSupplier,
  useStockProducts,    useCreateStockProduct,   useUpdateStockProduct,   useDeleteStockProduct,
  useStockMovements,   useCreateStockMovement,
  useStockAlerts,
  useStockTickets, useStockTicket, useStockTicketStats, useCreateStockTicket, useCancelStockTicket,
  type StockCategory, type StockSupplier, type StockProduct, type MovementType,
  type TicketPaymentMethod,
} from '@/hooks/useStock'
import { cn, formatCurrency } from '@/lib/utils'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { stockProductsSchema } from '@/lib/importExportSchemas'

/* ═══════════════════════════════════════════════════════════════
   PAGE — 6 onglets internes
═══════════════════════════════════════════════════════════════ */
export default function ProduitsStock() {
  const { data: alerts = [] } = useStockAlerts()

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Boxes className="w-6 h-6 text-blue-500" />
            Produits & Stock
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestion complète du catalogue, du stock et des mouvements
          </p>
        </div>
        {alerts.length > 0 && (
          <Badge variant="destructive" className="gap-1.5 py-1.5 px-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            {alerts.length} alerte{alerts.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="products"    className="gap-1.5"><Package className="w-4 h-4" /> Produits</TabsTrigger>
          <TabsTrigger value="tickets"     className="gap-1.5"><ReceiptText className="w-4 h-4" /> Tickets</TabsTrigger>
          <TabsTrigger value="categories"  className="gap-1.5"><Tags className="w-4 h-4" /> Catégories</TabsTrigger>
          <TabsTrigger value="stock"       className="gap-1.5"><Boxes className="w-4 h-4" /> Stock</TabsTrigger>
          <TabsTrigger value="movements"   className="gap-1.5"><ArrowLeftRight className="w-4 h-4" /> Mouvements</TabsTrigger>
          <TabsTrigger value="suppliers"   className="gap-1.5"><Truck className="w-4 h-4" /> Fournisseurs</TabsTrigger>
          <TabsTrigger value="alerts"      className="gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Alertes
            {alerts.length > 0 && (
              <span className="ml-1 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {alerts.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="tickets"><TicketsTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="stock"><StockTab /></TabsContent>
        <TabsContent value="movements"><MovementsTab /></TabsContent>
        <TabsContent value="suppliers"><SuppliersTab /></TabsContent>
        <TabsContent value="alerts"><AlertsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PRODUCTS TAB
═══════════════════════════════════════════════════════════════ */
const EMPTY_PRODUCT: Partial<StockProduct> = {
  sku: '', nom: '', description: '',
  category_id: null, supplier_id: null,
  prix_achat: 0, prix_vente: 0, tva: 20,
  stock_actuel: 0, stock_minimum: 0,
  image_url: '', is_active: true,
}

function ProductsTab() {
  const [search, setSearch] = useState('')
  const [form, setForm]     = useState<(Partial<StockProduct> & { id?: string }) | null>(null)

  const { data: products = [], isLoading } = useStockProducts(search)
  const { data: categories = [] }          = useStockCategories()
  const { data: suppliers = [] }           = useStockSuppliers()
  const create = useCreateStockProduct()
  const update = useUpdateStockProduct()
  const remove = useDeleteStockProduct()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (form.id) {
      await update.mutateAsync({ id: form.id, ...form })
    } else {
      await create.mutateAsync(form)
    }
    setForm(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={stockProductsSchema}
            data={products}
            onImport={async (row) => { await create.mutateAsync(row as Partial<StockProduct>) }}
          />
          <Button size="sm" onClick={() => setForm({ ...EMPTY_PRODUCT })}>
            <Plus className="w-4 h-4" /> Nouveau produit
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock label="Chargement des produits…" />
      ) : products.length === 0 ? (
        <EmptyState icon={<Package className="w-8 h-8" />} label="Aucun produit">
          Créez votre premier produit pour démarrer le suivi de stock.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={() => setForm(p)}
              onDelete={() => remove.mutate(p.id)}
            />
          ))}
        </div>
      )}

      <ProductFormDialog
        open={!!form}
        form={form}
        setForm={setForm}
        categories={categories}
        suppliers={suppliers}
        onSubmit={handleSubmit}
        loading={create.isPending || update.isPending}
      />
    </div>
  )
}

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: StockProduct
  onEdit:  () => void
  onDelete:() => void
}) {
  const low = Number(product.stock_actuel) <= Number(product.stock_minimum)
  const out = Number(product.stock_actuel) <= 0

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{product.nom}</span>
            {product.category_nom && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{ background: (product.category_color ?? '#3B82F6') + '20', color: product.category_color ?? '#3B82F6' }}
              >
                {product.category_nom}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{product.sku}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 rounded hover:bg-muted transition-colors" title="Modifier">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors" title="Supprimer">
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Prix vente</div>
          <div className="font-semibold">{formatCurrency(product.prix_vente)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Stock</div>
          <div className={cn(
            'font-semibold flex items-center gap-1',
            out ? 'text-red-600' : low ? 'text-amber-600' : 'text-emerald-600',
          )}>
            {product.stock_actuel}
            {out && <Badge variant="destructive" className="text-[9px] h-4 px-1">Rupture</Badge>}
            {!out && low && <Badge className="text-[9px] h-4 px-1 bg-amber-500">Faible</Badge>}
          </div>
        </div>
      </div>
    </Card>
  )
}

function ProductFormDialog({
  open, form, setForm, categories, suppliers, onSubmit, loading,
}: {
  open:       boolean
  form:       (Partial<StockProduct> & { id?: string }) | null
  setForm:    (f: (Partial<StockProduct> & { id?: string }) | null) => void
  categories: StockCategory[]
  suppliers:  StockSupplier[]
  onSubmit:   (e: React.FormEvent) => void
  loading:    boolean
}) {
  if (!form) return null
  const set = <K extends keyof StockProduct>(k: K, v: StockProduct[K] | null) =>
    setForm({ ...form, [k]: v })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nom *">
              <AutocorrectInput value={form.nom ?? ''} onChange={(e) => set('nom', e.target.value)} required />
            </Field>
            <Field label="SKU" hint="laissez vide pour générer">
              <Input value={form.sku ?? ''} onChange={(e) => set('sku', e.target.value)} />
            </Field>
            <Field label="Catégorie">
              <Select
                value={form.category_id ?? 'none'}
                onValueChange={(v) => set('category_id', v === 'none' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucune —</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fournisseur">
              <Select
                value={form.supplier_id ?? 'none'}
                onValueChange={(v) => set('supplier_id', v === 'none' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucun —</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prix achat">
              <Input type="number" step="0.01" value={form.prix_achat ?? 0} onChange={(e) => set('prix_achat', Number(e.target.value))} />
            </Field>
            <Field label="Prix vente">
              <Input type="number" step="0.01" value={form.prix_vente ?? 0} onChange={(e) => set('prix_vente', Number(e.target.value))} />
            </Field>
            <Field label="TVA (%)">
              <Input type="number" step="0.01" value={form.tva ?? 20} onChange={(e) => set('tva', Number(e.target.value))} />
            </Field>
            <Field label="Image URL">
              <Input value={form.image_url ?? ''} onChange={(e) => set('image_url', e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Stock actuel">
              <Input type="number" step="0.01" value={form.stock_actuel ?? 0} onChange={(e) => set('stock_actuel', Number(e.target.value))} />
            </Field>
            <Field label="Stock minimum">
              <Input type="number" step="0.01" value={form.stock_minimum ?? 0} onChange={(e) => set('stock_minimum', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Description">
            <AutocorrectTextarea
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setForm(null)}>Annuler</Button>
            <Button type="submit" disabled={loading}>{form.id ? 'Enregistrer' : 'Créer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════
   CATEGORIES TAB
═══════════════════════════════════════════════════════════════ */
function CategoriesTab() {
  const { data: categories = [], isLoading } = useStockCategories()
  const create = useCreateStockCategory()
  const update = useUpdateStockCategory()
  const remove = useDeleteStockCategory()
  const [form, setForm] = useState<(Partial<StockCategory> & { id?: string }) | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (form.id) await update.mutateAsync({ id: form.id, ...form })
    else         await create.mutateAsync(form)
    setForm(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setForm({ nom: '', color: '#3B82F6', description: '' })}>
          <Plus className="w-4 h-4" /> Nouvelle catégorie
        </Button>
      </div>

      {isLoading ? (
        <LoadingBlock label="Chargement…" />
      ) : categories.length === 0 ? (
        <EmptyState icon={<Tags className="w-8 h-8" />} label="Aucune catégorie">
          Ajoutez une catégorie pour organiser vos produits.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {categories.map((c) => (
            <Card key={c.id} className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color ?? '#3B82F6' }} />
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{c.nom}</div>
                  {c.description && (
                    <div className="text-[11px] text-muted-foreground truncate">{c.description}</div>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setForm(c)} className="p-1.5 rounded hover:bg-muted" title="Modifier">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => remove.mutate(c.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        {form && (
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? 'Modifier' : 'Nouvelle catégorie'}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Nom *">
                <AutocorrectInput value={form.nom ?? ''} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
              </Field>
              <Field label="Couleur">
                <Input type="color" value={form.color ?? '#3B82F6'} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-24 p-1" />
              </Field>
              <Field label="Description">
                <AutocorrectInput value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setForm(null)}>Annuler</Button>
                <Button type="submit">{form.id ? 'Enregistrer' : 'Créer'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   STOCK TAB — vue synthèse avec action "Mouvement rapide"
═══════════════════════════════════════════════════════════════ */
function StockTab() {
  const { data: products = [], isLoading } = useStockProducts('')
  const [mvFor, setMvFor] = useState<StockProduct | null>(null)

  const totals = useMemo(() => {
    const totalStock = products.reduce((s, p) => s + Number(p.stock_actuel), 0)
    const lowCount   = products.filter((p) => Number(p.stock_actuel) <= Number(p.stock_minimum)).length
    const value      = products.reduce((s, p) => s + Number(p.stock_actuel) * Number(p.prix_achat), 0)
    return { totalStock, lowCount, value }
  }, [products])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Produits" value={products.length} icon={<Package className="w-4 h-4" />} />
        <StatCard label="Unités en stock" value={totals.totalStock} icon={<Boxes className="w-4 h-4" />} />
        <StatCard label="Valeur stock" value={formatCurrency(totals.value)} icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} />
      </div>

      {isLoading ? (
        <LoadingBlock label="Chargement…" />
      ) : products.length === 0 ? (
        <EmptyState icon={<Boxes className="w-8 h-8" />} label="Aucun produit en stock">
          Ajoutez des produits dans l'onglet Produits pour voir l'état du stock.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Produit</th>
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-right px-3 py-2">Stock</th>
                  <th className="text-right px-3 py-2">Min</th>
                  <th className="text-right px-3 py-2">Statut</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((p) => {
                  const out = Number(p.stock_actuel) <= 0
                  const low = Number(p.stock_actuel) <= Number(p.stock_minimum)
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{p.nom}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.sku}</td>
                      <td className="px-3 py-2 text-right font-semibold">{p.stock_actuel}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{p.stock_minimum}</td>
                      <td className="px-3 py-2 text-right">
                        {out ? <Badge variant="destructive">Rupture</Badge>
                          : low ? <Badge className="bg-amber-500">Faible</Badge>
                          : <Badge className="bg-emerald-500">OK</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setMvFor(p)}>
                          <ArrowLeftRight className="w-3.5 h-3.5" /> Mouvement
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <QuickMovementDialog product={mvFor} onClose={() => setMvFor(null)} />
    </div>
  )
}

function QuickMovementDialog({ product, onClose }: { product: StockProduct | null; onClose: () => void }) {
  const [type, setType]       = useState<MovementType>('entree')
  const [qty, setQty]         = useState(1)
  const [reference, setRef]   = useState('')
  const [note, setNote]       = useState('')
  const create = useCreateStockMovement()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return
    await create.mutateAsync({ product_id: product.id, type, quantite: qty, reference, note, source: 'manual' })
    setType('entree'); setQty(1); setRef(''); setNote('')
    onClose()
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      {product && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5" /> Mouvement — {product.nom}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <Select value={type} onValueChange={(v) => setType(v as MovementType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entree">Entrée (+)</SelectItem>
                    <SelectItem value="sortie">Sortie (−)</SelectItem>
                    <SelectItem value="ajustement">Ajustement (=)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={type === 'ajustement' ? 'Nouveau stock' : 'Quantité'}>
                <Input type="number" step="0.01" value={qty} onChange={(e) => setQty(Number(e.target.value))} required />
              </Field>
            </div>
            <Field label="Référence">
              <Input value={reference} onChange={(e) => setRef(e.target.value)} placeholder="BL-001, commande #…" />
            </Field>
            <Field label="Note">
              <AutocorrectInput value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
              <Button type="submit" disabled={create.isPending}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MOVEMENTS TAB
═══════════════════════════════════════════════════════════════ */
function MovementsTab() {
  const { data: movements = [], isLoading } = useStockMovements()

  return (
    <div className="space-y-4">
      {isLoading ? (
        <LoadingBlock label="Chargement…" />
      ) : movements.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight className="w-8 h-8" />} label="Aucun mouvement">
          Les entrées, sorties et ajustements apparaîtront ici.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Produit</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2">Qté</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-left px-3 py-2">Réf.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{m.product_nom ?? '—'}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{m.product_sku}</div>
                    </td>
                    <td className="px-3 py-2">
                      {m.type === 'entree' && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                          <TrendingUp className="w-3.5 h-3.5" /> Entrée
                        </span>
                      )}
                      {m.type === 'sortie' && (
                        <span className="inline-flex items-center gap-1 text-red-600 text-xs font-semibold">
                          <TrendingDown className="w-3.5 h-3.5" /> Sortie
                        </span>
                      )}
                      {m.type === 'ajustement' && (
                        <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold">
                          <RefreshCw className="w-3.5 h-3.5" /> Ajustement
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{m.quantite}</td>
                    <td className="px-3 py-2 text-xs">
                      {m.source === 'facture'
                        ? <Badge variant="outline" className="text-[10px]">Facture</Badge>
                        : <span className="text-muted-foreground">manuel</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{m.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SUPPLIERS TAB
═══════════════════════════════════════════════════════════════ */
function SuppliersTab() {
  const { data: suppliers = [], isLoading } = useStockSuppliers()
  const create = useCreateStockSupplier()
  const update = useUpdateStockSupplier()
  const remove = useDeleteStockSupplier()
  const [form, setForm] = useState<(Partial<StockSupplier> & { id?: string }) | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (form.id) await update.mutateAsync({ id: form.id, ...form })
    else         await create.mutateAsync(form)
    setForm(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setForm({ nom: '' })}>
          <Plus className="w-4 h-4" /> Nouveau fournisseur
        </Button>
      </div>
      {isLoading ? (
        <LoadingBlock label="Chargement…" />
      ) : suppliers.length === 0 ? (
        <EmptyState icon={<Truck className="w-8 h-8" />} label="Aucun fournisseur">
          Ajoutez vos fournisseurs de stock pour les rattacher aux produits.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {suppliers.map((s) => (
            <Card key={s.id} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm">{s.nom}</div>
                {s.email     && <div className="text-xs text-muted-foreground truncate">{s.email}</div>}
                {s.telephone && <div className="text-xs text-muted-foreground">{s.telephone}</div>}
                {s.adresse   && <div className="text-xs text-muted-foreground truncate">{s.adresse}</div>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setForm(s)} className="p-1.5 rounded hover:bg-muted" title="Modifier">
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => remove.mutate(s.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        {form && (
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? 'Modifier' : 'Nouveau fournisseur'}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Nom *">
                <AutocorrectInput value={form.nom ?? ''} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Téléphone">
                <Input value={form.telephone ?? ''} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
              </Field>
              <Field label="Adresse">
                <AutocorrectInput value={form.adresse ?? ''} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
              </Field>
              <Field label="Notes">
                <AutocorrectInput value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setForm(null)}>Annuler</Button>
                <Button type="submit">{form.id ? 'Enregistrer' : 'Créer'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ALERTS TAB
═══════════════════════════════════════════════════════════════ */
function AlertsTab() {
  const { data: alerts = [], isLoading } = useStockAlerts()

  if (isLoading) return <LoadingBlock label="Chargement…" />
  if (alerts.length === 0) {
    return (
      <EmptyState icon={<AlertTriangle className="w-8 h-8 text-emerald-500" />} label="Tout est OK">
        Aucun produit en rupture ou stock faible.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-3">
      {alerts.map((a) => (
        <Card key={a.id} className={cn(
          'p-4 flex items-center justify-between gap-3 border-l-4',
          a.level === 'rupture' ? 'border-l-red-500' : 'border-l-amber-500',
        )}>
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle className={cn(
              'w-5 h-5 flex-shrink-0',
              a.level === 'rupture' ? 'text-red-500' : 'text-amber-500',
            )} />
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{a.nom}</div>
              <div className="text-xs text-muted-foreground font-mono">{a.sku}</div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={cn(
              'text-lg font-bold',
              a.level === 'rupture' ? 'text-red-600' : 'text-amber-600',
            )}>
              {a.stock_actuel}
            </div>
            <div className="text-[10px] text-muted-foreground">min. {a.stock_minimum}</div>
          </div>
        </Card>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TICKETS TAB — caisse (POS-style)
═══════════════════════════════════════════════════════════════ */

interface CartLine {
  product_id:    string
  product_nom:   string
  product_sku:   string
  quantite:      number
  prix_unitaire: number
  tva:           number
  stock_actuel:  number
}

function TicketsTab() {
  const { data: tickets = [], isLoading: loadingTickets } = useStockTickets()
  const { data: stats }                                   = useStockTicketStats()
  const cancel       = useCancelStockTicket()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Aujourd'hui"   value={formatCurrency(Number(stats?.today_revenue ?? 0))}   icon={<ReceiptText className="w-4 h-4 text-blue-500" />} />
        <StatCard label="Cette semaine" value={formatCurrency(Number(stats?.week_revenue ?? 0))}    icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="Ce mois"       value={formatCurrency(Number(stats?.month_revenue ?? 0))}   icon={<TrendingUp className="w-4 h-4 text-violet-500" />} />
        <StatCard label="Total tickets" value={Number(stats?.total_count ?? 0)}                      icon={<ShoppingCart className="w-4 h-4 text-amber-500" />} />
      </div>

      {/* New ticket form */}
      <NewTicketForm />

      {/* History */}
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ReceiptText className="w-4 h-4" /> Historique des tickets
          </h3>
          <span className="text-xs text-muted-foreground">{tickets.length} ticket(s)</span>
        </div>
        {loadingTickets ? (
          <LoadingBlock label="Chargement…" />
        ) : tickets.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Aucun ticket pour le moment. Créez le premier ci-dessus.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Numéro</th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Client</th>
                  <th className="text-right px-3 py-2">Lignes</th>
                  <th className="text-right px-3 py-2">Total TTC</th>
                  <th className="text-left px-3 py-2">Paiement</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tickets.map((t) => (
                  <tr key={t.id} className={cn('hover:bg-muted/30', t.statut === 'annule' && 'opacity-60')}>
                    <td className="px-3 py-2 font-mono text-xs">{t.numero}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(t.date).toLocaleString('fr-FR')}</td>
                    <td className="px-3 py-2 text-xs">{t.client_full_nom ?? t.client_nom ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{t.lines_count ?? 0}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(Number(t.total_ttc))}</td>
                    <td className="px-3 py-2 text-xs">
                      <Badge variant="outline" className="text-[10px] capitalize">{t.methode_paiement}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.statut === 'valide'
                        ? <Badge className="bg-emerald-500 text-[10px]">Validé</Badge>
                        : <Badge variant="destructive" className="text-[10px]">Annulé</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setOpenId(t.id)} className="p-1.5 rounded hover:bg-muted" title="Voir détails">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      {t.statut === 'valide' && (
                        <button
                          onClick={() => { if (confirm(`Annuler le ticket ${t.numero} ?`)) cancel.mutate(t.id) }}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
                          title="Annuler"
                        >
                          <Ban className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TicketDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

function NewTicketForm() {
  const { data: products = [] } = useStockProducts('')
  const create                  = useCreateStockTicket()
  const [cart, setCart]         = useState<CartLine[]>([])
  const [methode, setMethode]   = useState<TicketPaymentMethod>('especes')
  const [clientNom, setClientNom] = useState('')
  const [notes, setNotes]       = useState('')
  const [search, setSearch]     = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products
      .filter(p => p.is_active)
      .filter(p => !q || p.nom.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 12)
  }, [products, search])

  const totals = useMemo(() => {
    let ht = 0, tva = 0
    for (const l of cart) {
      const ttc = l.prix_unitaire * l.quantite
      const lht = ttc / (1 + l.tva / 100)
      ht += lht
      tva += ttc - lht
    }
    return { ht, tva, ttc: ht + tva }
  }, [cart])

  const addProduct = (p: StockProduct) => {
    setCart(prev => {
      const idx = prev.findIndex(l => l.product_id === p.id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], quantite: copy[idx].quantite + 1 }
        return copy
      }
      return [...prev, {
        product_id:    p.id,
        product_nom:   p.nom,
        product_sku:   p.sku,
        quantite:      1,
        prix_unitaire: Number(p.prix_vente),
        tva:           Number(p.tva),
        stock_actuel:  Number(p.stock_actuel),
      }]
    })
  }

  const updateLine = (id: string, patch: Partial<CartLine>) => {
    setCart(prev => prev.map(l => l.product_id === id ? { ...l, ...patch } : l))
  }

  const removeLine = (id: string) => setCart(prev => prev.filter(l => l.product_id !== id))

  const submit = async () => {
    if (cart.length === 0) return
    await create.mutateAsync({
      methode_paiement: methode,
      client_nom:       clientNom || null,
      notes:            notes || null,
      lines:            cart.map(l => ({
        product_id:    l.product_id,
        quantite:      l.quantite,
        prix_unitaire: l.prix_unitaire,
        tva:           l.tva,
      })),
    })
    setCart([]); setClientNom(''); setNotes(''); setMethode('especes')
  }

  return (
    <Card className="p-4 space-y-4 border-2 border-dashed border-blue-200 dark:border-blue-950/60 bg-blue-50/30 dark:bg-blue-950/10">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-blue-500" /> Nouveau ticket de caisse
        </h3>
        <span className="text-[11px] text-muted-foreground italic">
          Stock décrémenté automatiquement à la validation
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Product picker */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un produit (nom ou SKU)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="col-span-full text-xs text-muted-foreground italic text-center py-4">
                Aucun produit trouvé
              </div>
            ) : filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                disabled={Number(p.stock_actuel) <= 0}
                className={cn(
                  'text-left rounded-md border border-border bg-background overflow-hidden hover:border-blue-400 hover:shadow-md hover:bg-blue-50/30 dark:hover:bg-blue-950/30 transition-all',
                  Number(p.stock_actuel) <= 0 && 'opacity-40 cursor-not-allowed',
                )}
              >
                <ProductThumb url={p.image_url} alt={p.nom} />
                <div className="p-2">
                  <div className="text-xs font-semibold line-clamp-1">{p.nom}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">{p.sku}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold text-blue-600">{formatCurrency(Number(p.prix_vente))}</span>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                      Number(p.stock_actuel) <= 0 ? 'bg-red-100 text-red-700' :
                      Number(p.stock_actuel) <= Number(p.stock_minimum) ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700',
                    )}>
                      {p.stock_actuel}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="space-y-2">
          <div className="rounded-md border border-border bg-background overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Panier ({cart.length})
            </div>
            {cart.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                Cliquez un produit pour l'ajouter
              </div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto divide-y divide-border">
                {cart.map(l => (
                  <div key={l.product_id} className="p-2 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{l.product_nom}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{l.product_sku}</div>
                      </div>
                      <button onClick={() => removeLine(l.product_id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 p-1 rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateLine(l.product_id, { quantite: Math.max(0.01, l.quantite - 1) })}
                        className="p-1 rounded hover:bg-muted"
                      ><Minus className="w-3 h-3" /></button>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={l.quantite}
                        onChange={(e) => updateLine(l.product_id, { quantite: Number(e.target.value) || 0.01 })}
                        className="h-7 w-14 text-center text-xs"
                      />
                      <button
                        onClick={() => updateLine(l.product_id, { quantite: l.quantite + 1 })}
                        className="p-1 rounded hover:bg-muted"
                      ><Plus className="w-3 h-3" /></button>
                      <span className="text-[10px] text-muted-foreground mx-1">×</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={l.prix_unitaire}
                        onChange={(e) => updateLine(l.product_id, { prix_unitaire: Number(e.target.value) || 0 })}
                        className="h-7 flex-1 text-right text-xs"
                      />
                      <span className="text-xs font-bold w-20 text-right">
                        {formatCurrency(l.prix_unitaire * l.quantite)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals + meta */}
          <div className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total HT</span><span>{formatCurrency(totals.ht)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">TVA</span><span>{formatCurrency(totals.tva)}</span></div>
            <div className="flex justify-between text-base font-bold border-t border-border pt-2">
              <span>Total TTC</span><span className="text-blue-600">{formatCurrency(totals.ttc)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Select value={methode} onValueChange={(v) => setMethode(v as TicketPaymentMethod)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="especes">Espèces</SelectItem>
                  <SelectItem value="carte">Carte</SelectItem>
                  <SelectItem value="virement">Virement</SelectItem>
                  <SelectItem value="cheque">Chèque</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
              <AutocorrectInput
                placeholder="Client (optionnel)"
                value={clientNom}
                onChange={(e) => setClientNom(e.target.value)}
                className="h-9"
              />
            </div>
            <AutocorrectInput
              placeholder="Notes (optionnel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9"
            />

            <Button
              onClick={submit}
              disabled={cart.length === 0 || create.isPending}
              className="w-full h-10 mt-1 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800"
            >
              <ReceiptText className="w-4 h-4" />
              {create.isPending ? 'Validation…' : `Valider — ${formatCurrency(totals.ttc)}`}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function TicketDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: ticket, isLoading } = useStockTicket(id)

  const handlePrint = () => {
    if (!ticket) return
    printTicket(ticket)
  }

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      {id && (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="w-5 h-5" /> Ticket {ticket?.numero ?? '…'}
            </DialogTitle>
          </DialogHeader>
          {isLoading || !ticket ? (
            <LoadingBlock label="Chargement…" />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Date :</span>{' '}
                  {new Date(ticket.date).toLocaleString('fr-FR')}
                </div>
                <div>
                  <span className="text-muted-foreground">Client :</span>{' '}
                  {ticket.client_nom ?? '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">Paiement :</span>{' '}
                  <span className="capitalize">{ticket.methode_paiement}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Statut :</span>{' '}
                  {ticket.statut === 'valide'
                    ? <Badge className="bg-emerald-500 text-[10px]">Validé</Badge>
                    : <Badge variant="destructive" className="text-[10px]">Annulé</Badge>}
                </div>
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase">
                    <tr>
                      <th className="text-left px-2 py-1">Produit</th>
                      <th className="text-right px-2 py-1">Qté</th>
                      <th className="text-right px-2 py-1">PU</th>
                      <th className="text-right px-2 py-1">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ticket.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-2 py-1">
                          <div className="font-medium">{l.product_nom}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{l.product_sku}</div>
                        </td>
                        <td className="px-2 py-1 text-right">{l.quantite}</td>
                        <td className="px-2 py-1 text-right">{formatCurrency(Number(l.prix_unitaire))}</td>
                        <td className="px-2 py-1 text-right font-semibold">{formatCurrency(Number(l.total_ttc))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center bg-muted/40 rounded-md p-2 text-sm">
                <span className="font-bold">Total TTC</span>
                <span className="font-bold text-blue-600">{formatCurrency(Number(ticket.total_ttc))}</span>
              </div>
              {ticket.notes && (
                <div className="text-xs text-muted-foreground italic">{ticket.notes}</div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={onClose}>Fermer</Button>
                <Button size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4" /> Imprimer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

/* ─── Product thumbnail with placeholder fallback ──────────────── */
function ProductThumb({ url, alt }: { url: string | null | undefined; alt: string }) {
  const [errored, setErrored] = useState(false)
  if (!url || errored) {
    return (
      <div className="w-full aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center">
        <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
      </div>
    )
  }
  return (
    <div className="w-full aspect-[4/3] bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setErrored(true)}
        className="w-full h-full object-cover"
      />
    </div>
  )
}

/* ─── Print receipt — opens a small, printer-friendly window ──── */
function printTicket(ticket: {
  numero:           string
  date:             string
  client_nom:       string | null
  methode_paiement: string
  statut:           string
  notes:            string | null
  total_ht:         number
  total_tva:        number
  total_ttc:        number
  lines:            Array<{
    product_nom:   string
    product_sku:   string
    quantite:      number
    prix_unitaire: number
    total_ttc:     number
  }>
}) {
  const fmt = (v: number) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' MAD'
  const tenantSlug = sessionStorage.getItem('gestiq_tenant_slug') ?? 'GestiQ'
  const tenantName = (localStorage.getItem('gestiq_company') || tenantSlug).replace(/[<>]/g, '')

  const linesHtml = ticket.lines.map(l => `
    <tr>
      <td>
        <div class="nom">${escapeHtml(l.product_nom)}</div>
        <div class="sku">${escapeHtml(l.product_sku)}</div>
      </td>
      <td class="num">${Number(l.quantite)}</td>
      <td class="num">${fmt(Number(l.prix_unitaire))}</td>
      <td class="num">${fmt(Number(l.total_ttc))}</td>
    </tr>
  `).join('')

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Ticket ${escapeHtml(ticket.numero)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
    font-size: 12px; color: #111; max-width: 320px; margin: 0 auto; padding: 16px;
  }
  .head { text-align: center; border-bottom: 2px dashed #999; padding-bottom: 10px; margin-bottom: 10px; }
  .head h1 { font-size: 16px; margin: 0 0 4px; letter-spacing: 0.5px; }
  .head .sub { font-size: 11px; color: #666; }
  .meta { display: flex; flex-direction: column; gap: 2px; font-size: 11px; margin-bottom: 10px; }
  .meta .row { display: flex; justify-content: space-between; }
  .meta .row span:first-child { color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  thead th {
    text-align: left; font-size: 10px; text-transform: uppercase; color: #666;
    border-bottom: 1px solid #999; padding: 4px 2px;
  }
  thead th.num { text-align: right; }
  tbody td { padding: 5px 2px; border-bottom: 1px dashed #ddd; vertical-align: top; }
  tbody td.num { text-align: right; }
  .nom { font-weight: 600; }
  .sku { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; color: #888; }
  .totals { margin-top: 8px; }
  .totals .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .totals .grand { border-top: 2px solid #111; margin-top: 4px; padding-top: 6px; font-weight: 700; font-size: 14px; }
  .footer { text-align: center; margin-top: 14px; padding-top: 10px; border-top: 2px dashed #999; font-size: 11px; color: #666; }
  .stamp { display: inline-block; padding: 2px 8px; border: 2px solid #c00; color: #c00;
           font-weight: 700; transform: rotate(-8deg); margin-top: 8px; }
  .notes { font-style: italic; color: #555; margin-top: 6px; font-size: 10px; }
  @media print { body { padding: 4px; } @page { margin: 8mm; size: 80mm auto; } }
</style>
</head>
<body>
  <div class="head">
    <h1>${escapeHtml(tenantName.toUpperCase())}</h1>
    <div class="sub">Ticket de caisse</div>
  </div>

  <div class="meta">
    <div class="row"><span>N°</span><strong>${escapeHtml(ticket.numero)}</strong></div>
    <div class="row"><span>Date</span><span>${new Date(ticket.date).toLocaleString('fr-FR')}</span></div>
    ${ticket.client_nom ? `<div class="row"><span>Client</span><span>${escapeHtml(ticket.client_nom)}</span></div>` : ''}
    <div class="row"><span>Paiement</span><span style="text-transform:capitalize">${escapeHtml(ticket.methode_paiement)}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Produit</th>
        <th class="num">Qté</th>
        <th class="num">PU</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Total HT</span><span>${fmt(Number(ticket.total_ht))}</span></div>
    <div class="row"><span>TVA</span><span>${fmt(Number(ticket.total_tva))}</span></div>
    <div class="row grand"><span>Total TTC</span><span>${fmt(Number(ticket.total_ttc))}</span></div>
  </div>

  ${ticket.notes ? `<div class="notes">${escapeHtml(ticket.notes)}</div>` : ''}
  ${ticket.statut === 'annule' ? `<div style="text-align:center"><span class="stamp">ANNULÉ</span></div>` : ''}

  <div class="footer">
    Merci de votre visite !<br>
    <span style="font-size:9px">Édité par GestiQ</span>
  </div>

  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 300);
    };
  </script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=380,height=700')
  if (!win) { alert('Veuillez autoriser les pop-ups pour imprimer.'); return }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* ═══════════════════════════════════════════════════════════════
   Shared UI bits
═══════════════════════════════════════════════════════════════ */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
        {label}
        {hint && <span className="text-[10px] italic text-muted-foreground/70">— {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </Card>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground py-10 justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      {label}
    </div>
  )
}

function EmptyState({ icon, label, children }: { icon: React.ReactNode; label: string; children?: React.ReactNode }) {
  return (
    <Card className="p-10 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-3 text-muted-foreground">
        {icon}
      </div>
      <h3 className="font-semibold">{label}</h3>
      {children && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{children}</p>}
    </Card>
  )
}
