/**
 * /my-space/crm — onglet « Prospects » de l'espace commercial.
 *
 * ── Ce que cet écran montre
 * UNIQUEMENT le périmètre de la personne connectée : les fiches dont elle
 * est l'auteur ou la responsable, plus celles qu'on lui a partagées. Ce
 * découpage est fait par le SERVEUR (server/lib/crmScope.ts) ; ce qui
 * n'arrive pas ici n'existe pas pour elle, il n'y a rien à re-filtrer.
 *
 * ── Pourquoi une liste peut être vide alors que l'espace compte des
 *    centaines de prospects
 * L'attribution (prospects.assigned_to) est récente : la quasi-totalité
 * des fiches existantes n'ont encore de responsable. Un commercial que
 * l'on vient d'activer voit donc légitimement un écran vide, et « Aucun
 * résultat » lui ferait croire à une panne. L'état vide dit ce qui se
 * passe et ce qu'il faut faire : demander une attribution.
 *
 * ── Le vocabulaire des statuts
 * Sept valeurs vivent réellement dans prospects.statut. Elles sont
 * réécrites ici plutôt qu'importées de PROSPECT_STAGES (useProspects) :
 * ce référentiel-là n'en connaît que six — « prospect » y manque — et une
 * fiche portant ce statut s'afficherait sans libellé ni couleur.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, Search, Plus, X, Phone, Mail, Building2, CalendarClock,
  ChevronRight, Loader2, ShieldAlert, Target, Wallet, Inbox,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  myCrmApi, PROSPECT_SOURCES_FALLBACK,
  type CrmProspect, type CrmProspectStatut, type CrmProspectPriorite,
  type MyCrmAbilities, type MyCrmProspectInput,
} from './contratCrm'
import { cn, formatCurrency } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════
   Briques partagées avec ProspectFiche

   Elles vivent dans ce fichier — et non dans un module utilitaire de
   plus — parce que ce module n'a que deux écrans et qu'un troisième
   fichier de vingt lignes coûterait plus à lire qu'il ne rapporte. La
   fiche les importe d'ici ; l'inverse n'existe pas, il n'y a donc pas
   de cycle.
   ═══════════════════════════════════════════════════════════════ */

/** Le septième statut, « prospect », existe en base mais pas dans l'union
 *  du contrat (src/lib/api.ts, propriété d'un autre agent). On l'ajoute
 *  ici : amputer l'écran d'une valeur réellement portée par des fiches
 *  les rendrait illisibles. */
export type StatutProspect = CrmProspectStatut | 'prospect'

export const STATUTS: { id: StatutProspect; label: string; dot: string; badge: string }[] = [
  { id: 'nouveau',     label: 'Nouveau',     dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { id: 'prospect',    label: 'Prospect',    dot: 'bg-sky-500',     badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' },
  { id: 'contacte',    label: 'Contacté',    dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  { id: 'qualifie',    label: 'Qualifié',    dot: 'bg-violet-500',  badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' },
  { id: 'proposition', label: 'Proposition', dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  { id: 'gagne',       label: 'Gagné',       dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  { id: 'perdu',       label: 'Perdu',       dot: 'bg-red-500',     badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
]

export const statutInfo = (s?: string | null) =>
  STATUTS.find(x => x.id === s) ?? STATUTS[0]

/** Le contrat ne type que six statuts, la base en porte sept. On ne
 *  convertit qu'au moment d'écrire, et à un seul endroit, pour que
 *  l'écart reste visible et corrigeable d'une ligne le jour où l'union
 *  d'api.ts sera complétée. */
export const versContrat = (s: StatutProspect) => s as CrmProspectStatut

/** Clé de cache de la liste. Exportée : la fiche l'invalide après une
 *  modification ou une conversion, sinon on revient sur une liste qui
 *  affiche encore l'ancien statut. */
export const CLE_PROSPECTS = ['my-space', 'crm', 'prospects'] as const

/**
 * Message d'erreur lisible.
 *
 * `request()` (src/lib/api.ts) fabrique « HTTP 403 » quand le serveur n'a
 * pas renvoyé de message. Le montrer tel quel à un commercial ne lui
 * apprend rien — surtout dans le cas le plus fréquent : l'administrateur
 * vient de lui retirer un droit et l'écran, chargé une seconde plus tôt,
 * proposait encore le bouton.
 */
export function messageErreur(e: unknown, defaut: string): string {
  const brut = e instanceof Error ? e.message.trim() : ''
  if (!brut) return defaut
  const code = /^HTTP (\d{3})$/.exec(brut)?.[1]
  if (!code) return brut
  if (code === '403') {
    return "Cette action ne vous est pas autorisée. Vos accès ont peut-être changé à l'instant — rechargez la page, puis voyez avec votre administrateur."
  }
  if (code === '404') return "Cette fiche n'existe plus."
  if (code === '400') return 'Certaines informations saisies ne sont pas valides.'
  return defaut
}

export const dateFr = (v?: string | null) =>
  v ? new Date(String(v).slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—'

/** Valeur d'un <input type="date"> : la colonne peut porter un jour nu
 *  ou un horodatage complet selon la façon dont la fiche a été créée. */
export const versInputDate = (v?: string | null) => (v ? String(v).slice(0, 10) : '')

/* ═══════════════════════════════════════════════════════════════
   L'écran
   ═══════════════════════════════════════════════════════════════ */

const TOUS = '__tous__'

/* Une seule requête, tout le périmètre : recherche et filtre travaillent
   ensuite en mémoire. Un commercial gère des dizaines de fiches, pas des
   dizaines de milliers — et le filtrage instantané compte davantage au
   téléphone qu'une pagination serveur. */
const LIMITE = 500

export default function ProspectsListe({
  can, onOuvrir,
}: {
  can:      MyCrmAbilities
  onOuvrir: (id: string) => void
}) {
  const qc = useQueryClient()
  const [recherche, setRecherche] = useState('')
  const [statut, setStatut]       = useState<string>(TOUS)
  const [formOuvert, setFormOuvert] = useState(false)

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: CLE_PROSPECTS,
    queryFn:  () => myCrmApi.prospects({ limit: LIMITE }),
    staleTime: 30_000,
    retry: false,
  })

  /* Référence stable : un `?? []` recréerait un tableau à chaque rendu et
     relancerait tous les mémos qui en dépendent. */
  const prospects = useMemo(() => data?.prospects ?? [], [data])

  /* Les statuts proposés au filtre sont ceux réellement portés par les
     fiches : offrir « Perdu » à quelqu'un qui n'en a aucun donne un filtre
     qui ne trouve jamais rien. */
  const statutsPresents = useMemo(() => {
    const vus = new Set(prospects.map(p => String(p.statut)))
    return STATUTS.filter(s => vus.has(s.id))
  }, [prospects])

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return prospects.filter(p => {
      if (statut !== TOUS && String(p.statut) !== statut) return false
      if (!q) return true
      return [p.nom, p.entreprise, p.telephone, p.email, p.source]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [prospects, recherche, statut])

  const filtreActif = recherche.trim() !== '' || statut !== TOUS
  const reinitialiser = () => { setRecherche(''); setStatut(TOUS) }

  /* Repères de tête — calculés sur le périmètre entier, pas sur le
     résultat filtré : un chiffre de synthèse qui bouge quand on tape dans
     la recherche ne veut plus rien dire. */
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const aRelancer = prospects.filter(p =>
    p.date_relance && String(p.date_relance).slice(0, 10) <= aujourdhui
    && p.statut !== 'gagne' && p.statut !== 'perdu').length
  const gagnes = prospects.filter(p => p.statut === 'gagne').length
  const pipe = prospects
    .filter(p => p.statut !== 'gagne' && p.statut !== 'perdu')
    .reduce((s, p) => s + (Number(p.valeur_estimee) || 0), 0)

  const creer = useMutation({
    mutationFn: (input: MyCrmProspectInput) => myCrmApi.createProspect(input),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: CLE_PROSPECTS })
      toast.success('Prospect créé')
      setFormOuvert(false)
      /* On enchaîne sur la fiche : après une création, la première chose
         qu'on veut faire est de journaliser le premier échange. */
      if (p?.id) onOuvrir(p.id)
    },
    onError: (e) => toast.error(messageErreur(e, "Impossible de créer ce prospect")),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
        <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
      </div>
    )
  }

  /* Un refus rendu comme « liste vide » est le pire des deux mondes : on
     croit son portefeuille vide et on va réclamer des prospects qu'on a
     peut-être déjà. On dit ce que le serveur a répondu. */
  if (isError) {
    return (
      <div className="card-premium p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7 text-rose-600 dark:text-rose-400" />
        </div>
        <h3 className="text-base font-bold text-foreground">Vos prospects sont indisponibles</h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
          {messageErreur(error, 'La requête a échoué.')}
        </p>
        <Button variant="secondary" size="sm" className="mt-5" onClick={() => refetch()}>
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Repères de tête ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Kpi icon={Users}         libelle="Mes prospects" valeur={String(prospects.length)} accent="text-blue-600 dark:text-blue-400" />
        <Kpi icon={CalendarClock} libelle="À relancer"    valeur={String(aRelancer)}        accent="text-amber-600 dark:text-amber-400" />
        <Kpi icon={Target}        libelle="Gagnés"        valeur={String(gagnes)}           accent="text-emerald-600 dark:text-emerald-400" />
        <Kpi icon={Wallet}        libelle="En cours"      valeur={formatCurrency(pipe)}     accent="text-violet-600 dark:text-violet-400" />
      </div>

      {/* ── Recherche et filtres ──────────────────────────────────── */}
      <div className="card-premium p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Nom, société, téléphone…"
            className="pl-9 h-9"
            aria-label="Rechercher un prospect"
          />
        </div>

        {statutsPresents.length > 1 && (
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="h-9 w-auto min-w-[9rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUS}>Tous les statuts</SelectItem>
              {statutsPresents.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {filtreActif && (
          <Button variant="ghost" size="sm" className="h-9" onClick={reinitialiser}>
            <X className="w-3.5 h-3.5" /> Réinitialiser
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : `${filtres.length} / ${prospects.length}`}
        </span>

        {/* Le bouton n'apparaît que si le droit de créer a été accordé. Le
            masquer n'interdit rien : la route refuse de son côté. */}
        {can.prospects_create && (
          <Button size="sm" className="h-9" onClick={() => setFormOuvert(true)}>
            <Plus className="w-4 h-4" /> Nouveau prospect
          </Button>
        )}
      </div>

      {/* ── Périmètre vide : la situation attendue tant que rien n'a été
             attribué. On l'explique au lieu d'afficher « aucun résultat ». */}
      {prospects.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-base font-bold text-foreground">Aucun prospect ne vous est attribué</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            Aucun prospect ne vous est attribué pour le moment — votre administrateur
            doit vous en confier. {can.prospects_create
              ? 'Vous pouvez aussi créer vous-même une fiche : elle vous sera rattachée automatiquement.'
              : 'Dès qu’il l’aura fait, vos fiches apparaîtront ici.'}
          </p>
          {can.prospects_create && (
            <Button className="mt-5" onClick={() => setFormOuvert(true)}>
              <Plus className="w-4 h-4" /> Nouveau prospect
            </Button>
          )}
        </div>
      ) : filtres.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <Search className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Aucun prospect ne correspond</p>
          <p className="text-xs text-muted-foreground mt-1">
            Essayez un autre terme, ou retirez le filtre de statut.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={reinitialiser}>
            Réinitialiser les filtres
          </Button>
        </div>
      ) : (
        <>
          {/* ── Téléphone : une carte par fiche. Le tableau maison impose
                 640px de large, il obligerait à faire défiler
                 horizontalement pour lire un simple nom. */}
          <div className="md:hidden space-y-2">
            {filtres.map((p, i) => (
              <CarteProspect key={p.id} p={p} index={i} onOuvrir={() => onOuvrir(p.id)} />
            ))}
          </div>

          {/* ── Écran large : le tableau maison. */}
          <div className="hidden md:block card-premium overflow-hidden">
            <div className="table-scroll">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="text-left">Prospect</th>
                    <th className="text-left">Contact</th>
                    <th className="text-left">Statut</th>
                    <th className="text-left">Source</th>
                    <th className="text-left">Relance</th>
                    <th className="text-right">Fiche</th>
                  </tr>
                </thead>
                <tbody>
                  {filtres.map((p, i) => {
                    const st = statutInfo(p.statut)
                    const enRetard = !!p.date_relance
                      && String(p.date_relance).slice(0, 10) <= aujourdhui
                      && p.statut !== 'gagne' && p.statut !== 'perdu'
                    return (
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 12) * 0.02 }}
                        className="table-row group cursor-pointer"
                        onClick={() => onOuvrir(p.id)}
                      >
                        <td>
                          <span className="flex items-center gap-3 min-w-0">
                            <span className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {initiales(p.nom)}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-foreground truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {p.nom}
                              </span>
                              {p.entreprise && (
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 truncate">
                                  <Building2 className="w-3 h-3 flex-shrink-0" /> {p.entreprise}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>

                        <td className="text-xs text-muted-foreground">
                          <span className="flex flex-col gap-0.5">
                            {p.telephone && (
                              <span className="flex items-center gap-1.5 whitespace-nowrap">
                                <Phone className="w-3 h-3" /> {p.telephone}
                              </span>
                            )}
                            {p.email && (
                              <span className="flex items-center gap-1.5 truncate max-w-[14rem]">
                                <Mail className="w-3 h-3 flex-shrink-0" /> {p.email}
                              </span>
                            )}
                            {!p.telephone && !p.email && '—'}
                          </span>
                        </td>

                        <td>
                          <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap', st.badge)}>
                            {st.label}
                          </span>
                        </td>

                        <td className="text-sm text-muted-foreground">{p.source || '—'}</td>

                        <td className="whitespace-nowrap">
                          <span className={cn(
                            'flex items-center gap-1.5 text-xs',
                            enRetard ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground',
                          )}>
                            <CalendarClock className="w-3.5 h-3.5" /> {dateFr(p.date_relance)}
                          </span>
                        </td>

                        <td className="text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                            Ouvrir <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {formOuvert && (
        <FormulaireProspect
          enCours={creer.isPending}
          onFermer={() => setFormOuvert(false)}
          onValider={input => creer.mutate(input)}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── */

const initiales = (nom: string) =>
  nom.trim().split(/\s+/).slice(0, 2).map(m => m.charAt(0)).join('').toUpperCase() || '?'

function Kpi({ icon: Icon, libelle, valeur, accent }: {
  icon: React.ElementType; libelle: string; valeur: string; accent: string
}) {
  return (
    <div className="card-premium p-3 flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Icon className={cn('w-4.5 h-4.5', accent)} />
      </span>
      <span className="min-w-0">
        <span className={cn('block text-base font-bold tabular-nums truncate', accent)}>{valeur}</span>
        <span className="block text-[11px] text-muted-foreground">{libelle}</span>
      </span>
    </div>
  )
}

/** Carte mobile — le même contenu que la ligne du tableau, empilé. */
function CarteProspect({ p, index, onOuvrir }: {
  p: CrmProspect; index: number; onOuvrir: () => void
}) {
  const st = statutInfo(p.statut)
  return (
    <motion.button
      type="button"
      onClick={onOuvrir}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.02 }}
      className="card-premium w-full p-3.5 text-left flex items-start gap-3 active:scale-[0.99] transition-transform"
    >
      <span className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {initiales(p.nom)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate flex-1">{p.nom}</span>
          <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0', st.badge)}>
            {st.label}
          </span>
        </span>
        {p.entreprise && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 truncate">
            <Building2 className="w-3 h-3 flex-shrink-0" /> {p.entreprise}
          </span>
        )}
        <span className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
          {p.telephone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {p.telephone}</span>}
          {p.source && <span className="truncate">{p.source}</span>}
          {p.date_relance && (
            <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {dateFr(p.date_relance)}</span>
          )}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
    </motion.button>
  )
}

/* ─────────────────────────────────────────────────────────────── */

/** Formulaire de création. Aucun champ d'attribution : s'attribuer une
 *  fiche est une opération d'administration, le serveur pose lui-même
 *  l'auteur et le responsable. */
function FormulaireProspect({ enCours, onFermer, onValider }: {
  enCours:   boolean
  onFermer:  () => void
  onValider: (input: MyCrmProspectInput) => void
}) {
  const [nom, setNom]               = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [telephone, setTelephone]   = useState('')
  const [email, setEmail]           = useState('')
  const [statut, setStatut]         = useState<StatutProspect>('nouveau')
  const [source, setSource]         = useState('')
  const [valeur, setValeur]         = useState('')
  const [priorite, setPriorite]     = useState<CrmProspectPriorite | ''>('')
  const [relance, setRelance]       = useState('')
  const [notes, setNotes]           = useState('')

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nom.trim()) return
    onValider({
      nom:            nom.trim(),
      entreprise:     entreprise.trim() || null,
      telephone:      telephone.trim() || null,
      email:          email.trim() || null,
      statut:         versContrat(statut),
      source:         source.trim() || null,
      valeur_estimee: valeur.trim() === '' ? null : Number(valeur),
      priorite:       priorite || null,
      date_relance:   relance || null,
      notes:          notes.trim() || null,
    })
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onFermer() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau prospect</DialogTitle>
        </DialogHeader>

        <form onSubmit={soumettre} className="space-y-3">
          <div>
            <label className="form-label" htmlFor="crm-nom">Nom ou raison sociale *</label>
            <Input id="crm-nom" value={nom} onChange={e => setNom(e.target.value)} required autoFocus />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label" htmlFor="crm-entreprise">Société</label>
              <Input id="crm-entreprise" value={entreprise} onChange={e => setEntreprise(e.target.value)} />
            </div>
            <div>
              <label className="form-label" htmlFor="crm-tel">Téléphone</label>
              <Input id="crm-tel" type="tel" inputMode="tel" value={telephone} onChange={e => setTelephone(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="crm-email">E-mail</label>
            <Input id="crm-email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="form-label">Statut</span>
              <Select value={statut} onValueChange={v => setStatut(v as StatutProspect)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUTS.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="form-label">Source</span>
              <Select value={source || TOUS} onValueChange={v => setSource(v === TOUS ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOUS}>Non précisée</SelectItem>
                  {PROSPECT_SOURCES_FALLBACK.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="form-label" htmlFor="crm-valeur">Valeur estimée</label>
              <Input id="crm-valeur" type="number" inputMode="decimal" min="0" step="any"
                value={valeur} onChange={e => setValeur(e.target.value)} />
            </div>
            <div>
              <span className="form-label">Priorité</span>
              <Select value={priorite || TOUS} onValueChange={v => setPriorite(v === TOUS ? '' : v as CrmProspectPriorite)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOUS}>Non précisée</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="moyen">Moyen</SelectItem>
                  <SelectItem value="bas">Bas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="form-label" htmlFor="crm-relance">Relance prévue</label>
              <Input id="crm-relance" type="date" value={relance} onChange={e => setRelance(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="crm-notes">Notes</label>
            <textarea
              id="crm-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-electric-500/30"
              placeholder="Ce qu'il faut retenir de ce prospect…"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onFermer}>Annuler</Button>
            <Button type="submit" disabled={enCours || !nom.trim()}>
              {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Créer le prospect
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
