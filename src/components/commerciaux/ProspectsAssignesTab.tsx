/**
 * PROSPECTS ATTRIBUÉS à un commercial.
 *
 * ── Le fait qui commande tout cet écran ─────────────────────────────
 * Dans l'espace de production, 144 prospects sur 145 n'ont AUCUN
 * responsable (`assigned_to IS NULL`). Le premier commercial qu'on
 * active voit donc une liste vide — et un « Aucun résultat » lui ferait
 * croire à une panne. L'état vide explique la situation, donne le
 * nombre réel de fiches sans responsable (compté ici, jamais écrit en
 * dur) et propose le geste qui la corrige.
 *
 * ── Pourquoi une attribution en masse ───────────────────────────────
 * Attribuer cent prospects un par un, c'est cent clics et cent risques
 * d'oubli. Le sélecteur envoie la sélection en UN appel
 * (commercialsApi.assignProspects), et l'on annonce le nombre RÉELLEMENT
 * traité que renvoie le serveur — une fiche déjà confiée à quelqu'un
 * d'autre peut être refusée, et dire « 40 attribués » quand il y en a 38
 * fabriquerait une confiance fausse.
 *
 * ── Le vocabulaire des statuts ──────────────────────────────────────
 * `prospects.statut` porte SEPT valeurs en base : nouveau, prospect,
 * contacte, qualifie, proposition, gagne, perdu. C'est la seule source
 * qui fait foi ; les colonnes `prospect_status` et `pipeline_stage`
 * existent encore mais ne sont plus alimentées, s'y fier donnerait des
 * pastilles fausses. Toute valeur inconnue est affichée telle quelle,
 * en gris : mieux vaut une étiquette brute qu'une couleur inventée.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle, Building2, CalendarClock, Check, Loader2, Phone, Search,
  Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { commercialsApi, type CrmActivity, type CrmProspect } from '@/lib/api'
import { useProspects, type Prospect } from '@/hooks/useProspects'
import { cn } from '@/lib/utils'

/* Les colonnes de périmètre (migration 102) existent en base et sont
   renvoyées par le CRUD, mais le type `Prospect` du hook ne les déclare
   pas — il décrit l'écran Prospects, qui ne s'en sert pas. On les ajoute
   ici plutôt que d'élargir un type partagé par une dizaine d'écrans. */
type ProspectBrut = Prospect & {
  assigned_to?:      string | null
  assigned_to_name?: string | null
}

export interface StyleStatut { label: string; puce: string; texte: string }

export const STATUTS_PROSPECT: Record<string, StyleStatut> = {
  nouveau:     { label: 'Nouveau',     puce: 'bg-slate-400',   texte: 'text-slate-600 dark:text-slate-300' },
  prospect:    { label: 'Prospect',    puce: 'bg-cyan-500',    texte: 'text-cyan-700 dark:text-cyan-400' },
  contacte:    { label: 'Contacté',    puce: 'bg-blue-500',    texte: 'text-blue-700 dark:text-blue-400' },
  qualifie:    { label: 'Qualifié',    puce: 'bg-violet-500',  texte: 'text-violet-700 dark:text-violet-400' },
  proposition: { label: 'Proposition', puce: 'bg-amber-500',   texte: 'text-amber-700 dark:text-amber-400' },
  gagne:       { label: 'Gagné',       puce: 'bg-emerald-500', texte: 'text-emerald-700 dark:text-emerald-400' },
  perdu:       { label: 'Perdu',       puce: 'bg-red-500',     texte: 'text-red-700 dark:text-red-400' },
}

export function PastilleStatut({ statut }: { statut?: string | null }) {
  const cle = String(statut ?? '').toLowerCase()
  const s = STATUTS_PROSPECT[cle]
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap',
      s ? s.texte : 'text-muted-foreground',
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s ? s.puce : 'bg-slate-300 dark:bg-slate-600')} />
      {s ? s.label : (statut || '—')}
    </span>
  )
}

const dateFr = (d?: string | null) =>
  d ? new Date(String(d).slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—'

const dateHeureFr = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      + ' · ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '—'

/* Une seule et même clé pour le journal d'activité, partagée avec
   l'onglet Activités : deux limites différentes feraient deux requêtes
   pour la même liste, et deux « dernière activité » possiblement
   divergentes sur le même écran. */
export const LIMITE_ACTIVITES = 200
export const cleActivites = (userId: string) => ['commercial-activities', userId, LIMITE_ACTIVITES] as const

export default function ProspectsAssignesTab({ userId, nom }: { userId: string; nom: string }) {
  const qc = useQueryClient()
  const [selecteurOuvert, setSelecteurOuvert] = useState(false)
  const [aRetirer, setARetirer] = useState<CrmProspect | null>(null)

  const cleProspects = ['commercial-prospects', userId] as const

  const q = useQuery({
    queryKey: cleProspects,
    queryFn:  () => commercialsApi.prospects(userId),
    enabled:  !!userId,
  })

  /* Le portefeuille COMPLET de l'espace : il sert au sélecteur, et il
     sert surtout à chiffrer l'état vide. Sans lui on écrirait « aucun
     prospect attribué » sans dire combien attendent un responsable. */
  const tousQ = useProspects()

  /* Silencieux en cas d'échec : la dernière activité est un complément,
     son absence ne doit pas vider le tableau. */
  const activitesQ = useQuery({
    queryKey: cleActivites(userId),
    queryFn:  () => commercialsApi.activities(userId, LIMITE_ACTIVITES),
    enabled:  !!userId,
    retry:    false,
  })

  const derniereActivite = useMemo(() => {
    const carte = new Map<string, string>()
    for (const a of (activitesQ.data?.activities ?? []) as CrmActivity[]) {
      const vue = carte.get(a.prospect_id)
      if (!vue || a.created_at > vue) carte.set(a.prospect_id, a.created_at)
    }
    return carte
  }, [activitesQ.data])

  const prospects = useMemo(() => q.data?.prospects ?? [], [q.data])

  const tous = useMemo(() => (tousQ.data ?? []) as ProspectBrut[], [tousQ.data])
  const sansResponsable = useMemo(() => tous.filter(p => !p.assigned_to), [tous])

  const desattribuer = useMutation({
    mutationFn: (prospectId: string) => commercialsApi.unassignProspect(userId, prospectId),
    onSuccess: () => {
      toast.success('Prospect retiré de son portefeuille')
      setARetirer(null)
      void qc.invalidateQueries({ queryKey: cleProspects })
      void qc.invalidateQueries({ queryKey: ['prospects'] })
      void qc.invalidateQueries({ queryKey: ['commercial', userId] })
      void qc.invalidateQueries({ queryKey: ['commerciaux'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Le retrait a échoué'),
  })

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-14 rounded-xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
        <div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
      </div>
    )
  }

  if (q.isError) {
    return (
      <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-6 text-center">
        <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-red-700 dark:text-red-300">
          Impossible de charger son portefeuille.{' '}
          <button onClick={() => q.refetch()} className="underline">Réessayer</button>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Barre d'action */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            Portefeuille de {nom}
            <span className="ml-2 text-[11px] font-semibold text-muted-foreground">
              {prospects.length} fiche{prospects.length > 1 ? 's' : ''}
            </span>
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            Les prospects qu’il a créés et ceux qu’on lui a attribués.
          </p>
        </div>
        <Button size="sm" onClick={() => setSelecteurOuvert(true)}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Attribuer des prospects
        </Button>
      </div>

      {prospects.length === 0 ? (
        <EtatVide
          nom={nom}
          sansResponsable={sansResponsable.length}
          total={tous.length}
          chargement={tousQ.isLoading}
          onAttribuer={() => setSelecteurOuvert(true)}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">

          {/* Tableau — écrans larges */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
                  <th className="py-2.5 px-3">Prospect</th>
                  <th className="py-2.5 px-3">Société</th>
                  <th className="py-2.5 px-3">Téléphone</th>
                  <th className="py-2.5 px-3">Statut</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Attribué le</th>
                  <th className="py-2.5 px-3">Dernière activité</th>
                  <th className="py-2.5 px-3">Prochaine relance</th>
                  <th className="py-2.5 px-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {prospects.map(p => {
                  const attribue = p.assigned_to === userId
                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground">{p.nom}</div>
                        {!attribue && (
                          <div className="text-[10.5px] text-muted-foreground" title="Fiche qu’il a créée mais dont il n’est pas le responsable désigné.">
                            créée par lui · sans attribution
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{p.entreprise || '—'}</td>
                      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{p.telephone || '—'}</td>
                      <td className="py-2.5 px-3"><PastilleStatut statut={p.statut} /></td>
                      <td className="py-2.5 px-3 text-muted-foreground">{p.source || '—'}</td>
                      <td
                        className="py-2.5 px-3 text-muted-foreground"
                        title="La colonne assigned_to ne conserve pas d’horodatage : la date d’attribution n’est enregistrée nulle part."
                      >
                        —
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                        {dateHeureFr(derniereActivite.get(p.id))}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Relance date={p.date_relance ?? p.relance_at} />
                      </td>
                      <td className="py-2.5 px-3">
                        {attribue && (
                          <button
                            type="button"
                            onClick={() => setARetirer(p)}
                            title="Retirer de son portefeuille"
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cartes — mobile. Un tableau à neuf colonnes sur téléphone se
              lit à l'horizontale, c'est-à-dire pas du tout. */}
          <div className="md:hidden divide-y divide-border">
            {prospects.map(p => {
              const attribue = p.assigned_to === userId
              return (
                <div key={p.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{p.nom}</p>
                      {p.entreprise && (
                        <p className="text-[11.5px] text-muted-foreground truncate flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {p.entreprise}
                        </p>
                      )}
                    </div>
                    <PastilleStatut statut={p.statut} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11.5px] text-muted-foreground">
                    {p.telephone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {p.telephone}</span>}
                    {p.source && <span>{p.source}</span>}
                    <span className="flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" /> {dateHeureFr(derniereActivite.get(p.id))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <Relance date={p.date_relance ?? p.relance_at} />
                    {attribue && (
                      <button
                        type="button"
                        onClick={() => setARetirer(p)}
                        className="text-[11px] text-muted-foreground hover:text-red-600 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Retirer
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[10.5px] text-muted-foreground p-3 border-t border-border leading-snug">
            « Attribué le » reste vide : l’attribution n’est pas horodatée en base, seule la
            personne responsable est enregistrée. « Dernière activité » est le dernier échange que
            {' '}{nom} a lui-même journalisé sur la fiche.
          </p>
        </div>
      )}

      {/* Sélecteur d'attribution */}
      <SelecteurProspects
        ouvert={selecteurOuvert}
        onClose={() => setSelecteurOuvert(false)}
        userId={userId}
        nom={nom}
        tous={tous}
        chargement={tousQ.isLoading}
      />

      {/* Confirmation de retrait */}
      <Dialog open={!!aRetirer} onOpenChange={o => !o && setARetirer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Retirer ce prospect de son portefeuille ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{aRetirer?.nom}</span> retourne au pot
            commun : la fiche, son historique et ses devis restent intacts, elle n’a simplement
            plus de responsable. {nom} ne la verra plus dans son CRM.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setARetirer(null)}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={desattribuer.isPending}
              onClick={() => aRetirer && desattribuer.mutate(aRetirer.id)}
            >
              {desattribuer.isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Retrait…</>
                : <><Trash2 className="w-4 h-4 mr-1.5" /> Retirer</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   ÉTAT VIDE — il EXPLIQUE, il ne constate pas
═══════════════════════════════════════════════════════════════════ */
function EtatVide({ nom, sansResponsable, total, chargement, onAttribuer }: {
  nom: string; sansResponsable: number; total: number; chargement: boolean; onAttribuer: () => void
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
        <Users className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-foreground">Aucun prospect attribué.</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-lg mx-auto leading-relaxed">
        {chargement
          ? 'Comptage du portefeuille de l’espace…'
          : total === 0
            ? 'L’espace ne contient encore aucun prospect : il n’y a rien à lui attribuer pour l’instant.'
            : <>
                <span className="font-semibold text-foreground">{sansResponsable}</span> des{' '}
                <span className="font-semibold text-foreground">{total}</span> prospects de l’espace
                n’ont pas encore de responsable — attribuez-lui-en pour qu’il voie quelque chose
                dans son CRM.
              </>}
      </p>
      {total > 0 && (
        <Button className="mt-4" onClick={onAttribuer}>
          <UserPlus className="w-4 h-4 mr-1.5" /> Attribuer des prospects à {nom}
        </Button>
      )}
    </div>
  )
}

function Relance({ date }: { date?: string | null }) {
  if (!date) return <span className="text-muted-foreground text-[11.5px]">—</span>
  const jour = String(date).slice(0, 10)
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const enRetard = jour < aujourdhui
  const cestAujourdhui = jour === aujourdhui
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[11.5px] font-medium whitespace-nowrap',
      enRetard ? 'text-red-600 dark:text-red-400'
        : cestAujourdhui ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground',
    )}>
      <CalendarClock className="w-3 h-3" />
      {cestAujourdhui ? 'Aujourd’hui' : dateFr(jour)}
      {enRetard && ' · en retard'}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SÉLECTEUR — cases multiples, un seul appel
═══════════════════════════════════════════════════════════════════ */
function SelecteurProspects({ ouvert, onClose, userId, nom, tous, chargement }: {
  ouvert: boolean; onClose: () => void; userId: string; nom: string
  tous: ProspectBrut[]; chargement: boolean
}) {
  const qc = useQueryClient()
  const [recherche, setRecherche] = useState('')
  /* Par défaut on ne propose QUE les fiches sans responsable : ce sont
     celles qu'on cherche à placer, et ce sont les seules qu'aucun
     collègue ne perdra en cours de route. Voir les autres reste possible,
     mais c'est un geste délibéré. */
  const [libresSeulement, setLibresSeulement] = useState(true)
  const [choix, setChoix] = useState<Set<string>>(new Set())

  const candidats = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return tous
      .filter(p => p.assigned_to !== userId)
      .filter(p => !libresSeulement || !p.assigned_to)
      .filter(p => !q || [p.nom, p.entreprise, p.email, p.telephone]
        .some(v => (v ?? '').toLowerCase().includes(q)))
  }, [tous, userId, libresSeulement, recherche])

  const attribuer = useMutation({
    mutationFn: (ids: string[]) => commercialsApi.assignProspects(userId, ids),
    onSuccess: (res, ids) => {
      /* On annonce ce que le SERVEUR dit avoir traité, pas ce qu'on a
         demandé : une fiche déjà confiée à quelqu'un d'autre peut être
         refusée, et un compte optimiste ferait croire à une attribution
         qui n'a pas eu lieu. */
      const faits = typeof res?.assigned === 'number' ? res.assigned : ids.length
      if (faits < ids.length) {
        toast.warning(`${faits} prospect${faits > 1 ? 's' : ''} attribué${faits > 1 ? 's' : ''} sur ${ids.length} demandés — les autres sont déjà confiés à quelqu’un d’autre.`)
      } else {
        toast.success(`${faits} prospect${faits > 1 ? 's' : ''} attribué${faits > 1 ? 's' : ''} à ${nom}`)
      }
      setChoix(new Set())
      setRecherche('')
      onClose()
      void qc.invalidateQueries({ queryKey: ['commercial-prospects', userId] })
      void qc.invalidateQueries({ queryKey: ['prospects'] })
      void qc.invalidateQueries({ queryKey: ['commercial', userId] })
      void qc.invalidateQueries({ queryKey: ['commerciaux'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'L’attribution a échoué'),
  })

  const basculer = (id: string) => {
    const suivant = new Set(choix)
    if (suivant.has(id)) suivant.delete(id)
    else suivant.add(id)
    setChoix(suivant)
  }

  const toutCocher = () => setChoix(new Set(candidats.map(p => p.id)))

  return (
    <Dialog open={ouvert} onOpenChange={o => { if (!o) { setChoix(new Set()); onClose() } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attribuer des prospects à {nom}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                placeholder="Nom, société, téléphone…"
                className="pl-9"
              />
            </div>
            <button
              type="button"
              onClick={() => setLibresSeulement(v => !v)}
              className={cn(
                'text-xs px-3 py-2 rounded-lg font-medium transition-colors border',
                libresSeulement
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              Sans responsable
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{candidats.length} fiche{candidats.length > 1 ? 's' : ''} proposée{candidats.length > 1 ? 's' : ''}</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={toutCocher} disabled={candidats.length === 0}
                      className="text-blue-600 hover:underline disabled:opacity-40">
                Tout cocher
              </button>
              <button type="button" onClick={() => setChoix(new Set())} disabled={choix.size === 0}
                      className="hover:text-foreground hover:underline disabled:opacity-40">
                Vider
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border max-h-[45vh] overflow-y-auto divide-y divide-border">
            {chargement ? (
              <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto" /></div>
            ) : candidats.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {libresSeulement
                  ? 'Plus aucun prospect sans responsable ne correspond. Décochez « Sans responsable » pour reprendre une fiche déjà confiée.'
                  : 'Aucun prospect ne correspond à cette recherche.'}
              </p>
            ) : candidats.map(p => {
              const coche = choix.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  role="checkbox"
                  aria-checked={coche}
                  onClick={() => basculer(p.id)}
                  className="w-full p-2.5 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                    coche ? 'bg-blue-600 border-blue-600 text-white' : 'border-border bg-background',
                  )}>
                    {coche && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-foreground truncate">{p.nom}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {[p.entreprise, p.telephone, p.source].filter(Boolean).join(' · ') || 'Aucune coordonnée'}
                    </span>
                  </span>
                  <PastilleStatut statut={p.statut} />
                  {p.assigned_to && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 whitespace-nowrap flex-shrink-0"
                          title="Déjà confiée à quelqu’un d’autre : le serveur peut refuser de la déplacer.">
                      {p.assigned_to_name ? `Suivi par ${p.assigned_to_name}` : 'Déjà confiée'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-xs text-muted-foreground">
            {choix.size} sélectionné{choix.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => { setChoix(new Set()); onClose() }}>
              <X className="w-4 h-4 mr-1.5" /> Annuler
            </Button>
            <Button
              disabled={choix.size === 0 || attribuer.isPending}
              onClick={() => attribuer.mutate([...choix])}
            >
              {attribuer.isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Attribution…</>
                : <><UserPlus className="w-4 h-4 mr-1.5" /> Attribuer</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
