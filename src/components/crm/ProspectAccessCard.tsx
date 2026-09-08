/**
 * « Responsable commercial » et « Gérer les accès » — les deux commandes
 * d'accès d'une fiche prospect.
 *
 * ── Ce que règlent ces deux blocs ───────────────────────────────────
 * Le premier désigne À QUI appartient la fiche (prospects.assigned_to) ;
 * le second ouvre la fiche à d'AUTRES personnes, droit par droit
 * (crm_record_grants). Les deux écrivent par le même appel — PUT
 * /api/crm/grants/prospect/:id remplace l'état COMPLET — d'où un seul
 * composant : deux écrans séparés auraient chacun envoyé la moitié de
 * l'état et effacé le travail de l'autre.
 *
 * ── L'interface ne décide RIEN ──────────────────────────────────────
 * Masquer un bouton n'a jamais fermé une API. La règle d'accès vit dans
 * server/lib/crmScope.ts et est appliquée par crud.ts ; ce composant ne
 * fait qu'écrire les données que le serveur relit. Le test de rôle
 * ci-dessous sert au CONFORT (ne pas afficher un panneau qui répondrait
 * 403), jamais de barrière.
 *
 * ── Enregistrement immédiat, sans bouton ────────────────────────────
 * Même raisonnement que les réglages de notifications
 * (src/components/settings/MessagesNotifSettings.tsx) — et il pèse plus
 * lourd ici : un bouton « Enregistrer » oublié après avoir DÉCOCHÉ un
 * droit laisserait l'accès grand ouvert en croyant l'avoir fermé. Les
 * envois sont sérialisés (un seul en vol, le dernier état gagne) parce
 * que chaque appel transporte l'état entier : deux requêtes qui se
 * doubleraient pourraient faire gagner l'ancienne.
 *
 * Contrat serveur associé : server/routes/crmAccess.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  UserCog, ShieldCheck, Loader2, Check, AlertCircle, RefreshCw, Search, Info,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crmAccessApi, type CrmAssignable, type CrmGrants } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { currentTenantIdForCache } from '@/lib/authToken'
import { cn, getInitials } from '@/lib/utils'

/* ─── Vocabulaire ─────────────────────────────────────────────────── */

/** Les cinq droits de crm_record_grants, dans l'ordre où ils se lisent :
 *  voir, puis agir de plus en plus loin sur la fiche. */
interface Droits {
  can_view:    boolean
  can_log:     boolean
  can_edit:    boolean
  can_quote:   boolean
  can_convert: boolean
}

const AUCUN_DROIT: Droits = {
  can_view: false, can_log: false, can_edit: false, can_quote: false, can_convert: false,
}

const DROITS: { cle: keyof Droits; label: string; aide: string }[] = [
  { cle: 'can_view',    label: 'Voir',                aide: 'La fiche apparaît dans sa liste de prospects.' },
  { cle: 'can_log',     label: 'Ajouter un suivi',    aide: 'Enregistrer un appel, un WhatsApp, une note.' },
  { cle: 'can_edit',    label: 'Modifier',            aide: 'Changer les coordonnées, l’étape, la valeur estimée.' },
  { cle: 'can_quote',   label: 'Créer un devis',      aide: 'Établir un devis à partir de cette fiche.' },
  { cle: 'can_convert', label: 'Convertir en client', aide: 'Transformer le prospect en client.' },
]

/* Rôles qui voient déjà tout le CRM. Même liste que
   crmScope.estGestionnaire côté serveur — la recopier ici est assumé :
   c'est un choix d'AFFICHAGE, et le serveur reste seul juge. */
const ROLES_GESTIONNAIRES = ['admin', 'super_admin', 'manager']

function estGestionnaire(role: string | null | undefined): boolean {
  return ROLES_GESTIONNAIRES.includes((role ?? '').toLowerCase().trim())
}

const ROLE_LABELS: Record<string, string> = {
  admin:       'Administrateur',
  super_admin: 'Administrateur',
  manager:     'Manager',
  commercial:  'Commercial',
  comptable:   'Comptable',
  developpeur: 'Développeur',
  viewer:      'Lecture seule',
}

const libelleRole = (r: string) => ROLE_LABELS[(r ?? '').toLowerCase()] ?? r

/* Radix refuse un <SelectItem value=""> : il lui faut une valeur non vide
   pour représenter « rien ». Même sentinelle que le formulaire de la
   fiche prospect (src/pages/ProspectDetail.tsx). */
const AUCUN = '__none__'

const extraireDroits = (g: Droits): Droits => ({
  can_view:    g.can_view    === true,
  can_log:     g.can_log     === true,
  can_edit:    g.can_edit    === true,
  can_quote:   g.can_quote   === true,
  can_convert: g.can_convert === true,
})

const aUnDroit = (d: Droits) =>
  d.can_view || d.can_log || d.can_edit || d.can_quote || d.can_convert

/* ─── Composant ───────────────────────────────────────────────────── */

interface ProspectAccessCardProps {
  prospectId: string
  /** Responsable et auteur de la fiche, tels que l'écran appelant les a
   *  déjà chargés. Ils décident si la personne connectée peut partager
   *  cette fiche-ci : le serveur applique la même règle, ceci ne sert
   *  qu'à ne pas afficher un panneau qui répondrait 403. */
  assignedTo?: string | null
  createdBy?:  string | null
}

export default function ProspectAccessCard({ prospectId, assignedTo, createdBy }: ProspectAccessCardProps) {
  const { role, userId } = useAuth()
  const qc = useQueryClient()

  /* Volontairement fermé par défaut, à l'inverse de usePermissions qui
     retombe sur 'admin' quand le rôle est absent : un panneau d'accès ne
     doit pas s'ouvrir parce qu'une session est encore en cours
     d'hydratation. */
  const gestionnaire = estGestionnaire(role)

  /* Le PROPRIÉTAIRE d'une fiche peut la partager — avec l'administration
     seulement (le serveur le vérifie ; ici on ne fait que ne pas
     proposer l'impossible). L'appartenance vient de la fiche elle-même,
     passée en props par l'écran qui l'a déjà chargée : la redemander
     provoquerait un aller-retour de plus juste pour savoir si l'on a le
     droit d'afficher un panneau. */
  const proprietaire = !!userId && (assignedTo === userId || createdBy === userId)
  const peutPartager = gestionnaire || proprietaire

  /* Le tenant entre dans les clés de cache : ce dépôt autorise un
     changement d'espace sans rechargement, et les accès d'un espace
     n'ont rien à faire dans l'autre. */
  const cacheTenant = currentTenantIdForCache()
  const cleAcces = ['crm-grants', 'prospect', prospectId, cacheTenant] as const

  const qPersonnel = useQuery<{ users: CrmAssignable[] }>({
    queryKey: ['crm-assignables', cacheTenant],
    queryFn:  () => crmAccessApi.assignables(),
    enabled:  peutPartager,
    /* Le personnel de l'espace bouge en semaines, pas en secondes. */
    staleTime: 5 * 60_000,
  })

  const qAcces = useQuery<CrmGrants>({
    queryKey: cleAcces,
    queryFn:  () => crmAccessApi.grants('prospect', prospectId),
    enabled:  peutPartager && !!prospectId,
  })

  const [responsable, setResponsable] = useState<string | null>(null)
  const [droits, setDroits] = useState<Record<string, Droits>>({})
  const [recherche, setRecherche] = useState('')

  const [enregistrement, setEnregistrement] = useState(false)
  const [confirme, setConfirme] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* File d'envoi : `enVol` dit qu'une requête est en cours, `aRenvoyer`
     porte le dernier état voulu. Cinq bascules cliquées à la suite ne
     font donc pas cinq requêtes concurrentes dont l'ordre d'arrivée
     déciderait du résultat. */
  const enVol = useRef(false)
  const aRenvoyer = useRef<{ assigned_to: string | null; droits: Record<string, Droits> } | null>(null)

  const appliquer = (d: CrmGrants) => {
    setResponsable(d.assigned_to)
    const carte: Record<string, Droits> = {}
    for (const g of d.grants) carte[g.user_id] = extraireDroits(g)
    setDroits(carte)
  }

  /* Resynchronisation sur le contenu, pas sur l'identité de l'objet :
     react-query renvoie un nouvel objet à chaque refetch, et se caler
     dessus écraserait l'écran à chaque revalidation de fenêtre. Le garde
     `enVol/aRenvoyer` protège le cas inverse : une réponse partie AVANT
     notre dernière bascule ne doit pas la faire sauter. */
  const donnees = qAcces.data
  const signature = donnees ? JSON.stringify(donnees) : ''
  useEffect(() => {
    if (!donnees) return
    if (enVol.current || aRenvoyer.current) return
    appliquer(donnees)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const temoinEnregistre = () => {
    setConfirme(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setConfirme(false), 2_000)
  }

  /**
   * Envoie l'état COMPLET de la fiche (responsable + partages).
   *
   * `assigned_to` est toujours transmis, jamais omis : côté serveur,
   * omettre signifie « ne touche pas » et `null` signifie « retire le
   * responsable ». Comme cet écran affiche la vérité entière, il
   * l'assume entière.
   */
  const pousser = async (etat: { assigned_to: string | null; droits: Record<string, Droits> }) => {
    aRenvoyer.current = etat
    if (enVol.current) return
    enVol.current = true
    setEnregistrement(true)

    let erreur: unknown = null
    try {
      while (aRenvoyer.current) {
        const e = aRenvoyer.current
        aRenvoyer.current = null
        await crmAccessApi.saveGrants('prospect', prospectId, {
          assigned_to: e.assigned_to,
          /* Une ligne sans aucune case cochée n'est pas envoyée : le PUT
             remplace tout, l'absence vaut suppression du partage. */
          grants: Object.entries(e.droits)
            .filter(([, d]) => aUnDroit(d))
            .map(([user_id, d]) => ({ user_id, ...d })),
        })
      }
    } catch (e) {
      erreur = e
      aRenvoyer.current = null
    }

    enVol.current = false
    setEnregistrement(false)

    if (erreur) {
      const msg = erreur instanceof Error ? erreur.message : 'Erreur inconnue'
      toast.error('Accès non enregistrés', { description: msg })
      /* On remet À LA MAIN ce que le serveur avait renvoyé : l'écran doit
         cesser d'afficher un droit qui n'existe pas. Compter sur le
         refetch ne suffirait pas — si la réponse est identique à la
         précédente, la signature ne change pas et l'effet ne rejoue
         jamais. */
      const verite = qc.getQueryData<CrmGrants>(cleAcces)
      if (verite) appliquer(verite)
      void qc.invalidateQueries({ queryKey: cleAcces })
      return
    }

    temoinEnregistre()
    void qc.invalidateQueries({ queryKey: cleAcces })
    /* La liste des prospects filtre désormais sur le responsable : sans
       cette invalidation, réassigner une fiche ne se verrait qu'au
       prochain rechargement complet. */
    void qc.invalidateQueries({ queryKey: ['prospects'] })
  }

  const changerResponsable = (valeur: string) => {
    const suivant = valeur === AUCUN ? null : valeur
    if (suivant === responsable) return
    setResponsable(suivant)
    void pousser({ assigned_to: suivant, droits })
  }

  const basculer = (userId: string, cle: keyof Droits) => {
    const actuel = droits[userId] ?? AUCUN_DROIT
    let suivant: Droits = { ...actuel, [cle]: !actuel[cle] }

    /* Décocher « Voir » remet les quatre autres à zéro. Ce n'est pas une
       commodité : le serveur SUPPRIME une ligne dont can_view est faux
       (crmAccess.normaliserDroits), et la clause de périmètre des listes
       ne regarde que can_view. Garder des cases cochées afficherait donc
       un droit que la base ne conserve pas. */
    if (cle === 'can_view' && !suivant.can_view) suivant = { ...AUCUN_DROIT }
    /* Réciproque, gardée même si les cases sont désactivées sans « Voir » :
       le serveur force can_view dès qu'un autre droit arrive, l'écran ne
       doit pas raconter autre chose. */
    if (cle !== 'can_view' && suivant[cle]) suivant.can_view = true

    const apres = { ...droits, [userId]: suivant }
    setDroits(apres)
    void pousser({ assigned_to: responsable, droits: apres })
  }

  /* Mémorisé : `?? []` fabrique un tableau NEUF à chaque rendu tant que la
     requête n'a pas répondu, ce qui invalidait le useMemo de `lignes` en
     permanence — tri et recherche recalculés à chaque frappe pour rien. */
  const personnel = useMemo(() => qPersonnel.data?.users ?? [], [qPersonnel.data])
  const createur = donnees?.created_by ?? null

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return personnel
      /* Un commercial ne partage qu'avec l'administration : lui montrer
         ses collègues reviendrait à lui proposer des cases que le
         serveur refusera (403). La règle métier est celle du client —
         un portefeuille se confie par la hiérarchie, pas de proche en
         proche — et le serveur l'applique de son côté ; ce filtre ne
         fait qu'éviter la promesse intenable. */
      .filter(u => gestionnaire || estGestionnaire(u.role))
      .filter(u => !q
        || (u.name ?? '').toLowerCase().includes(q)
        || (u.email ?? '').toLowerCase().includes(q))
      /* Ordre alphabétique fixe, et non « ceux qui ont un accès d'abord » :
         une ligne qui saute au moment où on la décoche fait perdre le fil
         et fait cliquer à côté. */
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'fr'))
      .map(u => {
        const d = droits[u.user_id] ?? AUCUN_DROIT
        /* Trois cas où cocher n'aurait aucun effet : le serveur accorde
           déjà l'accès sans partage. Le dire vaut mieux qu'offrir des
           cases qui ne changent rien. */
        const implicite =
          estGestionnaire(u.role)      ? 'Gestionnaire — voit et modifie déjà toutes les fiches.'
          : u.user_id === responsable  ? 'Responsable de cette fiche — accès complet, sans partage.'
          : u.user_id === createur     ? 'A créé cette fiche — accès complet, sans partage.'
          : null
        return { u, d, implicite }
      })
  }, [personnel, droits, responsable, createur, recherche, gestionnaire])

  const nbPartages = useMemo(
    () => Object.values(droits).filter(d => d.can_view).length,
    [droits],
  )

  /* Après les hooks : React exige un nombre d'appels constant. */
  if (!peutPartager) return null

  const chargement = qAcces.isLoading || qPersonnel.isLoading
  const enErreur   = qAcces.isError   || qPersonnel.isError
  const messageErreur =
    (qAcces.error instanceof Error && qAcces.error.message)
    || (qPersonnel.error instanceof Error && qPersonnel.error.message)
    || 'Chargement impossible'

  const temoin = (
    <span className={cn(
      'text-[11px] flex items-center gap-1.5 transition-opacity duration-200',
      enregistrement || confirme ? 'opacity-100' : 'opacity-0',
      confirme ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
    )}>
      {enregistrement
        ? <><Loader2 className="w-3 h-3 animate-spin" /> Enregistrement…</>
        : <><Check className="w-3 h-3" /> Enregistré</>}
    </span>
  )

  /* ── Chargement et panne : un seul bloc, pas deux à moitié vides ── */
  if (chargement || enErreur) {
    return (
      <Bloc title="Accès à cette fiche" icon={ShieldCheck} color="#f59e0b">
        {chargement ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des accès…
          </p>
        ) : (
          <div className="flex items-start gap-2.5 py-1">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Accès non chargés</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{messageErreur}</p>
              <button
                type="button"
                onClick={() => { void qAcces.refetch(); void qPersonnel.refetch() }}
                className="mt-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium
                           text-blue-700 dark:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20
                           border border-blue-500/20 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Réessayer
              </button>
            </div>
          </div>
        )}
      </Bloc>
    )
  }

  const nomDe = (id: string | null) =>
    personnel.find(u => u.user_id === id)?.name ?? null

  return (
    <>
      {/* ── Responsable commercial ─────────────────────────────────── */}
      <Bloc title="Responsable commercial" icon={UserCog} color="#6366f1" droite={temoin}>
        <div className="space-y-2.5">
          <Select value={responsable ?? AUCUN} onValueChange={changerResponsable}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choisir un responsable…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUCUN}>Aucun — fiche non attribuée</SelectItem>
              {personnel.map(u => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.name}
                  <span className="text-muted-foreground"> · {libelleRole(u.role)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-[11px] text-muted-foreground">
            {responsable ? (
              <>
                <strong className="text-foreground">{nomDe(responsable) ?? 'Cette personne'}</strong> retrouve
                cette fiche dans ses prospects et peut la travailler sans partage supplémentaire.
              </>
            ) : (
              <>
                Fiche <strong className="text-foreground">non attribuée</strong> : seuls les administrateurs
                et les managers la voient. Désignez un responsable pour qu’elle apparaisse dans sa liste.
              </>
            )}
          </p>

          <p className="text-[11px] text-muted-foreground/80 border-t border-border pt-2">
            {createur
              ? <>Fiche créée par <strong className="text-foreground">{nomDe(createur) ?? 'un compte supprimé'}</strong> — l’auteur garde son accès, il n’est pas modifiable ici.</>
              : <>Auteur inconnu : cette fiche est antérieure au suivi des accès. Elle reste visible des administrateurs et des managers.</>}
          </p>
        </div>
      </Bloc>

      {/* ── Gérer les accès ────────────────────────────────────────── */}
      <Bloc
        title="Gérer les accès"
        icon={ShieldCheck}
        color="#f59e0b"
        count={nbPartages}
        droite={temoin}
      >
        <p className="text-[11px] text-muted-foreground mb-3">
          Ouvrez cette fiche à d’autres personnes, droit par droit. Les cinq droits sont indépendants :
          on peut laisser quelqu’un ajouter un suivi sans lui permettre de modifier la fiche.
        </p>

        {personnel.length > 5 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher une personne…"
              className="pl-9 h-9 text-sm"
            />
          </div>
        )}

        {personnel.length === 0 ? (
          <p className="text-xs text-muted-foreground/70 py-2">
            Aucun autre compte actif dans l’espace. Ajoutez des utilisateurs pour pouvoir partager cette fiche.
          </p>
        ) : lignes.length === 0 ? (
          <p className="text-xs text-muted-foreground/70 py-2">
            Personne ne correspond à « {recherche.trim()} ».
          </p>
        ) : (
          <div className="space-y-2">
            {lignes.map(({ u, d, implicite }) => (
              <div
                key={u.user_id}
                className={cn(
                  'rounded-xl border p-3 transition-colors',
                  implicite      ? 'border-border bg-muted/20'
                  : d.can_view   ? 'border-blue-500/30 bg-blue-500/[0.04]'
                                 : 'border-border',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center
                                  text-[11px] font-bold text-muted-foreground flex-shrink-0">
                    {getInitials(u.name || u.email || '?')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{u.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted
                                   text-muted-foreground flex-shrink-0">
                    {libelleRole(u.role)}
                  </span>
                </div>

                {implicite ? (
                  <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Check className="w-3 h-3 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {implicite}
                  </p>
                ) : (
                  <>
                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
                      {DROITS.map(({ cle, label, aide }) => {
                        /* Sans « Voir », les quatre autres n'ont rien sur quoi
                           s'appliquer : on les éteint visuellement plutôt que de
                           laisser cocher un droit que le serveur refusera de
                           garder. */
                        const desactive = cle !== 'can_view' && !d.can_view
                        return (
                          <Bascule
                            key={cle}
                            label={label}
                            aide={desactive ? 'Cochez d’abord « Voir » pour ouvrir ce droit.' : aide}
                            valeur={d[cle]}
                            desactive={desactive}
                            onToggle={() => basculer(u.user_id, cle)}
                          />
                        )
                      })}
                    </div>

                    {!d.can_view && (
                      <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        Sans <strong className="text-foreground">« Voir »</strong>, cette fiche n’apparaît
                        pas dans sa liste : les quatre autres droits n’auraient rien sur quoi s’appliquer.
                        Cochez « Voir » pour les ouvrir.
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground/80 border-t border-border mt-3 pt-2">
          Ces droits ne valent que pour <strong className="text-foreground">cette fiche</strong>. Pour ouvrir
          tout le portefeuille à quelqu’un, passez par ses droits d’ensemble dans l’écran Équipe.
          Chaque changement est enregistré immédiatement.
        </p>
      </Bloc>
    </>
  )
}

/* ─── Briques d'affichage ─────────────────────────────────────────── */

/**
 * Même habillage que les sections de la fiche prospect (bandeau titré,
 * pastille d'icône teintée, corps séparé par un filet) — mais sans le
 * repli : un panneau d'accès replié serait un panneau qu'on oublie de
 * vérifier.
 */
function Bloc({
  title, icon: Icon, color, count, droite, children,
}: {
  title: string
  icon: React.ElementType
  color: string
  count?: number
  droite?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}18` }}>
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
          {count !== undefined && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
              style={{ background: `${color}15`, color }}>
              {count}
            </span>
          )}
        </div>
        {droite}
      </div>
      <div className="border-t border-border px-5 py-4">{children}</div>
    </div>
  )
}

/**
 * La bascule maison du dépôt (w-10 h-5, pastille blanche, bleu allumé),
 * reprise trait pour trait de MessagesNotifSettings. Une case à cocher
 * standard se verrait immédiatement comme une pièce rapportée, et cinq
 * cases brutes alignées se lisent moins vite que cinq interrupteurs.
 * Le libellé fait partie du bouton : la cible de clic couvre la cellule
 * entière, ce qui compte sur un écran tactile.
 */
function Bascule({
  label, aide, valeur, desactive, onToggle,
}: {
  label: string
  aide: string
  valeur: boolean
  desactive: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={valeur}
      aria-label={label}
      title={aide}
      disabled={desactive}
      onClick={onToggle}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
        desactive
          ? 'border-border/60 opacity-45 cursor-not-allowed'
          : 'border-border hover:border-electric-500/30',
      )}
    >
      <span className="text-[11px] font-medium text-foreground leading-tight">{label}</span>
      <span className={cn(
        'w-10 h-5 rounded-full transition-all relative flex-shrink-0',
        valeur ? 'bg-blue-600' : 'bg-border',
      )}>
        <span className={cn(
          'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all',
          valeur ? 'right-0.5' : 'left-0.5',
        )} />
      </span>
    </button>
  )
}
