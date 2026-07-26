/**
 * PrestationLibraryDialog — « Bibliothèque des prestations ».
 * Deux onglets :
 *   1. Prestations : catalogue de modèles (+ prestations enregistrées en base),
 *      recherche, filtre par catégorie, sélection multiple, aperçu, ajout.
 *   2. Modèles de devis : structures complètes prêtes à l'emploi.
 * Le dialog ne fait que sélectionner : l'insertion réelle (variables, doublons,
 * numérotation) est gérée par le parent (page Devis).
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, Check, Package, LayoutTemplate, Library, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { produitsApi } from '@/lib/api'
import { usePrestationModels } from '@/hooks/usePrestationModels'
import {
  PRESTATION_TEMPLATES, PRESTATION_CATEGORIES, DEVIS_TEMPLATE_PRESETS,
  templateBaseTitle, dbModelToTemplate,
  type PrestationTemplate, type PrestationCategory, type DevisTemplatePreset,
} from '@/lib/prestationTemplates'

interface SavedProduit { id: string; nom: string; description?: string | null; prix_ht: number; tva?: number; unite?: string }

interface Props {
  open: boolean
  onClose: () => void
  /** Prestations sélectionnées (modèles) à ajouter au devis. */
  onAddTemplates: (tpls: PrestationTemplate[]) => void
  /** Application d'un modèle de devis complet. */
  onApplyDevisPreset: (preset: DevisTemplatePreset) => void
  /** Titres de base normalisés déjà présents (pour signaler les doublons). */
  existingBaseTitles: Set<string>
}

/** Convertit une prestation enregistrée (table produits) en modèle. */
function produitToTemplate(p: SavedProduit): PrestationTemplate {
  const elements = (p.description ?? '')
    .split('\n')
    .map(l => l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return {
    key: `saved-${p.id}`, type: 'saved', category: 'Prestations personnalisées',
    titre: p.nom,
    description: elements.length > 1 ? '' : (elements[0] ?? ''),
    elements: elements.length > 1 ? elements : [],
    objectif: '',
    prixDefaut: p.prix_ht ?? 0, tvaDefaut: p.tva ?? 20, unite: p.unite ?? 'projet', unique: false,
  }
}

export default function PrestationLibraryDialog({
  open, onClose, onAddTemplates, onApplyDevisPreset, existingBaseTitles,
}: Props) {
  const [tab, setTab]           = useState<'prestations' | 'devis'>('devis')
  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState<PrestationCategory | 'all'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview]   = useState<string | null>(null)

  /* Prestations enregistrées en base (réutilise la table produits existante). */
  const { data: saved = [] } = useQuery<SavedProduit[]>({
    queryKey: ['produits'],
    queryFn:  () => produitsApi.list({ orderBy: 'nom', order: 'asc' }) as Promise<SavedProduit[]>,
    staleTime: 1000 * 60 * 5,
    enabled: open,
  })

  /* Modèles gérés en base (page Réglages → Modèles de prestations).
     Tant que la bibliothèque n'est pas personnalisée, on affiche les 20
     modèles par défaut définis dans le code. */
  const { data: dbModels = [] } = usePrestationModels()
  const dbTemplates = useMemo(
    () => dbModels.filter(m => m.actif).map(dbModelToTemplate),
    [dbModels],
  )

  const allTemplates: PrestationTemplate[] = useMemo(() => {
    const base = dbTemplates.length > 0 ? dbTemplates : PRESTATION_TEMPLATES
    return [...base, ...saved.map(produitToTemplate)]
  }, [dbTemplates, saved])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allTemplates.filter(t => {
      if (category !== 'all' && t.category !== category) return false
      if (!q) return true
      return (
        t.titre.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.elements.some(e => e.toLowerCase().includes(q))
      )
    })
  }, [allTemplates, search, category])

  const toggle = (key: string) =>
    setSelected(s => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  const reset = () => { setSelected(new Set()); setSearch(''); setCategory('all'); setPreview(null) }

  const handleAdd = () => {
    const tpls = allTemplates.filter(t => selected.has(t.key))
    if (tpls.length === 0) return
    onAddTemplates(tpls)
    reset()
  }

  const close = () => { reset(); onClose() }

  const previewTpl = preview ? allTemplates.find(t => t.key === preview) : null

  const isDuplicate = (t: PrestationTemplate) =>
    t.unique && existingBaseTitles.has(templateBaseTitle(t))

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close() }}>
      <DialogContent className="max-w-3xl w-[95vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Library className="w-4 h-4 text-blue-600" />
            Modèles de devis
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as 'prestations' | 'devis')} className="w-full">

          {/* ── Onglet Prestations (masqué) ── */}
          <TabsContent value="prestations" className="mt-0">
            {/* Recherche + catégories */}
            <div className="px-5 pt-3 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher une prestation…"
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {(['all', ...PRESTATION_CATEGORIES] as const).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c as PrestationCategory | 'all')}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      category === c
                        ? 'bg-blue-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {c === 'all' ? 'Toutes' : c}
                  </button>
                ))}
              </div>
            </div>

            {/* Liste + aperçu */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-0 mt-3 border-t border-border">
              <div className="max-h-[46vh] overflow-y-auto divide-y divide-border">
                {filtered.length === 0 ? (
                  <div className="py-14 text-center text-sm text-muted-foreground">
                    <Package className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    Aucun modèle trouvé
                  </div>
                ) : filtered.map(t => {
                  const on  = selected.has(t.key)
                  const dup = isDuplicate(t)
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onMouseEnter={() => setPreview(t.key)}
                      onClick={() => { setPreview(t.key); if (!dup) toggle(t.key) }}
                      className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                        on ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-muted/50'
                      } ${dup ? 'opacity-60' : ''}`}
                    >
                      <span className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border ${
                        on ? 'bg-blue-600 border-blue-600' : 'border-muted-foreground/40'
                      }`}>
                        {on && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{t.titre}</p>
                          {dup && <span className="text-[10px] text-amber-600 font-medium flex-shrink-0">déjà ajouté</span>}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{t.category}</p>
                      </div>
                      {t.prixDefaut > 0 && (
                        <span className="text-[11px] font-mono font-semibold text-foreground flex-shrink-0 mt-0.5">
                          {t.prixDefaut.toLocaleString('fr-FR')} MAD
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Aperçu */}
              <div className="hidden md:block border-l border-border bg-muted/20 max-h-[46vh] overflow-y-auto p-4">
                {previewTpl ? (
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-foreground">{previewTpl.titre}</p>
                    {previewTpl.description && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{previewTpl.description}</p>
                    )}
                    {previewTpl.elements.length > 0 && (
                      <ul className="space-y-1 mt-1">
                        {previewTpl.elements.map((e, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11px] text-foreground/80">
                            <span className="w-1 h-1 rounded-full bg-blue-600 flex-shrink-0 mt-1.5" />
                            {e}
                          </li>
                        ))}
                      </ul>
                    )}
                    {previewTpl.objectif && (
                      <p className="text-[11px] text-foreground/70 mt-2 leading-relaxed">
                        <span className="font-semibold">Objectif :</span> {previewTpl.objectif}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center mt-8">
                    Survolez un modèle pour l'aperçu
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
              <span className="text-xs text-muted-foreground">
                {selected.size > 0 ? `${selected.size} sélectionné(s)` : 'Sélectionnez un ou plusieurs modèles'}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={close} className="text-xs">
                  <X className="w-3.5 h-3.5 mr-1" /> Annuler
                </Button>
                <Button size="sm" onClick={handleAdd} disabled={selected.size === 0}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter au devis{selected.size > 0 ? ` (${selected.size})` : ''}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Onglet Modèles de devis ── */}
          <TabsContent value="devis" className="mt-0">
            <div className="max-h-[52vh] overflow-y-auto p-4 space-y-2.5">
              <p className="text-xs text-muted-foreground px-1">
                Un modèle de devis crée d'un coup toute la structure des prestations. Vous pourrez ensuite tout modifier.
              </p>
              {DEVIS_TEMPLATE_PRESETS.map(preset => (
                <div key={preset.key}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border p-3.5 hover:border-blue-500/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{preset.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{preset.desc}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{preset.modelKeys.length} prestations</p>
                  </div>
                  <Button size="sm" onClick={() => { onApplyDevisPreset(preset); close() }}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0">
                    Utiliser
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
