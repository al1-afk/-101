/**
 * Le tableau des commerciaux — présentation seule.
 *
 * ── Pourquoi un composant séparé de la page
 * La page porte les requêtes, les filtres et les confirmations ; ce
 * fichier ne sait que DESSINER une liste déjà filtrée. Les deux rendus
 * (tableau au-dessus de md, cartes en dessous) partagent ainsi les mêmes
 * libellés, les mêmes couleurs et les mêmes liens : sur un écran étroit,
 * une colonne « oubliée » dans la variante mobile est le genre d'écart
 * qui fait croire à un bug de données.
 *
 * ── Pourquoi aucune décision ici
 * Activer un accès demande parfois une confirmation, jamais un rendu :
 * le composant se contente d'appeler `onBasculerAcces` et laisse la page
 * décider s'il faut prévenir avant. Sans cette séparation, la fenêtre de
 * confirmation aurait fini dupliquée dans la variante mobile.
 */
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Mail, Phone, Building2, CalendarDays, MoreHorizontal, Eye, KeyRound,
  Target, Users, FileText, CheckCircle2, ShieldCheck, ShieldOff,
  ChevronRight, Loader2, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import type { Commercial } from '@/lib/api'
import { formatCurrency, formatCurrencyCompact, getInitials, cn } from '@/lib/utils'

/* Deux mondes d'identité se croisent dans cette liste : les employés
   (team_members.account_status) et les comptes de l'espace
   (tenant_users.status). Leurs vocabulaires ne coïncident pas, d'où une
   table qui couvre les deux et retombe sur la valeur brute plutôt que
   d'afficher « Inconnu » sur un statut parfaitement valide. */
const STATUT: Record<string, { label: string; classe: string }> = {
  active:    { label: 'Actif',     classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  actif:     { label: 'Actif',     classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  invited:   { label: 'Invité',    classe: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  pending:   { label: 'En attente', classe: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  suspended: { label: 'Suspendu',  classe: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  inactif:   { label: 'Inactif',   classe: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  archived:  { label: 'Archivé',   classe: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
}

export function libelleStatut(v?: string | null): string {
  const k = String(v ?? '').toLowerCase()
  return STATUT[k]?.label ?? (v || '—')
}

function classeStatut(v?: string | null): string {
  const k = String(v ?? '').toLowerCase()
  return STATUT[k]?.classe ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
}

const dateFr = (d?: string | null) =>
  d
    ? new Date(String(d).slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '—'

/* « il y a X » plutôt qu'une date : sur une colonne d'activité, ce qui
   intéresse c'est la fraîcheur, pas le jour exact — qui se lit dans la
   fiche. Le titre HTML conserve la date complète pour qui la cherche. */
export function ilYA(iso?: string | null): string {
  if (!iso) return 'Jamais'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const min = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (min < 1)  return "À l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24)   return `il y a ${h} h`
  const j = Math.round(h / 24)
  if (j < 31)   return `il y a ${j} j`
  const mois = Math.round(j / 30)
  if (mois < 12) return `il y a ${mois} mois`
  return `il y a ${Math.round(mois / 12)} an(s)`
}

/* Le lien de la fiche accepte un onglet en paramètre. La fiche peut très
   bien l'ignorer : le clic mène alors quand même à la bonne personne,
   ce qui vaut mieux qu'un lien mort en attendant. */
const versFiche = (base: string, userId: string, onglet?: string) =>
  `${base}/${encodeURIComponent(userId)}${onglet ? `?onglet=${onglet}` : ''}`

interface Props {
  commerciaux:     Commercial[]
  /** Racine des fiches, préfixe de tenant compris. */
  detailBase:      string
  onBasculerAcces: (c: Commercial) => void
  /** Identifiant dont l'accès est en cours de bascule — la ligne se fige
   *  le temps de l'aller-retour au lieu de laisser cliquer deux fois. */
  userIdEnCours?:  string | null
}

export default function CommercialsTable({
  commerciaux, detailBase, onBasculerAcces, userIdEnCours,
}: Props) {
  return (
    <>
      {/* ── Tableau (md et au-dessus) ──────────────────────────────── */}
      <div className="card-premium overflow-hidden hidden md:block">
        <div className="table-scroll">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="text-left">Commercial</th>
                <th className="text-left">Rattachement</th>
                <th className="text-left">Statut</th>
                <th className="text-left">Accès CRM</th>
                <th className="text-left">Portefeuille</th>
                <th className="text-right">CA généré</th>
                <th className="text-left">Dernière activité</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {commerciaux.map((c, i) => (
                <motion.tr
                  key={c.user_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i, 12) * 0.02 }}
                  className="table-row group"
                >
                  <td>
                    <Link
                      to={versFiche(detailBase, c.user_id)}
                      className="flex items-center gap-3 min-w-0"
                      title="Ouvrir la fiche du commercial"
                    >
                      <Avatar nom={c.name} kind={c.kind} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {c.name}
                        </span>
                        <span className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          {c.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 flex-shrink-0" /> {c.email}
                            </span>
                          )}
                          {c.phone && (
                            <span className="hidden xl:flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {c.phone}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </td>

                  <td>
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-xs text-foreground">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        {c.department || (c.kind === 'admin' ? 'Administration' : '—')}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <CalendarDays className="w-3 h-3" /> {dateFr(c.hired_at)}
                      </span>
                    </span>
                  </td>

                  <td>
                    <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', classeStatut(c.status))}>
                      {libelleStatut(c.status)}
                    </span>
                  </td>

                  <td><PastilleAcces actif={c.crm_enabled} /></td>

                  <td>
                    <Compteurs c={c} detailBase={detailBase} />
                  </td>

                  <td className="text-right">
                    <span className={cn(
                      'text-sm font-semibold tabular-nums',
                      c.revenue > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                    )}>
                      {c.revenue > 0 ? formatCurrency(c.revenue) : '—'}
                    </span>
                  </td>

                  <td>
                    <span
                      className="text-xs text-muted-foreground whitespace-nowrap"
                      title={c.last_activity_at ? new Date(c.last_activity_at).toLocaleString('fr-FR') : undefined}
                    >
                      {ilYA(c.last_activity_at)}
                    </span>
                  </td>

                  <td className="text-right">
                    <MenuActions
                      c={c}
                      detailBase={detailBase}
                      onBasculerAcces={onBasculerAcces}
                      enCours={userIdEnCours === c.user_id}
                    />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cartes (en dessous de md) ──────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {commerciaux.map((c, i) => (
          <motion.div
            key={c.user_id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.03 }}
            className="card-premium p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <Link to={versFiche(detailBase, c.user_id)} className="flex items-start gap-3 min-w-0 flex-1">
                <Avatar nom={c.name} kind={c.kind} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground truncate">{c.name}</span>
                  {c.email && (
                    <span className="block text-[11px] text-muted-foreground truncate">{c.email}</span>
                  )}
                  {c.phone && (
                    <span className="block text-[11px] text-muted-foreground">{c.phone}</span>
                  )}
                </span>
              </Link>
              <MenuActions
                c={c}
                detailBase={detailBase}
                onBasculerAcces={onBasculerAcces}
                enCours={userIdEnCours === c.user_id}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <PastilleAcces actif={c.crm_enabled} />
              <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', classeStatut(c.status))}>
                {libelleStatut(c.status)}
              </span>
              {c.department && (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {c.department}
                </span>
              )}
            </div>

            <Compteurs c={c} detailBase={detailBase} />

            <div className="flex items-center justify-between border-t border-border pt-2.5 text-[11px]">
              <span className="text-muted-foreground">
                Arrivée {dateFr(c.hired_at)} · {ilYA(c.last_activity_at)}
              </span>
              <span className={cn(
                'font-semibold tabular-nums',
                c.revenue > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
              )}>
                {c.revenue > 0 ? formatCurrencyCompact(c.revenue) : '—'}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  )
}

/* ─── Briques ────────────────────────────────────────────────────── */

/* Les administrateurs n'ont pas de fiche employé : la teinte de l'avatar
   est le seul rappel visuel qu'on ne les corrigera pas dans « Équipe ». */
function Avatar({ nom, kind }: { nom: string; kind: Commercial['kind'] }) {
  return (
    <span
      className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
        kind === 'admin'
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
      )}
      title={kind === 'admin' ? "Compte d'administration" : 'Employé'}
    >
      {getInitials(nom) || '?'}
    </span>
  )
}

function PastilleAcces({ actif }: { actif: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap',
      actif
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', actif ? 'bg-emerald-500' : 'bg-slate-400')} />
      {actif ? 'Accès CRM' : 'Inactif'}
    </span>
  )
}

/* Quatre compteurs plutôt que quatre colonnes : ils se lisent ensemble
   (« 12 prospects, 3 clients ») et tiennent dans la largeur d'un
   téléphone. Le libellé complet reste accessible au survol. */
function Compteurs({ c, detailBase }: { c: Commercial; detailBase: string }) {
  const rien = c.counts.prospects === 0

  return (
    <span className="flex items-center gap-3">
      <Compteur icone={Target}       valeur={c.counts.prospects}   titre="Prospects"   accent="text-blue-600 dark:text-blue-400" />
      <Compteur icone={Users}        valeur={c.counts.clients}     titre="Clients"     accent="text-cyan-600 dark:text-cyan-400" />
      <Compteur icone={FileText}     valeur={c.counts.devis}       titre="Devis"       accent="text-violet-600 dark:text-violet-400" />
      <Compteur icone={CheckCircle2} valeur={c.counts.conversions} titre="Conversions" accent="text-emerald-600 dark:text-emerald-400" />

      {/* Le cas normal au démarrage : l'accès est ouvert mais rien ne lui
          a encore été confié. Un « 0 » seul laisserait croire à un
          commercial inactif ; on propose plutôt le geste qui manque. */}
      {rien && c.crm_enabled && (
        <Link
          to={versFiche(detailBase, c.user_id, 'prospects')}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          <Sparkles className="w-3 h-3" /> Attribuer
        </Link>
      )}
    </span>
  )
}

function Compteur({
  icone: Icone, valeur, titre, accent,
}: {
  icone: React.ElementType
  valeur: number
  titre: string
  accent: string
}) {
  return (
    <span className="flex items-center gap-1" title={`${valeur} · ${titre}`}>
      <Icone className={cn('w-3.5 h-3.5', valeur > 0 ? accent : 'text-muted-foreground/50')} />
      <span className={cn(
        'text-xs font-semibold tabular-nums',
        valeur > 0 ? 'text-foreground' : 'text-muted-foreground',
      )}>
        {valeur}
      </span>
    </span>
  )
}

function MenuActions({
  c, detailBase, onBasculerAcces, enCours,
}: {
  c: Commercial
  detailBase: string
  onBasculerAcces: (c: Commercial) => void
  enCours: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${c.name}`}>
          {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{c.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link to={versFiche(detailBase, c.user_id)}>
            <Eye className="w-4 h-4" /> Voir la fiche
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link to={versFiche(detailBase, c.user_id, 'permissions')}>
            <KeyRound className="w-4 h-4" /> Gérer les permissions
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link to={versFiche(detailBase, c.user_id, 'prospects')}>
            <Target className="w-4 h-4" /> Voir les prospects
            <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={enCours}
          onSelect={() => onBasculerAcces(c)}
          className={c.crm_enabled ? 'text-red-600 dark:text-red-400 focus:text-red-600' : undefined}
        >
          {c.crm_enabled
            ? <><ShieldOff className="w-4 h-4" /> Désactiver l'accès CRM</>
            : <><ShieldCheck className="w-4 h-4" /> Activer l'accès CRM</>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
