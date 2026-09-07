/**
 * ACCÈS ET PERMISSIONS d'un commercial — la pièce maîtresse de sa fiche.
 *
 * ── Ce que cet écran est, et ce qu'il n'est pas ─────────────────────
 * C'est l'écran où l'administration ACCORDE des droits. Ce n'est pas
 * l'écran qui les applique : chaque route du module commercial revérifie
 * la capacité côté serveur (server/lib/crmScope.ts). Décocher une case
 * ici ne « cache » donc pas un bouton, cela ferme une porte — et cocher
 * une case n'ouvre rien que le serveur n'accorde pas de son côté.
 *
 * ── Pourquoi l'enregistrement est immédiat, sans bouton ─────────────
 * Ces cases se cochent une par une, en réaction à un besoin précis
 * (« laisse-le envoyer les devis »). Un bouton « Enregistrer » oublié
 * laisserait le droit fermé sans que personne ne s'en aperçoive, et la
 * personne concernée découvrirait un 403 sans explication. Même choix
 * que l'onglet Messagerie de la fiche d'un membre (EquipeMemberDetail).
 *
 * ── Pourquoi la sauvegarde renvoie la liste ENTIÈRE ─────────────────
 * PUT /capabilities REMPLACE : ce qui n'est pas envoyé est retiré. On
 * repart donc toujours de l'état en cache (déjà mis à jour de façon
 * optimiste), jamais d'un état local recalculé — deux clics rapides sur
 * deux cases différentes révoqueraient sinon la première.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, ArrowRightLeft, Building2, Check, Eye, FileText, Globe, Info,
  Loader2, Lock, ShieldCheck, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  commercialsApi, COMMERCIAL_CAPABILITY_LABELS,
  type Commercial, type CommercialCapability,
} from '@/lib/api'
import { cn } from '@/lib/utils'

/* Forme exacte de ce que renvoie commercialsApi.get() — la fiche ET la
   liste de capacités à plat. Les deux portent la même information ; on
   met les deux à jour à l'écriture optimiste pour que l'en-tête de la
   page (qui lit `commercial.crm_enabled`) ne mente pas une seconde. */
interface FicheCommercial {
  commercial:   Commercial
  capabilities: CommercialCapability[]
}

interface CaseDroit {
  cap:   CommercialCapability
  court: string
  aide:  string
}

interface GroupeDroits {
  cle:    string
  titre:  string
  icone:  React.ElementType
  ton:    string
  cases:  CaseDroit[]
}

/* Découpage voulu par le client : cinq familles, dans cet ordre. Les
   libellés visibles sont volontairement COURTS (« voir », « voir tous »)
   parce qu'ils se lisent en colonne sous un titre de famille ; la phrase
   d'aide dessous porte le sens. Le libellé long partagé
   (COMMERCIAL_CAPABILITY_LABELS) reste attaché en infobulle : c'est la
   formulation qu'emploient les autres écrans, elle ne doit pas diverger. */
const GROUPES: GroupeDroits[] = [
  {
    cle: 'prospects',
    titre: 'Prospects',
    icone: Users,
    ton: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    cases: [
      { cap: 'prospects.view',      court: 'Voir',           aide: 'Consulter les prospects de son périmètre : ceux qu’il a créés et ceux qu’on lui a attribués.' },
      { cap: 'prospects.view_all',  court: 'Voir tous',      aide: 'Élargit sa vue à TOUS les prospects de l’espace, y compris ceux de ses collègues.' },
      { cap: 'prospects.create',    court: 'Ajouter',        aide: 'Créer une nouvelle fiche prospect. Il en devient automatiquement le responsable.' },
      { cap: 'prospects.edit',      court: 'Modifier',       aide: 'Corriger les fiches de son périmètre : coordonnées, statut, valeur estimée.' },
      { cap: 'prospects.edit_all',  court: 'Modifier tous',  aide: 'Modifier n’importe quelle fiche de l’espace, même celle d’un collègue.' },
      { cap: 'prospects.delete',    court: 'Supprimer',      aide: 'Supprimer une fiche prospect. Geste irréversible : à réserver aux doublons.' },
      { cap: 'prospects.assign',    court: 'Attribuer',      aide: 'Confier un prospect à quelqu’un d’autre. C’est un droit d’encadrement.' },
    ],
  },
  {
    cle: 'clients',
    titre: 'Clients',
    icone: Building2,
    ton: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    cases: [
      { cap: 'clients.view',      court: 'Voir',          aide: 'Consulter les clients de son périmètre.' },
      { cap: 'clients.view_all',  court: 'Voir tous',     aide: 'Voir tout le fichier clients de l’espace.' },
      { cap: 'clients.create',    court: 'Ajouter',       aide: 'Créer une fiche client sans passer par une conversion de prospect.' },
      { cap: 'clients.edit',      court: 'Modifier',      aide: 'Mettre à jour les clients de son périmètre.' },
      { cap: 'clients.edit_all',  court: 'Modifier tous', aide: 'Modifier n’importe quelle fiche client de l’espace.' },
      { cap: 'clients.delete',    court: 'Supprimer',     aide: 'Supprimer une fiche client. Rarement souhaitable : l’historique part avec.' },
    ],
  },
  {
    cle: 'devis',
    titre: 'Devis',
    icone: FileText,
    ton: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
    cases: [
      { cap: 'devis.view',      court: 'Voir',          aide: 'Consulter les devis de son périmètre.' },
      { cap: 'devis.view_all',  court: 'Voir tous',     aide: 'Voir tous les devis de l’espace, montants compris.' },
      { cap: 'devis.create',    court: 'Créer',         aide: 'Établir un devis pour un prospect ou un client.' },
      { cap: 'devis.edit',      court: 'Modifier',      aide: 'Retoucher les devis de son périmètre tant qu’ils ne sont pas acceptés.' },
      { cap: 'devis.edit_all',  court: 'Modifier tous', aide: 'Retoucher n’importe quel devis de l’espace.' },
      { cap: 'devis.send',      court: 'Envoyer',       aide: 'Transmettre le devis au client. C’est le geste qui engage l’entreprise.' },
      { cap: 'devis.delete',    court: 'Supprimer',     aide: 'Supprimer un devis.' },
    ],
  },
  {
    cle: 'activites',
    titre: 'Activités',
    icone: Activity,
    ton: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    cases: [
      { cap: 'activities.view',      court: 'Voir',        aide: 'Lire l’historique des échanges sur les fiches de son périmètre.' },
      { cap: 'activities.view_all',  court: 'Voir toutes', aide: 'Lire l’historique de toutes les fiches de l’espace.' },
      { cap: 'activities.create',    court: 'Ajouter',     aide: 'Journaliser un échange. Sans elle, aucun canal ci-dessous ne s’enregistre.' },
      { cap: 'activities.edit',      court: 'Modifier',    aide: 'Corriger une activité déjà enregistrée.' },
      { cap: 'activities.note',      court: 'Note',        aide: 'Écrire une note libre sur une fiche.' },
      { cap: 'activities.call',      court: 'Appel',       aide: 'Enregistrer un appel et sa durée.' },
      { cap: 'activities.whatsapp',  court: 'WhatsApp',    aide: 'Consigner un échange WhatsApp.' },
      { cap: 'activities.followup',  court: 'Relance',     aide: 'Planifier une relance à une date donnée.' },
    ],
  },
  {
    cle: 'conversion',
    titre: 'Conversion',
    icone: ArrowRightLeft,
    ton: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
    cases: [
      { cap: 'convert.all', court: 'Convertir un prospect en client', aide: 'Transformer un prospect gagné en fiche client. La fiche prospect est conservée et reliée au client créé.' },
    ],
  },
]

/* Toutes les capacités détaillées, hors interrupteur maître : le
   raccourci « Tout autoriser » les coche, « Tout retirer » les décoche.
   Dérivé de GROUPES plutôt que réécrit à la main — une case ajoutée à un
   groupe entre d'elle-même dans les deux raccourcis. */
const TOUTES_DETAILLEES: CommercialCapability[] =
  GROUPES.flatMap(g => g.cases.map(c => c.cap))

export default function CrmPermissionsPanel({ userId, nom }: { userId: string; nom: string }) {
  const qc = useQueryClient()
  const [vientEnregistrer, setVientEnregistrer] = useState(false)

  /* MÊME clé que la page : la requête est partagée, pas dupliquée, et
     l'écriture optimiste ci-dessous rafraîchit l'en-tête en même temps
     que ce panneau. */
  const cle = ['commercial', userId] as const

  const q = useQuery({
    queryKey: cle,
    queryFn:  () => commercialsApi.get(userId),
    enabled:  !!userId,
  })

  const m = useMutation({
    mutationFn: (caps: CommercialCapability[]) => commercialsApi.saveCapabilities(userId, caps),
    /* Bascule optimiste : la case répond au doigt, le serveur confirme
       derrière. En cas d'échec on remet l'état précédent — une case qui
       reste cochée après un refus est un mensonge sur un droit d'accès. */
    onMutate: async (caps) => {
      await qc.cancelQueries({ queryKey: cle })
      const avant = qc.getQueryData<FicheCommercial>(cle)
      qc.setQueryData<FicheCommercial>(cle, ancien => ancien ? {
        ...ancien,
        capabilities: caps,
        commercial: {
          ...ancien.commercial,
          capabilities: caps,
          crm_enabled:  caps.includes('crm.access'),
        },
      } : ancien)
      return { avant }
    },
    onError: (e: any, _caps, contexte) => {
      if (contexte?.avant) qc.setQueryData<FicheCommercial>(cle, contexte.avant)
      toast.error(e?.message ?? 'Les droits n’ont pas pu être enregistrés')
    },
    onSuccess: () => {
      setVientEnregistrer(true)
      setTimeout(() => setVientEnregistrer(false), 2000)
      /* La liste des commerciaux affiche « accès actif » et le nombre de
         droits : sans cette invalidation, revenir en arrière montrerait
         l'état d'avant la modification. */
      void qc.invalidateQueries({ queryKey: ['commerciaux'] })
    },
  })

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    )
  }

  if (q.isError || !q.data) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Impossible de charger les droits de cette personne.{' '}
        <button onClick={() => q.refetch()} className="text-blue-600 hover:underline">Réessayer</button>
      </div>
    )
  }

  /* L'état affiché vient TOUJOURS du cache : c'est lui que la bascule
     optimiste met à jour, et c'est donc lui qui est juste entre le clic
     et la réponse du serveur. */
  const actuelles = new Set<CommercialCapability>(q.data.capabilities ?? [])
  const accesOuvert = actuelles.has('crm.access')

  /* Recompose la liste ENTIÈRE à partir du cache, jamais d'un état local :
     PUT remplace, et deux clics rapides sur deux cases doivent s'ajouter,
     pas s'annuler. */
  const enregistrer = (caps: Set<CommercialCapability>) => m.mutate([...caps])

  const basculer = (cap: CommercialCapability) => {
    const suivant = new Set(actuelles)
    if (suivant.has(cap)) suivant.delete(cap)
    else suivant.add(cap)
    enregistrer(suivant)
  }

  const basculerAcces = () => {
    const suivant = new Set(actuelles)
    /* Couper l'accès retire crm.access, et LUI SEUL : les droits
       détaillés restent en place pour qu'une réactivation ne demande pas
       de tout reconfigurer. C'est exactement ce que fait la route
       DELETE /api/commercials/:id côté serveur. */
    if (accesOuvert) suivant.delete('crm.access')
    else suivant.add('crm.access')
    enregistrer(suivant)
  }

  const toutAutoriser = () => {
    const suivant = new Set<CommercialCapability>(TOUTES_DETAILLEES)
    if (accesOuvert) suivant.add('crm.access')
    enregistrer(suivant)
  }

  const toutRetirer = () => {
    /* On ne coupe PAS l'accès au passage : cette personne garderait le
       CRM dans son menu mais ne pourrait plus rien y ouvrir, et personne
       ne comprendrait pourquoi. L'accès se coupe à l'interrupteur, qui
       le dit en toutes lettres. */
    const suivant = new Set<CommercialCapability>()
    if (accesOuvert) suivant.add('crm.access')
    enregistrer(suivant)
  }

  const nbAccordes = TOUTES_DETAILLEES.filter(c => actuelles.has(c)).length

  return (
    <div className="space-y-4">

      {/* ── Interrupteur maître ───────────────────────────────────── */}
      <div className={cn(
        'rounded-xl border p-4 transition-colors',
        accesOuvert
          ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
          : 'border-border bg-card',
      )}>
        <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            accesOuvert
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground',
          )}>
            {accesOuvert ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-foreground">Accès CRM</h3>
              <TemoinEnregistrement enCours={m.isPending} vientEnregistrer={vientEnregistrer} />
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              {accesOuvert
                ? `${nom} voit le module commercial dans son espace. Les droits ci-dessous décident de ce qu’il peut y faire.`
                : 'Sans cet accès, le CRM n’apparaît pas dans son espace. Les droits déjà accordés sont conservés et redeviendront actifs à la réouverture.'}
            </p>
          </div>

          <Interrupteur
            actif={accesOuvert}
            enCours={m.isPending}
            onClick={basculerAcces}
            libelle={accesOuvert ? 'Couper l’accès CRM' : 'Ouvrir l’accès CRM'}
          />
        </div>
      </div>

      {/* ── Raccourcis ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-1">
        <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
          {nbAccordes} droit{nbAccordes > 1 ? 's' : ''} accordé{nbAccordes > 1 ? 's' : ''} sur {TOUTES_DETAILLEES.length}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toutAutoriser}
            disabled={!accesOuvert || m.isPending}
            className="text-[11px] text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Tout autoriser
          </button>
          <button
            type="button"
            onClick={toutRetirer}
            disabled={!accesOuvert || m.isPending || nbAccordes === 0}
            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-40 disabled:no-underline"
            title="Décoche tous les droits détaillés. L’accès CRM lui-même se coupe avec l’interrupteur ci-dessus."
          >
            Tout retirer
          </button>
        </div>
      </div>

      {/* ── Les cinq groupes ──────────────────────────────────────── */}
      <div className={cn(
        'space-y-4 transition-opacity',
        !accesOuvert && 'opacity-40 pointer-events-none select-none',
      )}>
        {GROUPES.map(groupe => (
          <section key={groupe.cle} className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="flex items-center gap-2 p-3 border-b border-border">
              <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center', groupe.ton)}>
                <groupe.icone className="w-3.5 h-3.5" />
              </span>
              <h4 className="text-sm font-semibold text-foreground">{groupe.titre}</h4>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {groupe.cases.filter(c => actuelles.has(c.cap)).length}/{groupe.cases.length}
              </span>
            </header>

            <div className="divide-y divide-border">
              {groupe.cases.map(c => (
                <LigneDroit
                  key={c.cap}
                  coche={actuelles.has(c.cap)}
                  court={c.court}
                  aide={c.aide}
                  titreLong={COMMERCIAL_CAPABILITY_LABELS[c.cap]}
                  onToggle={() => basculer(c.cap)}
                />
              ))}
            </div>
          </section>
        ))}

        {/* ── Périmètre : une LECTURE de l'état, pas une case de plus ── */}
        <Perimetre
          voit={actuelles.has('prospects.view')}
          voitTout={actuelles.has('prospects.view_all')}
          nom={nom}
          onChoisir={(tout) => {
            const suivant = new Set(actuelles)
            if (tout) {
              suivant.add('prospects.view_all')
              /* Voir tout sans « voir » est un état incohérent que le
                 serveur devrait rattraper : on ne le fabrique pas. */
              suivant.add('prospects.view')
            } else {
              suivant.delete('prospects.view_all')
            }
            enregistrer(suivant)
          }}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   BRIQUES
═══════════════════════════════════════════════════════════════════ */

function TemoinEnregistrement({ enCours, vientEnregistrer }: { enCours: boolean; vientEnregistrer: boolean }) {
  return (
    <span className={cn(
      'text-[11px] inline-flex items-center gap-1.5 transition-opacity duration-200',
      enCours || vientEnregistrer ? 'opacity-100' : 'opacity-0',
      vientEnregistrer ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
    )}>
      {enCours
        ? <><Loader2 className="w-3 h-3 animate-spin" /> Enregistrement…</>
        : <><Check className="w-3 h-3" /> Enregistré</>}
    </span>
  )
}

/* Bascule maison : il n'existe pas de composant Switch dans ui/, et
   celle-ci reprend trait pour trait celle de l'onglet Messagerie — deux
   interrupteurs différents dans le même produit se lisent comme deux
   comportements différents. */
function Interrupteur({ actif, enCours, onClick, libelle }: {
  actif: boolean; enCours: boolean; onClick: () => void; libelle: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      aria-label={libelle}
      title={libelle}
      disabled={enCours}
      onClick={onClick}
      className={cn(
        'w-12 h-6 rounded-full transition-all relative flex-shrink-0 disabled:opacity-60',
        actif ? 'bg-emerald-600' : 'bg-border',
      )}
    >
      <span className={cn(
        'w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm',
        actif ? 'right-0.5' : 'left-0.5',
      )} />
    </button>
  )
}

function LigneDroit({ coche, court, aide, titreLong, onToggle }: {
  coche: boolean; court: string; aide: string; titreLong: string; onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={coche}
      title={titreLong}
      onClick={onToggle}
      className="w-full p-3 flex items-start gap-3 text-left hover:bg-muted/40 transition-colors"
    >
      <span className={cn(
        'w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
        coche
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'border-border bg-background',
      )}>
        {coche && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn(
          'block text-sm font-medium',
          coche ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {court}
        </span>
        <span className="block text-[11.5px] text-muted-foreground leading-snug mt-0.5">{aide}</span>
      </span>
    </button>
  )
}

/* Le périmètre n'est pas un droit de plus : c'est ce que les cases déjà
   cochées PRODUISENT. On l'affiche donc en toutes lettres, parce que
   « prospects.view_all » ne dit rien à l'administrateur qui doit décider
   si son commercial voit le portefeuille de ses collègues. */
function Perimetre({ voit, voitTout, nom, onChoisir }: {
  voit: boolean; voitTout: boolean; nom: string; onChoisir: (tout: boolean) => void
}) {
  const lecture = !voit && !voitTout
    ? 'Aucun prospect'
    : voitTout
      ? 'Tous les prospects de l’espace'
      : 'Ses prospects uniquement'

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="flex items-center gap-2 p-3 border-b border-border">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-500/10 text-slate-600 dark:text-slate-300">
          <Eye className="w-3.5 h-3.5" />
        </span>
        <h4 className="text-sm font-semibold text-foreground">Périmètre</h4>
      </header>

      <div className="p-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Ce que {nom} voit aujourd’hui :{' '}
          <span className="font-semibold text-foreground">{lecture}</span>
        </p>

        {!voit && !voitTout ? (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg p-2.5">
            Aucun droit de consultation sur les prospects n’est accordé : son CRM restera vide
            quoi qu’on lui attribue. Cochez « Voir » dans le groupe Prospects.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ChoixPerimetre
              actif={!voitTout}
              icone={Users}
              titre="Ses prospects uniquement"
              aide="Ce qu’il a créé et ce qu’on lui a attribué. C’est le réglage par défaut."
              onClick={() => onChoisir(false)}
            />
            <ChoixPerimetre
              actif={voitTout}
              icone={Globe}
              titre="Tous les prospects de l’espace"
              aide="Il voit aussi le portefeuille de ses collègues. À réserver aux profils d’encadrement."
              onClick={() => onChoisir(true)}
            />
          </div>
        )}

        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-1 border-t border-border">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          Le périmètre est appliqué par le serveur, à chaque requête : ce n’est pas cet écran qui
          masque des fiches. Une fiche hors périmètre n’est pas cachée, elle n’est jamais envoyée.
        </p>
      </div>
    </section>
  )
}

function ChoixPerimetre({ actif, icone: Icone, titre, aide, onClick }: {
  actif: boolean; icone: React.ElementType; titre: string; aide: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={actif}
      onClick={onClick}
      className={cn(
        'text-left rounded-lg border p-3 transition-colors',
        actif
          ? 'border-blue-500/40 bg-blue-500/[0.06]'
          : 'border-border bg-background hover:border-blue-500/25 hover:bg-muted/40',
      )}
    >
      <span className="flex items-center gap-2">
        <Icone className={cn('w-3.5 h-3.5', actif ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')} />
        <span className={cn('text-sm font-medium', actif ? 'text-foreground' : 'text-muted-foreground')}>{titre}</span>
        {actif && <Check className="w-3.5 h-3.5 ml-auto text-blue-600 dark:text-blue-400" />}
      </span>
      <span className="block text-[11.5px] text-muted-foreground leading-snug mt-1">{aide}</span>
    </button>
  )
}
