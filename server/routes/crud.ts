import { Router, Request, Response } from 'express'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { query, tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { safeColumn } from '../middleware/security'
import { tableRbac } from '../middleware/rbac'
import { logger } from '../lib/logger'
import {
  trackSecurityEvent, noteResourceProbe, isProbeThresholdCrossed, PROBE_LIMITS,
} from '../lib/securityEvents'
import { markSecurityLogged } from '../middleware/securityMonitor'
import { ensureTenantColumnCache, tableIsTenantScoped } from '../db/tenantColumns'
import {
  notifyNewProspect, notifyTaskValidation, notifyNewPaiement, notifyDevisAccepte,
} from '../lib/notificationEmails'
import {
  clausePerimetre, peutAcceder, estGestionnaire,
  type CrmActor, type CrmResource,
} from '../lib/crmScope'
import { UPLOAD_DIR } from '../lib/uploadStorage'

const router = Router()
router.use(requireAuth)

router.use('/:table', tableRbac)

export const EXPOSED_TABLES = new Set([
  'clients', 'prospects', 'devis', 'factures', 'paiements',
  'depenses', 'contrats', 'produits', 'fournisseurs', 'team_members',
  'domaines', 'hebergements', 'cheques_recus', 'cheques_emis',
  'abonnements', 'client_subscriptions', 'taches',
  'automation_rules', 'automation_logs', 'alerts',
  'calendrier_events', 'bank_accounts', 'credits_dettes',
  'bons_commande', 'employee_leaves', 'employee_payroll', 'tache_actions',
  'personal_tasks',
  /* Module Guides (playbook onboarding client) */
  'guide_steps', 'guide_templates', 'guide_checklists',
  'guide_checklist_state', 'guide_template_renders',
  'guide_discovery_questions', 'tenant_vision',
  /* SOPs personnalisés (Procédures internes) */
  'sops',
  /* Collaboration SOP : partage + suivi formation */
  'sop_shares',
  'sop_training_progress',
  /* Stagiaires (Équipe → onglet Stagiaires) */
  'stagiaires',
  /* Projets (gestion de projets clients & internes) */
  'projets',
  'projet_assignees',
  'projet_messages',
  'projet_templates',
  'team_member_tasks',
  /* Bons de livraison (handover projet + mots de passe + liens) */
  'bons_livraison',
  /* Carnet d'adresses : freelances, candidats, artisans, etc. */
  'contacts',
  /* Journal d'activité CRM (timeline prospect : notes, appels, emails…) */
  'prospect_logs',
  /* Bibliothèque de modèles de prestations (devis) */
  'prestation_models',
  /* Module financier : revenus encaissés, prévisions (revenus/dépenses
     à venir), virements internes, ajustements manuels de solde.
     Les ÉCRITURES sensibles passent par /api/finance (atomicité +
     anti-doublon) ; le CRUD générique sert la lecture et les
     modifications simples (cf. TABLE_ACL). */
  'revenus',
  'previsions_financieres',
  'transferts_comptes',
  'bank_account_adjustments',
])

const isProd = process.env.NODE_ENV === 'production'

const SAFE_COL = /^[a-z_][a-z0-9_]{0,63}$/

/**
 * Colonnes qu'aucun client n'a le droit d'écrire par le CRUD générique.
 *
 * Ce sont des champs posés par une transaction serveur, jamais par un
 * formulaire : les écrire directement casserait l'invariant qu'ils
 * représentent. Exemple concret : `previsions_financieres.revenu_id` et
 * `statut` sont écrits ensemble par POST /api/finance/previsions/:id/settle.
 * Un PATCH `{ statut: 'prevu' }` sur une prévision déjà encaissée la
 * rouvrirait sans supprimer le revenu correspondant — et permettrait de
 * l'encaisser une seconde fois. La base pose le même garde-fou (trigger
 * previsions_guard_reouverture) ; ici on refuse plus tôt et plus clairement.
 */
const READONLY_COLUMNS: Record<string, Set<string>> = {
  previsions_financieres: new Set([
    'montant_realise', 'date_realisation', 'revenu_id', 'depense_id',
  ]),
  revenus:  new Set(['prevision_id']),
  depenses: new Set(['prevision_id']),
  /* « Qui a ajouté / modifié » n'a de valeur que si personne ne peut
     l'écrire soi-même : le serveur seul les pose (stampAuthorship). */
  sops:     new Set(['created_by_name', 'updated_by_name']),
  /* Même raison pour l'accusé de consultation d'une tâche : il est posé
     par /api/my-space quand la personne assignée ouvre la tâche. */
  team_member_tasks: new Set(['viewed_at', 'viewed_by_name']),
  /* Propriété CRM (migration 102). Ces deux colonnes DÉCIDENT de qui voit
     la fiche : les laisser écrire depuis un formulaire annulerait tout le
     dispositif, un commercial s'attribuant le portefeuille entier d'un
     `PATCH { assigned_to: moi }`. `created_by` est posée une fois par le
     serveur à la création et ne bouge plus jamais ; `assigned_to` est
     réinjectée juste après ce filtre pour les SEULS gestionnaires
     (cf. appliquerAssignationCrm). */
  prospects: new Set(['created_by', 'assigned_to']),
  clients:   new Set(['created_by', 'assigned_to']),
  devis:     new Set(['created_by', 'assigned_to']),
}

/* ══════════════════════════════════════════════════════════════════
   PÉRIMÈTRE CRM PAR UTILISATEUR (migration 102)

   Ce fichier est l'entonnoir d'une cinquantaine de tables. Tout ce qui
   suit ne concerne QUE prospects, clients et devis, et doit rester
   rigoureusement sans effet pour les autres : une table absente de la
   correspondance ci-dessous traverse crud.ts exactement comme avant, au
   paramètre SQL près.

   La règle d'accès elle-même n'est PAS écrite ici — elle vit dans
   server/lib/crmScope.ts, seul endroit du dépôt où elle est rédigée.
   Ici on ne fait que la brancher aux cinq points d'entrée du CRUD :
   liste, fiche, création, modification, suppression.
══════════════════════════════════════════════════════════════════ */

/* Map (et non objet littéral) : `RESSOURCE_CRM.get('constructor')` rend
   undefined, là où un objet aurait rendu une fonction héritée. Le nom de
   table est déjà filtré par guardTable, c'est une ceinture de plus. */
const RESSOURCE_CRM = new Map<string, CrmResource>([
  ['prospects', 'prospect'],
  ['clients',   'client'],
  ['devis',     'devis'],
])

/* ── Tables ENFANTS d'une ressource CRM ─────────────────────────────
   Leur périmètre n'est pas le leur : c'est celui de leur parent. Une
   ligne de `prospect_logs` — les « suivis » du cahier des charges :
   appels, notes, comptes rendus — appartient au prospect qu'elle
   documente, et rien d'autre ne peut en décider.

   Sans ce branchement, la fiche d'un prospect répondait bien 403 à un
   commercial étranger… pendant que `GET /api/prospect_logs` lui servait
   la timeline complète de l'espace. Le contenu y est plus sensible que
   la fiche elle-même : un test a fait ressortir mot pour mot une note
   « marge réelle 45 %, plancher 62 000 MAD » posée par une collègue.
   L'écriture était ouverte de la même façon — on pouvait déposer un
   compte rendu dans le dossier d'autrui, sous son propre nom. */
const TABLE_DE_RESSOURCE: Record<CrmResource, string> = {
  prospect: 'prospects', client: 'clients', devis: 'devis',
}

const ENFANT_CRM = new Map<string, { parent: CrmResource; fk: string }>([
  ['prospect_logs', { parent: 'prospect', fk: 'prospect_id' }],
])

const UUID_CRM_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Le parent d'une ligne enfant, lu en base. null si la ligne n'existe pas. */
async function parentDeLEnfant(
  table: string, id: string, tenantId: string,
): Promise<string | null> {
  const enfant = ENFANT_CRM.get(table)
  if (!enfant) return null
  const rows = await tenantQuery<Record<string, string | null>>(
    tenantId,
    `SELECT ${enfant.fk} AS parent_id FROM ${table} WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  return rows[0]?.parent_id ?? null
}

/* L'acteur, tel que crmScope l'attend. `req.user.role` est le rôle
   EFFECTIF : requireAuth l'a relu dans tenant_users avant d'arriver ici
   (server/middleware/auth.ts), donc un jeton émis avant une
   rétrogradation ne porte plus les droits d'avant. */
function acteurCrm(req: Request): CrmActor {
  return {
    tenantId: req.user!.tenantId,
    userId:   req.user!.userId,
    role:     req.user!.role,
  }
}

/* ── Les colonnes de la 102 sont-elles déjà en base ? ────────────────
   Les migrations de ce dépôt sont appliquées À LA MAIN en production,
   APRÈS le déploiement automatique du code. Il existe donc une fenêtre
   pendant laquelle ce fichier tourne sans les colonnes qu'il écrit :
   sans ce sondage, chaque création de prospect y échouerait en 42703
   (« column "created_by" does not exist »). On casserait l'existant pour
   installer une nouveauté — exactement l'interdit posé.

   Le OUI est définitif : ce lot ne supprime aucune colonne, une fois
   présentes elles le restent. Le NON, lui, est REJOUÉ toutes les minutes
   — et c'est le point important : la migration est appliquée à la main
   SUR UN PROCESS DÉJÀ EN ROUTE. Un « non » mémorisé pour de bon ferait
   survivre le 503 à la migration elle-même, jusqu'au prochain
   redémarrage, et personne ne comprendrait pourquoi. Une requête sur
   information_schema par minute, dans le pire des cas, est un prix
   dérisoire pour ne pas avoir cet incident-là. */
let colonnes102 = false
let prochainSondage102 = 0
const RESONDAGE_102_MS = 60_000

async function perimetreCrmDisponible(): Promise<boolean> {
  if (colonnes102) return true
  const now = Date.now()
  if (now < prochainSondage102) return false
  prochainSondage102 = now + RESONDAGE_102_MS
  try {
    const rows = await query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name  IN ('prospects', 'clients', 'devis')
          AND column_name IN ('created_by', 'assigned_to')`
    )
    /* 3 tables x 2 colonnes : tout ou rien. Une migration à moitié
       appliquée est un état qu'on refuse d'exploiter — estampiller
       prospects mais pas devis produirait un périmètre incohérent,
       bien plus difficile à diagnostiquer qu'un refus net. */
    colonnes102 = Number(rows[0]?.n ?? 0) === 6
    if (!colonnes102) {
      logger.warn(
        '[crud:crm-scope] migration 102 absente : propriété CRM non estampillée, '
        + 'périmètre indisponible pour les non-gestionnaires'
      )
    }
    return colonnes102
  } catch (e: any) {
    logger.error('[crud:crm-scope] sondage du schéma impossible —', e?.message)
    return false
  }
}

/* Résultat du calcul de périmètre pour une lecture de LISTE.
   Trois états et non un booléen : « rien à filtrer » (gestionnaire, ou
   capacité view_all) et « je ne PEUX pas filtrer » (schéma pas prêt)
   mènent à des réponses opposées — tout voir, ou ne rien voir. Les
   confondre serait la fuite. */
type PerimetreListe =
  | { etat: 'libre' }
  | { etat: 'filtre'; sql: string; params: unknown[] }
  | { etat: 'indisponible' }

async function perimetreListeCrm(
  table: string,
  req: Request,
  startIdx: number,
): Promise<PerimetreListe> {
  const r = RESSOURCE_CRM.get(table)
  const enfant = ENFANT_CRM.get(table)
  if (!r && !enfant) return { etat: 'libre' }

  /* clausePerimetre rend null pour un gestionnaire ou un porteur de
     `<type>.view_all` : aucune requête, aucun filtre. */
  const ressource = r ?? enfant!.parent
  /* Pour une table enfant, la clause est calculée sur la table PARENT,
     puis enfermée dans un IN (…) : on ne duplique pas la règle, on la
     réutilise là où elle est écrite. */
  const alias = r ? table : 'p_perimetre'
  const clause = await clausePerimetre(acteurCrm(req), ressource, alias, startIdx)
  if (!clause) return { etat: 'libre' }

  if (!(await perimetreCrmDisponible())) return { etat: 'indisponible' }

  if (enfant) {
    const parentTable = TABLE_DE_RESSOURCE[enfant.parent]
    return {
      etat: 'filtre',
      sql: `${table}.${enfant.fk} IN (SELECT p_perimetre.id FROM public.${parentTable} p_perimetre`
         + ` WHERE p_perimetre.tenant_id = ${table}.tenant_id AND ${clause.sql})`,
      params: clause.params,
    }
  }
  return { etat: 'filtre', sql: clause.sql, params: clause.params }
}

/* Message rendu quand le périmètre ne peut pas être calculé (colonnes de
   la migration 102 absentes). Nommé une fois : les deux points d'entrée
   qui l'utilisent — périmètre personnel et filtre « Commercial » — sont
   la même panne vue de deux endroits, et doivent la dire pareil. */
const MESSAGE_MIGRATION_EN_COURS =
  'Mise à jour de la base en cours : cette liste sera de nouveau disponible dans quelques instants.'

/* ══════════════════════════════════════════════════════════════════
   FILTRE « COMMERCIAL » DE LA PAGE CRM  (§9 à §11 du cahier des charges)

   `GET /api/prospects?commercial=<uuid>` restreint la liste au
   portefeuille d'UNE personne. C'est un écran de pilotage pour
   l'administrateur : « montre-moi les leads de Yassmine ».

   ── Pourquoi côté serveur et pas dans le tableau du front ──────────
   Parce que le navigateur ne connaît pas la troisième branche du
   périmètre. Il sait lire `assigned_to` et `created_by` sur les lignes
   qu'il a reçues ; il ne sait rien des lignes qu'on a PARTAGÉES avec
   Yassmine (crm_record_grants), qui ne portent ni son identifiant ni son
   nom. Un filtre en mémoire afficherait donc un portefeuille amputé, et
   l'administrateur conclurait qu'elle n'a pas travaillé ces dossiers.

   ── Réservé aux gestionnaires, et IGNORÉ pour les autres ───────────
   Silencieusement ignoré, pas refusé : une commerciale qui forgerait
   `?commercial=<uuid d'une collègue>` reçoit sa propre liste, sans rien
   apprendre de l'existence du paramètre ni de la personne visée. Un 403
   aurait confirmé que l'identifiant essayé désigne bien quelqu'un.

   ── La règle de périmètre n'est PAS réécrite ici ───────────────────
   `clausePerimetre` (server/lib/crmScope.ts) est appelée telle quelle,
   avec la personne CIBLE en acteur. Une seconde condition écrite à la
   main aurait fini par diverger de la première, et l'écran de contrôle
   de l'administrateur aurait alors affiché un périmètre différent de
   celui que la commerciale voit vraiment — un mensonge sur un écran de
   contrôle d'accès, ce qui est pire que pas d'écran du tout.

   Deux conséquences assumées de cette réutilisation :
     · la cible porte `<type>.view_all` → `clausePerimetre` rend `null`,
       aucun filtre : l'administrateur voit tout l'espace, ce qui EST le
       portefeuille de quelqu'un qui voit tout l'espace ;
     · la cible porte `crm.access` sans `<type>.view` → la clause vaut
       `FALSE`, la liste est vide : elle ne voit effectivement rien.
   Aucun compte de la base ne se trouve dans le premier cas aujourd'hui.
══════════════════════════════════════════════════════════════════ */

/* Rôle prêté à la personne CIBLE le temps du calcul.
   `clausePerimetre` court-circuite tout pour un gestionnaire (elle rend
   `null` = « rien à filtrer »). Filtrer sur un manager renverrait donc
   la liste entière, et le filtre n'aurait plus aucun effet visible dès
   qu'on choisit un manager dans la liste déroulante. On demande donc
   « à quoi ressemble le PORTEFEUILLE de cette personne », question qui a
   un sens pour tout le monde, y compris pour un manager. */
const ROLE_POUR_PORTEFEUILLE = 'commercial'

type FiltreCommercial =
  | { etat: 'aucun' }
  | { etat: 'invalide' }
  | { etat: 'indisponible' }
  | { etat: 'filtre'; sql: string; params: unknown[] }

async function filtreCommercialCrm(
  table: string,
  req: Request,
  startIdx: number,
): Promise<FiltreCommercial> {
  /* Hors CRM, `commercial` n'a aucun sens — et il est de toute façon
     retiré des filtres d'égalité génériques (cf. RESERVED), sans quoi il
     partirait en `WHERE commercial = '…'` sur une colonne qui n'existe
     nulle part : une erreur 42703 rendue en 500. */
  const r = RESSOURCE_CRM.get(table)
  if (!r) return { etat: 'aucun' }

  const brut = req.query.commercial
  if (typeof brut !== 'string') return { etat: 'aucun' }
  const cible = brut.trim()
  /* « all » et la valeur vide sont la première option de la liste
     déroulante : comportement d'avant, aucun filtre ajouté. */
  if (!cible || cible === 'all') return { etat: 'aucun' }

  if (!estGestionnaire(req.user!.role)) return { etat: 'aucun' }

  /* Un gestionnaire, lui, mérite une erreur : sa liste déroulante
     n'envoie que des UUID, donc une valeur illisible est une requête
     forgée ou un bug du front. La rendre en « aucun filtre » ferait
     afficher les 133 fiches de l'espace sous l'étiquette d'une seule
     personne — l'écran mentirait au lieu de signaler la panne. */
  if (!UUID_CRM_RE.test(cible)) return { etat: 'invalide' }

  const clause = await clausePerimetre(
    { tenantId: req.user!.tenantId, userId: cible, role: ROLE_POUR_PORTEFEUILLE },
    r, table, startIdx,
  )
  if (!clause) return { etat: 'aucun' }

  /* La clause s'appuie sur created_by / assigned_to : sans la migration
     102, elle échouerait en 42703. Même réponse que pour le périmètre
     personnel — on refuse de servir une liste qu'on ne sait pas filtrer. */
  if (!(await perimetreCrmDisponible())) return { etat: 'indisponible' }

  return { etat: 'filtre', sql: clause.sql, params: clause.params }
}

/**
 * Refus de périmètre : 403 « Accès refusé », plus une trace.
 *
 * 403 et NON 404, comme l'exige le contrat — et c'est aussi le bon
 * message : une fiche hors périmètre EXISTE, la personne peut en
 * demander l'accès à son manager. Un 404 lui ferait croire à une donnée
 * supprimée et produirait un ticket de support pour rien.
 *
 * L'événement est journalisé au même titre qu'un refus RBAC : c'est
 * l'accumulation — quelqu'un qui balaie les fiches des autres — qui est
 * intéressante, pas l'occurrence isolée.
 */
function refuserPerimetre(
  req: Request, res: Response, table: string, action: string,
): void {
  markSecurityLogged(req)
  trackSecurityEvent({
    type: 'permission_denied', req,
    httpStatus: 403,
    reason: 'crm_scope_denied',
    metadata: { table, action, role: req.user!.role },
  })
  res.status(403).json({ error: 'Accès refusé' })
}

/**
 * Applique la propriété CRM à une CRÉATION.
 *
 * `created_by` est TOUJOURS l'utilisateur connecté, quoi qu'envoie le
 * client : le POST générique n'applique pas READONLY_COLUMNS (ce filtre
 * n'existe que dans le PATCH), donc le forçage est écrit ici, en toutes
 * lettres. Sans lui, il suffirait de poster `{ created_by: <autre> }`
 * pour se retirer une fiche du périmètre, ou pour l'attribuer à un
 * collègue.
 *
 * `assigned_to` n'est recevable que d'un gestionnaire ; pour tout autre
 * rôle elle vaut le créateur — sans quoi un commercial créerait une
 * fiche qu'il ne verrait pas lui-même à la seconde suivante.
 *
 * Renvoie un message d'erreur à renvoyer en 400, ou null.
 */
async function appliquerProprieteCrm(
  table: string, req: Request, data: Record<string, unknown>,
): Promise<string | null> {
  const r = RESSOURCE_CRM.get(table)
  if (!r) return null

  /* Ce que le client a envoyé ne compte jamais. */
  delete data.created_by
  delete data.assigned_to

  /* Schéma pas encore migré : on n'écrit NI l'une NI l'autre, et la
     création se comporte comme avant la 102 plutôt que d'échouer. */
  if (!(await perimetreCrmDisponible())) return null

  const moi = req.user!.userId
  data.created_by = moi

  if (!estGestionnaire(req.user!.role)) {
    data.assigned_to = moi
    return null
  }

  const demande = await lireAssignationDemandee(req)
  if (!demande.ok) return demande.erreur
  /* Un gestionnaire qui ne précise rien laisse la fiche « non
     attribuée » (NULL) : elle reste visible des seuls gestionnaires,
     ce qui est le comportement voulu et documenté par la migration. */
  if (demande.valeur !== undefined) data.assigned_to = demande.valeur
  return null
}

/**
 * Réinjecte `assigned_to` dans une MODIFICATION, pour les seuls
 * gestionnaires.
 *
 * READONLY_COLUMNS vient de la retirer du corps — c'est la bonne valeur
 * par défaut. Mais désigner le responsable d'un dossier est précisément
 * le geste d'un manager, et la fiche doit pouvoir le faire.
 *
 * NOTE sur le rôle non gestionnaire : on IGNORE sa demande, on ne la
 * remplace pas par lui-même. Repositionner `assigned_to = créateur` à
 * chaque PATCH — comme on le fait à la création — écraserait
 * l'attribution décidée par un manager dès la première modification
 * faite par le créateur. Ce serait un vol de dossier automatique.
 */
async function appliquerAssignationCrm(
  table: string, req: Request, data: Record<string, unknown>,
): Promise<string | null> {
  const r = RESSOURCE_CRM.get(table)
  if (!r) return null
  if (!estGestionnaire(req.user!.role)) return null
  if (!(await perimetreCrmDisponible())) return null

  const demande = await lireAssignationDemandee(req)
  if (!demande.ok) return demande.erreur
  if (demande.valeur !== undefined) data.assigned_to = demande.valeur
  return null
}

/**
 * Lit et valide `assigned_to` du corps de la requête.
 *   undefined → rien de demandé ; null → désattribution explicite ;
 *   string    → uuid d'un membre ACTIF de cet espace.
 *
 * La vérification d'appartenance n'est pas décorative : attribuer une
 * fiche au compte d'un AUTRE espace la rendrait invisible pour toute
 * l'équipe qui la travaille (le périmètre est toujours joint au filtre
 * de tenant), sans que personne ne comprenne pourquoi. Mieux vaut un
 * refus immédiat et lisible.
 */
async function lireAssignationDemandee(
  req: Request,
): Promise<{ ok: true; valeur: string | null | undefined } | { ok: false; erreur: string }> {
  const brut = (req.body as Record<string, unknown> | undefined)?.assigned_to
  if (brut === undefined) return { ok: true, valeur: undefined }
  /* '' vient des <select> vides du front : c'est « aucun responsable ». */
  if (brut === null || brut === '') return { ok: true, valeur: null }
  if (typeof brut !== 'string' || !UUID_CRM_RE.test(brut)) {
    return { ok: false, erreur: 'Responsable invalide' }
  }
  try {
    const membre = await tenantQueryOne<{ user_id: string }>(
      req.user!.tenantId,
      `SELECT user_id FROM public.tenant_users
        WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
      [req.user!.tenantId, brut],
    )
    if (!membre) return { ok: false, erreur: "Ce responsable ne fait pas partie de l'espace" }
  } catch (e: any) {
    logger.error('[crud:crm-assignation]', e?.message)
    return { ok: false, erreur: 'Vérification du responsable impossible' }
  }
  return { ok: true, valeur: brut }
}

/**
 * Estampille « qui a fait quoi » sur les tables qui l'exposent.
 *
 * Côté membre (espace /my-space) c'est server/routes/mySpace.ts qui pose
 * le nom ; ici on couvre le CRUD générique, donc les écritures faites
 * depuis l'espace admin. Dans les deux cas la valeur vient du serveur,
 * jamais du corps de la requête — sinon le nom affiché ne prouverait
 * rien. Les colonnes sont d'ailleurs dans READONLY_COLUMNS.
 */
async function stampAuthorship(
  table: string,
  data: Record<string, unknown>,
  req: Request,
  mode: 'create' | 'update',
): Promise<void> {
  if (table !== 'sops') return
  delete data.created_by_name
  delete data.updated_by_name
  try {
    const u = await tenantQueryOne<{ name: string | null; email: string }>(
      req.user!.tenantId,
      `SELECT name, email FROM public.users WHERE id = $1`,
      [req.user!.userId],
    )
    const who = (u?.name ?? '').trim() || u?.email || 'Administrateur'
    data.updated_by_name = who
    if (mode === 'create') data.created_by_name = who
  } catch (e: any) {
    /* Une estampille manquante ne doit pas faire échouer l'écriture. */
    logger.error('[crud:stampAuthorship]', e.message)
  }
}

function guardTable(table: string, res: Response, req?: Request): boolean {
  if (!EXPOSED_TABLES.has(table)) {
    /* Une table hors liste blanche, c'est soit un bug client, soit
       quelqu'un qui cherche `users`, `refresh_tokens`, `security_events`…
       Le nom demandé est journalisé (tronqué), la requête est refusée. */
    if (req) {
      trackSecurityEvent({
        type: 'invalid_input', req,
        httpStatus: 400,
        reason: 'table_not_allowed',
        metadata: { table: table.slice(0, 64) },
      })
    }
    res.status(400).json({ error: `Table non autorisée` })
    return false
  }
  return true
}

/**
 * Détecte une falsification explicite de `tenant_id` dans le corps.
 *
 * Le serveur impose déjà le tenant du JWT (POST) ou retire la colonne
 * (PATCH) : l'isolation n'est jamais en jeu. Mais recevoir un tenant_id
 * DIFFÉRENT du sien n'arrive pas par hasard — aucun écran de l'app n'en
 * envoie. C'est le signal IDOR/BOLA le plus net qu'on puisse capter ici,
 * et il est sans faux positif.
 */
function detectForgedTenant(req: Request, table: string): void {
  const claimed = (req.body as Record<string, unknown> | undefined)?.tenant_id
  if (typeof claimed !== 'string' || !claimed) return
  if (claimed === req.user!.tenantId) return
  markSecurityLogged(req)
  trackSecurityEvent({
    type: 'tenant_scope_denied', req,
    reason: 'forged_tenant_id',
    metadata: { table, claimed_tenant: claimed.slice(0, 64) },
  })
}

/**
 * Un 404 isolé est normal ; un balayage d'identifiants ne l'est pas.
 * On ne journalise qu'au franchissement du seuil (compteur en mémoire).
 */
function noteNotFound(req: Request, table: string): void {
  const actor = req.user!.userId
  const count = noteResourceProbe(`${actor}|notfound`)
  if (!isProbeThresholdCrossed(count)) return
  markSecurityLogged(req)
  trackSecurityEvent({
    type: 'tenant_scope_denied', req,
    httpStatus: 404,
    reason: 'resource_enumeration_suspected',
    /* SUSPICIOUS et non CONFIRMED : un client mal synchronisé peut
       produire ce volume. On signale, on n'accuse pas. */
    status: 'suspicious',
    metadata: {
      table, misses: count,
      window_minutes: PROBE_LIMITS.windowMs / 60000,
    },
  })
}

/* Express 5 types req.params[key] as string | string[]; our routes
   always receive a single segment, so narrow once at the top. */
function tableParam(req: Request): string {
  const t = req.params.table
  return Array.isArray(t) ? (t[0] ?? '') : (t ?? '')
}

/* ── GET /api/:table ─────────────────────────────────────────── */
router.get('/:table', async (req: Request, res: Response) => {
  const table = tableParam(req)
  if (!guardTable(table, res, req)) return

  const tenantId = req.user!.tenantId
  const orderBy  = safeColumn(String(req.query.orderBy || 'created_at'))
  const order    = req.query.order === 'asc' ? 'ASC' : 'DESC'
  const limit    = Math.min(Number(req.query.limit  || 500), 1000)
  const offset   = Math.max(Number(req.query.offset || 0), 0)

  /* Filtres d'égalité optionnels : tout query param hors réservés est traité
     comme `colonne = valeur` (nom validé par SAFE_COL, valeur paramétrée).
     Ex. /api/prospect_logs?prospect_id=… → timeline scopée à un prospect. */
  /* `commercial` est RÉSERVÉ : il désigne une personne, pas une colonne.
     Sans cette réservation, la boucle ci-dessous en ferait un
     `WHERE commercial = '<uuid>'` sur une colonne qui n'existe dans
     aucune table — 42703, rendu en 500. Il est traité plus bas par
     filtreCommercialCrm. */
  const RESERVED = new Set(['orderBy', 'order', 'limit', 'offset', 'commercial'])
  const whereClauses: string[] = []
  const whereVals: unknown[] = []
  for (const [k, v] of Object.entries(req.query)) {
    if (RESERVED.has(k) || typeof v !== 'string' || !SAFE_COL.test(k)) continue
    whereVals.push(v)
    whereClauses.push(`${k} = $${whereVals.length}`)
  }

  try {
    /* DEUX lignes de défense indépendantes :
       1. RLS PostgreSQL (SET LOCAL app.current_tenant dans tenantQuery) ;
       2. ce filtre applicatif.
       La 1re saute si le rôle est SUPERUSER/BYPASSRLS ou propriétaire
       d'une table dont la RLS n'est pas FORCÉE — situation réellement
       constatée. La 2e ne dépend d'aucune configuration de base. */
    await ensureTenantColumnCache()
    if (tableIsTenantScoped(table)) {
      whereVals.push(tenantId)
      whereClauses.push(`tenant_id = $${whereVals.length}`)
    }
    /* Périmètre par utilisateur — ajouté APRÈS le filtre de tenant, donc
       le premier placeholder encore libre est bien whereVals.length + 1.
       Les paramètres du périmètre sont poussés dans le MÊME tableau :
       LIMIT et OFFSET, numérotés à partir de whereVals.length, suivent
       tout seuls. C'est la seule façon de ne pas décaler la requête. */
    const perimetre = await perimetreListeCrm(table, req, whereVals.length + 1)
    if (perimetre.etat === 'indisponible') {
      /* On ne peut pas filtrer : on ne sert RIEN plutôt que tout. 503 et
         non 500 — la panne est temporaire et se répare en appliquant la
         migration, le message doit le dire. */
      return res.status(503).json({ error: MESSAGE_MIGRATION_EN_COURS })
    }
    if (perimetre.etat === 'filtre') {
      whereVals.push(...perimetre.params)
      whereClauses.push(perimetre.sql)
    }

    /* Filtre « Commercial » — s'AJOUTE au périmètre du demandeur, il ne
       le remplace pas. En pratique les deux ne se cumulent jamais : le
       paramètre n'est lu que pour un gestionnaire, dont le périmètre est
       justement « libre ». Le AND reste écrit tel quel pour que ce soit
       encore vrai si la règle changeait. */
    const filtreCom = await filtreCommercialCrm(table, req, whereVals.length + 1)
    if (filtreCom.etat === 'invalide') {
      return res.status(400).json({ error: 'Commercial invalide' })
    }
    if (filtreCom.etat === 'indisponible') {
      return res.status(503).json({ error: MESSAGE_MIGRATION_EN_COURS })
    }
    if (filtreCom.etat === 'filtre') {
      whereVals.push(...filtreCom.params)
      whereClauses.push(filtreCom.sql)
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const rows = await tenantQuery(
      tenantId,
      `SELECT * FROM ${table} ${whereSql} ORDER BY ${orderBy} ${order} LIMIT $${whereVals.length + 1} OFFSET $${whereVals.length + 2}`,
      [...whereVals, limit, offset]
    )
    res.json(rows)
  } catch (err: any) {
    logger.error(`[GET /api/${table}]`, err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/:table/:id ─────────────────────────────────────── */
router.get('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res, req)) return

  try {
    await ensureTenantColumnCache()
    const scope = tableIsTenantScoped(table) ? ' AND tenant_id = $2' : ''
    const params = tableIsTenantScoped(table) ? [id, req.user!.tenantId] : [id]
    const row = await tenantQueryOne(
      req.user!.tenantId,
      `SELECT * FROM ${table} WHERE id = $1${scope}`,
      params
    )
    if (!row) {
      noteNotFound(req, table)
      return res.status(404).json({ error: 'Non trouvé' })
    }

    /* La fiche existe et appartient bien à l'espace — mais pas forcément
       au périmètre de cette personne. 403, jamais 404 : voir
       refuserPerimetre. Le contrôle est fait APRÈS la lecture pour ne pas
       transformer un identifiant inexistant en 403, ce qui rendrait le
       débogage impossible côté support. */
    const rFiche = RESSOURCE_CRM.get(table)
    if (rFiche && !(await peutAcceder(acteurCrm(req), rFiche, String(id), 'view'))) {
      return refuserPerimetre(req, res, table, 'view')
    }
    /* Ligne enfant : c'est le PARENT qui décide. */
    const enfantFiche = ENFANT_CRM.get(table)
    if (enfantFiche) {
      const parentId = (row as Record<string, unknown>)[enfantFiche.fk]
      if (typeof parentId === 'string'
          && !(await peutAcceder(acteurCrm(req), enfantFiche.parent, parentId, 'view'))) {
        return refuserPerimetre(req, res, table, 'view')
      }
    }
    res.json(row)
  } catch (err: any) {
    sendDbError(res, err, `[GET /api/${table}/:id]`)
  }
})

/* Colonnes qui sont de VRAIS tableaux Postgres (int[], text[]…) et non
   du jsonb. Elles doivent échapper à la sérialisation JSON ci-dessous :
   pg-node sait déjà écrire un tableau JS en syntaxe Postgres `{30,1440}`,
   alors qu'un JSON.stringify produirait `[30,1440]` — rejeté par la base
   avec « malformed array literal ».

   La liste est explicite plutôt que déduite du schéma : une colonne jsonb
   traitée par erreur comme un tableau natif casserait silencieusement des
   écritures qui fonctionnent aujourd'hui (attachments, recurrence…). */
const NATIVE_ARRAY_COLUMNS: Record<string, Set<string>> = {
  team_member_tasks: new Set(['reminder_offsets']),
}

/* Empty string → null (Postgres rejects "" for date/numeric/uuid/enum columns).
   Arrays/plain objects → JSON string (for jsonb columns — sans cast, pg-node
   les sérialise en syntaxe array Postgres `{a,b}` qui échoue côté jsonb avec
   "Expected ':', but found ','"). */
function normalizeValues(obj: Record<string, unknown>, table?: string): Record<string, unknown> {
  const nativeArrays = table ? NATIVE_ARRAY_COLUMNS[table] : undefined
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (v === '') return [k, null]
      if (v === null || v === undefined) return [k, v]
      if (Array.isArray(v) && nativeArrays?.has(k)) return [k, v]
      if (Array.isArray(v) || (typeof v === 'object' && (v as object).constructor === Object)) {
        return [k, JSON.stringify(v)]
      }
      return [k, v]
    })
  )
}

/* Traduit une erreur Postgres en réponse HTTP lisible côté client.
   Le front (src/lib/api.ts) affiche `data.error` dans un toast, donc ce
   message est vu tel quel par l'utilisateur.
   - P0001 = RAISE EXCEPTION applicatif (garde-fous métier des triggers,
     ex. « Le paiement dépasse le solde restant ») → 400 + message tel quel :
     il est rédigé pour l'utilisateur, pas pour le debug.
   - 23xxx = violations d'intégrité → 400/409 + message court et clair.
   - Sinon → 500 générique + SQLSTATE (aide à repérer une dérive de schéma). */
function sendDbError(res: Response, err: any, ctx: string, extra?: unknown): void {
  const code = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : null
  logger.error(ctx, code, err?.message, err?.detail, extra ?? '')

  if (code === 'P0001') {
    const msg = typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : 'Opération refusée'
    return void res.status(400).json({ error: msg })
  }
  switch (code) {
    case '23505': return void res.status(409).json({ error: 'Doublon : cet enregistrement existe déjà.' })
    case '23503': return void res.status(400).json({ error: 'Référence liée introuvable ou déjà supprimée.' })
    case '23502': return void res.status(400).json({ error: 'Un champ obligatoire est manquant.' })
    case '23514': return void res.status(400).json({ error: 'Valeur non autorisée pour un des champs.' })
    /* 22P02 = « invalid text representation » : un identifiant qui n'est
       pas un UUID, une date illisible… C'est une requête MALFORMÉE, pas
       une panne. Rendue en 500, elle faisait croire à un serveur cassé —
       et une simple faute de frappe dans une URL suffisait à la produire. */
    case '22P02': return void res.status(400).json({ error: 'Identifiant ou valeur au format invalide.' })
  }
  res.status(500).json({ error: code ? `Erreur serveur (${code})` : 'Erreur serveur' })
}

/* ── POST /api/:table ────────────────────────────────────────── */
router.post('/:table', async (req: Request, res: Response) => {
  const table = tableParam(req)
  if (!guardTable(table, res, req)) return

  detectForgedTenant(req, table)
  const raw  = { ...req.body, tenant_id: req.user!.tenantId }
  const data = normalizeValues(Object.fromEntries(Object.entries(raw).filter(([k]) => SAFE_COL.test(k))), table)
  await stampAuthorship(table, data, req, 'create')
  /* Propriété CRM : AVANT le calcul de keys/vals, sinon les colonnes
     ajoutées ici n'auraient pas de placeholder. */
  const erreurPropriete = await appliquerProprieteCrm(table, req, data)
  if (erreurPropriete) return res.status(400).json({ error: erreurPropriete })

  /* Déposer un suivi dans un dossier suppose d'avoir accès à ce dossier.
     Sans ce contrôle, un commercial pouvait écrire un compte rendu
     d'appel chez le prospect d'un collègue — et cette écriture
     apparaissait chez lui, signée du nom de l'intrus. */
  const enfantPost = ENFANT_CRM.get(table)
  if (enfantPost) {
    const parentId = data[enfantPost.fk]
    if (typeof parentId === 'string' && UUID_CRM_RE.test(parentId)
        && !(await peutAcceder(acteurCrm(req), enfantPost.parent, parentId, 'log'))) {
      return refuserPerimetre(req, res, table, 'log')
    }
  }
  const keys = Object.keys(data)
  const vals = Object.values(data)
  const ph   = keys.map((_, i) => `$${i + 1}`).join(', ')
  const cols = keys.join(', ')

  try {
    const row = await tenantQueryOne<any>(
      req.user!.tenantId,
      `INSERT INTO ${table} (${cols}) VALUES (${ph}) RETURNING *`,
      vals,
      /* Qui écrit : lu par le déclencheur d'audit (log_mutation). */
      req.user!.userId,
    )
    res.status(201).json(row)

    /* Fire-and-forget notifications email (post-create). */
    if (row) {
      const tid = req.user!.tenantId
      console.log(`[crud:notif-hook] POST /api/${table} → row.id=${row.id} tid=${tid}`)
      if (table === 'prospects') {
        notifyNewProspect(tid, row).catch(e => logger.error('[notif:prospect] async err:', e?.message))
      } else if (table === 'paiements') {
        notifyNewPaiement(tid, row).catch(e => logger.error('[notif:paiement] async err:', e?.message))
      }
    }
  } catch (err: any) {
    sendDbError(res, err, `[POST /api/${table}]`, { keys })
  }
})

/* ── PATCH /api/:table/:id ───────────────────────────────────── */
router.patch('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res, req)) return

  detectForgedTenant(req, table)

  /* Périmètre AVANT toute écriture. Un refus doit être un 403 explicite,
     pas un UPDATE qui ne touche aucune ligne : celui-ci finirait en 404
     et laisserait croire à une fiche disparue. */
  /* Modifier un suivi, c'est écrire dans le dossier du prospect : le
     droit demandé est celui du parent, action « log ». */
  const enfantPatch = ENFANT_CRM.get(table)
  if (enfantPatch) {
    const parentId = await parentDeLEnfant(table, String(id), req.user!.tenantId)
    if (parentId && !(await peutAcceder(acteurCrm(req), enfantPatch.parent, parentId, 'log'))) {
      return refuserPerimetre(req, res, table, 'log')
    }
  }

  const rPatch = RESSOURCE_CRM.get(table)
  if (rPatch && !(await peutAcceder(acteurCrm(req), rPatch, String(id), 'edit'))) {
    return refuserPerimetre(req, res, table, 'edit')
  }

  const readonly = READONLY_COLUMNS[table]
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body as object)
      .filter(([k]) => SAFE_COL.test(k) && k !== 'tenant_id' && !readonly?.has(k))
  ), table)
  /* Réinjection d'`assigned_to` pour un gestionnaire — AVANT le contrôle
     « au moins un champ » : réassigner un dossier sans rien modifier
     d'autre est une modification parfaitement légitime, et le seul
     champ du corps vient d'être retiré par READONLY_COLUMNS. */
  /* Déposer un suivi dans un dossier suppose d'avoir accès à ce
     dossier. Sans ce contrôle, un commercial pouvait écrire un compte
     rendu d'appel chez le prospect d'un collègue — et cette écriture
     apparaissait chez lui, signée du nom de l'intrus. */
  const enfantPost = ENFANT_CRM.get(table)
  if (enfantPost) {
    const parentId = data[enfantPost.fk]
    if (typeof parentId === 'string' && UUID_CRM_RE.test(parentId)) {
      if (!(await peutAcceder(acteurCrm(req), enfantPost.parent, parentId, 'log'))) {
        return refuserPerimetre(req, res, table, 'log')
      }
    }
  }

  const erreurAssignation = await appliquerAssignationCrm(table, req, data)
  if (erreurAssignation) return res.status(400).json({ error: erreurAssignation })
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  /* Après le contrôle « au moins un champ » (l'estampille seule ne fait
     pas une mise à jour), mais AVANT le calcul de keys/vals : les deux
     doivent rester alignés sur les mêmes placeholders. */
  await stampAuthorship(table, data, req, 'update')
  const keys = Object.keys(data)

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const vals = [...Object.values(data), id]

  try {
    await ensureTenantColumnCache()
    /* Le tenant fait partie de la clause WHERE : une ligne d'un autre
       espace ne peut pas être modifiée, même si la RLS est inopérante. */
    let scope = ''
    if (tableIsTenantScoped(table)) {
      vals.push(req.user!.tenantId)
      scope = ` AND tenant_id = $${vals.length}`
    }
    const row = await tenantQueryOne<any>(
      req.user!.tenantId,
      `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1}${scope} RETURNING *`,
      vals,
      req.user!.userId,
    )
    if (!row) {
      noteNotFound(req, table)
      return res.status(404).json({ error: 'Non trouvé' })
    }
    res.json(row)

    /* Fire-and-forget notifications email (post-update). */
    const tid = req.user!.tenantId
    if (table === 'team_member_tasks' && data.status === 'validation') {
      void notifyTaskValidation(tid, row)
    } else if (table === 'devis' && data.statut === 'accepte') {
      void notifyDevisAccepte(tid, row)
    }
  } catch (err: any) {
    sendDbError(res, err, `[PATCH /api/${table}/${id}]`, { keys })
  }
})

/* ── DELETE /api/:table/:id ──────────────────────────────────── */
router.delete('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res, req)) return

  /* Même garde qu'au PATCH, et pour la même raison : refuser avant
     d'écrire. Aujourd'hui TABLE_ACL réserve déjà la suppression de ces
     trois tables aux admins et managers — donc ce test passe toujours.
     Il est là pour le jour où cette matrice s'ouvrira, pas pour
     aujourd'hui : une règle d'accès ne doit pas dépendre d'une autre
     règle qui, elle, peut changer. */
  const enfantDelete = ENFANT_CRM.get(table)
  if (enfantDelete) {
    const parentId = await parentDeLEnfant(table, String(id), req.user!.tenantId)
    if (parentId && !(await peutAcceder(acteurCrm(req), enfantDelete.parent, parentId, 'log'))) {
      return refuserPerimetre(req, res, table, 'log')
    }
  }

  const rDelete = RESSOURCE_CRM.get(table)
  if (rDelete && !(await peutAcceder(acteurCrm(req), rDelete, String(id), 'edit'))) {
    return refuserPerimetre(req, res, table, 'delete')
  }

  try {
    await ensureTenantColumnCache()
    const scoped = tableIsTenantScoped(table)

    /* Les fichiers d'images d'un SOP sont relevés AVANT le DELETE : la
       cascade emporte les lignes sop_images et on ne saurait plus quoi
       effacer sur le volume. Sans ça, chaque suppression d'un SOP
       illustré laissait ses images sur le disque, définitivement. */
    let orphanFiles: string[] = []
    if (table === 'sops') {
      try {
        const imgs = await tenantQuery<{ storage_path: string }>(
          req.user!.tenantId,
          `SELECT storage_path FROM public.sop_images WHERE sop_id = $1`, [id],
        )
        orphanFiles = imgs.map(i => i.storage_path)
      } catch (e: any) { logger.error('[crud:sop-images-scan]', e.message) }
    }

    const row = await tenantQueryOne(
      req.user!.tenantId,
      `DELETE FROM ${table} WHERE id = $1${scoped ? ' AND tenant_id = $2' : ''} RETURNING id`,
      scoped ? [id, req.user!.tenantId] : [id],
      req.user!.userId,
    )
    if (!row) {
      noteNotFound(req, table)
      return res.status(404).json({ error: 'Non trouvé' })
    }
    for (const rel of orphanFiles) {
      try { await unlink(path.join(UPLOAD_DIR, rel)) } catch { /* déjà absent */ }
    }
    res.json({ success: true })
  } catch (err: any) {
    /* 23503 sur un DELETE = la ligne est encore référencée par une FK
       RESTRICT. Ce n'est pas une panne : c'est un refus métier, et
       l'utilisateur doit savoir quoi faire. Cas réel : supprimer un compte
       bancaire porteur de transferts effacerait la moitié d'un mouvement
       et fausserait le solde de l'autre compte. */
    if (err?.code === '23503') {
      logger.warn(`[DELETE /api/${table}/${id}] référencé ailleurs:`, err?.detail)
      return res.status(409).json({
        error: table === 'bank_accounts'
          ? "Ce compte est utilisé par des transferts : supprimez-les d'abord, ou désactivez le compte."
          : 'Cet enregistrement est référencé par d\'autres données et ne peut pas être supprimé.',
      })
    }
    sendDbError(res, err, `[DELETE /api/${table}/${id}]`)
  }
})

export default router
