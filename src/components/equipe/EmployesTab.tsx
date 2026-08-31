/**
 * Onglet « Employés » — la liste des salariés, et rien d'autre.
 *
 * ── Pourquoi un onglet séparé de « Stagiaires » et d'« Espace équipe »
 * Les trois écrans parlent de personnes, mais pas des mêmes ni de la même
 * chose. « Espace équipe » gère des COMPTES (invitations, suspension,
 * accès SOP) ; « Stagiaires » lit une table à part (`stagiaires`, avec
 * école, convention, dates de stage) ; celui-ci lit la fiche RH des
 * salariés dans `team_members` — poste, département, entrée, statut.
 *
 * ── Qui est « employé »
 * `team_members.member_type` vaut 'employee', 'trainer' ou 'freelance'.
 * La colonne peut aussi être VIDE : le formulaire « Ajouter un salarié »
 * de cette page ne la renseigne pas. Une fiche sans type est donc traitée
 * comme un employé — c'est ce que la personne a voulu dire en l'ajoutant
 * par ce formulaire, et l'inverse la ferait disparaître de l'écran sans
 * qu'on comprenne pourquoi. Formateurs et freelances sont exclus.
 *
 * ── Deux sources, une seule ligne
 * La fiche RH (`teamApi`, CRUD générique) porte poste, département, date
 * d'entrée et salaire ; l'état du COMPTE (invité / actif / suspendu) ne
 * vit que dans `/api/team/members`. Les deux sont recoupés par `id` pour
 * qu'une ligne dise enfin la même chose partout — sans quoi un salarié
 * peut être « Actif » côté RH et n'avoir jamais accepté son invitation.
 */
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, Search, Building2, Briefcase, CalendarDays, Mail, Phone,
  ChevronRight, UserPlus, Wallet, SlidersHorizontal, X, ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useTeam, type TeamMember } from '@/hooks/useTeam'
import { useAuth } from '@/hooks/useAuth'
import { teamMgmtApi, type TeamMemberRow } from '@/lib/api'
import { cn } from '@/lib/utils'

/* Liste d'INCLUSION plutôt que d'exclusion : un type de collaboration
   ajouté demain (alternant, prestataire…) ne doit pas atterrir ici par
   défaut. La colonne a un DEFAULT 'employee' en base, donc une valeur
   vide ne se rencontre en pratique que sur des lignes importées ; on la
   tolère par prudence. */
const TYPES_EMPLOYE = new Set(['employee'])

function estEmploye(m: { member_type?: string | null }): boolean {
  return !m.member_type || TYPES_EMPLOYE.has(m.member_type)
}

/* La colonne `statut` accepte 'actif' ET 'Actif' (contrainte CHECK), et
   son DEFAULT est capitalisé : lire la valeur brute afficherait « Inactif »
   pour un salarié parfaitement actif, et le sortirait du compteur. */
const clefStatut = (v?: string | null) => String(v ?? '').toLowerCase()

const STATUT_RH: Record<string, { label: string; dot: string; texte: string }> = {
  actif:   { label: 'Actif',    dot: 'bg-emerald-500', texte: 'text-emerald-700 dark:text-emerald-400' },
  inactif: { label: 'Inactif',  dot: 'bg-slate-400',   texte: 'text-slate-600 dark:text-slate-400' },
  conge:   { label: 'En congé', dot: 'bg-amber-500',   texte: 'text-amber-700 dark:text-amber-400' },
}

/* L'état du compte n'est PAS le statut RH : un salarié actif peut n'avoir
   jamais ouvert son invitation. Les afficher côte à côte évite de croire
   qu'un collaborateur a accès à l'outil parce qu'il travaille ici. */
const ETAT_COMPTE: Record<string, { label: string; classe: string }> = {
  active:    { label: 'Compte actif', classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  invited:   { label: 'Invité',       classe: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  suspended: { label: 'Suspendu',     classe: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  archived:  { label: 'Archivé',      classe: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  aucun:     { label: 'Sans accès',   classe: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
}

const DEPT_COULEUR: Record<string, string> = {
  Tech:       'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  Marketing:  'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  Commercial: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Design:     'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400',
}
const deptClasse = (d?: string | null) =>
  (d && DEPT_COULEUR[d]) || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'

const initiales = (m: TeamMember) =>
  `${(m.prenom ?? '').charAt(0)}${(m.nom ?? '').charAt(0)}`.toUpperCase() || '?'

const dateFr = (d?: string | null) =>
  d ? new Date(String(d).slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—'

const TOUS = '__tous__'

export default function EmployesTab({ onAdd }: { onAdd?: () => void }) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const detailBase = tenantSlug ? `/${tenantSlug}/equipe` : '/equipe'
  const { role } = useAuth()

  /* Le salaire ne s'affiche pas à qui n'a pas à le voir. La page entière
     est déjà réservée à l'administration ; ce garde-fou reste explicite
     pour que l'ouverture de l'écran à d'autres rôles ne le laisse pas
     fuiter par inadvertance. */
  const peutVoirSalaires = role === 'admin' || role === 'comptable'

  const { data: fiches = [], isLoading, isError, error } = useTeam()

  /* MÊME clé que l'onglet « Espace équipe » : suspendre ou archiver un
     compte là-bas invalide ['team-mgmt'], et cet écran se met à jour avec
     lui. Une clé propre aurait affiché « Compte actif » sur un compte
     suspendu pendant toute la durée du cache.
     Silencieux en cas d'échec : l'état du compte est un complément, son
     absence ne doit pas vider la liste des salariés. */
  const comptesQ = useQuery<TeamMemberRow[]>({
    queryKey: ['team-mgmt'],
    queryFn:  () => teamMgmtApi.list(),
    staleTime: 30_000,
    retry: false,
  })
  /* Référence stable : un `?? []` recréerait un tableau à chaque rendu et
     relancerait les mémos qui en dépendent. */
  const comptes = useMemo(() => comptesQ.data ?? [], [comptesQ.data])

  const comptesParId = useMemo(
    () => new Map(comptes.map(c => [c.id, c])),
    [comptes],
  )

  /* GET /api/team/members exclut déjà les comptes archivés ; le CRUD, lui,
     les renvoie. Une fiche absente de la liste des comptes est donc soit
     archivée, soit sans compte du tout — impossible de trancher tant que
     cette liste n'a pas répondu, d'où le garde-fou sur `isSuccess` : sans
     lui, un échec de l'appel viderait l'écran de tous ses salariés. */
  const archives = useMemo(() => {
    if (!comptesQ.isSuccess) return new Set<string>()
    const vus = new Set(comptes.map(c => c.id))
    return new Set(
      fiches.filter(f => !vus.has(f.id) && f.member_type).map(f => f.id),
    )
  }, [comptesQ.isSuccess, comptes, fiches])

  const employes = useMemo(
    () => fiches
      .filter(estEmploye)
      .filter(f => !archives.has(f.id))
      .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')),
    [fiches, archives],
  )

  const [recherche, setRecherche] = useState('')
  const [dept, setDept] = useState(TOUS)
  const [statut, setStatut] = useState(TOUS)

  /* Les filtres sont construits à partir des données réelles : proposer
     un département que personne n'occupe donne un filtre qui ne trouve
     jamais rien. */
  const departements = useMemo(
    () => [...new Set(employes.map(e => e.departement).filter(Boolean) as string[])].sort(),
    [employes],
  )
  const statuts = useMemo(
    () => [...new Set(employes.map(e => clefStatut(e.statut)).filter(Boolean))].sort(),
    [employes],
  )

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return employes.filter(e => {
      if (dept !== TOUS && e.departement !== dept) return false
      if (statut !== TOUS && clefStatut(e.statut) !== statut) return false
      if (!q) return true
      return [e.nom, e.prenom, e.email, e.poste, e.departement]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [employes, recherche, dept, statut])

  const filtreActif = recherche.trim() !== '' || dept !== TOUS || statut !== TOUS
  const reinitialiser = () => { setRecherche(''); setDept(TOUS); setStatut(TOUS) }

  const actifs = employes.filter(e => clefStatut(e.statut) === 'actif').length
  /* Même périmètre que le compteur de l'en-tête de page (salariés ACTIFS)
     — deux totaux différents côte à côte sur le même écran donnaient deux
     « masse salariale » contradictoires. */
  const masse = employes
    .filter(e => clefStatut(e.statut) === 'actif')
    .reduce((s, e) => s + (Number(e.salaire_base) || 0), 0)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
        <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-900/50 animate-pulse" />
      </div>
    )
  }

  /* Un refus d'accès rendu comme « équipe vide » est le pire des deux
     mondes : on croit la base vide et on clique sur « Ajouter », qui
     échoue à son tour. On dit ce qui se passe. */
  if (isError) {
    return (
      <div className="card-premium p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7 text-rose-600 dark:text-rose-400" />
        </div>
        <h3 className="text-base font-bold text-foreground">Liste des salariés indisponible</h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
          {error instanceof Error ? error.message : 'La requête a échoué.'}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Si le message parle d'autorisation, ton rôle ne permet pas de consulter les fiches RH.
        </p>
      </div>
    )
  }

  /* Aucun salarié DU TOUT. Deux situations très différentes se cachent
     derrière une liste vide, et les confondre laisse la personne devant
     un écran qu'elle croit cassé : soit l'équipe est vraiment vide, soit
     elle ne compte que des formateurs ou des freelances — qui existent
     bel et bien, mais ailleurs. On le dit, chiffres à l'appui. */
  if (employes.length === 0) {
    const autres = fiches.filter(m => !estEmploye(m))
    const formateurs = autres.filter(m => m.member_type === 'trainer').length
    const freelances = autres.filter(m => m.member_type === 'freelance').length

    return (
      <div className="card-premium p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center mx-auto mb-4">
          <Users className="w-7 h-7 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          {autres.length > 0 ? 'Aucun salarié dans cette équipe' : 'Ton équipe est encore vide'}
        </h3>

        {autres.length > 0 ? (
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            {formateurs > 0 && <>{formateurs} formateur{formateurs > 1 ? 's' : ''}</>}
            {formateurs > 0 && freelances > 0 && ' et '}
            {freelances > 0 && <>{freelances} freelance{freelances > 1 ? 's' : ''}</>}
            {' '}dans l'équipe, mais aucun salarié. Les formateurs et les freelances
            se gèrent depuis l'onglet <strong>Espace équipe</strong>, les stagiaires
            depuis <strong>Stagiaires</strong>.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            Ajoute un premier salarié, ou invite quelqu'un depuis l'onglet
            <strong> Espace équipe</strong> pour lui ouvrir un accès à l'outil.
          </p>
        )}

        {onAdd && (
          <Button className="mt-5" onClick={onAdd}>
            <UserPlus className="w-4 h-4" /> Ajouter un salarié
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Chiffres de tête ─────────────────────────────────────── */}
      <div className={cn(
        'grid gap-3',
        peutVoirSalaires ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3',
      )}>
        <Kpi icon={Users}     libelle="Salariés"      valeur={String(employes.length)} accent="text-blue-600 dark:text-blue-400" />
        <Kpi icon={Briefcase} libelle="Actifs"        valeur={String(actifs)}          accent="text-emerald-600 dark:text-emerald-400" />
        <Kpi icon={Building2} libelle="Départements"  valeur={String(departements.length)} accent="text-violet-600 dark:text-violet-400" />
        {peutVoirSalaires && (
          <Kpi
            icon={Wallet} libelle="Masse salariale"
            valeur={`${masse.toLocaleString('fr-FR')} MAD`}
            accent="text-amber-600 dark:text-amber-400"
          />
        )}
      </div>

      {/* ── Recherche et filtres ─────────────────────────────────── */}
      <div className="card-premium p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un salarié…"
            className="pl-9 h-9"
            aria-label="Rechercher un salarié"
          />
        </div>

        {departements.length > 0 && (
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 w-auto min-w-[9rem]">
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUS}>Tous les départements</SelectItem>
              {departements.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {statuts.length > 1 && (
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="h-9 w-auto min-w-[8rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TOUS}>Tous les statuts</SelectItem>
              {statuts.map(s => (
                <SelectItem key={s} value={s}>{STATUT_RH[s]?.label ?? s}</SelectItem>
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
          {filtres.length} / {employes.length}
        </span>

        {/* Le bouton d'ajout ne vivait que dans l'état vide : dès le premier
            salarié enregistré, il disparaissait et il fallait remonter à
            l'en-tête de la page pour en ajouter un second. */}
        {onAdd && (
          <Button size="sm" className="h-9" onClick={onAdd}>
            <UserPlus className="w-4 h-4" /> Ajouter un salarié
          </Button>
        )}
      </div>

      {/* ── Liste ────────────────────────────────────────────────── */}
      {filtres.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <Search className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">Aucun salarié ne correspond</p>
          <p className="text-xs text-muted-foreground mt-1">
            Essaie un autre terme, ou retire un filtre.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={reinitialiser}>
            Réinitialiser les filtres
          </Button>
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <div className="table-scroll">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="text-left">Salarié</th>
                  <th className="text-left">Poste</th>
                  <th className="text-left">Département</th>
                  <th className="text-left">Entrée</th>
                  <th className="text-left">Statut</th>
                  <th className="text-right">Fiche</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((e, i) => {
                  const compte = comptesParId.get(e.id)
                  const st = STATUT_RH[clefStatut(e.statut)] ?? STATUT_RH.inactif
                  /* account_status vaut 'invited' PAR DÉFAUT, même quand
                     aucune invitation n'a jamais été envoyée : un salarié
                     créé par le formulaire RH s'affichait « Invité » sans
                     que personne ne l'ait invité. */
                  const etat = !compte ? null
                    : compte.account_status === 'invited' && !compte.invitation_sent_at
                      ? ETAT_COMPTE.aucun
                      : ETAT_COMPTE[compte.account_status]
                  return (
                    <motion.tr
                      key={e.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 12) * 0.02 }}
                      className="table-row group"
                    >
                      <td>
                        <Link
                          to={`${detailBase}/${e.id}`}
                          className="flex items-center gap-3 min-w-0"
                          title="Ouvrir la fiche complète"
                        >
                          <span className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {initiales(e)}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {e.prenom} {e.nom}
                            </span>
                            <span className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                              {e.email && (
                                <span className="flex items-center gap-1 truncate">
                                  <Mail className="w-3 h-3 flex-shrink-0" /> {e.email}
                                </span>
                              )}
                              {e.telephone && (
                                <span className="hidden lg:flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {e.telephone}
                                </span>
                              )}
                            </span>
                          </span>
                        </Link>
                      </td>

                      <td className="text-sm text-foreground">{e.poste || '—'}</td>

                      <td>
                        {e.departement ? (
                          <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', deptClasse(e.departement))}>
                            {e.departement}
                          </span>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </td>

                      <td className="text-sm text-muted-foreground whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" /> {dateFr(e.date_embauche)}
                        </span>
                      </td>

                      <td>
                        <span className="flex flex-col gap-1">
                          <span className={cn('flex items-center gap-1.5 text-xs font-medium', st.texte)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', st.dot)} /> {st.label}
                          </span>
                          {etat && (
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium w-fit', etat.classe)}>
                              {etat.label}
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="text-right">
                        <Link
                          to={`${detailBase}/${e.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Ouvrir <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({
  icon: Icon, libelle, valeur, accent,
}: {
  icon: React.ElementType
  libelle: string
  valeur: string
  accent: string
}) {
  return (
    <div className="card-premium p-4 flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        <Icon className={cn('w-5 h-5', accent)} />
      </span>
      <span className="min-w-0">
        <span className={cn('block text-lg font-bold tabular-nums truncate', accent)}>{valeur}</span>
        <span className="block text-[11px] text-muted-foreground">{libelle}</span>
      </span>
    </div>
  )
}
