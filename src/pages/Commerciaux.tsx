/**
 * « Les commerciaux » — l'écran d'administration de l'équipe commerciale.
 *
 * ── Pourquoi une page à part d'« Équipe »
 * « Équipe » répond à « qui travaille ici » : fiche RH, contrat, salaire,
 * congés — tout le monde y figure. Cette page répond à une autre
 * question, « qui vend, avec quels droits, et pour quel résultat », et ne
 * montre donc qu'une poignée de personnes, avec des colonnes qui n'ont
 * rien à faire dans un dossier RH (portefeuille, chiffre d'affaires,
 * dernière activité). Les mélanger donnait une page où l'on cherchait un
 * comptable parmi des taux de conversion.
 *
 * ── Ce que la page ne fait PAS
 * Elle ne crée aucun compte. Un commercial est quelqu'un qui existe déjà,
 * à qui on ouvre le CRM — d'où « Rattacher » plutôt que « Créer » dans le
 * dialogue d'ajout, et « Désactiver l'accès » plutôt que « Supprimer »
 * dans les actions de ligne : couper l'accès conserve les fiches et
 * l'historique, et une réactivation ne redemande rien.
 *
 * ── Le cas normal au démarrage : tout est à zéro
 * Sur un espace qui vient d'activer le module, presque aucun prospect
 * n'est attribué (`assigned_to` est nul) et personne n'a encore de
 * capacité. Le premier commercial rattaché verra donc un portefeuille
 * vide — ce n'est pas une panne, c'est une étape. L'écran le dit en
 * toutes lettres et propose le geste qui manque plutôt que d'afficher un
 * « 0 » énigmatique.
 */
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Users, Target, TrendingUp, Wallet, Search, SlidersHorizontal, X,
  UserPlus, ShieldAlert, RefreshCw, Info, ShieldOff, Loader2, Briefcase,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import CommercialsTable, { libelleStatut } from '@/components/commerciaux/CommercialsTable'
import AddCommercialDialog from '@/components/commerciaux/AddCommercialDialog'
import { commercialsApi, type Commercial } from '@/lib/api'
import { formatCurrency, cn } from '@/lib/utils'

const TOUS = '__tous__'

/* Bornes du mois courant, en date locale. Passer par toISOString()
   décalerait le 1er du mois d'un jour pour tout fuseau à l'est de
   Greenwich, et la carte « Conversions du mois » aurait affiché un
   chiffre systématiquement faux au premier jour du mois. */
function moisCourant(): { from: string; to: string } {
  const n = new Date()
  const p = (v: number) => String(v).padStart(2, '0')
  const a = n.getFullYear()
  const m = n.getMonth()
  const dernier = new Date(a, m + 1, 0).getDate()
  return { from: `${a}-${p(m + 1)}-01`, to: `${a}-${p(m + 1)}-${p(dernier)}` }
}

export default function Commerciaux() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const detailBase = tenantSlug ? `/${tenantSlug}/commerciaux` : '/commerciaux'
  const qc = useQueryClient()

  const liste = useQuery({
    queryKey: ['commercials'],
    queryFn:  () => commercialsApi.list(),
    staleTime: 30_000,
  })

  /* Référence stable : un `?? []` recréerait un tableau à chaque rendu et
     relancerait tous les mémos qui en dépendent. */
  const commerciaux = useMemo(() => liste.data?.commercials ?? [], [liste.data])

  const actifs = useMemo(() => commerciaux.filter(c => c.crm_enabled), [commerciaux])

  /* ── Conversions du mois ─────────────────────────────────────────
     `list()` ne renvoie que des compteurs de TOUJOURS ; seule la route
     /performance sait borner une période. On interroge donc chaque
     commercial ACTIF — les autres ne peuvent rien avoir converti ce
     mois-ci sans accès — et on additionne. Une requête par personne
     paraît beaucoup, mais une équipe commerciale se compte en unités, et
     l'alternative (afficher un total de toujours sous l'étiquette « du
     mois ») serait un chiffre faux.
     `retry: false` : si l'une échoue, la carte le dira au lieu de
     retenir la page en chargement. */
  const periode = useMemo(moisCourant, [])
  const perfs = useQueries({
    queries: actifs.map(c => ({
      queryKey:  ['commercials', c.user_id, 'performance', periode.from, periode.to],
      queryFn:   () => commercialsApi.performance(c.user_id, periode),
      staleTime: 60_000,
      retry:     false,
    })),
  })

  const perfsEnCours = perfs.some(p => p.isLoading)
  const perfsPartielles = perfs.some(p => p.isError)
  const conversionsMois = perfs.reduce((s, p) => s + (p.data?.kpis.converted ?? 0), 0)

  const totalProspects = commerciaux.reduce((s, c) => s + c.counts.prospects, 0)
  const caTotal        = commerciaux.reduce((s, c) => s + (Number(c.revenue) || 0), 0)

  /* ── Filtres ─────────────────────────────────────────────────── */
  const [recherche, setRecherche] = useState('')
  const [acces, setAcces]         = useState<string>(TOUS)
  const [statut, setStatut]       = useState<string>(TOUS)

  /* Construit sur les données réelles : proposer « Suspendu » quand
     personne ne l'est donne un filtre qui ne trouve jamais rien. */
  const statuts = useMemo(
    () => [...new Set(commerciaux.map(c => String(c.status ?? '').toLowerCase()).filter(Boolean))].sort(),
    [commerciaux],
  )

  const filtres = useMemo(() => {
    const t = recherche.trim().toLowerCase()
    return commerciaux.filter(c => {
      if (acces === 'actif'   && !c.crm_enabled) return false
      if (acces === 'inactif' &&  c.crm_enabled) return false
      if (statut !== TOUS && String(c.status ?? '').toLowerCase() !== statut) return false
      if (!t) return true
      return [c.name, c.email].some(v => (v ?? '').toLowerCase().includes(t))
    })
  }, [commerciaux, recherche, acces, statut])

  const filtreActif = recherche.trim() !== '' || acces !== TOUS || statut !== TOUS
  const reinitialiser = () => { setRecherche(''); setAcces(TOUS); setStatut(TOUS) }

  /* ── Ajout et bascule d'accès ────────────────────────────────── */
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  /* Désactiver coupe l'accès de quelqu'un sans le prévenir : ça se
     confirme. Activer ne casse rien et part donc directement. */
  const [aDesactiver, setADesactiver] = useState<Commercial | null>(null)

  const bascule = useMutation({
    mutationFn: ({ c, activer }: { c: Commercial; activer: boolean }) =>
      activer ? commercialsApi.add(c.user_id) : commercialsApi.remove(c.user_id),
    onSuccess: (_res, { c, activer }) => {
      /* La racine couvre la liste, les fiches et les performances : trois
         lectures qui se contrediraient si l'une gardait son cache. */
      qc.invalidateQueries({ queryKey: ['commercials'] })
      if (activer) {
        toast.success(`Accès CRM ouvert pour ${c.name}`, {
          description: "Droits de départ accordés — ajuste-les depuis l'onglet Permissions de sa fiche.",
        })
      } else {
        toast.success(`Accès CRM retiré à ${c.name}`, {
          description: 'Ses fiches et son historique sont conservés.',
        })
      }
      setADesactiver(null)
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "L'accès n'a pas pu être modifié")
    },
  })

  const onBasculerAcces = (c: Commercial) => {
    if (c.crm_enabled) setADesactiver(c)
    else bascule.mutate({ c, activer: true })
  }

  /* ── En-tête, commun à tous les états : on ne fait jamais disparaître
        le titre ni le bouton d'ajout, même en erreur — sinon un espace
        vide ressemble à une page cassée sans issue. ── */
  const entete = (
    <div className="page-header">
      <div>
        <h1 className="page-title">Les commerciaux</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Équipe gère tous les employés ; ici, l'équipe commerciale, ses accès CRM
          et ses résultats.
        </p>
      </div>
      <div>
        <Button size="sm" onClick={() => setAjoutOuvert(true)}>
          <UserPlus className="w-4 h-4" /> Ajouter un commercial
        </Button>
      </div>
    </div>
  )

  /* ── Chargement ────────────────────────────────────────────────── */
  if (liste.isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {entete}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-[74px] rounded-2xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
          ))}
        </div>
        <div className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
        <div className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
      </div>
    )
  }

  /* ── Erreur ────────────────────────────────────────────────────── */
  if (liste.isError) {
    return (
      <div className="space-y-6 animate-fade-in">
        {entete}
        <div className="card-premium p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-rose-600 dark:text-rose-400" />
          </div>
          <h3 className="text-base font-bold text-foreground">Liste des commerciaux indisponible</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            {liste.error instanceof Error ? liste.error.message : 'La requête a échoué.'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Si le message parle d'autorisation, ton rôle ne permet pas d'administrer
            les accès commerciaux.
          </p>
          <Button variant="secondary" size="sm" className="mt-5" onClick={() => liste.refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Réessayer
          </Button>
        </div>
        <AddCommercialDialog open={ajoutOuvert} onOpenChange={setAjoutOuvert} />
      </div>
    )
  }

  /* ── Personne, nulle part ──────────────────────────────────────── */
  if (commerciaux.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        {entete}
        <div className="card-premium p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-base font-bold text-foreground">Aucun commercial pour l'instant</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            Ajoutez-en un depuis vos employés : on ouvre le CRM à quelqu'un qui
            travaille déjà chez vous, aucun second compte n'est créé.
          </p>
          <Button className="mt-5" onClick={() => setAjoutOuvert(true)}>
            <UserPlus className="w-4 h-4" /> Ajouter un commercial
          </Button>
        </div>
        <AddCommercialDialog open={ajoutOuvert} onOpenChange={setAjoutOuvert} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {entete}

      {/* ── Bandeau KPI ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          libelle="Commerciaux actifs"
          valeur={`${actifs.length}`}
          detail={commerciaux.length > actifs.length ? `sur ${commerciaux.length} rattachés` : undefined}
          icon={Users} color="text-blue-600 dark:text-blue-400" bg="bg-blue-500/20"
        />
        <Kpi
          libelle="Prospects attribués"
          valeur={`${totalProspects}`}
          icon={Target} color="text-cyan-600 dark:text-cyan-400" bg="bg-cyan-500/20"
        />
        <Kpi
          libelle="Conversions du mois"
          valeur={perfsEnCours ? '…' : `${conversionsMois}`}
          detail={perfsPartielles && !perfsEnCours ? 'total partiel' : undefined}
          icon={TrendingUp} color="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-500/20"
        />
        <Kpi
          libelle="Chiffre d'affaires généré"
          valeur={formatCurrency(caTotal)}
          icon={Wallet} color="text-amber-600 dark:text-amber-400" bg="bg-amber-500/20"
        />
      </div>

      {/* ── L'étape qui manque, dite explicitement ─────────────────────
           144 prospects sur 145 arrivent sans `assigned_to` : tant que
           l'administration n'a rien attribué, chaque commercial ouvre un
           portefeuille vide. Sans ce bandeau, on cherche la panne. ── */}
      {actifs.length > 0 && totalProspects === 0 && (
        <div className="card-premium p-4 flex items-start gap-3 border-l-4 border-l-blue-500">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Aucun prospect n'est encore attribué
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Vos commerciaux ont l'accès, mais leur liste restera vide tant qu'aucune
              fiche ne leur sera confiée. Ouvrez la fiche d'un commercial, onglet
              <strong> Prospects</strong>, pour lui en attribuer plusieurs d'un coup.
            </p>
          </div>
        </div>
      )}

      {/* ── Recherche et filtres ───────────────────────────────────── */}
      <div className="card-premium p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un commercial (nom, e-mail)…"
            className="pl-9 h-9"
            aria-label="Rechercher un commercial"
          />
        </div>

        <Select value={acces} onValueChange={setAcces}>
          <SelectTrigger className="h-9 w-auto min-w-[10rem]">
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOUS}>Tous les accès CRM</SelectItem>
            <SelectItem value="actif">Accès actif</SelectItem>
            <SelectItem value="inactif">Accès inactif</SelectItem>
          </SelectContent>
        </Select>

        {statuts.length > 1 && (
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="h-9 w-auto min-w-[9rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUS}>Tous les statuts</SelectItem>
              {statuts.map(s => (
                <SelectItem key={s} value={s}>{libelleStatut(s)}</SelectItem>
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
          {filtres.length} / {commerciaux.length}
        </span>
      </div>

      {/* ── Liste ──────────────────────────────────────────────────── */}
      {filtres.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <Search className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Aucun commercial ne correspond</p>
          <p className="text-xs text-muted-foreground mt-1">
            Essaie un autre terme, ou retire un filtre.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={reinitialiser}>
            Réinitialiser les filtres
          </Button>
        </div>
      ) : (
        <CommercialsTable
          commerciaux={filtres}
          detailBase={detailBase}
          onBasculerAcces={onBasculerAcces}
          userIdEnCours={bascule.isPending ? (bascule.variables?.c.user_id ?? null) : null}
        />
      )}

      <AddCommercialDialog open={ajoutOuvert} onOpenChange={setAjoutOuvert} />

      {/* ── Confirmation de désactivation ──────────────────────────── */}
      <Dialog
        open={aDesactiver !== null}
        onOpenChange={o => { if (!o && !bascule.isPending) setADesactiver(null) }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldOff className="w-5 h-5 text-red-500" /> Désactiver l'accès CRM
            </DialogTitle>
            <DialogDescription>
              {aDesactiver?.name} ne verra plus le module commercial dans son espace.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs text-foreground font-medium">L'historique est conservé.</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Ses prospects, ses clients, ses devis et ses activités restent en place,
              ainsi que ses permissions détaillées. Réactiver l'accès plus tard lui
              rendra tout tel quel — rien n'est à reconfigurer.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="secondary"
              disabled={bascule.isPending}
              onClick={() => setADesactiver(null)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={bascule.isPending}
              onClick={() => aDesactiver && bascule.mutate({ c: aDesactiver, activer: false })}
            >
              {bascule.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ShieldOff className="w-4 h-4" />}
              Désactiver l'accès
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* Même carte que le bandeau d'« Équipe » : icône dans un carré teinté,
   valeur, libellé. La ligne de détail est optionnelle — elle sert aux
   chiffres qui mentiraient seuls (« 3 » actifs quand 7 sont rattachés). */
function Kpi({
  libelle, valeur, detail, icon: Icon, color, bg,
}: {
  libelle: string
  valeur:  string
  detail?: string
  icon:    React.ElementType
  color:   string
  bg:      string
}) {
  return (
    <div className="card-premium p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-foreground tabular-nums truncate">{valeur}</p>
        <p className="text-xs text-muted-foreground truncate">{libelle}</p>
        {detail && <p className="text-[10px] text-muted-foreground/70 truncate">{detail}</p>}
      </div>
    </div>
  )
}
