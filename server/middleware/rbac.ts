import { Request, Response, NextFunction } from 'express'
import type { Role } from './auth'
import { trackSecurityEvent } from '../lib/securityEvents'
import { markSecurityLogged } from './securityMonitor'
import { getEffectiveRole } from '../lib/effectiveRole'
import { queryOne } from '../db/pool'
import { logger } from '../lib/logger'

/* ─────────────────────────────────────────────────────────────────
   RBAC matrix for table CRUD routes.

   Mirrors the frontend `ROLE_PERMISSIONS` map in
   [src/lib/permissions.ts], but enforced server-side — the frontend
   map is a UX hint, this one is the security boundary.

   Key = table name (same as route :table param).
   Value = set of roles allowed to perform the HTTP method.
───────────────────────────────────────────────────────────────── */

export type Action = 'view' | 'create' | 'edit' | 'delete'

const METHOD_TO_ACTION: Record<string, Action> = {
  GET:    'view',
  POST:   'create',
  PATCH:  'edit',
  PUT:    'edit',
  DELETE: 'delete',
}

const ALL: Role[] = ['admin', 'manager', 'commercial', 'comptable', 'viewer']

/* ALL + le profil technique.
   `developpeur` n'est volontairement PAS dans ALL : 34 tables ouvrent
   leur lecture à ALL, dont paiements, factures, devis et contrats. L'y
   glisser aurait donné au profil Production un accès financier complet
   d'un seul caractère. Le rôle est donc ajouté table par table, là où le
   travail l'exige — c'est le moindre privilège appliqué, pas déclaré. */
const ALL_TECH: Role[] = [...ALL, 'developpeur']

function rw(roles: Role[]): Record<Action, Role[]> {
  return { view: roles, create: roles, edit: roles, delete: roles }
}

function ro(roles: Role[]): Record<Action, Role[]> {
  return { view: roles, create: [], edit: [], delete: [] }
}

function matrix(
  view:   Role[],
  create: Role[] = view,
  edit:   Role[] = create,
  del:    Role[] = ['admin'],
): Record<Action, Role[]> {
  return { view, create, edit, delete: del }
}

/* Canonical permission map. Undefined table → admin-only. */
/* Exportée en LECTURE pour que le Centre de sécurité affiche les règles
   RÉELLEMENT appliquées, et non une copie tenue à part dans le front —
   une matrice affichée qui diverge de la matrice appliquée est pire que
   pas de matrice du tout : elle rassure à tort. */
export const TABLE_ACL: Record<string, Record<Action, Role[]>> = {
  clients:              matrix(ALL_TECH,                             ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  prospects:            matrix(ALL,                             ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  /* Journal d'activité prospect (notes, appels, emails, changements de statut) —
     création ouverte à qui travaille les prospects ; édition/suppression admin/manager. */
  prospect_logs:        matrix(ALL,                             ['admin','manager','commercial'], ['admin','manager'],              ['admin','manager']),
  devis:                matrix(ALL,                             ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  factures:             matrix(ALL,                             ['admin','manager','commercial','comptable'], ['admin','manager','comptable'], ['admin','manager','comptable']),
  paiements:            matrix(ALL,                             ['admin','manager','comptable'],              ['admin','manager','comptable'], ['admin','comptable']),
  depenses:             matrix(['admin','manager','comptable'], ['admin','comptable'],                        ['admin','comptable'],            ['admin','comptable']),
  contrats:             matrix(ALL,                             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  produits:             matrix(ALL_TECH,                             ['admin','manager','commercial'],             ['admin','manager','commercial'], ['admin','manager']),
  fournisseurs:         matrix(['admin','manager','comptable'], ['admin','manager'],                          ['admin','manager'],              ['admin']),
  contacts:             matrix(ALL_TECH,                             ['admin','manager','commercial'],             ['admin','manager','commercial'], ['admin','manager']),
  team_members:         matrix(['admin','manager','comptable'], ['admin'],                                    ['admin'],                        ['admin']),
  domaines:             matrix(ALL_TECH,                             ['admin','manager','developpeur'],                          ['admin','manager','developpeur'],              ['admin']),
  hebergements:         matrix(ALL_TECH,                             ['admin','manager','developpeur'],                          ['admin','manager','developpeur'],              ['admin']),
  cheques_recus:        matrix(['admin','manager','comptable'], ['admin','manager','comptable'],              ['admin','comptable'],            ['admin','comptable']),
  cheques_emis:         matrix(['admin','manager','comptable'], ['admin','manager','comptable'],              ['admin','comptable'],            ['admin','comptable']),
  abonnements:          matrix(ALL,                             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  client_subscriptions: matrix(ALL,                             ['admin','manager','commercial'],             ['admin','manager','commercial'], ['admin','manager']),
  taches:               rw(ALL_TECH),
  automation_rules:     matrix(['admin','manager'],             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  automation_logs:      ro(['admin','manager']),
  alerts:               { view: ALL, create: ['admin','manager'], edit: ALL, delete: ALL },
  calendrier_events:    rw(ALL_TECH),
  bank_accounts:        matrix(['admin','manager','comptable'], ['admin'],                                    ['admin','comptable'],            ['admin']),
  credits_dettes:       matrix(['admin','manager','comptable'], ['admin','manager','comptable'],              ['admin','manager','comptable'], ['admin','comptable']),
  bons_commande:        matrix(['admin','manager','commercial','comptable'], ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  employee_leaves:      matrix(['admin','manager'],             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  employee_payroll:     matrix(['admin','comptable'],           ['admin','comptable'],                        ['admin','comptable'],            ['admin']),
  tache_actions:        rw(ALL_TECH),
  personal_tasks:       rw(ALL_TECH),
  /* Module Guides — playbook lecture pour tous, écriture admin/manager.
     guide_checklist_state et guide_template_renders : chaque user gère
     son propre état → CRUD pour tous (RLS + tenant_id assurent l'isolation). */
  guide_steps:               matrix(ALL_TECH,                  ['admin','manager'], ['admin','manager'], ['admin']),
  guide_templates:           matrix(ALL_TECH,                  ['admin','manager'], ['admin','manager'], ['admin']),
  guide_checklists:          matrix(ALL_TECH,                  ['admin','manager'], ['admin','manager'], ['admin']),
  guide_checklist_state:     rw(ALL_TECH),
  guide_template_renders:    rw(ALL_TECH),
  guide_discovery_questions: matrix(ALL_TECH,                  ['admin','manager'], ['admin','manager'], ['admin']),
  /* Vision (Primary Aim) — lecture pour tous (widgets Dashboard),
     écriture admin seulement (page /vision protège déjà l'UI) */
  tenant_vision:             matrix(ALL,                  ['admin'],           ['admin'],           ['admin']),
  /* SOPs — lecture pour tous, création/édition admin+manager,
     suppression admin uniquement */
  sops:                      matrix(ALL_TECH,                  ['admin','manager'], ['admin','manager'], ['admin']),
  /* Partages SOP — lecture pour tous, partage/édition admin+manager,
     suppression admin+manager (le propriétaire peut révoquer) */
  sop_shares:                matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin','manager']),
  /* Progression formation SOP — CRUD ouvert à tous (RLS + tenant_id
     assurent l'isolation, et chaque user gère sa propre progression) */
  sop_training_progress:     rw(ALL_TECH),
  /* Stagiaires — lecture pour tous, création/édition admin+manager,
     suppression admin uniquement */
  stagiaires:                matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin']),
  /* Projets — lecture pour tous, création/édition admin+manager+commercial,
     suppression admin+manager */
  projets:                   matrix(ALL_TECH,                  ['admin','manager','commercial','developpeur'], ['admin','manager','commercial','developpeur'], ['admin','manager']),
  /* Projet assignees — qui peut assigner des membres aux projets */
  projet_assignees:          matrix(ALL,                  ['admin','manager'],              ['admin','manager'],              ['admin','manager']),
  /* Templates de projet personnalisés — lecture pour tous, édition admin/manager */
  projet_templates:          matrix(ALL_TECH,                  ['admin','manager'],              ['admin','manager'],              ['admin','manager']),
  /* Messages projet — chat équipe : tous peuvent lire/écrire, admin/manager peut supprimer */
  projet_messages:           matrix(ALL,                  ALL,                              ALL,                              ['admin','manager']),
  /* Tâches assignées aux membres — chacun peut voir + modifier ses tâches,
     admin/manager peuvent tout faire */
  team_member_tasks:         rw(ALL_TECH),
  /* Bons de livraison — handover projet (contient mots de passe → accès restreint) */
  bons_livraison:            matrix(['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  /* Modèles de prestations (bibliothèque devis) — lecture pour tous
     (utilisée dans l'éditeur de devis), gestion admin/manager */
  prestation_models:         matrix(ALL_TECH,                  ['admin','manager'], ['admin','manager'], ['admin','manager']),

  /* ── Module financier ────────────────────────────────────────────
     Même périmètre que `paiements` : l'argent réellement encaissé ne
     se manipule pas depuis un rôle commercial ou viewer.

     Les créations/suppressions passant par /api/finance (atomicité,
     anti-doublon, cohérence avec les prévisions) sont volontairement
     FERMÉES ici : `create`/`delete` à [] force le chemin sûr.
       · revenus                  → création via POST /api/finance/revenus
                                    suppression via DELETE /api/finance/revenus/:id
       · transferts_comptes       → POST/DELETE /api/finance/transferts
       · bank_account_adjustments → journal en ajout seul, POST /api/finance/ajustements,
                                    jamais modifiable ni supprimable (historique intact)
     Les prévisions, elles, n'engagent aucun mouvement d'argent tant
     qu'elles ne sont pas réalisées : CRUD classique. */
  revenus:                   { view: ['admin','manager','comptable'], create: [],
                               edit: ['admin','manager','comptable'], delete: [] },
  /* Même périmètre de LECTURE que les autres tables financières : un rôle
     qui ne peut pas lire les dépenses ni les ajustements ne doit pas voir
     un prévisionnel calculé sur des données partielles. */
  previsions_financieres:    matrix(['admin','manager','comptable'],
                                    ['admin','manager','comptable'],
                                    ['admin','manager','comptable'],
                                    ['admin','manager','comptable']),
  transferts_comptes:        { view: ['admin','manager','comptable'], create: [], edit: [], delete: [] },
  bank_account_adjustments:  ro(['admin','manager','comptable']),
}

/* ═══════════════════════════════════════════════════════════════════
   MODULES AUTORISÉS PAR PERSONNE  (tenant_users.allowed_modules)

   ── La panne que ce bloc ferme ─────────────────────────────────────
   `allowed_modules` existait déjà et n'était lue QUE par le front
   (ALL_MODULES dans src/components/layout/Sidebar.tsx). La barre
   latérale cachait donc « Factures » à une commerciale pendant que
   l'API continuait de la servir. Mesuré avec un jeton de rôle
   commercial : GET /api/factures, /api/paiements et /api/contrats
   répondaient 200. Un menu absent n'est pas un contrôle d'accès — il
   suffit de taper l'URL, ou d'appeler l'API sans passer par l'écran.
   Ce bloc est la moitié serveur qui manquait ; rien n'est inventé, on
   applique le réglage que l'écran d'administration écrit déjà.

   ── Quatre règles, et pas une de plus ──────────────────────────────
   1. Le contrôle ne peut qu'ENLEVER un droit. TABLE_ACL tranche
      d'abord ; ici on retranche. Un module coché n'ouvre JAMAIS une
      table que le rôle n'ouvrait pas déjà.
   2. `allowed_modules` NULL = aucun réglage personnalisé = comportement
      d'avant, à l'octet près. C'est le cas de 56 des 58 appartenances
      de la base : ce lot ne devait rien changer pour elles.
   3. Le rôle `admin` n'est jamais restreint — c'est déjà la règle de la
      barre latérale (`if (userRole === 'admin') return true`). Un
      administrateur enfermé hors du module Équipe ne pourrait plus se
      rouvrir la porte : personne au-dessus de lui pour le faire.
   4. Une table dont le module est INCONNU d'ici reste régie par
      TABLE_ACL seul. On ne ferme pas une porte au hasard : mieux vaut
      une table oubliée dans la correspondance qu'un écran qui se vide
      sans que personne ne sache lequel des deux contrôles l'a fermé.
═══════════════════════════════════════════════════════════════════ */

/* Écrans qui affichent un NOM DE CLIENT et cesseraient de fonctionner
   si `clients` leur était fermée : un devis, une facture, un contrat,
   un paiement, un bon, un abonnement ou un projet nomment tous leur
   client. Fermer `clients` à quelqu'un qui a « Factures » ne
   protégerait rien — il voit déjà les montants — et lui laisserait un
   tableau de factures sans nom en face des sommes. */
const LECTEURS_DE_CLIENT = [
  'clients', 'prospects', 'devis', 'factures', 'contrats', 'paiements',
  'bons-commande', 'bons-livraison', 'abonnements-clients', 'projets', 'finances',
]

/* Même raisonnement pour le catalogue : l'éditeur de devis, de facture
   et de bon de commande y puise ses lignes. */
const LECTEURS_DE_PRODUIT = [
  'produits', 'produits-stock', 'services', 'devis', 'factures', 'bons-commande',
]

/**
 * Correspondance FERMÉE table → modules qui l'ouvrent.
 *
 * Les clés de module sont exactement celles d'ALL_MODULES
 * (src/components/layout/Sidebar.tsx) : c'est le même vocabulaire que
 * celui coché dans l'écran d'administration. Un intitulé inventé ici
 * serait un droit que personne ne peut accorder.
 *
 * PLUSIEURS modules par table, et non un seul : une table ouverte par
 * l'un ou l'autre reste ouverte (`some`). C'est ce qui évite de fermer
 * une table de référence à quelqu'un dont on n'a coché que l'écran qui
 * la consomme.
 *
 * Tables VOLONTAIREMENT absentes — elles ne portent aucun module et
 * restent régies par TABLE_ACL seul :
 *   · alerts             bandeau transverse, présent sur tout écran ;
 *   · personal_tasks     pense-bête personnel, propre à chacun ;
 *   · team_member_tasks  tâches de l'espace employé (/my-space) ;
 *   · prestation_models  bibliothèque partagée devis/produits, sans
 *                        écran de module qui lui corresponde seul.
 */
export const MODULES_DE_TABLE: Record<string, readonly string[]> = {
  /* ── CRM ─────────────────────────────────────────────────────── */
  prospects:            ['prospects'],
  /* La timeline suit sa fiche : elle s'ouvre et se ferme avec elle. */
  prospect_logs:        ['prospects'],
  clients:              LECTEURS_DE_CLIENT,

  /* ── Documents commerciaux ───────────────────────────────────── */
  devis:                ['devis'],
  factures:             ['factures'],
  contrats:             ['contrats'],
  bons_commande:        ['bons-commande'],
  bons_livraison:       ['bons-livraison'],

  /* ── Argent ──────────────────────────────────────────────────── */
  paiements:            ['paiements', 'finances'],
  depenses:             ['depenses', 'finances'],
  cheques_recus:        ['cheques-recus', 'finances'],
  cheques_emis:         ['cheques-emis', 'finances'],
  bank_accounts:            ['finances'],
  bank_account_adjustments: ['finances'],
  credits_dettes:           ['finances'],
  revenus:                  ['finances'],
  previsions_financieres:   ['finances'],
  transferts_comptes:       ['finances'],

  /* ── Catalogue & tiers ───────────────────────────────────────── */
  produits:             LECTEURS_DE_PRODUIT,
  fournisseurs:         ['fournisseurs', 'depenses'],
  contacts:             ['contacts'],
  domaines:             ['domaines'],
  hebergements:         ['hebergements'],

  /* ── Abonnements ─────────────────────────────────────────────── */
  abonnements:          ['abonnements'],
  client_subscriptions: ['abonnements-clients', 'abonnements'],

  /* ── Travail ─────────────────────────────────────────────────── */
  taches:               ['taches'],
  tache_actions:        ['taches'],
  calendrier_events:    ['calendrier'],
  projets:              ['projets'],
  projet_assignees:     ['projets'],
  projet_messages:      ['projets'],
  projet_templates:     ['projets'],

  /* ── Équipe ──────────────────────────────────────────────────── */
  team_members:         ['equipe'],
  stagiaires:           ['equipe'],
  employee_leaves:      ['equipe'],
  employee_payroll:     ['equipe'],

  /* ── Procédures & onboarding ─────────────────────────────────── */
  sops:                      ['sop'],
  sop_shares:                ['sop'],
  sop_training_progress:     ['sop'],
  guide_steps:               ['guides'],
  guide_templates:           ['guides'],
  guide_checklists:          ['guides'],
  guide_checklist_state:     ['guides'],
  guide_template_renders:    ['guides'],
  guide_discovery_questions: ['guides'],

  /* ── Divers ──────────────────────────────────────────────────── */
  automation_rules:     ['automatisations'],
  automation_logs:      ['automatisations'],
  /* `dashboard` en plus de `vision` : les widgets Vision sont rendus
     sur le tableau de bord (src/components/VisionWidgets.tsx). Sans cet
     alias, un compte qui a « Tableau de bord » sans « Ma Vision »
     verrait son accueil se remplir d'erreurs 403. */
  tenant_vision:        ['vision', 'dashboard'],
}

/* Même dispositif de cache que server/lib/effectiveRole.ts, et pour la
   même raison : la valeur est relue à CHAQUE requête du CRUD, qui est un
   chemin chaud. TTL courte — un module retiré prend effet en 30 s au
   pire, jamais à l'expiration du jeton (1 h). Le cache vit dans la
   mémoire du process : en multi-instance chacune a le sien, d'où,
   encore, la TTL courte. */
const MODULES_TTL_MS     = 30_000
const MODULES_MAX_ENTREES = 10_000

interface EntreeModules { modules: ReadonlySet<string> | null; exp: number }
const cacheModules = new Map<string, EntreeModules>()
const cleModules = (userId: string, tenantId: string) => `${userId}|${tenantId}`

/**
 * Modules cochés pour cette personne dans cet espace.
 *
 * `null` = aucun réglage personnalisé (colonne NULL) : le rôle décide
 * seul, exactement comme avant ce lot. Un TABLEAU VIDE, lui, est un
 * réglage — « aucun module » — et se distingue donc de `null`. C'est la
 * sémantique déjà retenue par le front, qui commente son propre champ
 * `allowedModules` par « null = use role default ; [] = empty access ».
 *
 * En cas d'ERREUR base, on renvoie `null` sans mettre en cache, donc on
 * ne restreint pas. Ce n'est pas un oubli de « fail-closed » : ce
 * contrôle-ci ne fait que RETRANCHER des droits, et TABLE_ACL tient
 * toujours la ligne au-dessus. Échouer en fermant reviendrait à couper
 * tout l'ERP — pour tout le monde, y compris les comptes sans réglage —
 * parce qu'une colonne manque après un déploiement dont la migration
 * n'est pas encore passée à la main. Le vrai fail-closed, celui du rôle,
 * a déjà eu lieu quelques lignes plus haut.
 */
export async function modulesAutorises(
  userId: string, tenantId: string,
): Promise<ReadonlySet<string> | null> {
  const cle = cleModules(userId, tenantId)
  const now = Date.now()
  const hit = cacheModules.get(cle)
  if (hit && hit.exp > now) return hit.modules

  let modules: ReadonlySet<string> | null = null
  try {
    const row = await queryOne<{ allowed_modules: string[] | null }>(
      `SELECT allowed_modules FROM tenant_users
        WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    )
    modules = Array.isArray(row?.allowed_modules) ? new Set(row!.allowed_modules) : null
  } catch (e: any) {
    logger.error('[rbac] lecture de allowed_modules impossible —', e?.message)
    return null
  }

  if (cacheModules.size >= MODULES_MAX_ENTREES) cacheModules.clear()
  cacheModules.set(cle, { modules, exp: now + MODULES_TTL_MS })
  return modules
}

/** À appeler dès qu'on modifie les modules de quelqu'un — le retrait
 *  devient alors immédiat au lieu d'attendre 30 s. */
export function invaliderModules(userId: string, tenantId?: string): void {
  if (tenantId) { cacheModules.delete(cleModules(userId, tenantId)); return }
  for (const k of cacheModules.keys()) {
    if (k.startsWith(`${userId}|`)) cacheModules.delete(k)
  }
}

/** Vide tout le cache (tests, ou changement massif de droits). */
export function resetModulesCache(): void {
  cacheModules.clear()
}

export const MODULES_CACHE_TTL_MS = MODULES_TTL_MS

/**
 * Cette table est-elle FERMÉE par le réglage de modules ?
 *
 * Vrai uniquement si : un réglage existe (tableau non nul) ET la table
 * porte un module connu ET aucun de ses modules n'est coché. Dans tous
 * les autres cas, faux — c'est-à-dire : on ne restreint pas.
 */
/* ═══════════════════════════════════════════════════════════════════
   LES MODULES FERMENT AUSSI LES ROUTES MÉTIER DÉDIÉES

   `tableRbac` ne protège que le CRUD générique, monté sur /api/:table.
   Or la moitié des données de l'application passe par des routeurs
   écrits à la main — /api/finance, /api/stock, /api/outbound,
   /api/vehicles, /api/time… Mesuré avant ce garde-fou, avec le jeton
   d'une commerciale restreinte au seul module « prospects » :

     /api/factures        403   (CRUD générique : bien fermé)
     /api/stock/alerts    200   ← ouvert
     /api/outbound/prospects 200 ← ouvert
     /api/vehicles        200   ← ouvert
     /api/time/entries    200   ← ouvert

   Cacher l'entrée dans la barre latérale ne ferme donc rien : l'API
   répondait toujours. Ce middleware applique la MÊME règle que
   `tableFermeeParModules`, mais sur le PREMIER SEGMENT de l'URL.

   ── Ce qui n'est volontairement PAS fermé ─────────────────────────
   Les préfixes absents de la table ci-dessous passent sans contrôle :
   authentification, messagerie interne, cloche de notifications,
   espace employé, préférences personnelles. Fermer par défaut aurait
   coupé la connexion elle-même. On ferme ce qu'on sait nommer.
   ═══════════════════════════════════════════════════════════════════ */
const MODULE_DE_PREFIXE: Record<string, string> = {
  finance:      'finances',
  stock:        'produits-stock',
  outbound:     'outbound',
  vehicles:     'vehicules',
  time:         '7aty',
  reports:      'rapports',
  activity:     'activite',
  security:     'centre-securite',
  team:         'equipe',
  commercials:  'commerciaux',
  'projet-chat': 'projets',
  'task-reminders': 'taches',
}

/**
 * Refuse une route métier dédiée dont le module n'est pas accordé.
 *
 * À monter sur /api AVANT les routeurs. Ne peut qu'ENLEVER un droit :
 * une personne sans réglage personnalisé (allowed_modules NULL) et un
 * administrateur passent toujours.
 */
export async function moduleRbac(req: Request, res: Response, next: NextFunction) {
  const user = req.user
  /* Pas de session, ou membre d'équipe (aucune ligne tenant_users) :
     ces publics sont gouvernés ailleurs, pas par les modules d'espace. */
  if (!user?.userId || !user?.tenantId || user.role === 'team_member') return next()
  if (user.role === 'admin') return next()

  /* `req.path` est AMPUTÉ du point de montage : sous
     app.use('/api/stock', …) il vaut '/alerts', pas '/stock/alerts'.
     On reconstitue donc le chemin complet avec `req.baseUrl`, sans quoi
     le préfixe qu'on cherche à reconnaître n'apparaît jamais et le
     contrôle laisse tout passer en silence. */
  const complet = `${req.baseUrl || ''}${req.path || ''}`
  const morceaux = complet.split('/').filter(Boolean)
  const segment = (morceaux[0] === 'api' ? morceaux[1] : morceaux[0]) ?? ''
  const module = MODULE_DE_PREFIXE[segment]
  if (!module) return next()

  try {
    const modules = await modulesAutorises(user.userId, user.tenantId)
    if (!modules) return next()          // aucun réglage personnalisé
    if (modules.has(module)) return next()
  } catch {
    /* Une panne de lecture ne doit pas fermer l'application à tout le
       monde : on laisse passer, le contrôle de rôle reste en place. */
    return next()
  }

  logger.warn(`[rbac] module refusé — ${segment} (module ${module}) pour ${user.userId}`)
  return res.status(403).json({ error: "Ce module n'est pas autorisé pour votre compte" })
}

export function tableFermeeParModules(
  table: string, modules: ReadonlySet<string> | null,
): boolean {
  if (!modules) return false
  const cles = MODULES_DE_TABLE[table]
  if (!cles) return false
  return !cles.some(m => modules.has(m))
}

export function canTableAction(role: Role, table: string, action: Action): boolean {
  const allowed = TABLE_ACL[table]?.[action]
  if (!allowed) return false
  return allowed.includes(role)
}

/* Express middleware — call AFTER requireAuth, on routes with :table param.
   Le rôle vient de la BASE (lib/effectiveRole), pas du JWT : une
   rétrogradation ou une révocation prend effet en moins de 30 s au lieu
   d'attendre l'expiration du token (1 h). */
export async function tableRbac(req: Request, res: Response, next: NextFunction) {
  const rawTable = req.params.table
  const table    = Array.isArray(rawTable) ? rawTable[0] : rawTable
  const action   = METHOD_TO_ACTION[req.method]
  const jwtRole  = (req.user?.role ?? '') as Role

  if (!table || !action || !req.user?.userId || !req.user?.tenantId) {
    return res.status(401).json({ error: 'Non authentifié' })
  }

  let role: Role | null
  try {
    role = await getEffectiveRole(req.user.userId, req.user.tenantId)
  } catch {
    /* Fail-closed : en cas de doute sur les droits, on refuse. */
    return res.status(403).json({ error: 'Permissions insuffisantes pour cette action' })
  }

  /* Plus d'appartenance active (accès révoqué, compte désactivé) : le
     token reste valide mais ne donne plus aucun droit. */
  if (!role) {
    markSecurityLogged(req)
    trackSecurityEvent({
      type: 'permission_denied',
      req,
      httpStatus: 403,
      reason: 'membership_revoked',
      metadata: { table, action, jwt_role: jwtRole },
    })
    return res.status(403).json({ error: 'Accès révoqué' })
  }

  if (!canTableAction(role, table, action)) {
    /* Refus de permission journalisé avec le contexte utile (table +
       action + rôle), et rien d'autre : ni corps de requête, ni token.
       MEDIUM/BLOCKED par défaut — c'est l'accumulation, pas l'occurrence
       isolée, qui déclenche une alerte (un utilisateur qui clique sur un
       module interdit produit ce refus tous les jours). */
    markSecurityLogged(req)
    trackSecurityEvent({
      type: 'permission_denied',
      req,
      httpStatus: 403,
      reason: `table_${action}_denied`,
      /* jwt_role differs from role → token émis avant une
         rétrogradation : c'est précisément le cas que ce contrôle
         rattrape. */
      metadata: { table, action, role, jwt_role: jwtRole },
    })
    return res.status(403).json({ error: 'Permissions insuffisantes pour cette action' })
  }

  /* ── Modules autorisés ────────────────────────────────────────────
     APRÈS TABLE_ACL, et seulement après : ce contrôle ne peut que
     retrancher un droit que le rôle vient d'accorder, jamais en
     accorder un. L'ordre compte aussi pour la trace — un refus de rôle
     garde son motif `table_<action>_denied`, un refus de module porte
     le sien, et on sait lequel des deux a fermé la porte.

     L'admin est exclu du contrôle : il est le seul à pouvoir modifier
     les modules des autres, donc le seul que personne ne pourrait
     déverrouiller s'il s'enfermait lui-même. C'est déjà la règle de la
     barre latérale, appliquée ici à l'identique. */
  if (role !== 'admin') {
    const modules = await modulesAutorises(req.user.userId, req.user.tenantId)
    if (tableFermeeParModules(table, modules)) {
      markSecurityLogged(req)
      trackSecurityEvent({
        type: 'permission_denied',
        req,
        httpStatus: 403,
        reason: 'module_not_allowed',
        /* `modules` n'est PAS journalisé en entier : c'est la liste des
           droits de la personne, elle n'a rien à faire dans un
           événement de sécurité consultable. Le nom de la table et le
           module attendu suffisent au diagnostic. */
        metadata: { table, action, role, module_requis: MODULES_DE_TABLE[table]?.join('|') ?? null },
      })
      return res.status(403).json({ error: "Ce module n'est pas autorisé pour votre compte" })
    }
  }

  next()
}
