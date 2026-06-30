import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, Building2, Mail, Phone, Edit2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getInitials } from '@/lib/utils'
import { fournisseursApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { fournisseursSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'

interface Fournisseur { id: string; created_at: string; nom: string; email?: string; telephone?: string; adresse?: string; categorie?: string; notes?: string }

const EMPTY = { nom: '', email: '', telephone: '', adresse: '', categorie: '', notes: '' }

const CAT_COLORS: Record<string, string> = {
  Logiciels: 'text-blue-400 bg-blue-500/20',
  Hébergement: 'text-purple-400 bg-purple-500/20',
  Télécom: 'text-cyan-400 bg-cyan-500/20',
  Fournitures: 'text-yellow-400 bg-yellow-500/20',
}

export default function Fournisseurs() {
  const qc = useQueryClient()
  const { data: fournisseurs = [], isLoading } = useQuery<Fournisseur[]>({
    queryKey: ['fournisseurs'],
    queryFn: () => fournisseursApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Fournisseur[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => fournisseursApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fournisseurs'] }); toast.success('Fournisseur ajouté'); setShowForm(false); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const update = useMutation({
    mutationFn: ({ id, ...data }: Fournisseur) => fournisseursApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fournisseurs'] }); toast.success('Mis à jour'); setShowForm(false); setEditing(undefined) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => fournisseursApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fournisseurs'] }); toast.success('Supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Fournisseur | undefined>()
  const [form, setForm] = useState(EMPTY)
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filtered = useMemo(() =>
    fournisseurs.filter(f =>
      (!search || [f.nom, f.email, f.categorie].some(x => x?.toLowerCase().includes(search.toLowerCase())))
      && dateMatch(f.created_at)
    )
  , [fournisseurs, search, dateMatch])

  const openAdd  = () => { setEditing(undefined); setForm(EMPTY); setShowForm(true) }
  const openEdit = (f: Fournisseur) => { setEditing(f); setForm({ nom: f.nom, email: f.email || '', telephone: f.telephone || '', adresse: f.adresse || '', categorie: f.categorie || '', notes: f.notes || '' }); setShowForm(true) }

  const save = () => {
    if (!form.nom) return
    if (editing) { update.mutate({ ...editing, ...form }) }
    else { create.mutate(form) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fournisseurs</h1>
          <p className="text-muted-foreground text-sm mt-1">{fournisseurs.length} fournisseurs</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={fournisseursSchema}
            data={fournisseurs}
            onImport={async (row) => { await create.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4" /> Ajouter</Button>
        </div>
      </div>

      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? <div className="text-center text-muted-foreground text-sm py-10">Chargement...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((f, i) => (
            <motion.div key={f.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="card-premium p-5 hover:border-blue-500/30 transition-all group">
              <div className="flex items-start gap-3">
                <div className="avatar-initials w-12 h-12 flex-shrink-0">
                  <span className="font-bold text-sm">{getInitials(f.nom)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{f.nom}</h3>
                  {f.categorie && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[f.categorie] || 'text-muted-foreground bg-muted'}`}>{f.categorie}</span>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(f)}><Edit2 className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400" onClick={() => remove.mutate(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {f.email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="w-3.5 h-3.5" />{f.email}</div>}
                {f.telephone && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="w-3.5 h-3.5" />{f.telephone}</div>}
                {f.notes && <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">{f.notes}</p>}
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && <div className="col-span-full empty-state"><Building2 className="empty-state-icon" /><p className="empty-state-title">Aucun fournisseur</p></div>}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><label className="form-label">Nom *</label><AutocorrectInput value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Email</label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Téléphone</label><Input value={form.telephone} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Catégorie</label><AutocorrectInput value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Adresse</label><AutocorrectInput value={form.adresse} onChange={e => setForm(p => ({ ...p, adresse: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><label className="form-label">Notes</label>
              <AutocorrectTextarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input-field resize-none h-16" /></div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button disabled={(create.isPending || update.isPending) || !form.nom} onClick={save}>
                {editing ? 'Mettre à jour' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
