/**
 * /my-space/sops — list + detail view of SOPs filtered by member access.
 * Reuses SopRenderer from the existing /sop page if present, else inline.
 */
import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  BookOpen, Search, ChevronLeft, Loader2, Eye, Clock, Star, FileText, Plus, Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { mySpaceApi } from '@/lib/api'
import { SOP_CATEGORY_BY_KEY } from '@/lib/sopCategories'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SopBlock } from '@/hooks/useSops'
import { SopBlocksRenderer } from '@/components/sop/SopBlocksRenderer'
import { SopAuthorship } from '@/components/sop/SopAuthorship'
import SopEditor from '@/components/SopEditor'

interface SopRow {
  id: string; slug: string; title: string; description: string | null;
  category: string; tags: string[]; author: string | null; author_bg: string;
  read_min: number; views: number; popular: boolean; blocks: any[];
  created_by_name: string | null; updated_by_name: string | null;
  can_edit?: boolean;
  created_at: string; updated_at: string;
}

export default function MySops() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const initialCat = params.get('category') ?? null
  const [activeCat, setActiveCat] = useState<string | null>(initialCat)
  const [query, setQuery] = useState('')
  const [openSop, setOpenSop] = useState<SopRow | null>(null)
  /* null = fermé · 'new' = création · SopRow = édition */
  const [editing, setEditing] = useState<SopRow | 'new' | null>(null)

  useEffect(() => {
    setActiveCat(params.get('category'))
  }, [params])

  const { data: sops = [], isLoading } = useQuery<SopRow[]>({
    queryKey: ['my-space', 'sops'],
    queryFn:  () => mySpaceApi.sops() as Promise<SopRow[]>,
    staleTime: 60_000,
  })

  /* Catégories où le niveau « Édition (formateur) » m'a été accordé.
     Vide = le membre reste en lecture seule, aucun bouton n'apparaît. */
  const { data: editableCats = [] } = useQuery<string[]>({
    queryKey: ['my-space', 'sops', 'editable'],
    queryFn:  () => mySpaceApi.editableSopCategories(),
    staleTime: 5 * 60_000,
  })
  const canContribute = editableCats.length > 0

  const saveSop = async (payload: {
    title: string; description: string | null; category: string
    tags: string[]; read_min: number; blocks: SopBlock[]
  }) => {
    try {
      const saved = editing && editing !== 'new'
        ? await mySpaceApi.updateSop(editing.id, payload)
        : await mySpaceApi.createSop(payload)
      await qc.invalidateQueries({ queryKey: ['my-space', 'sops'] })
      /* La fiche ouverte doit refléter la version enregistrée, y compris
         le « Modifié par » que le serveur vient de poser. */
      if (openSop && saved?.id === openSop.id) setOpenSop(saved as SopRow)
      toast.success(editing === 'new' ? 'SOP ajoutée' : 'SOP mise à jour')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer la SOP")
      throw e
    }
  }

  const accessibleCats = useMemo(() => {
    const set = new Set<string>()
    sops.forEach(s => set.add(s.category))
    return Array.from(set)
  }, [sops])

  const filtered = useMemo(() => {
    let list = sops
    if (activeCat) list = list.filter(s => s.category === activeCat)
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [sops, activeCat, query])

  /* L'éditeur est monté dans les deux vues (liste et fiche) : le membre
     peut ouvrir une SOP puis cliquer « Modifier » sans revenir en arrière. */
  const editor = (
    <SopEditor
      open={editing !== null}
      existing={editing && editing !== 'new' ? (editing as any) : null}
      initialCategory={editing === 'new' ? (activeCat ?? undefined) : undefined}
      allowedCategories={editableCats}
      hidePopular
      onSubmit={saveSop}
      onClose={() => setEditing(null)}
    />
  )

  /* Detail view */
  if (openSop) {
    /* Log view once */
    mySpaceApi.logSop(openSop.id, 'sop_viewed').catch(() => {})
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setOpenSop(null)}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <ChevronLeft className="w-4 h-4" /> Retour à mes SOPs
          </button>
          {openSop.can_edit && (
            <Button size="sm" variant="outline" onClick={() => setEditing(openSop)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Modifier
            </Button>
          )}
        </div>
        <SopDetail sop={openSop} />
        {editor}
      </div>
    )
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" /> Mes SOPs
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sops.length} procédure{sops.length > 1 ? 's' : ''} accessible{sops.length > 1 ? 's' : ''}
            {canContribute && ` · ${editableCats.length} modifiable${editableCats.length > 1 ? 's' : ''} par vous`}.
          </p>
        </div>
        {canContribute && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4 mr-1.5" /> Nouvelle SOP
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Rechercher dans mes SOPs…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Category filter chips */}
      {accessibleCats.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <FilterChip active={activeCat === null} onClick={() => { setActiveCat(null); setParams({}) }}>
            Toutes ({sops.length})
          </FilterChip>
          {accessibleCats.map(c => {
            const meta = SOP_CATEGORY_BY_KEY[c]
            const count = sops.filter(s => s.category === c).length
            return (
              <FilterChip
                key={c}
                active={activeCat === c}
                onClick={() => { setActiveCat(c); setParams({ category: c }) }}
              >
                {meta?.emoji ?? '📚'} {meta?.label ?? c} ({count})
              </FilterChip>
            )
          })}
        </div>
      )}

      {/* SOPs list */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sops.length === 0 ? "Aucune SOP n'est encore accessible." : 'Aucune SOP ne correspond à votre recherche.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((s, i) => {
            const meta = SOP_CATEGORY_BY_KEY[s.category]
            return (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => setOpenSop(s)}
                className="text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0', meta?.bg ?? 'bg-slate-100 dark:bg-slate-800')}>
                    {meta?.emoji ?? '📚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {s.popular && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-300 line-clamp-1">
                        {s.title}
                      </h3>
                    </div>
                    {s.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{s.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 dark:text-slate-500 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {s.read_min} min</span>
                      <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {s.views}</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', meta?.bg, meta?.text)}>
                        {meta?.label ?? s.category}
                      </span>
                      <SopAuthorship
                        compact
                        createdBy={s.created_by_name}
                        updatedBy={s.updated_by_name}
                        className="max-w-[10rem]"
                      />
                    </div>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </div>
      )}
      {editor}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700',
      )}
    >
      {children}
    </button>
  )
}

function SopDetail({ sop }: { sop: SopRow }) {
  const meta = SOP_CATEGORY_BY_KEY[sop.category]
  return (
    <article className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <header className={cn('p-6 border-b border-slate-200 dark:border-slate-800', meta?.bg ?? 'bg-slate-50 dark:bg-slate-900')}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-2xl shadow-sm">
            {meta?.emoji ?? '📚'}
          </div>
          <div className="flex-1 min-w-0">
            <div className={cn('text-xs font-semibold', meta?.text ?? 'text-slate-500')}>
              {meta?.label ?? sop.category}
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{sop.title}</h1>
            {sop.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{sop.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {sop.read_min} min de lecture</span>
              <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" /> {sop.blocks?.length ?? 0} sections</span>
              {sop.author && <span>• {sop.author}</span>}
            </div>
            <SopAuthorship
              createdBy={sop.created_by_name}
              updatedBy={sop.updated_by_name}
              className="mt-2 text-xs text-slate-500 dark:text-slate-400"
            />
          </div>
        </div>
      </header>
      <div className="p-6 sop-content">
        <SopBlocksRenderer blocks={sop.blocks ?? []} />
      </div>
    </article>
  )
}
