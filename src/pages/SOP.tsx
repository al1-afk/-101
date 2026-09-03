import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, MessageSquare, Zap, Briefcase, UserPlus, Rocket, LifeBuoy, FolderKanban, Code2,
  Megaphone, HelpCircle, Sparkles, Home, Search, Star, Clock,
  Filter, Plus, ChevronRight, Copy, Share2, Pencil, Download,
  CheckCircle2, ArrowLeft, FileText, Tag as TagIcon, Eye,
  TrendingUp, Bookmark, BookmarkCheck, MoreHorizontal, Users, UserSearch, Palette, HandCoins, AtSign,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Badge }  from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import SopEditor from '@/components/SopEditor'
import { SopAuthorship } from '@/components/sop/SopAuthorship'
import { useSops, useDeleteSop, type Sop as DbSop } from '@/hooks/useSops'
import { useAuth } from '@/hooks/useAuth'
import { parseRichText } from '@/components/sop/parseRichText'
import { detectVideo } from '@/components/sop/videoEmbed'
import { SopShareDialog } from '@/components/sop/SopShareDialog'
import { SopTrainingMode } from '@/components/sop/SopTrainingMode'
import { useSopShares } from '@/hooks/useSopCollab'
import { GraduationCap } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */
type CategoryKey =
  | 'home' | 'whatsapp' | 'quick' | 'sales' | 'onboarding'
  | 'delivery' | 'support' | 'marketing' | 'faq' | 'ai' | 'projets' | 'dev'
  | 'media_buyer' | 'prospection' | 'designer' | 'commercial' | 'community_manager'

interface Category {
  key:   CategoryKey
  label: string
  icon:  React.ElementType
  color: string
  bg:    string
  desc:  string
}

type BlockType =
  | 'heading' | 'heading2' | 'heading3'
  | 'paragraph' | 'list' | 'numbered' | 'checklist' | 'steps'
  | 'callout' | 'template' | 'code' | 'divider'
  | 'image' | 'table' | 'quote' | 'video'

interface SOPImageMeta {
  url:     string
  caption?:string
  size?:   'small' | 'medium' | 'large' | 'full'
  align?:  'left' | 'center' | 'right'
}

interface SOPTableMeta {
  headers: string[]
  rows:    string[][]
}

interface SOPVideoMeta {
  url:      string
  caption?: string
  size?:    'small' | 'medium' | 'large' | 'full'
  align?:   'left' | 'center' | 'right'
}

interface SOPBlock {
  type:    BlockType
  text?:   string
  items?:  string[]
  variant?:'info' | 'warning' | 'success' | 'tip' | 'danger'
  title?:  string
  image?:  SOPImageMeta
  table?:  SOPTableMeta
  video?:  SOPVideoMeta
}

interface SOP {
  id:        string
  title:     string
  description: string
  category:  CategoryKey
  tags:      string[]
  author:    string
  authorBg:  string
  updatedAt: string
  readMin:   number
  views:     number
  popular?:  boolean
  blocks:    SOPBlock[]
  /* Qui a ajouté / modifié — posé par le serveur, affiché tel quel. */
  createdByName?: string | null
  updatedByName?: string | null
  /* Cycle de vie (migration 098). Les SOPs du catalogue sont 'active' ;
     un membre peut créer un brouillon ou archiver depuis son espace, et
     l'admin doit le voir plutôt que de croire à une procédure publiée. */
  status?: 'draft' | 'active' | 'archived'
}

/* ═══════════════════════════════════════════════════════════════════
   CATEGORIES
   ═══════════════════════════════════════════════════════════════════ */
const CATEGORIES: Category[] = [
  { key: 'home',       label: 'Accueil SOP',         icon: Home,         color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-900/20',       desc: 'Vue d\'ensemble & accès rapide' },
  { key: 'whatsapp',   label: 'Scripts WhatsApp',    icon: MessageSquare,color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', desc: 'Messages prêts pour clients'   },
  { key: 'quick',      label: 'Réponses rapides',    icon: Zap,          color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/20',     desc: 'Snippets prêts à copier'        },
  { key: 'sales',      label: 'Process Commercial',  icon: Briefcase,    color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-50 dark:bg-violet-900/20',   desc: 'Qualification, closing, devis' },
  { key: 'onboarding', label: 'Onboarding Client',   icon: UserPlus,     color: 'text-cyan-600 dark:text-cyan-400',       bg: 'bg-cyan-50 dark:bg-cyan-900/20',       desc: 'Bienvenue & démarrage'         },
  { key: 'delivery',   label: 'Livraison Projet',    icon: Rocket,       color: 'text-pink-600 dark:text-pink-400',       bg: 'bg-pink-50 dark:bg-pink-900/20',       desc: 'Process de livraison & QA'     },
  { key: 'support',    label: 'Support Client',      icon: LifeBuoy,     color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-900/20',         desc: 'Réclamations & SAV'            },
  { key: 'marketing',  label: 'Marketing & Ads',     icon: Megaphone,    color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-900/20',   desc: 'Campagnes, retargeting, ROI'   },
  { key: 'faq',        label: 'FAQ Interne',         icon: HelpCircle,   color: 'text-teal-600 dark:text-teal-400',       bg: 'bg-teal-50 dark:bg-teal-900/20',       desc: 'Questions fréquentes équipe'   },
  { key: 'ai',         label: 'IA & Automatisation', icon: Sparkles,     color: 'text-purple-600 dark:text-purple-400',   bg: 'bg-purple-50 dark:bg-purple-900/20',   desc: 'Workflows IA & prompts'        },
  { key: 'projets',    label: 'Chef de projet',      icon: FolderKanban, color: 'text-violet-700 dark:text-violet-300',   bg: 'bg-violet-50 dark:bg-violet-900/20',   desc: 'Ouverture, suivi, livraison, KPIs' },
  { key: 'dev',        label: 'Développeur',         icon: Code2,        color: 'text-sky-700 dark:text-sky-300',         bg: 'bg-sky-50 dark:bg-sky-900/20',         desc: 'WordPress, Dokploy, Titan, IA' },
  { key: 'media_buyer',label: 'Media Buyer',         icon: Megaphone,    color: 'text-amber-700 dark:text-amber-300',     bg: 'bg-amber-50 dark:bg-amber-900/20',     desc: 'Facebook, TikTok, Google Ads, GMB' },
  { key: 'prospection',label: 'Prospection',         icon: UserSearch,   color: 'text-teal-700 dark:text-teal-300',       bg: 'bg-teal-50 dark:bg-teal-900/20',       desc: 'LinkedIn, WhatsApp, terrain, partenariats' },
  { key: 'designer',   label: 'Designer / Graphiste',icon: Palette,      color: 'text-rose-700 dark:text-rose-300',       bg: 'bg-rose-50 dark:bg-rose-900/20',       desc: 'Canva, Figma, charte, visuels, identité' },
  { key: 'commercial', label: 'Commercial',          icon: HandCoins,    color: 'text-green-700 dark:text-green-300',     bg: 'bg-green-50 dark:bg-green-900/20',     desc: 'Réunion, objections, closing, négociation, devis, suivi' },
  { key: 'community_manager', label: 'Community Manager', icon: AtSign, color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-50 dark:bg-violet-900/20', desc: 'Contenu organique, calendrier, engagement, stories, reels, reporting' },
]

/* SOPs statiques retirés au profit du seeding DB (migration 026) */
const SOPS: SOP[] = []

/* ═══════════════════════════════════════════════════════════════════
   STORAGE — favoris persistés localement
   ═══════════════════════════════════════════════════════════════════ */
const FAV_KEY = 'sop-favorites'
function loadFavs(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] }
}
function saveFavs(ids: string[]) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(ids)) } catch {}
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════ */
/* Convertit un SOP de la DB (snake_case) vers la forme du composant (camelCase + isUserCreated) */
/**
 * Cycle de vie d'un SOP, côté admin.
 *
 * Rien n'est affiché pour un SOP actif : c'est le cas normal, et un
 * badge sur 142 cartes n'apporterait que du bruit. En revanche un
 * brouillon ou un archivé DOIT se distinguer — sans ça, l'admin lit un
 * texte en cours de rédaction en le croyant applicable.
 */
function SopStatusBadge({ status }: { status?: 'draft' | 'active' | 'archived' }) {
  if (!status || status === 'active') return null
  const cfg = status === 'draft'
    ? { label: '✏️ Brouillon', cls: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' }
    : { label: '📦 Archivé',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' }
  return (
    <span
      className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-bold', cfg.cls)}
      title={status === 'draft'
        ? "Brouillon — en cours de rédaction, pas encore publié à l'équipe"
        : 'Archivé — retiré des listes des membres, conservé ici'}
    >
      {cfg.label}
    </span>
  )
}

function dbSopToView(s: DbSop): SOP & { isUserCreated: true; dbId: string } {
  return {
    id:          s.id,
    dbId:        s.id,
    title:       s.title,
    description: s.description ?? '',
    category:    (s.category as CategoryKey) ?? 'whatsapp',
    tags:        Array.isArray(s.tags) ? s.tags : [],
    author:      s.author ?? 'Vous',
    authorBg:    s.author_bg ?? 'bg-blue-500',
    updatedAt:   (s.updated_at ?? '').slice(0, 10),
    readMin:     s.read_min ?? 2,
    views:       s.views ?? 0,
    popular:     s.popular,
    blocks:      Array.isArray(s.blocks) ? (s.blocks as SOPBlock[]) : [],
    createdByName: (s as any).created_by_name ?? null,
    updatedByName: (s as any).updated_by_name ?? null,
    status:        ((s as any).status ?? 'active') as 'draft' | 'active' | 'archived',
    isUserCreated: true,
  }
}

export default function SOPPage() {
  const [activeCat,  setActiveCat]  = useState<CategoryKey>('home')
  const [query,      setQuery]      = useState('')
  const [openId,     setOpenId]     = useState<string | null>(null)
  const [favs,       setFavs]       = useState<string[]>(loadFavs)
  const [activeTag,  setActiveTag]  = useState<string | null>(null)
  const [onlyFavs,   setOnlyFavs]   = useState(false)
  const [onlyShared, setOnlyShared] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSop, setEditingSop] = useState<DbSop | null>(null)
  const [shareSopId, setShareSopId] = useState<string | null>(null)
  const [trainSopId, setTrainSopId] = useState<string | null>(null)

  const { role, userId } = useAuth()
  const canEdit  = role === 'admin' || role === 'manager'
  const canDelete = role === 'admin'

  const { data: dbSops = [] } = useSops()
  const { data: sopShares = [] } = useSopShares()
  const deleteSop = useDeleteSop()

  /* SOPs partagés avec moi (via sop_shares dont shared_with = userId) */
  const sharedWithMeIds = useMemo(() => {
    if (!userId) return new Set<string>()
    return new Set(
      sopShares.filter(s => s.shared_with === userId && s.is_active).map(s => s.sop_id),
    )
  }, [sopShares, userId])

  /* SOPs combinés : ceux créés par l'utilisateur (DB) en premier, puis les exemples statiques */
  const ALL_SOPS = useMemo<(SOP & { isUserCreated?: boolean; dbId?: string })[]>(
    () => [...dbSops.map(dbSopToView), ...SOPS],
    [dbSops]
  )

  const toggleFav = (id: string) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      saveFavs(next)
      return next
    })
  }

  /* ── Filtres ── */
  const filtered = useMemo(() => {
    let list = ALL_SOPS
    if (activeCat !== 'home') list = list.filter(s => s.category === activeCat)
    if (onlyFavs) list = list.filter(s => favs.includes(s.id))
    if (onlyShared) list = list.filter(s => sharedWithMeIds.has(s.id))
    if (activeTag) list = list.filter(s => s.tags.includes(activeTag))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [ALL_SOPS, activeCat, query, favs, onlyFavs, onlyShared, sharedWithMeIds, activeTag])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    ALL_SOPS.forEach(s => s.tags.forEach(t => set.add(t)))
    return Array.from(set)
  }, [ALL_SOPS])

  const openedSOP = openId ? ALL_SOPS.find(s => s.id === openId) : null

  const handleEdit = (sopView: SOP & { dbId?: string }) => {
    if (!sopView.dbId) return
    const dbSop = dbSops.find(s => s.id === sopView.dbId)
    if (!dbSop) return
    setEditingSop(dbSop)
    setEditorOpen(true)
  }
  const handleDelete = (sopView: SOP & { dbId?: string }) => {
    if (!sopView.dbId) return
    if (!confirm(`Supprimer définitivement « ${sopView.title} » ?`)) return
    deleteSop.mutate(sopView.dbId)
    if (openId === sopView.id) setOpenId(null)
  }

  /* ═══ Page header ═══ */
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-500" />
            SOP & Procédures Internes
          </h1>
          <p className="page-sub">
            Centralisez les méthodes de travail, scripts et templates de votre équipe
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Download className="w-3.5 h-3.5" /> Exporter
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => { setEditingSop(null); setEditorOpen(true) }}>
              <Plus className="w-3.5 h-3.5" /> Nouveau SOP
            </Button>
          )}
        </div>
      </div>

      {/* ═══ Hero search + KPIs ═══ */}
      {!openedSOP && (
        <div className="card-premium p-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un SOP, un script, un template..."
              className="pl-12 h-12 text-[15px] rounded-xl"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Effacer
              </button>
            )}
          </div>

          {/* Mini-stats sous la search */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <MiniStat icon={FileText}   label="SOP totaux"   value={ALL_SOPS.length} className="kpi-blue text-[var(--pastel-blue-txt)]" />
            <MiniStat icon={Star}       label="Favoris"      value={favs.length} className="kpi-orange text-[var(--pastel-orange-txt)]" />
            <MiniStat icon={TrendingUp} label="Populaires"   value={ALL_SOPS.filter(s => s.popular).length} className="kpi-green text-[var(--pastel-green-txt)]" />
            <MiniStat icon={Users}      label="Catégories"   value={CATEGORIES.length - 1} className="kpi-purple text-[var(--pastel-purple-txt)]" />
          </div>
        </div>
      )}

      {/* ═══ Body : sidebar SOP + content ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">

        {/* ── Sidebar interne des catégories ── */}
        <aside className="card-premium p-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between px-2 py-1 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Catégories
            </p>
            <span className="text-[10px] text-muted-foreground">{ALL_SOPS.length}</span>
          </div>
          <nav className="space-y-0.5">
            {CATEGORIES.map(cat => {
              const count = cat.key === 'home'
                ? ALL_SOPS.length
                : ALL_SOPS.filter(s => s.category === cat.key).length
              const active = activeCat === cat.key
              return (
                <button
                  key={cat.key}
                  onClick={() => { setActiveCat(cat.key); setOpenId(null); setOnlyFavs(false); setActiveTag(null) }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                    active
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                    active ? 'bg-white/15' : cat.bg
                  )}>
                    <cat.icon className={cn('w-3.5 h-3.5', active ? 'text-white' : cat.color)} />
                  </div>
                  <span className="flex-1 truncate text-left">{cat.label}</span>
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                    active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  )}>
                    {count}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Toggle favoris */}
          <div className="border-t border-border mt-3 pt-3 px-2 space-y-1">
            <button
              onClick={() => { setOnlyFavs(v => !v); setOnlyShared(false); setOpenId(null) }}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-all',
                onlyFavs ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'text-muted-foreground hover:bg-muted/60'
              )}
            >
              <Star className={cn('w-3.5 h-3.5', onlyFavs && 'fill-amber-500 text-amber-500')} />
              Favoris uniquement
              <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-md">{favs.length}</span>
            </button>
            <button
              onClick={() => { setOnlyShared(v => !v); setOnlyFavs(false); setOpenId(null) }}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[13px] font-medium transition-all',
                onlyShared ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'text-muted-foreground hover:bg-muted/60'
              )}
            >
              <Share2 className={cn('w-3.5 h-3.5', onlyShared && 'text-blue-500')} />
              Partagé avec moi
              <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-md">{sharedWithMeIds.size}</span>
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="min-w-0">
          <AnimatePresence mode="wait">
            {openedSOP ? (
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
              >
                <SOPDetail
                  sop={openedSOP}
                  isFav={favs.includes(openedSOP.id)}
                  onClose={() => setOpenId(null)}
                  onToggleFav={() => toggleFav(openedSOP.id)}
                  onShare={() => setShareSopId(openedSOP.dbId ?? null)}
                  onTrain={() => setTrainSopId(openedSOP.dbId ?? null)}
                  onEdit={() => handleEdit(openedSOP)}
                  canEdit={canEdit && !!openedSOP.dbId}
                  canShare={!!openedSOP.dbId}
                />
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                {/* Tags chips */}
                {activeCat === 'home' && !query && (
                  <div className="card-premium p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TagIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tags populaires</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.slice(0, 14).map(tag => (
                        <button
                          key={tag}
                          onClick={() => setActiveTag(t => t === tag ? null : tag)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                            activeTag === tag
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-muted/50 border-border text-muted-foreground hover:border-blue-400 hover:text-blue-600'
                          )}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick categories grid (home only, no query) */}
                {activeCat === 'home' && !query && !onlyFavs && !activeTag && (
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="section-title">Catégories</h2>
                      <span className="text-xs text-muted-foreground">Sélectionnez pour filtrer</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                      {CATEGORIES.filter(c => c.key !== 'home').map((cat, i) => {
                        const count = ALL_SOPS.filter(s => s.category === cat.key).length
                        return (
                          <motion.button
                            key={cat.key}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            onClick={() => setActiveCat(cat.key)}
                            className="card-premium p-4 text-left group cursor-pointer"
                          >
                            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', cat.bg)}>
                              <cat.icon className={cn('w-5 h-5', cat.color)} />
                            </div>
                            <p className="font-semibold text-sm text-foreground group-hover:text-blue-600 transition-colors">
                              {cat.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{cat.desc}</p>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                              <span className="text-[11px] font-semibold text-muted-foreground">{count} SOP</span>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* Populaires (home only) */}
                {activeCat === 'home' && !query && !onlyFavs && !activeTag && dbSops.length === 0 && canEdit && (
                  <div className="rounded-2xl border border-dashed border-blue-300 dark:border-blue-700/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                      <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">Créez votre premier SOP personnalisé</p>
                      <p className="text-xs text-muted-foreground">Les exemples ci-dessous sont en lecture seule. Cliquez sur « Nouveau SOP » pour bâtir votre propre bibliothèque.</p>
                    </div>
                    <Button size="sm" onClick={() => { setEditingSop(null); setEditorOpen(true) }}>
                      <Plus className="w-3.5 h-3.5" /> Commencer
                    </Button>
                  </div>
                )}
                {activeCat === 'home' && !query && !onlyFavs && !activeTag && (
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="section-title flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                        SOP populaires
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {ALL_SOPS.filter(s => s.popular).slice(0, 6).map((sop, i) => (
                        <SOPCard
                          key={sop.id}
                          sop={sop}
                          isFav={favs.includes(sop.id)}
                          onOpen={() => setOpenId(sop.id)}
                          onToggleFav={() => toggleFav(sop.id)}
                          delay={i * 0.04}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          onEdit={() => handleEdit(sop)}
                          onDelete={() => handleDelete(sop)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Documents récents (home only) */}
                {activeCat === 'home' && !query && !onlyFavs && !activeTag && (
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="section-title flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-500" />
                        Récemment modifiés
                      </h2>
                    </div>
                    <div className="card-premium divide-y divide-border/50">
                      {[...ALL_SOPS].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map(sop => {
                        const cat = CATEGORIES.find(c => c.key === sop.category)!
                        return (
                          <button
                            key={sop.id}
                            onClick={() => setOpenId(sop.id)}
                            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
                          >
                            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', cat.bg)}>
                              <cat.icon className={cn('w-4 h-4', cat.color)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-foreground truncate">{sop.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{sop.description}</p>
                            </div>
                            <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {sop.readMin} min
                              </span>
                              <span>{sop.updatedAt}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* Liste filtrée (catégorie / recherche / favoris / tag) */}
                {(activeCat !== 'home' || query || onlyFavs || activeTag) && (
                  <section>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="section-title">
                          {query ? `Recherche : "${query}"`
                            : onlyFavs ? 'Mes favoris'
                            : activeTag ? `Tag : #${activeTag}`
                            : CATEGORIES.find(c => c.key === activeCat)?.label}
                        </h2>
                        <Badge variant="secondary" size="sm">{filtered.length} SOP</Badge>
                        {activeTag && (
                          <button
                            onClick={() => setActiveTag(null)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Effacer le tag
                          </button>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setActiveTag(null); setOnlyFavs(false); setActiveCat('home') }}>
                        <Filter className="w-3.5 h-3.5" /> Réinitialiser
                      </Button>
                    </div>

                    {filtered.length === 0 ? (
                      <div className="card-premium empty-state">
                        <BookOpen className="empty-state-icon" />
                        <p className="empty-state-title">Aucun SOP trouvé</p>
                        <p className="empty-state-desc">Essayez un autre mot-clé ou parcourez les catégories.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {filtered.map((sop, i) => (
                          <SOPCard
                            key={sop.id}
                            sop={sop}
                            isFav={favs.includes(sop.id)}
                            onOpen={() => setOpenId(sop.id)}
                            onToggleFav={() => toggleFav(sop.id)}
                            delay={i * 0.04}
                            canEdit={canEdit}
                            canDelete={canDelete}
                            onEdit={() => handleEdit(sop)}
                            onDelete={() => handleDelete(sop)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <SopEditor
        open={editorOpen}
        existing={editingSop}
        initialCategory={activeCat}
        onClose={() => { setEditorOpen(false); setEditingSop(null) }}
      />

      {/* Dialog partage */}
      <SopShareDialog
        open={!!shareSopId}
        sopId={shareSopId}
        sopTitle={ALL_SOPS.find(s => s.id === shareSopId)?.title || ''}
        onClose={() => setShareSopId(null)}
      />

      {/* Mode formation */}
      <SopTrainingMode
        open={!!trainSopId}
        sop={trainSopId ? (dbSops.find(s => s.id === trainSopId) ?? null) : null}
        onClose={() => setTrainSopId(null)}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MINI-STAT
   ═══════════════════════════════════════════════════════════════════ */
function MiniStat({ icon: Icon, label, value, className }: {
  icon: React.ElementType; label: string; value: number; className: string
}) {
  return (
    <div className={cn('rounded-2xl p-3 flex items-center gap-3', className)}>
      <div className="w-9 h-9 rounded-lg bg-white/60 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[11px] font-medium opacity-80 mt-1">{label}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SOP CARD
   ═══════════════════════════════════════════════════════════════════ */
function SOPCard({ sop, isFav, onOpen, onToggleFav, delay = 0, onEdit, onDelete, canEdit, canDelete }: {
  sop: SOP & { isUserCreated?: boolean }
  isFav: boolean
  onOpen: () => void
  onToggleFav: () => void
  delay?: number
  onEdit?: () => void
  onDelete?: () => void
  canEdit?: boolean
  canDelete?: boolean
}) {
  const cat = CATEGORIES.find(c => c.key === sop.category)!
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={onOpen}
      className="card-premium p-4 cursor-pointer group flex flex-col"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cat.bg)}>
          <cat.icon className={cn('w-5 h-5', cat.color)} />
        </div>
        <div className="flex items-center gap-1">
          {sop.popular && (
            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              POPULAIRE
            </span>
          )}
          {sop.isUserCreated && canEdit && onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              title="Modifier"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {sop.isUserCreated && canDelete && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFav() }}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              isFav ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
            )}
          >
            {isFav ? <BookmarkCheck className="w-3.5 h-3.5 fill-amber-500" /> : <Bookmark className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <p className="font-semibold text-sm text-foreground group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
        {sop.title}
      </p>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">
        {sop.description}
      </p>

      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <SopStatusBadge status={sop.status} />
        {sop.tags.slice(0, 2).map(tag => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
            #{tag}
          </span>
        ))}
        {sop.tags.length > 2 && (
          <span className="text-[10px] text-muted-foreground">+{sop.tags.length - 2}</span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold', sop.authorBg)}>
            {sop.author[0]}
          </div>
          <span className="truncate">{sop.author}</span>
        </div>
        <div className="flex items-center gap-2">
          <SopAuthorship compact createdBy={sop.createdByName} updatedBy={sop.updatedByName} className="max-w-[8rem]" />
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {sop.readMin}m</span>
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {sop.views}</span>
        </div>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SOP DETAIL (Notion-like)
   ═══════════════════════════════════════════════════════════════════ */
function SOPDetail({ sop, isFav, onClose, onToggleFav, onShare, onTrain, onEdit, canEdit, canShare }: {
  sop:        SOP
  isFav:      boolean
  onClose:    () => void
  onToggleFav:() => void
  onShare?:   () => void
  onTrain?:   () => void
  onEdit?:    () => void
  canEdit?:   boolean
  canShare?:  boolean
}) {
  const cat = CATEGORIES.find(c => c.key === sop.category)!
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const toggleCheck = (key: string) =>
    setChecked(p => ({ ...p, [key]: !p[key] }))

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copié dans le presse-papier'))
  }

  return (
    <div className="space-y-4">
      {/* ── Breadcrumb + actions ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour</span>
          <ChevronRight className="w-3 h-3" />
          <span className={cn('font-medium', cat.color)}>{cat.label}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onToggleFav}>
            {isFav
              ? <BookmarkCheck className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              : <Bookmark className="w-3.5 h-3.5" />}
            {isFav ? 'Favori' : 'Ajouter aux favoris'}
          </Button>
          {canShare && onShare && (
            <Button variant="ghost" size="sm" onClick={onShare}>
              <Share2 className="w-3.5 h-3.5" /> Partager
            </Button>
          )}
          {onTrain && (
            <Button variant="ghost" size="sm" onClick={onTrain}>
              <GraduationCap className="w-3.5 h-3.5" /> Formation
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => toast.success('Bientôt : export PDF')}>
            <Download className="w-3.5 h-3.5" /> PDF
          </Button>
          {canEdit && onEdit && (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </Button>
          )}
        </div>
      </div>

      {/* ── Header ── */}
      <div className="card-premium p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0', cat.bg)}>
            <cat.icon className={cn('w-7 h-7', cat.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="default" size="sm">{cat.label}</Badge>
              {sop.popular && <Badge variant="success" size="sm">Populaire</Badge>}
              <SopStatusBadge status={sop.status} />
            </div>
            <h1 className="text-[24px] md:text-[28px] font-extrabold text-foreground leading-tight tracking-tight">
              {sop.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">{sop.description}</p>

            <div className="flex items-center gap-5 mt-4 flex-wrap text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold', sop.authorBg)}>
                  {sop.author[0]}
                </div>
                <span className="font-medium text-foreground">{sop.author}</span>
              </div>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {sop.readMin} min de lecture</span>
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {sop.views} vues</span>
              <span>Mis à jour le {sop.updatedAt}</span>
              <SopAuthorship createdBy={sop.createdByName} updatedBy={sop.updatedByName} />
            </div>

            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {sop.tags.map(tag => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content blocks ── */}
      <div className="card-premium p-6 md:p-10 space-y-4">
        {sop.blocks.map((block, i) => (
          <BlockRenderer
            key={i}
            block={block}
            blockKey={`${sop.id}-${i}`}
            checked={checked}
            onCheck={toggleCheck}
            onCopy={handleCopy}
          />
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="card-premium p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Procédure validée par l'équipe — version du {sop.updatedAt}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => toast.success('SOP dupliqué')}>
            <Copy className="w-3.5 h-3.5" /> Dupliquer
          </Button>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   BLOCK RENDERER — Notion-style
   ═══════════════════════════════════════════════════════════════════ */
function BlockRenderer({ block, blockKey, checked, onCheck, onCopy }: {
  block:    SOPBlock
  blockKey: string
  checked:  Record<string, boolean>
  onCheck:  (key: string) => void
  onCopy:   (text: string) => void
}) {
  switch (block.type) {
    case 'heading':
      return (
        <h2 className="text-xl font-extrabold text-foreground mt-4 mb-2 tracking-tight">
          {parseRichText(block.text)}
        </h2>
      )

    case 'heading2':
      return (
        <h3 className="text-lg font-bold text-foreground mt-3 mb-2 tracking-tight">
          {parseRichText(block.text)}
        </h3>
      )

    case 'heading3':
      return (
        <h4 className="text-base font-bold text-foreground mt-2 mb-1.5 tracking-tight">
          {parseRichText(block.text)}
        </h4>
      )

    case 'paragraph':
      return (
        <p className="text-[15px] text-foreground/85 leading-relaxed whitespace-pre-line">
          {parseRichText(block.text)}
        </p>
      )

    case 'quote':
      return (
        <blockquote className="border-l-4 border-blue-500 pl-4 py-2 italic text-foreground/80 bg-blue-50/30 dark:bg-blue-950/20 rounded-r-lg">
          {parseRichText(block.text)}
        </blockquote>
      )

    case 'list':
      return (
        <ul className="space-y-1.5">
          {block.items?.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] text-foreground/85">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
              <span className="flex-1">{parseRichText(item)}</span>
            </li>
          ))}
        </ul>
      )

    case 'numbered':
      return (
        <ol className="space-y-1.5 list-decimal pl-6">
          {block.items?.map((item, i) => (
            <li key={i} className="text-[15px] text-foreground/85 pl-1">
              {parseRichText(item)}
            </li>
          ))}
        </ol>
      )

    case 'checklist':
      return (
        <ul className="space-y-2">
          {block.items?.map((item, i) => {
            const key = `${blockKey}-${i}`
            const isChecked = checked[key]
            return (
              <li
                key={i}
                onClick={() => onCheck(key)}
                className="flex items-start gap-3 cursor-pointer group"
              >
                <span className={cn(
                  'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
                  isChecked
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-border group-hover:border-emerald-400'
                )}>
                  {isChecked && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
                <span className={cn(
                  'text-[15px] transition-all',
                  isChecked ? 'text-muted-foreground line-through' : 'text-foreground/85'
                )}>
                  {item}
                </span>
              </li>
            )
          })}
        </ul>
      )

    case 'steps':
      return (
        <ol className="space-y-3">
          {block.items?.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/20">
                {i + 1}
              </span>
              <span className="text-[15px] text-foreground/85 leading-relaxed pt-0.5 flex-1">
                {item}
              </span>
            </li>
          ))}
        </ol>
      )

    case 'callout': {
      const variants = {
        info:    { bg: 'bg-blue-50 dark:bg-blue-900/20',       border: 'border-blue-200 dark:border-blue-800/50',     icon: 'text-blue-500',    iconBg: 'bg-blue-100 dark:bg-blue-900/40',    emoji: 'ℹ️' },
        warning: { bg: 'bg-amber-50 dark:bg-amber-900/20',     border: 'border-amber-200 dark:border-amber-800/50',   icon: 'text-amber-500',   iconBg: 'bg-amber-100 dark:bg-amber-900/40',  emoji: '⚠️' },
        danger:  { bg: 'bg-rose-50 dark:bg-rose-900/20',       border: 'border-rose-200 dark:border-rose-800/50',     icon: 'text-rose-500',    iconBg: 'bg-rose-100 dark:bg-rose-900/40',    emoji: '🚨' },
        success: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800/50', icon: 'text-emerald-500', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', emoji: '✅' },
        tip:     { bg: 'bg-violet-50 dark:bg-violet-900/20',   border: 'border-violet-200 dark:border-violet-800/50', icon: 'text-violet-500',  iconBg: 'bg-violet-100 dark:bg-violet-900/40',  emoji: '💡' },
      }
      const v = variants[block.variant || 'info']
      return (
        <div className={cn('rounded-2xl border p-4 flex gap-3', v.bg, v.border)}>
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-lg', v.iconBg)}>
            <span>{v.emoji}</span>
          </div>
          <div className="flex-1 min-w-0">
            {block.title && <p className="font-semibold text-sm text-foreground mb-1">{block.title}</p>}
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{parseRichText(block.text)}</p>
          </div>
        </div>
      )
    }

    case 'image': {
      const img = block.image
      if (!img?.url) return null
      const sizeClass = img.size === 'small' ? 'max-w-xs' : img.size === 'medium' ? 'max-w-sm' : img.size === 'large' ? 'max-w-md' : 'w-full'
      const alignClass = img.align === 'left' ? 'mr-auto' : img.align === 'right' ? 'ml-auto' : 'mx-auto'
      return (
        <figure className={cn('my-2', sizeClass, alignClass)}>
          <img src={img.url} alt={img.caption ?? ''} className="w-full rounded-lg border border-border shadow-sm" />
          {img.caption && <figcaption className="text-xs text-muted-foreground text-center mt-1.5 italic">{img.caption}</figcaption>}
        </figure>
      )
    }

    case 'video': {
      const v = block.video
      if (!v?.url) return null
      const info = detectVideo(v.url)
      const sizeClass = v.size === 'small' ? 'max-w-xs' : v.size === 'medium' ? 'max-w-sm' : v.size === 'large' ? 'max-w-md' : 'w-full'
      const alignClass = v.align === 'left' ? 'mr-auto' : v.align === 'right' ? 'ml-auto' : 'mx-auto'
      return (
        <figure className={cn('my-2', sizeClass, alignClass)}>
          <div className="aspect-video w-full rounded-lg overflow-hidden border border-border shadow-sm bg-black">
            {info.embedUrl ? (
              info.kind === 'file' ? (
                <video src={info.embedUrl} controls className="w-full h-full" />
              ) : (
                <iframe
                  src={info.embedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={v.caption || 'Vidéo'}
                />
              )
            ) : (
              <a href={v.url} target="_blank" rel="noreferrer"
                className="flex items-center justify-center w-full h-full text-sm text-white/90 hover:underline">
                Ouvrir la vidéo : {v.url}
              </a>
            )}
          </div>
          {v.caption && <figcaption className="text-xs text-muted-foreground text-center mt-1.5 italic">{v.caption}</figcaption>}
        </figure>
      )
    }

    case 'table': {
      const t = block.table
      if (!t || t.rows.length === 0) return null
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>{t.headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold text-foreground border-b border-border">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {t.rows.map((row, r) => (
                <tr key={r} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 text-foreground/85">{parseRichText(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'template':
      return (
        <div className="rounded-2xl border border-border bg-muted/30 dark:bg-muted/10 overflow-hidden group">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-foreground">Template message</span>
            </div>
            <button
              onClick={() => onCopy(block.text || '')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-500 transition-colors"
            >
              <Copy className="w-3 h-3" /> Copier
            </button>
          </div>
          <pre className="p-4 text-[13px] text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed">
            {parseRichText(block.text)}
          </pre>
        </div>
      )

    case 'code':
      return (
        <div className="rounded-2xl bg-slate-900 dark:bg-slate-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
            <span className="text-[11px] font-mono text-slate-400">prompt</span>
            <button
              onClick={() => onCopy(block.text || '')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Copy className="w-3 h-3" /> Copier
            </button>
          </div>
          <pre className="p-4 text-[13px] text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">
            {block.text}
          </pre>
        </div>
      )

    case 'divider':
      return <hr className="border-t border-border/60 my-4" />

    default:
      return null
  }
}
