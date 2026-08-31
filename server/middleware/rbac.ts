import { Request, Response, NextFunction } from 'express'
import type { Role } from './auth'
import { trackSecurityEvent } from '../lib/securityEvents'
import { markSecurityLogged } from './securityMonitor'
import { getEffectiveRole } from '../lib/effectiveRole'

/* ─────────────────────────────────────────────────────────────────
   RBAC matrix for table CRUD routes.

   Mirrors the frontend `ROLE_PERMISSIONS` map in
   [src/lib/permissions.ts], but enforced server-side — the frontend
   map is a UX hint, this one is the security boundary.

   Key = table name (same as route :table param).
   Value = set of roles allowed to perform the HTTP method.
───────────────────────────────────────────────────────────────── */

type Action = 'view' | 'create' | 'edit' | 'delete'

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
const TABLE_ACL: Record<string, Record<Action, Role[]>> = {
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
  next()
}
