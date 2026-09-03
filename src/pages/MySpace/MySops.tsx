/**
 * /my-space/sops — bibliothèque de procédures du membre.
 *
 * Lecture, rédaction et cycle de vie complet : création, modification,
 * duplication, favoris, archivage, suppression et historique des
 * versions. Tout passe par /api/my-space/sops, qui revérifie les droits
 * à chaque appel : masquer un bouton ici n'interdit rien côté serveur.
 *
 * Les catégories affichées ne viennent pas d'une liste en dur mais des
 * accès réellement accordés au membre (team_member_sop_access) — une
 * catégorie créée à la volée apparaît donc sans redéploiement.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Search, ChevronLeft, Loader2, Eye, Clock, Star, FileText,
  Plus, Pencil, Copy, Archive, Trash2, MoreVertical, History, RotateCcw,
  X, ArchiveRestore, Image as ImageIcon, AlertTriangle, Gauge,
} from 'lucide-react'
import { toast } from 'sonner'
import { mySpaceApi, type SopRow, type SopVersion } from '@/lib/api'
import { SOP_CATEGORY_BY_KEY } from '@/lib/sopCategories'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SopBlocksRenderer } from '@/components/sop/SopBlocksRenderer'
import { SopAuthorship } from '@/components/sop/SopAuthorship'
import SopEditor from '@/components/SopEditor'

type Filter = { kind: 'all' } | { kind: 'favorites' } | { kind: 'archived' } | { kind: 'category'; key: string }

const DIFFICULTY_LABEL: Record<string, { label: string; cls: string }> = {
  facile:    { label: 'Facile',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  moyen:     { label: 'Moyen',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  difficile: { label: 'Difficile', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Brouillon', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  archived: { label: 'Archivé',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
}

/** Libellé d'une catégorie : celles du référentiel ont un nom soigné,
 *  les catégories maison s'affichent telles qu'elles ont été saisies. */
const catLabel = (key: string) => SOP_CATEGORY_BY_KEY[key]?.label ?? key
const catEmoji = (key: string) => SOP_CATEGORY_BY_KEY[key]?.emoji ?? '📚'
const catBg    = (key: string) => SOP_CATEGORY_BY_KEY[key]?.bg ?? 'bg-slate-100 dark:bg-slate-800'
const catText  = (key: string) => SOP_CATEGORY_BY_KEY[key]?.text ?? 'text-slate-600 dark:text-slate-300'

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const longDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function MySops() {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()

  const initialCat = params.get('category')
  const [filter, setFilter] = useState<Filter>(
    initialCat ? { kind: 'category', key: initialCat } : { kind: 'all' },
  )
  const [query, setQuery]         = useState('')
  const [openId, setOpenId]       = useState<string | null>(null)
  const [editing, setEditing]     = useState<SopRow | 'new' | null>(null)
  const [confirmDel, setConfirmDel] = useState<SopRow | null>(null)
  const [historyFor, setHistoryFor] = useState<SopRow | null>(null)
  const [busyId, setBusyId]       = useState<string | null>(null)

  useEffect(() => {
    const c = params.get('category')
    setFilter(c ? { kind: 'category', key: c } : f => (f.kind === 'category' ? { kind: 'all' } : f))
  }, [params])

  /* Les archivés vivent dans une requête distincte : les mélanger
     obligerait à les filtrer partout ailleurs. */
  const listStatus = filter.kind === 'archived' ? 'archived' as const : undefined
  const { data: sops = [], isLoading } = useQuery<SopRow[]>({
    queryKey: ['my-space', 'sops', listStatus ?? 'active'],
    queryFn:  () => mySpaceApi.sops(listStatus ? { status: listStatus } : undefined),
    staleTime: 30_000,
  })

  const { data: editableCats = [] } = useQuery<string[]>({
    queryKey: ['my-space', 'sops', 'editable'],
    queryFn:  () => mySpaceApi.editableSopCategories(),
    staleTime: 5 * 60_000,
  })
  const canContribute = editableCats.length > 0

  /* Fiche ouverte : requête dédiée pour obtenir les images et le
     contenu à jour après une modification. */
  const { data: openSop } = useQuery({
    queryKey: ['my-space', 'sop', openId],
    queryFn:  () => mySpaceApi.sop(openId!),
    enabled:  !!openId,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['my-space', 'sops'] })
    if (openId) qc.invalidateQueries({ queryKey: ['my-space', 'sop', openId] })
  }

  /* ── Actions ─────────────────────────────────────────────────── */
  const withBusy = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id)
    try {
      await fn()
      refresh()
      toast.success(ok)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Action impossible')
    } finally {
      setBusyId(null)
    }
  }

  const toggleFavorite = (s: SopRow) =>
    withBusy(s.id, () => mySpaceApi.setSopFavorite(s.id, !s.is_favorite),
      s.is_favorite ? 'Retiré des favoris' : 'Ajouté à vos favoris')

  const duplicate = (s: SopRow) =>
    withBusy(s.id, () => mySpaceApi.duplicateSop(s.id),
      'Copie créée en brouillon — à vous de la compléter')

  const setStatus = (s: SopRow, status: 'draft' | 'active' | 'archived') =>
    withBusy(s.id, () => mySpaceApi.setSopStatus(s.id, status),
      status === 'archived' ? 'SOP archivé' : status === 'active' ? 'SOP restauré' : 'Repassé en brouillon')

  const doDelete = async (s: SopRow) => {
    setConfirmDel(null)
    await withBusy(s.id, () => mySpaceApi.deleteSop(s.id), 'SOP supprimé')
    if (openId === s.id) setOpenId(null)
  }

  const saveSop = async (payload: any) => {
    try {
      const saved = editing && editing !== 'new'
        ? await mySpaceApi.updateSop(editing.id, payload)
        : await mySpaceApi.createSop(payload)
      refresh()
      qc.invalidateQueries({ queryKey: ['my-space', 'sops', 'editable'] })
      toast.success(editing === 'new' ? 'SOP enregistré avec succès' : 'Modifications enregistrées')
      if (editing === 'new') setOpenId(saved.id)
    } catch (e: unknown) {
      /* On relance : l'éditeur garde alors la modale ouverte et le
         contenu saisi n'est pas perdu. */
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer")
      throw e
    }
  }

  /* ── Filtres et recherche ────────────────────────────────────── */
  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sops) m.set(s.category, (m.get(s.category) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [sops])

  const favCount = useMemo(() => sops.filter(s => s.is_favorite).length, [sops])

  const filtered = useMemo(() => {
    let list = sops
    if (filter.kind === 'category')  list = list.filter(s => s.category === filter.key)
    if (filter.kind === 'favorites') list = list.filter(s => s.is_favorite)

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        catLabel(s.category).toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        /* Le contenu aussi : c'est souvent le seul endroit où figure le
           mot qu'on cherche (un nom de commande, un message d'erreur). */
        JSON.stringify(s.blocks ?? []).toLowerCase().includes(q),
      )
    }
    return list
  }, [sops, filter, query])

  const editor = (
    <SopEditor
      open={editing !== null}
      existing={editing && editing !== 'new' ? (editing as any) : null}
      initialCategory={editing === 'new' && filter.kind === 'category' ? filter.key : undefined}
      allowedCategories={editableCats}
      hidePopular
      showLifecycle
      allowCustomCategory
      onUploadImage={async (file) => mySpaceApi.uploadSopImage(file)}
      onSubmit={saveSop}
      onClose={() => setEditing(null)}
    />
  )

  /* ══ Fiche détaillée ═══════════════════════════════════════════ */
  if (openId && openSop) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setOpenId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <ChevronLeft className="w-4 h-4" /> Retour à mes SOPs
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleFavorite(openSop as any)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              title={(openSop as any).is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <Star className={cn('w-4 h-4', (openSop as any).is_favorite
                ? 'text-amber-500 fill-amber-500' : 'text-slate-400')} />
            </button>
            <Button size="sm" variant="secondary" onClick={() => setHistoryFor(openSop as any)}>
              <History className="w-3.5 h-3.5 mr-1.5" /> Historique
            </Button>
            {openSop.can_edit && (
              <Button size="sm" onClick={() => setEditing(openSop as any)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Modifier
              </Button>
            )}
          </div>
        </div>

        <SopDetail sop={openSop as any} />
        {editor}
        {historyFor && (
          <HistoryDialog
            sop={historyFor}
            onClose={() => setHistoryFor(null)}
            onRestored={() => { setHistoryFor(null); refresh() }}
          />
        )}
      </div>
    )
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
  }

  /* ══ Liste ═════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" /> Mes SOPs
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sops.length} procédure{sops.length > 1 ? 's' : ''} accessible{sops.length > 1 ? 's' : ''}
            {canContribute && ` · ${editableCats.length} catégorie${editableCats.length > 1 ? 's' : ''} modifiable${editableCats.length > 1 ? 's' : ''}`}.
          </p>
        </div>
        {canContribute && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4 mr-1.5" /> Nouveau SOP
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Rechercher dans mes SOPs… (titre, description, catégorie, contenu)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filtres — même style de puces qu'avant */}
      <div className="flex gap-2 flex-wrap">
        <Chip active={filter.kind === 'all'} onClick={() => { setFilter({ kind: 'all' }); setParams({}) }}>
          Toutes ({sops.length})
        </Chip>
        <Chip active={filter.kind === 'favorites'} onClick={() => { setFilter({ kind: 'favorites' }); setParams({}) }}>
          ⭐ Favoris ({favCount})
        </Chip>
        <Chip active={filter.kind === 'archived'} onClick={() => { setFilter({ kind: 'archived' }); setParams({}) }}>
          📦 Archivés
        </Chip>
        {filter.kind !== 'archived' && categories.map(([key, count]) => (
          <Chip
            key={key}
            active={filter.kind === 'category' && filter.key === key}
            onClick={() => { setFilter({ kind: 'category', key }); setParams({ category: key }) }}
          >
            {catEmoji(key)} {catLabel(key)} ({count})
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filter.kind === 'archived'  ? 'Aucun SOP archivé.'
             : filter.kind === 'favorites' ? "Aucun favori — cliquez l'étoile d'un SOP pour le retrouver ici."
             : sops.length === 0 ? "Aucune SOP n'est encore accessible."
             : 'Aucune SOP ne correspond à votre recherche.'}
          </p>
          {canContribute && filter.kind !== 'archived' && (
            <Button size="sm" className="mt-4" onClick={() => setEditing('new')}>
              <Plus className="w-4 h-4 mr-1.5" /> Nouveau SOP
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((s, i) => (
            <SopCard
              key={s.id}
              sop={s}
              index={i}
              busy={busyId === s.id}
              onOpen={() => setOpenId(s.id)}
              onFavorite={() => toggleFavorite(s)}
              onEdit={() => setEditing(s)}
              onDuplicate={() => duplicate(s)}
              onArchive={() => setStatus(s, s.status === 'archived' ? 'active' : 'archived')}
              onDelete={() => setConfirmDel(s)}
              onHistory={() => setHistoryFor(s)}
            />
          ))}
        </div>
      )}

      {editor}
      {confirmDel && (
        <ConfirmDelete
          sop={confirmDel}
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => doDelete(confirmDel)}
        />
      )}
      {historyFor && (
        <HistoryDialog
          sop={historyFor}
          onClose={() => setHistoryFor(null)}
          onRestored={() => { setHistoryFor(null); refresh() }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

/** Carte de la liste — volontairement sobre : titre, résumé, quelques
 *  repères, et un menu pour tout le reste. */
function SopCard({
  sop, index, busy, onOpen, onFavorite, onEdit, onDuplicate, onArchive, onDelete, onHistory,
}: {
  sop: SopRow; index: number; busy: boolean
  onOpen: () => void; onFavorite: () => void; onEdit: () => void
  onDuplicate: () => void; onArchive: () => void; onDelete: () => void; onHistory: () => void
}) {
  const [menu, setMenu] = useState(false)
  const fav  = sop.is_favorite as boolean
  const diff = sop.difficulty ? DIFFICULTY_LABEL[sop.difficulty] : null
  const st   = STATUS_LABEL[sop.status]

  /* Fermeture au clic extérieur : un voile plein écran ferait écran aux
     clics sur la carte elle-même. */
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.02 }}
      className={cn(
        'relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4',
        'hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all group',
        busy && 'opacity-60 pointer-events-none',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onOpen}
          className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0', catBg(sop.category))}
          title="Ouvrir"
        >
          {catEmoji(sop.category)}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <button onClick={onFavorite} className="mt-0.5 flex-shrink-0" title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
              <Star className={cn('w-3.5 h-3.5 transition-colors',
                fav ? 'text-amber-500 fill-amber-500' : 'text-slate-300 dark:text-slate-600 hover:text-amber-400')} />
            </button>
            <button onClick={onOpen} className="text-left min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-300 line-clamp-1">
                {sop.title}
              </h3>
            </button>
          </div>

          {sop.description && (
            <button onClick={onOpen} className="text-left w-full">
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{sop.description}</p>
            </button>
          )}

          <div className="flex items-center gap-2.5 mt-2 text-[11px] text-slate-400 dark:text-slate-500 flex-wrap">
            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {sop.read_min} min</span>
            <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {sop.views}</span>
            {!!sop.image_count && (
              <span className="inline-flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {sop.image_count}</span>
            )}
            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', catBg(sop.category), catText(sop.category))}>
              {catLabel(sop.category)}
            </span>
            {diff && <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', diff.cls)}>{diff.label}</span>}
            {st   && <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', st.cls)}>{st.label}</span>}
            <span title={`Dernière modification : ${longDate(sop.updated_at)}`}>
              modifié le {shortDate(sop.updated_at)}
            </span>
            <SopAuthorship compact createdBy={sop.created_by_name} updatedBy={sop.updated_by_name} className="max-w-[9rem]" />
          </div>
        </div>

        {/* Menu d'actions */}
        <div className="relative flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setMenu(v => !v) }}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
            aria-label="Actions"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.12 }}
                onClick={e => e.stopPropagation()}
                className="absolute right-0 top-9 z-20 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden py-1"
              >
                <MenuItem icon={Eye}     label="Voir"      onClick={() => { setMenu(false); onOpen() }} />
                {sop.can_edit && <MenuItem icon={Pencil} label="Modifier" onClick={() => { setMenu(false); onEdit() }} />}
                <MenuItem icon={History} label="Historique" onClick={() => { setMenu(false); onHistory() }} />
                {sop.can_edit && (
                  <>
                    <MenuItem icon={Copy} label="Dupliquer" onClick={() => { setMenu(false); onDuplicate() }} />
                    <MenuItem
                      icon={sop.status === 'archived' ? ArchiveRestore : Archive}
                      label={sop.status === 'archived' ? 'Restaurer' : 'Archiver'}
                      onClick={() => { setMenu(false); onArchive() }}
                    />
                    <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                    <MenuItem icon={Trash2} label="Supprimer" danger onClick={() => { setMenu(false); onDelete() }} />
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }: {
  icon: React.ElementType; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors text-left',
        danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
      )}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" /> {label}
    </button>
  )
}

/** Fiche complète : métadonnées, contenu, puis la galerie des images
 *  qui ne sont pas déjà posées dans le corps du SOP. */
function SopDetail({ sop }: { sop: SopRow }) {
  const diff = sop.difficulty ? DIFFICULTY_LABEL[sop.difficulty] : null
  const st   = STATUS_LABEL[sop.status]

  /* Une image posée dans le contenu ne doit pas réapparaître en bas. */
  const inlineIds = new Set(
    (sop.blocks ?? [])
      .map((b: { image?: { sopImageId?: string } }) => b?.image?.sopImageId)
      .filter(Boolean),
  )
  const gallery = (sop.images ?? []).filter(i => !inlineIds.has(i.id))

  return (
    <article className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <header className={cn('p-6 border-b border-slate-200 dark:border-slate-800', catBg(sop.category))}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-2xl shadow-sm flex-shrink-0">
            {catEmoji(sop.category)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-xs font-semibold', catText(sop.category))}>{catLabel(sop.category)}</span>
              {diff && <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', diff.cls)}>{diff.label}</span>}
              {st   && <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', st.cls)}>{st.label}</span>}
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{sop.title}</h1>
            {sop.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{sop.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {sop.read_min} min de lecture</span>
              <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" /> {sop.blocks?.length ?? 0} sections</span>
              <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {sop.views} consultations</span>
              {!!gallery.length && (
                <span className="inline-flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {gallery.length} image{gallery.length > 1 ? 's' : ''}</span>
              )}
              {sop.difficulty && (
                <span className="inline-flex items-center gap-1"><Gauge className="w-3 h-3" /> {DIFFICULTY_LABEL[sop.difficulty]?.label}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
              <span>Créé le {shortDate(sop.created_at)}</span>
              <span>· Modifié le {longDate(sop.updated_at)}</span>
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
        <SopBlocksRenderer blocks={sop.blocks ?? []} imageAuth="member" />
      </div>

      {gallery.length > 0 && (
        <div className="px-6 pb-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Images jointes ({gallery.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gallery.map((img) => (
              <SopBlocksRenderer
                key={img.id}
                imageAuth="member"
                blocks={[{ type: 'image', image: { sopImageId: img.id, caption: img.caption ?? img.filename } } as any]}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

/** Confirmation de suppression — action irréversible, on le dit. */
function ConfirmDelete({ sop, onCancel, onConfirm }: {
  sop: SopRow; onCancel: () => void; onConfirm: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
      >
        <div className="p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Êtes-vous sûr de vouloir supprimer ce SOP ?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              <strong className="text-slate-900 dark:text-slate-100">{sop.title}</strong>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Cette action est irréversible. Le contenu, les images et l'historique
              des versions seront supprimés. Pour simplement le retirer des listes,
              utilisez « Archiver ».
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
          <Button size="sm" variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button
            size="sm"
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white border-red-600"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Supprimer
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

/** Historique des versions, avec restauration. */
function HistoryDialog({ sop, onClose, onRestored }: {
  sop: SopRow; onClose: () => void; onRestored: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-space', 'sop', sop.id, 'versions'],
    queryFn:  () => mySpaceApi.sopVersions(sop.id),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const restore = async (v: SopVersion) => {
    setBusy(v.id)
    try {
      await mySpaceApi.restoreSopVersion(sop.id, v.id)
      toast.success(`Version ${v.version_number} restaurée`)
      onRestored()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Restauration impossible')
    } finally {
      setBusy(null)
    }
  }

  const versions = data?.versions ?? []

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              Historique — {sop.title}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune version antérieure — ce SOP n'a pas encore été modifié.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map(v => (
                <div
                  key={v.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                >
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex-shrink-0">
                    v{v.version_number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{v.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {longDate(v.created_at)} · {v.author_name || 'Inconnu'} · {v.block_count} section{v.block_count > 1 ? 's' : ''}
                    </p>
                  </div>
                  {data?.can_restore && (
                    <Button size="sm" variant="secondary" disabled={busy === v.id} onClick={() => restore(v)}>
                      {busy === v.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                      Restaurer
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Restaurer une version remplace le contenu actuel — qui est lui-même
            archivé au passage, la restauration reste donc annulable. La catégorie
            et le statut ne sont pas modifiés.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
