import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Search, Edit2, Trash2, Loader2, GraduationCap, FileSignature,
  FileCheck2, FileText, Mail, Phone, MapPin, IdCard, School, Calendar,
  ChevronDown, User, UserRound, Eye, Download, Settings2, Play, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu'
import { cn, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useStagiaires, useCreateStagiaire, useUpdateStagiaire, useDeleteStagiaire,
  type Stagiaire, type StagiaireInput, type StagiaireGenre, type StagiaireStatut,
} from '@/hooks/useStagiaires'
import { generateAttestationAcceptation } from '@/lib/pdf/attestationAcceptation'
import { generateConventionStage, CONVENTION_ARTICLES } from '@/lib/pdf/conventionStage'
import { generateAttestationStage } from '@/lib/pdf/attestationStage'
import AIButton from '@/components/ui/AIButton'

const STATUT_CONFIG: Record<StagiaireStatut, { label: string; color: string; bg: string; dot: string }> = {
  accepte:  { label: 'Accepté',  color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-500/10',       dot: 'bg-blue-500'    },
  en_cours: { label: 'En cours', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', dot: 'bg-emerald-500' },
  termine:  { label: 'Terminé',  color: 'text-slate-600 dark:text-slate-300',     bg: 'bg-slate-100 dark:bg-slate-500/15',    dot: 'bg-slate-500'   },
  annule:   { label: 'Annulé',   color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-500/10',         dot: 'bg-red-500'     },
}

const EMPTY_FORM: StagiaireInput = {
  nom_complet:   '',
  genre:         'homme',
  cin:           '',
  date_naissance:null,
  lieu_naissance:'',
  telephone:     '',
  email:         '',
  adresse:       '',
  etablissement: '',
  formation:     'Marketing digital / Création de site internet',
  departement:   'création de sites web et référencement naturel (SEO)',
  date_debut:    '',
  date_fin:      '',
  statut:        'accepte',
  notes:         '',
}

export function StagiairesTab() {
  const { data: stagiaires = [], isLoading } = useStagiaires()
  const create = useCreateStagiaire()
  const update = useUpdateStagiaire()
  const remove = useDeleteStagiaire()

  const [search, setSearch] = useState('')
  const [filterStatut, setFilterStatut] = useState<'all' | StagiaireStatut>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Stagiaire | undefined>()

  const filtered = useMemo(() => {
    return stagiaires.filter(s => {
      if (filterStatut !== 'all' && s.statut !== filterStatut) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        s.nom_complet.toLowerCase().includes(q) ||
        s.cin.toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.etablissement || '').toLowerCase().includes(q)
      )
    })
  }, [stagiaires, search, filterStatut])

  const stats = useMemo(() => ({
    total:   stagiaires.length,
    enCours: stagiaires.filter(s => s.statut === 'en_cours').length,
    accepte: stagiaires.filter(s => s.statut === 'accepte').length,
    termine: stagiaires.filter(s => s.statut === 'termine').length,
  }), [stagiaires])

  const handleSubmit = async (form: StagiaireInput) => {
    if (editing) await update.mutateAsync({ id: editing.id, ...form })
    else         await create.mutateAsync(form)
    setShowForm(false)
    setEditing(undefined)
  }

  const handleDelete = (s: Stagiaire) => {
    if (!confirm(`Supprimer le stagiaire ${s.nom_complet} ?`)) return
    remove.mutate(s.id)
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-premium p-3 flex items-center gap-3">
          <GraduationCap className="w-5 h-5 text-blue-500" />
          <div><p className="text-lg font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </div>
        <div className="card-premium p-3 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <div><p className="text-lg font-bold">{stats.enCours}</p><p className="text-xs text-muted-foreground">En cours</p></div>
        </div>
        <div className="card-premium p-3 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <div><p className="text-lg font-bold">{stats.accepte}</p><p className="text-xs text-muted-foreground">Acceptés</p></div>
        </div>
        <div className="card-premium p-3 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
          <div><p className="text-lg font-bold">{stats.termine}</p><p className="text-xs text-muted-foreground">Terminés</p></div>
        </div>
      </div>

      {/* Header actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher (nom, CIN, email…)" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterStatut} onValueChange={v => setFilterStatut(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              {Object.entries(STATUT_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => { setEditing(undefined); setShowForm(true) }}>
          <Plus className="w-4 h-4" /> Nouveau stagiaire
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <GraduationCap className="empty-state-icon" />
          <p className="empty-state-title">Aucun stagiaire</p>
          <p className="empty-state-desc">Ajoutez un stagiaire pour générer automatiquement ses documents officiels.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s, i) => (
            <StagiaireCard
              key={s.id}
              stagiaire={s}
              index={i}
              onEdit={() => { setEditing(s); setShowForm(true) }}
              onDelete={() => handleDelete(s)}
              onChangeStatut={(statut) => update.mutate({ id: s.id, statut } as any)}
            />
          ))}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditing(undefined) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le stagiaire' : 'Nouveau stagiaire'}</DialogTitle>
          </DialogHeader>
          <StagiaireForm
            initial={editing}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditing(undefined) }}
            saving={create.isPending || update.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────── */

function StagiaireCard({
  stagiaire: s, index, onEdit, onDelete, onChangeStatut,
}: {
  stagiaire:       Stagiaire
  index:           number
  onEdit:          () => void
  onDelete:        () => void
  onChangeStatut:  (statut: StagiaireStatut) => void
}) {
  const cfg = STATUT_CONFIG[s.statut]
  const isFini = s.statut === 'termine' || new Date(s.date_fin) < new Date()

  const [customConventionOpen, setCustomConventionOpen] = useState(false)

  const runPdf = async (
    kind:     'acceptation' | 'convention' | 'attestation',
    mode:     'download' | 'preview',
    included?: string[],
  ) => {
    try {
      if (kind === 'acceptation')      await generateAttestationAcceptation(s, mode)
      else if (kind === 'convention')  await generateConventionStage(s, mode, included)
      else                             await generateAttestationStage(s, mode)
      toast.success(mode === 'preview' ? 'Aperçu ouvert' : 'Document téléchargé')
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la génération')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="card-premium p-5 hover:border-blue-500/30 transition-all duration-300 group"
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0',
          s.genre === 'femme' ? 'bg-pink-100 dark:bg-pink-500/20' : 'bg-blue-100 dark:bg-blue-500/20',
        )}>
          {s.genre === 'femme'
            ? <UserRound className="w-5 h-5 text-pink-600 dark:text-pink-400" />
            : <User      className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm truncate">{s.nom_complet}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <IdCard className="w-3 h-3" /> {s.cin}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onEdit}>
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Infos */}
      <div className="mt-3 space-y-1">
        {s.email     && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail   className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{s.email}</span></div>}
        {s.telephone && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone  className="w-3.5 h-3.5 flex-shrink-0" />{s.telephone}</div>}
        {s.etablissement && <div className="flex items-center gap-2 text-xs text-muted-foreground"><School className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{s.etablissement}</span></div>}
        {s.adresse   && <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{s.adresse}</span></div>}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
          {formatDate(s.date_debut)} → {formatDate(s.date_fin)}
        </div>
      </div>

      {/* Statut + actions PDF */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
        <Badge className={cn('text-xs', cfg.color, cfg.bg)}>
          <span className={cn('w-2 h-2 rounded-full mr-1.5', cfg.dot)} />
          {cfg.label}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" className="h-7 text-xs">
              <FileText className="w-3.5 h-3.5 mr-1" /> Documents <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={onEdit}>
              <Edit2 className="w-4 h-4 text-slate-500" />
              <div className="flex flex-col">
                <span className="text-sm">Modifier le stagiaire</span>
                <span className="text-[10px] text-muted-foreground">Corriger les infos avant de régénérer</span>
              </div>
            </DropdownMenuItem>
            {s.statut !== 'en_cours' && s.statut !== 'termine' && (
              <DropdownMenuItem onClick={() => onChangeStatut('en_cours')}>
                <Play className="w-4 h-4 text-emerald-500" />
                <div className="flex flex-col">
                  <span className="text-sm">Activer le stage</span>
                  <span className="text-[10px] text-muted-foreground">Passer le statut à « En cours »</span>
                </div>
              </DropdownMenuItem>
            )}
            {s.statut !== 'termine' && (
              <DropdownMenuItem onClick={() => onChangeStatut('termine')}>
                <CheckCircle2 className="w-4 h-4 text-slate-500" />
                <div className="flex flex-col">
                  <span className="text-sm">Terminer le stage</span>
                  <span className="text-[10px] text-muted-foreground">Marquer comme terminé</span>
                </div>
              </DropdownMenuItem>
            )}
            {s.statut === 'termine' && (
              <DropdownMenuItem onClick={() => onChangeStatut('en_cours')}>
                <Play className="w-4 h-4 text-emerald-500" />
                <div className="flex flex-col">
                  <span className="text-sm">Réactiver le stage</span>
                  <span className="text-[10px] text-muted-foreground">Repasser à « En cours »</span>
                </div>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DocSubMenu
              icon={<FileText className="w-4 h-4 text-blue-500" />}
              label="Attestation d'acceptation"
              hint="Avant le début du stage"
              onPreview={() => runPdf('acceptation', 'preview')}
              onDownload={() => runPdf('acceptation', 'download')}
            />
            <DocSubMenu
              icon={<FileSignature className="w-4 h-4 text-emerald-500" />}
              label="Convention de stage"
              hint="Contrat signé entre parties"
              onPreview={() => runPdf('convention', 'preview')}
              onDownload={() => runPdf('convention', 'download')}
              extra={(
                <DropdownMenuItem onClick={() => setCustomConventionOpen(true)}>
                  <Settings2 className="w-4 h-4 text-blue-500" />
                  <div className="flex flex-col">
                    <span className="text-sm">Personnaliser les articles…</span>
                    <span className="text-[10px] text-muted-foreground">Choisir les clauses à inclure</span>
                  </div>
                </DropdownMenuItem>
              )}
            />
            <DropdownMenuSeparator />
            <DocSubMenu
              icon={<FileCheck2 className="w-4 h-4 text-amber-500" />}
              label="Attestation de stage"
              hint={isFini ? 'Fin de stage' : 'Générer (aperçu / anticipé)'}
              onPreview={() => runPdf('attestation', 'preview')}
              onDownload={() => runPdf('attestation', 'download')}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CustomConventionDialog
        open={customConventionOpen}
        onOpenChange={setCustomConventionOpen}
        onGenerate={(mode, ids) => runPdf('convention', mode, ids)}
      />
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────────────── */

function CustomConventionDialog({
  open, onOpenChange, onGenerate,
}: {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  onGenerate:    (mode: 'download' | 'preview', includedIds: string[]) => void
}) {
  const optional = CONVENTION_ARTICLES.filter(a => a.optional)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(optional.map(a => a.id)))

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const all = () => setSelected(new Set(optional.map(a => a.id)))
  const none = () => setSelected(new Set())

  const submit = (mode: 'download' | 'preview') => {
    onGenerate(mode, Array.from(selected))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Personnaliser la convention</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Décochez les articles à ne pas inclure. La numérotation s'ajuste automatiquement.
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Button size="sm" variant="secondary" onClick={all} className="h-7 text-xs">Tout cocher</Button>
          <Button size="sm" variant="secondary" onClick={none} className="h-7 text-xs">Tout décocher</Button>
          <span className="text-[11px] text-muted-foreground ml-auto">
            {selected.size + CONVENTION_ARTICLES.filter(a => !a.optional).length} / {CONVENTION_ARTICLES.length} articles
          </span>
        </div>
        <div className="max-h-[52vh] overflow-y-auto space-y-1.5 mt-2 pr-1">
          {CONVENTION_ARTICLES.map(a => {
            const disabled = !a.optional
            const checked  = disabled || selected.has(a.id)
            return (
              <label
                key={a.id}
                className={cn(
                  'flex items-start gap-3 p-2.5 rounded-lg border border-border cursor-pointer transition-colors',
                  disabled ? 'bg-muted/30 cursor-not-allowed' : 'hover:bg-muted/40',
                  checked && !disabled && 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => !disabled && toggle(a.id)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Article {a.num} — {a.title}
                    {disabled && <span className="ml-2 text-[10px] font-medium text-muted-foreground">(obligatoire)</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {a.getParagraphs({ genre: 'homme' } as any).find(p => p && !p.startsWith('•')) ?? ''}
                  </p>
                </div>
              </label>
            )
          })}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button variant="secondary" size="sm" onClick={() => submit('preview')}>
            <Eye className="w-4 h-4" /> Aperçu
          </Button>
          <Button size="sm" onClick={() => submit('download')}>
            <Download className="w-4 h-4" /> Télécharger
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─────────────────────────────────────────────────────────────────── */

function DocSubMenu({
  icon, label, hint, onPreview, onDownload, extra,
}: {
  icon:       React.ReactNode
  label:      string
  hint:       string
  onPreview:  () => void
  onDownload: () => void
  extra?:     React.ReactNode
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        {icon}
        <div className="flex flex-col flex-1">
          <span className="text-sm">{label}</span>
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-56">
          <DropdownMenuItem onClick={onPreview}>
            <Eye className="w-4 h-4 text-blue-500" />
            <div className="flex flex-col">
              <span className="text-sm">Aperçu complet</span>
              <span className="text-[10px] text-muted-foreground">Ouvrir dans un onglet</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDownload}>
            <Download className="w-4 h-4 text-emerald-500" />
            <div className="flex flex-col">
              <span className="text-sm">Télécharger</span>
              <span className="text-[10px] text-muted-foreground">Fichier PDF</span>
            </div>
          </DropdownMenuItem>
          {extra && (
            <>
              <DropdownMenuSeparator />
              {extra}
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

/* ─────────────────────────────────────────────────────────────────── */

function StagiaireForm({
  initial, onSubmit, onCancel, saving,
}: {
  initial?:  Stagiaire
  onSubmit:  (data: StagiaireInput) => Promise<void> | void
  onCancel:  () => void
  saving:    boolean
}) {
  const [form, setForm] = useState<StagiaireInput>(() => initial ? {
    nom_complet:   initial.nom_complet,
    genre:         initial.genre,
    cin:           initial.cin,
    date_naissance:initial.date_naissance,
    lieu_naissance:initial.lieu_naissance || '',
    telephone:     initial.telephone,
    email:         initial.email,
    adresse:       initial.adresse,
    etablissement: initial.etablissement,
    formation:     initial.formation,
    departement:   initial.departement,
    date_debut:    initial.date_debut,
    date_fin:      initial.date_fin,
    statut:        initial.statut,
    notes:         initial.notes || '',
  } : { ...EMPTY_FORM })

  const update = <K extends keyof StagiaireInput>(k: K, v: StagiaireInput[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (new Date(form.date_fin) < new Date(form.date_debut)) {
      toast.error('La date de fin doit être après la date de début')
      return
    }
    await onSubmit(form)
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Identité */}
      <Section title="Identité">
        <Field label="Nom complet *">
          <AutocorrectInput value={form.nom_complet} onChange={e => update('nom_complet', e.target.value)} required placeholder="Ex: YOUNES MOUQLA" />
        </Field>
        <Field label="Genre *">
          <Select value={form.genre} onValueChange={v => update('genre', v as StagiaireGenre)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="homme">Homme</SelectItem>
              <SelectItem value="femme">Femme</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="CIN *">
          <Input value={form.cin} onChange={e => update('cin', e.target.value.toUpperCase())} required placeholder="Ex: F766383" />
        </Field>
        <Field label="Date de naissance">
          <Input type="date" value={form.date_naissance ?? ''} onChange={e => update('date_naissance', e.target.value || null)} />
        </Field>
        <Field label="Lieu de naissance" full>
          <AutocorrectInput value={form.lieu_naissance ?? ''} onChange={e => update('lieu_naissance', e.target.value)} placeholder="Ex: OUJDA" />
        </Field>
      </Section>

      {/* Coordonnées */}
      <Section title="Coordonnées">
        <Field label="Téléphone *">
          <Input value={form.telephone} onChange={e => update('telephone', e.target.value)} required placeholder="06 XX XX XX XX" />
        </Field>
        <Field label="Email *">
          <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} required />
        </Field>
        <Field label="Adresse complète *" full>
          <AutocorrectInput value={form.adresse} onChange={e => update('adresse', e.target.value)} required placeholder="Ex: HAY TAKADOUM BLOC D NR 02 OUJDA" />
        </Field>
      </Section>

      {/* Formation & stage */}
      <Section title="Formation & Stage">
        <Field label="Établissement *" full>
          <AutocorrectInput value={form.etablissement} onChange={e => update('etablissement', e.target.value)} required placeholder="Nom de l'école ou de l'université" />
        </Field>
        <Field label="Nature de la formation" full>
          <AutocorrectInput value={form.formation} onChange={e => update('formation', e.target.value)} />
        </Field>
        <Field label="Département d'accueil" full>
          <AutocorrectInput value={form.departement} onChange={e => update('departement', e.target.value)} />
        </Field>
        <Field label="Date de début *">
          <Input type="date" value={form.date_debut} onChange={e => update('date_debut', e.target.value)} required />
        </Field>
        <Field label="Date de fin *">
          <Input type="date" value={form.date_fin} onChange={e => update('date_fin', e.target.value)} required />
        </Field>
        <Field label="Statut *">
          <Select value={form.statut} onValueChange={v => update('statut', v as StagiaireStatut)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUT_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Notes (interne)" full action={
          <AIButton value={form.notes ?? ''} onChange={v => update('notes', v)} />
        }>
          <AutocorrectTextarea
            value={form.notes ?? ''}
            onChange={e => update('notes', e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {initial ? 'Mettre à jour' : 'Ajouter'}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">{title}</h4>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, children, full = false, action }: { label: string; children: React.ReactNode; full?: boolean; action?: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', full && 'col-span-2')}>
      <div className="flex items-center justify-between">
        <label className="form-label">{label}</label>
        {action}
      </div>
      {children}
    </div>
  )
}
