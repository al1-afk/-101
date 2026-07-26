/**
 * Page Réglages → « Modèles de prestations ».
 * Gestion complète de la bibliothèque de modèles utilisée dans les devis :
 * créer, modifier, dupliquer, activer/désactiver, réordonner, supprimer, et
 * restaurer les 20 modèles par défaut. Adossée à la table `prestation_models`.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Library, Plus, Pencil, Copy, Trash2, ChevronUp, ChevronDown,
  RotateCcw, Check, X, Loader2, ArrowLeft, Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  usePrestationModels, useCreatePrestationModel, useUpdatePrestationModel, useDeletePrestationModel,
} from '@/hooks/usePrestationModels'
import {
  PRESTATION_TEMPLATES, PRESTATION_CATEGORIES, defaultSeedPayload,
  type PrestationModel,
} from '@/lib/prestationTemplates'

interface FormState {
  titre: string; type: string; category: string; description: string
  elements: string; objectif: string; prix_defaut: string; tva_defaut: string
  unite: string; is_unique: boolean; actif: boolean
}

const EMPTY_FORM: FormState = {
  titre: '', type: 'custom', category: 'Prestations personnalisées', description: '',
  elements: '', objectif: '', prix_defaut: '0', tva_defaut: '20', unite: 'projet',
  is_unique: false, actif: true,
}

function modelToForm(m: PrestationModel): FormState {
  return {
    titre: m.titre, type: m.type || 'custom', category: m.category || 'Prestations personnalisées',
    description: m.description ?? '', elements: (m.elements ?? []).join('\n'), objectif: m.objectif ?? '',
    prix_defaut: String(Number(m.prix_defaut) || 0), tva_defaut: String(Number(m.tva_defaut) || 20),
    unite: m.unite || 'projet', is_unique: !!m.is_unique, actif: !!m.actif,
  }
}

export default function ModelesPrestations() {
  const { data: models = [], isLoading } = usePrestationModels()
  const createM = useCreatePrestationModel()
  const updateM = useUpdatePrestationModel()
  const deleteM = useDeletePrestationModel()

  const [editing, setEditing] = useState<PrestationModel | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [seeding, setSeeding] = useState(false)

  const sorted = useMemo(
    () => [...models].sort((a, b) => a.position - b.position),
    [models],
  )

  const existingSourceKeys = useMemo(
    () => new Set(models.map(m => m.source_key).filter(Boolean) as string[]),
    [models],
  )
  const missingDefaults = PRESTATION_TEMPLATES.filter(t => !existingSourceKeys.has(t.key))

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true) }
  const openEdit = (m: PrestationModel) => { setEditing(m); setForm(modelToForm(m)); setFormOpen(true) }

  const payloadFromForm = (f: FormState, position: number) => ({
    titre: f.titre.trim(),
    type: f.type.trim() || 'custom',
    category: f.category,
    description: f.description.trim(),
    elements: f.elements.split('\n').map(l => l.trim()).filter(Boolean),
    objectif: f.objectif.trim(),
    prix_defaut: Number(f.prix_defaut) || 0,
    tva_defaut: Number(f.tva_defaut) || 0,
    unite: f.unite.trim() || 'projet',
    is_unique: f.is_unique,
    actif: f.actif,
    position,
  })

  const maxPos = () => models.reduce((mx, m) => Math.max(mx, m.position), 0)

  const handleSave = async () => {
    if (!form.titre.trim()) { toast.error('Donnez un titre au modèle'); return }
    try {
      if (editing) {
        await updateM.mutateAsync({ id: editing.id, ...payloadFromForm(form, editing.position) })
        toast.success('Modèle mis à jour')
      } else {
        await createM.mutateAsync({ source_key: null, ...payloadFromForm(form, maxPos() + 1) })
        toast.success('Modèle créé')
      }
      setFormOpen(false)
    } catch { /* toast géré par la mutation */ }
  }

  const handleDuplicate = async (m: PrestationModel) => {
    try {
      await createM.mutateAsync({
        source_key: null, titre: `${m.titre} (copie)`, type: m.type, category: m.category,
        description: m.description, elements: m.elements, objectif: m.objectif,
        prix_defaut: Number(m.prix_defaut) || 0, tva_defaut: Number(m.tva_defaut) || 20,
        unite: m.unite, is_unique: false, actif: m.actif, position: maxPos() + 1,
      })
      toast.success('Modèle dupliqué')
    } catch { /* */ }
  }

  const handleDelete = async (m: PrestationModel) => {
    if (!confirm(`Supprimer le modèle « ${m.titre} » ?`)) return
    try { await deleteM.mutateAsync(m.id); toast.success('Modèle supprimé') } catch { /* */ }
  }

  const toggleActif = (m: PrestationModel) =>
    updateM.mutate({ id: m.id, actif: !m.actif })

  const move = async (index: number, dir: -1 | 1) => {
    const a = sorted[index]
    const b = sorted[index + dir]
    if (!a || !b) return
    await Promise.all([
      updateM.mutateAsync({ id: a.id, position: b.position }),
      updateM.mutateAsync({ id: b.id, position: a.position }),
    ])
  }

  const handleRestoreDefaults = async () => {
    if (missingDefaults.length === 0) { toast.info('Tous les modèles par défaut sont déjà présents'); return }
    setSeeding(true)
    try {
      let pos = maxPos()
      for (const t of missingDefaults) {
        pos += 1
        await createM.mutateAsync(defaultSeedPayload(t, pos))
      }
      toast.success(`${missingDefaults.length} modèle(s) par défaut ajouté(s)`)
    } catch {
      toast.error('Erreur lors de la restauration')
    } finally {
      setSeeding(false)
    }
  }

  const busy = createM.isPending || updateM.isPending || deleteM.isPending

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link to="../parametres" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="page-title flex items-center gap-2">
          <Library className="w-5 h-5 text-blue-600" />
          Modèles de prestations
        </h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Gérez la bibliothèque de prestations proposée lors de la création d'un devis.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openNew} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-0">
          <Plus className="w-4 h-4" /> Nouveau modèle
        </Button>
        <Button variant="outline" onClick={handleRestoreDefaults} disabled={seeding || missingDefaults.length === 0}
          className="gap-1.5">
          {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          Restaurer les modèles par défaut
          {missingDefaults.length > 0 && ` (${missingDefaults.length})`}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : sorted.length === 0 ? (
        <div className="card-premium p-10 text-center space-y-3">
          <Package className="w-8 h-8 mx-auto text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            Aucun modèle personnalisé pour l'instant.<br />
            Les 20 modèles par défaut restent disponibles dans l'éditeur de devis.
          </p>
          <Button onClick={handleRestoreDefaults} disabled={seeding} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-0">
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Importer les 20 modèles par défaut
          </Button>
        </div>
      ) : (
        <div className="card-premium divide-y divide-border overflow-hidden">
          {sorted.map((m, i) => (
            <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${!m.actif ? 'opacity-55' : ''}`}>
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0 || busy}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === sorted.length - 1 || busy}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{m.titre}</p>
                  {m.is_unique && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">unique</span>}
                  {!m.actif && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">inactif</span>}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {m.category}{(Number(m.prix_defaut) || 0) > 0 && ` · ${(Number(m.prix_defaut)).toLocaleString('fr-FR')} MAD`}
                </p>
              </div>
              <button onClick={() => toggleActif(m)} title={m.actif ? 'Désactiver' : 'Activer'}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${m.actif ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <span className={`pointer-events-none inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${m.actif ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(m)} title="Modifier" className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDuplicate(m)} title="Dupliquer" className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(m)} title="Supprimer" className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Formulaire création / édition ── */}
      <Dialog open={formOpen} onOpenChange={v => { if (!v) setFormOpen(false) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le modèle' : 'Nouveau modèle'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="form-label">Titre *</label>
              <Input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
                placeholder="Ex : Site web professionnel" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Catégorie</label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESTATION_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Type (technique)</label>
                <Input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="custom" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm resize-y" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Éléments (une ligne par puce)</label>
              <textarea value={form.elements} onChange={e => setForm(f => ({ ...f, elements: e.target.value }))}
                rows={6} className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm resize-y font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Objectif</label>
              <textarea value={form.objectif} onChange={e => setForm(f => ({ ...f, objectif: e.target.value }))}
                rows={2} className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm resize-y" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Prix HT défaut</label>
                <Input type="number" min={0} value={form.prix_defaut} onChange={e => setForm(f => ({ ...f, prix_defaut: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">TVA (%)</label>
                <Input type="number" min={0} value={form.tva_defaut} onChange={e => setForm(f => ({ ...f, tva_defaut: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Unité</label>
                <Input value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <button type="button" onClick={() => setForm(f => ({ ...f, is_unique: !f.is_unique }))}
                  className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${form.is_unique ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${form.is_unique ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                Un seul par devis (unique)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <button type="button" onClick={() => setForm(f => ({ ...f, actif: !f.actif }))}
                  className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${form.actif ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${form.actif ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                Actif
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} className="gap-1">
              <X className="w-3.5 h-3.5" /> Annuler
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy}
              className="gap-1 bg-blue-600 hover:bg-blue-700 text-white border-0">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
