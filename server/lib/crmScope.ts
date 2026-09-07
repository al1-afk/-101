/**
 * PÉRIMÈTRE CRM — qui a le droit de voir et de toucher quoi.
 *
 * ── La règle, en une phrase ─────────────────────────────────────────
 * ADMIN et MANAGER voient tout. Tous les autres — le COMMERCIAL en
 * premier lieu — ne voient que ce qu'ils ont créé, ce qu'on leur a
 * assigné, et ce qu'on leur a explicitement partagé.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────
 * Parce que cette règle doit être écrite UNE SEULE FOIS. Recopiée dans
 * crud.ts, puis dans aiQuote.ts, puis dans le prochain module, elle
 * divergerait — et une divergence dans une règle d'accès n'est pas un
 * bug d'affichage, c'est une fuite de portefeuille commercial. Tout le
 * reste du serveur appelle ces fonctions ; personne ne réécrit la
 * condition à la main.
 *
 * ── Pourquoi dans Express et pas dans la RLS PostgreSQL ─────────────
 * La messagerie interne (migration 100) fait porter sa règle par la
 * base : ses politiques lisent `current_app_user_id()`. C'est la bonne
 * réponse là-bas, et ce serait une panne générale ici. Fait mesuré :
 * 378 des 387 appels à tenantQuery/tenantTransaction du dépôt ne
 * passent PAS le 4e argument (l'utilisateur agissant). Sans lui,
 * `app.current_user_id` n'est pas posée, et une politique par personne
 * sur prospects/clients/devis renverrait ZÉRO ligne — à commencer par
 * les deux lectures principales de crud.ts. Le CRM se viderait à la
 * seconde du déploiement, sur 176 prospects en production.
 *
 * La RLS cloisonne donc l'ESPACE, et le périmètre par PERSONNE est
 * appliqué ici. Ce n'est pas un pis-aller : c'est déjà ce que fait le
 * module Outbound (server/routes/outbound.ts, ownershipWhere) depuis la
 * migration 067. Le filtrage reste côté BACKEND — l'exigence du client
 * — dans la couche qui, elle, connaît l'utilisateur à coup sûr.
 *
 * Schéma associé : supabase/migrations/102_crm_acces_par_utilisateur.sql
 */
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { logger } from './logger'

/* ─────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────── */
export type CrmResource = 'prospect' | 'client' | 'devis'

/**
 * Les gestes que l'on peut demander sur une fiche.
 *
 * Les cinq premiers existaient depuis la migration 102 ; `create`,
 * `delete`, `assign` et `send` viennent de l'espace commercial
 * (/my-space/crm), qui doit pouvoir refuser AVANT d'écrire — un écran
 * qui propose « Nouveau prospect » à quelqu'un qui n'a pas le droit de
 * créer produit un 500 en base plutôt qu'un 403 lisible.
 *
 * `create` est le seul geste sans enregistrement : il ne porte donc sur
 * aucune ligne de `crm_record_grants` et se décide à la seule capacité.
 */
export type CrmAction =
  | 'view' | 'log' | 'edit' | 'quote' | 'convert'
  | 'create' | 'delete' | 'assign' | 'send'

export interface CrmActor {
  tenantId: string
  userId:   string
  /** Rôle EFFECTIF, relu en base par getEffectiveRole — jamais celui du
   *  corps de la requête, et jamais celui du JWT seul. */
  role:     string
}

/* ─────────────────────────────────────────────────────────────────
   VOCABULAIRE FERMÉ DES CAPACITÉS

   Ce sont les cases « voir tout / modifier tout » qu'un administrateur
   peut accorder à quelqu'un SANS le promouvoir manager — le cas réel du
   commercial senior qui suit tout le portefeuille mais n'a rien à faire
   dans la paie ni dans les paramètres de l'espace.

   La liste est fermée et déclarée ici plutôt que par une contrainte
   CHECK en base : une capacité ajoutée ne demande alors pas de
   migration, et une capacité RETIRÉE du produit mais restée en base
   n'empêche pas de mettre la ligne à jour — elle est simplement ignorée
   à la lecture (cf. `capacites`). Toute valeur hors liste est en
   revanche refusée à l'écriture par un 400 (server/routes/crmAccess.ts).

   ── Sémantique, une fois pour toutes ────────────────────────────────
     crm.access   interrupteur maître : sans elle, aucune route de
                  l'espace commercial (/api/my-space/crm) ne répond.
     X.view       voir les fiches de MON périmètre — ce que j'ai créé,
                  ce qu'on m'a assigné, ce qu'on m'a partagé.
     X.view_all   voir TOUTES les fiches de l'espace (élargit).
     X.edit       modifier les fiches de mon périmètre.
     X.edit_all   modifier n'importe laquelle (élargit).
     X.create     créer ; X.delete supprimer ; prospects.assign
                  attribuer un prospect ; devis.send envoyer un devis.
     activities.* journaliser : une capacité par canal (note, appel,
                  WhatsApp, relance), pour qu'un commercial « appels
                  seulement » ne puisse pas écrire de note libre.

   Il n'existe VOLONTAIREMENT pas de niveau intermédiaire « mon équipe » :
   ni team_members ni tenant_users ne portent de hiérarchie (aucun
   manager_id, aucun team_id). Le déduire de `departement`, qui est du
   texte libre saisi à la main, fabriquerait un périmètre qui change de
   taille à la première faute de frappe.

   ── Les huit premières ne bougent JAMAIS de nom ─────────────────────
   `*_all` et `convert.all` sont déjà écrites dans crm_user_capabilities
   en production. Les renommer ne lèverait aucune erreur : le filtre de
   `capacites` écarterait simplement les anciennes valeurs, et des droits
   accordés s'éteindraient en silence, sans que personne ne sache
   pourquoi la vue d'ensemble a disparu.
───────────────────────────────────────────────────────────────── */
export const CRM_CAPABILITIES = [
  /* Interrupteur maître de l'espace commercial. */
  'crm.access',

  'prospects.view', 'prospects.view_all', 'prospects.create', 'prospects.edit',
  'prospects.edit_all', 'prospects.delete', 'prospects.assign',

  'clients.view', 'clients.view_all', 'clients.create', 'clients.edit',
  'clients.edit_all', 'clients.delete',

  'devis.view', 'devis.view_all', 'devis.create', 'devis.edit',
  'devis.edit_all', 'devis.send', 'devis.delete',

  'activities.view', 'activities.view_all', 'activities.create', 'activities.edit',
  'activities.note', 'activities.call', 'activities.whatsapp', 'activities.followup',

  'convert.all',
] as const

/** Interrupteur maître, nommé une fois : une faute de frappe dans cette
 *  chaîne ouvrirait le CRM à tout le monde ou à personne. */
export const CAPACITE_ACCES_CRM = 'crm.access'

export type CrmCapability = typeof CRM_CAPABILITIES[number]

const CAPACITES_CONNUES: ReadonlySet<string> = new Set(CRM_CAPABILITIES)

/** Vrai si la chaîne appartient au vocabulaire fermé ci-dessus. */
export function estCapaciteValide(valeur: unknown): valeur is CrmCapability {
  return typeof valeur === 'string' && CAPACITES_CONNUES.has(valeur)
}

export const CRM_RESOURCES: readonly CrmResource[] = ['prospect', 'client', 'devis']

/** Garde de paramètre d'URL : `/api/crm/grants/:type/:id` reçoit du texte
 *  libre, et `tableDe` interpole son résultat dans du SQL. */
export function estRessourceCrm(valeur: unknown): valeur is CrmResource {
  return valeur === 'prospect' || valeur === 'client' || valeur === 'devis'
}

/* ─────────────────────────────────────────────────────────────────
   RÔLES ET NOMS DE TABLES
───────────────────────────────────────────────────────────────── */

/* `super_admin` n'est pas dans le type Role de auth.ts, mais outbound.ts
   le teste : un espace le porte. On l'accepte ici plutôt que de laisser
   un administrateur historique perdre la vue d'ensemble. */
const ROLES_GESTIONNAIRES = new Set(['admin', 'super_admin', 'manager'])

/** ADMIN et MANAGER voient et modifient tout, sans exception ni case à
 *  cocher. C'est le seul court-circuit de tout ce fichier. */
export function estGestionnaire(role: string): boolean {
  return ROLES_GESTIONNAIRES.has((role ?? '').toLowerCase().trim())
}

/* Table SQL portant chaque type de ressource. Le résultat est interpolé
   dans les requêtes : il vient d'une correspondance FERMÉE, jamais d'une
   entrée utilisateur — c'est ce qui rend l'interpolation sûre. */
const TABLES: Record<CrmResource, string> = {
  prospect: 'prospects',
  client:   'clients',
  devis:    'devis',
}

export function tableDe(r: CrmResource): string {
  return TABLES[r]
}

/* Préfixe des capacités : 'prospect' → 'prospects.view_all'. `devis` est
   invariable, d'où la table de correspondance plutôt qu'un « + s ». */
const PREFIXES: Record<CrmResource, string> = {
  prospect: 'prospects',
  client:   'clients',
  devis:    'devis',
}

/* Colonne de crm_record_grants interrogée pour chaque action. Fermée,
   donc interpolable sans risque.

   Les gestes ajoutés se rabattent sur les cinq colonnes EXISTANTES
   plutôt que d'en réclamer de nouvelles : `crm_record_grants` porte des
   lignes en production, et une colonne de plus voudrait dire une
   migration pour chaque capacité — exactement ce que la migration 102 a
   refusé. Un partage « modification » couvre donc la suppression et la
   réattribution (ce sont des écritures sur la fiche), et un partage
   « devis » couvre l'envoi.

   `create` n'a pas de colonne : il n'y a pas encore de fiche à partager. */
const COLONNE_GRANT: Record<CrmAction, string | null> = {
  view:    'can_view',
  log:     'can_log',
  edit:    'can_edit',
  quote:   'can_quote',
  convert: 'can_convert',
  create:  null,
  delete:  'can_edit',
  assign:  'can_edit',
  send:    'can_quote',
}

/* Capacités transverses qui suffisent à autoriser l'action, sans
   propriété ni partage.

   Noter que `log`, `quote` et `convert` s'appuient sur `edit_all` : il
   n'existe pas de capacité « journaliser tout » séparée, et en inventer
   une hors du vocabulaire figé créerait un droit que l'écran
   d'administration ne saurait pas afficher — donc un droit invisible.
   `convert` accepte en plus `convert.all`, qui est bien au catalogue. */
const CAPACITES_SUFFISANTES: Record<CrmAction, (prefixe: string) => string[]> = {
  view:    (p) => [`${p}.view_all`],
  log:     (p) => [`${p}.edit_all`],
  edit:    (p) => [`${p}.edit_all`],
  quote:   (p) => [`${p}.edit_all`],
  convert: (p) => [`${p}.edit_all`, 'convert.all'],
  /* `create` ne porte sur aucune fiche : rien à dispenser, tout se joue
     dans CAPACITE_REQUISE. */
  create:  ()  => [],
  /* Pour les trois autres, `edit_all` dispense du PÉRIMÈTRE, jamais de
     la capacité exigée : « modifier tous les prospects » ne doit pas
     valoir « supprimer », qui est irréversible. */
  delete:  (p) => [`${p}.edit_all`],
  assign:  ()  => ['prospects.edit_all'],
  send:    ()  => ['devis.edit_all'],
}

/* Capacité SANS LAQUELLE l'action est refusée, périmètre ou pas.
   C'est l'inverse exact de CAPACITES_SUFFISANTES : là-bas une capacité
   remplace le périmètre, ici elle s'y AJOUTE.
   Être propriétaire d'un prospect ne suffit donc pas à le supprimer :
   sans `prospects.delete`, la corbeille reste fermée. */
const CAPACITE_REQUISE: Partial<Record<CrmAction, (prefixe: string) => string>> = {
  create: (p) => `${p}.create`,
  delete: (p) => `${p}.delete`,
  assign: ()  => 'prospects.assign',
  send:   ()  => 'devis.send',
}

/* Ressource sur laquelle chaque geste a un sens. Attribuer un client ou
   « envoyer » un prospect ne veut rien dire : plutôt que de laisser la
   requête chercher une colonne qui existe (et donc répondre oui), on
   refuse tout de suite. */
const RESSOURCE_ATTENDUE: Partial<Record<CrmAction, CrmResource>> = {
  assign: 'prospect',
  send:   'devis',
}

/* Socle exigé des porteurs de `crm.access`, en plus du périmètre.

   Pourquoi seulement d'eux : les comptes de l'espace d'administration
   antérieurs à ce module n'ont aucune ligne dans crm_user_capabilities.
   Exiger `prospects.view` de tout le monde retirerait d'un coup à ces
   comptes-là les fiches qu'ils ont eux-mêmes créées — une panne d'accès
   généralisée sur 176 prospects, le jour du déploiement, pour appliquer
   un réglage que personne n'a encore eu l'occasion de saisir.

   Pour un commercial de l'espace employé, en revanche, les capacités
   SONT la porte d'entrée : c'est là que « mes prospects » (X.view seul)
   et « tous les prospects » (X.view_all) se règlent, et quelqu'un à qui
   l'on n'a pas coché « voir les prospects » ne doit rien voir — pas même
   les siens. Ce socle est le pendant exact de `clausePerimetre` : sans
   lui, une fiche absente de la liste resterait ouverte par son URL. */
const SOCLE_ACCES: Partial<Record<CrmAction, (prefixe: string) => string[]>> = {
  view: (p) => [`${p}.view`, `${p}.view_all`],
  edit: (p) => [`${p}.edit`, `${p}.edit_all`],
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ─────────────────────────────────────────────────────────────────
   CACHE DES CAPACITÉS

   `capacites` est appelée sur le chemin CHAUD : chaque GET de liste,
   chaque PATCH, chaque DELETE du CRUD. Sans cache, c'est une requête
   supplémentaire — avec sa connexion et sa transaction, cf. tenantQuery
   — à chaque ligne d'un écran qui en charge des centaines.

   Même dispositif que server/lib/effectiveRole.ts, et pour la même
   raison : TTL COURTE. Retirer « voir tous les prospects » à quelqu'un
   doit prendre effet tout de suite, pas à l'expiration de son jeton.
   30 secondes au pire, et zéro dès que la route d'administration appelle
   `invaliderCapacites`. Le cache vit dans la mémoire du process : en
   multi-instance chacune a le sien — d'où, encore, la TTL courte.

   Borne dure à 10 000 entrées : un espace ne compte pas dix mille
   utilisateurs, mais un cache non borné sur une clé composée finit
   toujours par fuir. Au plafond, on vide tout plutôt que d'évincer
   finement — c'est une perte de performance d'une requête, pas une
   perte de justesse.
───────────────────────────────────────────────────────────────── */
const TTL_MS      = 30_000
const MAX_ENTRIES = 10_000

interface EntreeCapacites { caps: ReadonlySet<string>; exp: number }
const cacheCapacites = new Map<string, EntreeCapacites>()

const cleDe = (tenantId: string, userId: string) => `${tenantId}|${userId}`

const AUCUNE: ReadonlySet<string> = new Set<string>()

/**
 * Capacités transverses accordées à cette personne dans cet espace.
 *
 * Renvoie toujours un ensemble — jamais null : un appelant qui oublierait
 * de tester le null accorderait tout. En cas d'erreur base, l'ensemble
 * est VIDE et n'est PAS mis en cache : on échoue en refusant (le
 * périmètre se réduit à ce qui est à soi), et sans figer ce refus 30
 * secondes après le rétablissement de la base.
 */
export async function capacites(a: CrmActor): Promise<Set<string>> {
  if (!UUID_RE.test(a?.tenantId ?? '') || !UUID_RE.test(a?.userId ?? '')) {
    return new Set(AUCUNE)
  }
  const cle = cleDe(a.tenantId, a.userId)
  const now = Date.now()
  const hit = cacheCapacites.get(cle)
  if (hit && hit.exp > now) return new Set(hit.caps)

  let brutes: string[] = []
  try {
    const row = await tenantQueryOne<{ capabilities: string[] | null }>(
      a.tenantId,
      `SELECT capabilities
         FROM public.crm_user_capabilities
        WHERE tenant_id = $1 AND user_id = $2`,
      [a.tenantId, a.userId],
    )
    brutes = row?.capabilities ?? []
  } catch (e: any) {
    logger.error('[crmScope] lecture des capacités impossible —', e?.message)
    return new Set(AUCUNE)
  }

  /* Filtrage contre le vocabulaire fermé : une valeur écrite avant un
     renommage, ou glissée à la main en base, ne doit pas se comporter
     comme un droit. */
  const caps = new Set(brutes.filter(estCapaciteValide))
  if (cacheCapacites.size >= MAX_ENTRIES) cacheCapacites.clear()
  cacheCapacites.set(cle, { caps, exp: now + TTL_MS })
  /* Copie défensive : l'appelant ne doit pas pouvoir muter le cache. */
  return new Set(caps)
}

/**
 * Cette personne a-t-elle le droit d'ENTRER dans l'espace commercial ?
 *
 * C'est la première question de chaque route de /api/my-space/crm : sans
 * `crm.access`, elles répondent 403 et le menu n'affiche pas le module.
 * Un gestionnaire passe sans réglage — lui demander de se cocher l'accès
 * au CRM de son propre espace n'aurait aucun sens, et le premier
 * administrateur d'un nouvel espace se retrouverait dehors, sans
 * personne pour lui ouvrir.
 *
 * Fail-closed comme le reste : base injoignable → `capacites` renvoie un
 * ensemble vide → pas d'accès.
 */
export async function aAcces(a: CrmActor): Promise<boolean> {
  if (estGestionnaire(a?.role ?? '')) return true
  const caps = await capacites(a)
  return caps.has(CAPACITE_ACCES_CRM)
}

/** Même question, quand l'appelant a DÉJÀ l'ensemble des capacités en
 *  main : évite un second aller-retour sur le chemin chaud (la route
 *  /permissions les renvoie toutes de toute façon). */
export function aAccesAvecCapacites(role: string, caps: ReadonlySet<string>): boolean {
  return estGestionnaire(role ?? '') || caps.has(CAPACITE_ACCES_CRM)
}

/** À appeler dès qu'on modifie les capacités de quelqu'un — la
 *  révocation devient alors immédiate au lieu d'attendre 30 s. */
export function invaliderCapacites(userId: string, tenantId?: string): void {
  if (tenantId) { cacheCapacites.delete(cleDe(tenantId, userId)); return }
  for (const k of cacheCapacites.keys()) {
    if (k.endsWith(`|${userId}`)) cacheCapacites.delete(k)
  }
}

/** Vide tout le cache (tests, ou changement massif de droits). */
export function resetCapacitesCache(): void {
  cacheCapacites.clear()
}

export const CRM_CAPS_CACHE_TTL_MS = TTL_MS

/* ─────────────────────────────────────────────────────────────────
   LA CLAUSE DE PÉRIMÈTRE (lectures en liste)
───────────────────────────────────────────────────────────────── */

/**
 * Fragment SQL à joindre en `AND` au WHERE d'une lecture de liste.
 *
 * Renvoie `null` quand il n'y a RIEN à restreindre — gestionnaire, ou
 * capacité `<type>.view_all`. `null` et non une clause `TRUE` : le
 * planificateur n'a alors rien de plus à évaluer sur 176 lignes, et
 * l'appelant voit d'un coup d'œil qu'aucun filtre n'est appliqué.
 *
 * `startIdx` est le numéro du PREMIER placeholder libre chez l'appelant.
 * Trois paramètres sont produits, dans cet ordre :
 *   $startIdx     = userId    (référencé trois fois — Postgres l'autorise)
 *   $startIdx + 1 = tenantId
 *   $startIdx + 2 = resource_type
 *
 * Les colonnes sont TOUJOURS qualifiées, par l'alias fourni ou, à
 * défaut, par le nom de la table : sans cela, `id` dans la sous-requête
 * EXISTS deviendrait ambigu dès que l'appelant ajouterait une jointure.
 *
 * NULL est traité comme « non attribué » et non comme « à tout le
 * monde » : `assigned_to = $1` vaut NULL — donc faux — sur les 176
 * lignes antérieures à la migration 102. Elles restent visibles des
 * seuls gestionnaires, ce qui est exactement la règle demandée.
 */
export async function clausePerimetre(
  a: CrmActor,
  r: CrmResource,
  alias: string,
  startIdx: number,
): Promise<{ sql: string; params: unknown[] } | null> {
  if (estGestionnaire(a.role)) return null

  const caps = await capacites(a)
  /* `X.view_all` ÉLARGIT : plus aucun filtre, quelles que soient les
     autres cases. Testé en premier pour que l'absence de `X.view` ne
     puisse jamais l'annuler — « voir tout » sans « voir » resterait
     cohérent pour un lecteur, et un ordre inverse aurait rendu la case
     sans effet. */
  if (caps.has(`${PREFIXES[r]}.view_all`)) return null

  /* L'absence de `X.view` ne rétrécit pas : elle FERME. Un commercial de
     l'espace employé (porteur de crm.access) à qui l'on n'a pas coché
     « voir les prospects » n'en voit aucun — pas même les siens, pas
     même ceux qu'on lui a partagés. Sans ce cas, l'absence de case se
     serait lue comme « périmètre personnel », c'est-à-dire comme un
     droit accordé par oubli.
     Zéro paramètre produit : tous les appelants interpolent `sql` et
     répandent `params`, un tableau vide leur convient (crud.ts,
     stock.ts, googleContactsService.ts). */
  if (caps.has(CAPACITE_ACCES_CRM) && !caps.has(`${PREFIXES[r]}.view`)) {
    return { sql: 'FALSE', params: [] }
  }

  const q   = alias && alias.trim() ? alias.trim() : TABLES[r]
  const col = (nom: string) => `${q}.${nom}`

  const iUser   = startIdx
  const iTenant = startIdx + 1
  const iType   = startIdx + 2

  const sql =
    `(${col('assigned_to')} = $${iUser}` +
    ` OR ${col('created_by')} = $${iUser}` +
    ` OR EXISTS (SELECT 1 FROM public.crm_record_grants g` +
    ` WHERE g.tenant_id = $${iTenant}` +
    ` AND g.user_id = $${iUser}` +
    ` AND g.resource_type = $${iType}` +
    ` AND g.resource_id = ${col('id')}` +
    ` AND g.can_view))`

  return { sql, params: [a.userId, a.tenantId, r] }
}

/* ─────────────────────────────────────────────────────────────────
   L'AUTORISATION UNITAIRE (fiche, modification, suppression)
───────────────────────────────────────────────────────────────── */

/**
 * Cette personne a-t-elle le droit d'effectuer `action` sur cet
 * enregistrement précis ?
 *
 * Ordre de décision :
 *   1. gestionnaire                        → oui, sans requête ;
 *   2. geste hors sujet pour la ressource  → non (assign/send) ;
 *   3. capacité EXIGÉE manquante           → non, sans requête
 *      (create, delete, assign, send) ;
 *   4. socle manquant chez un porteur de
 *      crm.access                          → non, sans requête ;
 *   5. capacité transverse adéquate        → oui, sans requête ;
 *   6. assigned_to = moi, created_by = moi,
 *      ou partage explicite portant le bon droit.
 *
 * ── Les quatre gestes ajoutés, un par un ────────────────────────────
 * `create`   ne porte sur aucune fiche : il n'y a ni propriétaire ni
 *            partage à interroger, la capacité `X.create` décide seule.
 *            L'`id` reçu est ignoré — les appelants en passent souvent
 *            une chaîne vide, et exiger un UUID ici aurait obligé
 *            chaque route à inventer un identifiant fictif.
 * `delete`   exige `X.delete` ET le périmètre. Les deux, parce que la
 *            suppression est le seul geste qu'aucun écran ne rattrape :
 *            être propriétaire ne suffit pas, et « modifier tout » ne
 *            suffit pas non plus. `X.edit_all` remplace en revanche le
 *            périmètre, comme partout ailleurs.
 * `assign`   n'a de sens que sur un prospect (c'est le portefeuille que
 *            l'on redistribue) et exige `prospects.assign`. Elle exige
 *            AUSSI le périmètre : réattribuer une fiche que l'on n'a
 *            pas le droit d'ouvrir reviendrait à se l'offrir — la
 *            personne deviendrait `assigned_to`, donc lectrice de tout
 *            son contenu. Le contrat ne demandait que la capacité ;
 *            c'est le seul endroit où l'on est plus strict que lui, et
 *            aucun écran ne s'en trouve fermé : l'administrateur qui
 *            redistribue est gestionnaire, donc court-circuité en 1.
 * `send`     exige `devis.send` et le périmètre, pour la même raison :
 *            envoyer un devis, c'est en sortir le contenu (montants,
 *            marges) vers un tiers.
 *
 * ── Un devis n'hérite PAS de son client ni de son prospect ──────────
 * Le cahier des charges énumère explicitement, pour chaque ressource :
 * créés, assignés, partagés. Faire hériter la visibilité par jointure
 * paraîtrait plus « naturel », mais ouvrirait un chemin détourné : il
 * suffirait de partager un client pour révéler tous ses devis, montants
 * et marges compris, alors que le partage n'accordait que la fiche. En
 * prime, un devis peut n'avoir NI client_id NI prospect_id (les deux
 * sont nullables) : l'héritage laisserait ces devis-là sans propriétaire
 * calculable. La règle reste donc portée par les colonnes du devis
 * lui-même.
 *
 * Fail-closed : identifiant malformé, acteur incomplet ou erreur base
 * renvoient `false`. Refuser à tort se voit et se corrige ; accorder à
 * tort ne se voit pas.
 */
export async function peutAcceder(
  a: CrmActor,
  r: CrmResource,
  id: string,
  action: CrmAction,
): Promise<boolean> {
  if (estGestionnaire(a?.role ?? '')) return true

  if (!UUID_RE.test(a?.tenantId ?? '') || !UUID_RE.test(a?.userId ?? '')) return false

  /* Ressource attendue AVANT tout le reste : `assign` sur un devis ou
     `send` sur un prospect est une erreur d'appel, pas une question
     d'autorisation. Répondre non évite qu'une capacité prévue pour les
     prospects ouvre incidemment autre chose. */
  const attendue = RESSOURCE_ATTENDUE[action]
  if (attendue && r !== attendue) return false

  /* Identifiant illisible : refusé sans toucher à la base, comme avant.
     `create` en est dispensé — il n'a pas de fiche à désigner. */
  if (action !== 'create' && !UUID_RE.test(id ?? '')) return false

  const prefixe = PREFIXES[r]
  const caps    = await capacites(a)

  /* Capacité exigée : elle ne remplace rien, elle est un préalable. */
  const requise = CAPACITE_REQUISE[action]?.(prefixe)
  if (requise && !caps.has(requise)) return false

  /* `create` s'arrête ici : aucune fiche, donc aucun périmètre. */
  if (action === 'create') return true

  /* Socle des porteurs de crm.access — cf. SOCLE_ACCES. Sans ce test,
     une fiche que la liste n'affiche pas resterait lisible par son URL. */
  if (caps.has(CAPACITE_ACCES_CRM)) {
    const socle = SOCLE_ACCES[action]?.(prefixe)
    if (socle && !socle.some(c => caps.has(c))) return false
  }

  for (const c of CAPACITES_SUFFISANTES[action](prefixe)) {
    if (caps.has(c)) return true
  }

  const table   = TABLES[r]
  const colonne = COLONNE_GRANT[action]
  /* Aucune colonne de partage pour ce geste : seul le périmètre par
     propriété reste à interroger. Le cas ne se produit aujourd'hui que
     pour `create`, déjà tranché plus haut ; la garde existe pour que
     l'ajout d'un geste sans colonne n'aille pas construire un SQL
     `AND g.null` — c'est-à-dire une erreur 42601 en pleine lecture. */
  if (!colonne) return false

  try {
    const row = await tenantQueryOne<{ ok: boolean }>(
      a.tenantId,
      `SELECT TRUE AS ok
         FROM public.${table} t
        WHERE t.id = $1
          AND t.tenant_id = $2
          AND (t.assigned_to = $3
               OR t.created_by = $3
               OR EXISTS (SELECT 1 FROM public.crm_record_grants g
                           WHERE g.tenant_id = $2
                             AND g.user_id = $3
                             AND g.resource_type = $4
                             AND g.resource_id = t.id
                             AND g.${colonne}))`,
      [id, a.tenantId, a.userId, r],
    )
    return !!row
  } catch (e: any) {
    logger.error(`[crmScope] contrôle d'accès ${r}/${action} impossible —`, e?.message)
    return false
  }
}

/* ─────────────────────────────────────────────────────────────────
   JOURNALISATION
───────────────────────────────────────────────────────────────── */

/* activity_logs.old_value / new_value sont en jsonb : pg attend une
   CHAÎNE JSON, pas un objet. `undefined` doit devenir NULL et non la
   chaîne "undefined", qui ferait échouer l'INSERT en 22P02. */
function jsonOuNull(v: unknown): string | null {
  if (v === undefined || v === null) return null
  try { return JSON.stringify(v) } catch { return null }
}

/**
 * Écrit une ligne dans `activity_logs` — la table que lit déjà la page
 * « Journal d'activité ».
 *
 * Volontairement PAS `audit_logs` : cette table n'existe pas dans ce
 * schéma, et c'est pour cela que le déclencheur log_mutation() n'est pas
 * branché sur les tables CRM — il ferait échouer chaque écriture.
 *
 * N'échoue JAMAIS, et ne renvoie rien. Une réassignation de prospect ne
 * doit pas être annulée parce que sa trace n'a pas pu être écrite :
 * l'action métier prime sur son journal. L'échec part dans les logs
 * serveur, où il reste visible.
 */
export async function journaliser(
  a: CrmActor,
  entree: {
    module: string
    recordId: string
    action: string
    description: string
    avant?: unknown
    apres?: unknown
  },
): Promise<void> {
  try {
    /* user_id est NOT NULL en base : sans acteur identifié, on renonce
       plutôt que de faire échouer l'INSERT dans le catch. */
    if (!UUID_RE.test(a?.tenantId ?? '') || !UUID_RE.test(a?.userId ?? '')) return

    await tenantQuery(
      a.tenantId,
      `INSERT INTO public.activity_logs
         (tenant_id, user_id, module_name, record_id, action_type, description, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        a.tenantId,
        a.userId,
        entree.module,
        entree.recordId ?? null,
        entree.action,
        entree.description ?? '',
        jsonOuNull(entree.avant),
        jsonOuNull(entree.apres),
      ],
      /* 4e argument : pose app.current_user_id le temps de la
         transaction. Inutile pour l'INSERT lui-même, mais c'est la
         convention du dépôt pour toute écriture attribuable. */
      a.userId,
    )
  } catch (e: any) {
    logger.error('[crmScope] journalisation impossible —', e?.message)
  }
}
