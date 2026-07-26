import { Request, Response, NextFunction } from 'express'
import type { Role } from './auth'

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
  clients:              matrix(ALL,                             ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  prospects:            matrix(ALL,                             ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  /* Journal d'activité prospect (notes, appels, emails, changements de statut) —
     création ouverte à qui travaille les prospects ; édition/suppression admin/manager. */
  prospect_logs:        matrix(ALL,                             ['admin','manager','commercial'], ['admin','manager'],              ['admin','manager']),
  devis:                matrix(ALL,                             ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  factures:             matrix(ALL,                             ['admin','manager','commercial','comptable'], ['admin','manager','comptable'], ['admin','manager','comptable']),
  paiements:            matrix(ALL,                             ['admin','manager','comptable'],              ['admin','manager','comptable'], ['admin','comptable']),
  depenses:             matrix(['admin','manager','comptable'], ['admin','comptable'],                        ['admin','comptable'],            ['admin','comptable']),
  contrats:             matrix(ALL,                             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  produits:             matrix(ALL,                             ['admin','manager','commercial'],             ['admin','manager','commercial'], ['admin','manager']),
  fournisseurs:         matrix(['admin','manager','comptable'], ['admin','manager'],                          ['admin','manager'],              ['admin']),
  contacts:             matrix(ALL,                             ['admin','manager','commercial'],             ['admin','manager','commercial'], ['admin','manager']),
  team_members:         matrix(['admin','manager','comptable'], ['admin'],                                    ['admin'],                        ['admin']),
  domaines:             matrix(ALL,                             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  hebergements:         matrix(ALL,                             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  cheques_recus:        matrix(['admin','manager','comptable'], ['admin','manager','comptable'],              ['admin','comptable'],            ['admin','comptable']),
  cheques_emis:         matrix(['admin','manager','comptable'], ['admin','manager','comptable'],              ['admin','comptable'],            ['admin','comptable']),
  abonnements:          matrix(ALL,                             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  client_subscriptions: matrix(ALL,                             ['admin','manager','commercial'],             ['admin','manager','commercial'], ['admin','manager']),
  taches:               rw(ALL),
  automation_rules:     matrix(['admin','manager'],             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  automation_logs:      ro(['admin','manager']),
  alerts:               { view: ALL, create: ['admin','manager'], edit: ALL, delete: ALL },
  calendrier_events:    rw(ALL),
  bank_accounts:        matrix(['admin','manager','comptable'], ['admin'],                                    ['admin','comptable'],            ['admin']),
  credits_dettes:       matrix(['admin','manager','comptable'], ['admin','manager','comptable'],              ['admin','manager','comptable'], ['admin','comptable']),
  bons_commande:        matrix(['admin','manager','commercial','comptable'], ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  conges:               matrix(['admin','manager'],             ['admin','manager'],                          ['admin','manager'],              ['admin']),
  salaires_paiements:   matrix(['admin','comptable'],           ['admin','comptable'],                        ['admin','comptable'],            ['admin']),
  tache_actions:        rw(ALL),
  personal_tasks:       rw(ALL),
  /* Module Guides — playbook lecture pour tous, écriture admin/manager.
     guide_checklist_state et guide_template_renders : chaque user gère
     son propre état → CRUD pour tous (RLS + tenant_id assurent l'isolation). */
  guide_steps:               matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin']),
  guide_templates:           matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin']),
  guide_checklists:          matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin']),
  guide_checklist_state:     rw(ALL),
  guide_template_renders:    rw(ALL),
  guide_discovery_questions: matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin']),
  /* Vision (Primary Aim) — lecture pour tous (widgets Dashboard),
     écriture admin seulement (page /vision protège déjà l'UI) */
  tenant_vision:             matrix(ALL,                  ['admin'],           ['admin'],           ['admin']),
  /* SOPs — lecture pour tous, création/édition admin+manager,
     suppression admin uniquement */
  sops:                      matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin']),
  /* Partages SOP — lecture pour tous, partage/édition admin+manager,
     suppression admin+manager (le propriétaire peut révoquer) */
  sop_shares:                matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin','manager']),
  /* Progression formation SOP — CRUD ouvert à tous (RLS + tenant_id
     assurent l'isolation, et chaque user gère sa propre progression) */
  sop_training_progress:     rw(ALL),
  /* Stagiaires — lecture pour tous, création/édition admin+manager,
     suppression admin uniquement */
  stagiaires:                matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin']),
  /* Projets — lecture pour tous, création/édition admin+manager+commercial,
     suppression admin+manager */
  projets:                   matrix(ALL,                  ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  /* Projet assignees — qui peut assigner des membres aux projets */
  projet_assignees:          matrix(ALL,                  ['admin','manager'],              ['admin','manager'],              ['admin','manager']),
  /* Templates de projet personnalisés — lecture pour tous, édition admin/manager */
  projet_templates:          matrix(ALL,                  ['admin','manager'],              ['admin','manager'],              ['admin','manager']),
  /* Messages projet — chat équipe : tous peuvent lire/écrire, admin/manager peut supprimer */
  projet_messages:           matrix(ALL,                  ALL,                              ALL,                              ['admin','manager']),
  /* Tâches assignées aux membres — chacun peut voir + modifier ses tâches,
     admin/manager peuvent tout faire */
  team_member_tasks:         rw(ALL),
  /* Bons de livraison — handover projet (contient mots de passe → accès restreint) */
  bons_livraison:            matrix(['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager','commercial'], ['admin','manager']),
  /* Modèles de prestations (bibliothèque devis) — lecture pour tous
     (utilisée dans l'éditeur de devis), gestion admin/manager */
  prestation_models:         matrix(ALL,                  ['admin','manager'], ['admin','manager'], ['admin','manager']),
}

export function canTableAction(role: Role, table: string, action: Action): boolean {
  const allowed = TABLE_ACL[table]?.[action]
  if (!allowed) return false
  return allowed.includes(role)
}

/* Express middleware — call AFTER requireAuth, on routes with :table param */
export function tableRbac(req: Request, res: Response, next: NextFunction) {
  const rawTable = req.params.table
  const table    = Array.isArray(rawTable) ? rawTable[0] : rawTable
  const action   = METHOD_TO_ACTION[req.method]
  const role     = (req.user?.role ?? '') as Role

  if (!table || !action || !role) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  if (!canTableAction(role, table, action)) {
    return res.status(403).json({ error: 'Permissions insuffisantes pour cette action' })
  }
  next()
}
