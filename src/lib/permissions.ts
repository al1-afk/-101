export type Role = 'admin' | 'manager' | 'commercial' | 'comptable' | 'developpeur' | 'viewer'
export type Module =
  | 'clients' | 'prospects' | 'factures' | 'devis' | 'contrats'
  | 'paiements' | 'depenses' | 'finances' | 'equipe' | 'fournisseurs'
  | 'domaines' | 'hebergements' | 'produits' | 'statistiques'
  | 'automatisations' | 'parametres' | 'activite' | 'conseiller_ia'
export type Action = 'view' | 'create' | 'edit' | 'delete' | 'export'

type PermissionMap = Partial<Record<Module, Partial<Record<Action, boolean>>>>

const FULL: Partial<Record<Action, boolean>> = {
  view: true, create: true, edit: true, delete: true, export: true,
}
const READ_ONLY: Partial<Record<Action, boolean>> = { view: true, export: true }
const READ_WRITE: Partial<Record<Action, boolean>> = { view: true, create: true, edit: true, export: true }

export const ROLE_PERMISSIONS: Record<Role, PermissionMap> = {
  admin: {
    clients: FULL, prospects: FULL, factures: FULL, devis: FULL,
    contrats: FULL, paiements: FULL, depenses: FULL, finances: FULL,
    equipe: FULL, fournisseurs: FULL, domaines: FULL, hebergements: FULL,
    produits: FULL, statistiques: FULL, automatisations: FULL,
    parametres: FULL, activite: FULL, conseiller_ia: FULL,
  },
  manager: {
    clients: READ_WRITE, prospects: FULL, factures: READ_WRITE,
    devis: FULL, contrats: READ_WRITE, paiements: READ_ONLY,
    depenses: READ_ONLY, finances: READ_ONLY, equipe: READ_ONLY,
    fournisseurs: READ_WRITE, domaines: READ_WRITE, hebergements: READ_WRITE,
    produits: FULL, statistiques: READ_ONLY, automatisations: READ_WRITE,
    activite: READ_ONLY, conseiller_ia: { view: true },
    parametres: {},
  },
  commercial: {
    clients: READ_WRITE, prospects: FULL, factures: { view: true, create: true },
    devis: FULL, contrats: { view: true }, paiements: READ_ONLY,
    produits: READ_ONLY, statistiques: { view: true },
    conseiller_ia: { view: true },
  },
  comptable: {
    clients: READ_ONLY, prospects: READ_ONLY, factures: READ_WRITE,
    devis: READ_ONLY, contrats: READ_ONLY, paiements: FULL,
    depenses: FULL, finances: FULL, statistiques: READ_ONLY,
    activite: READ_ONLY,
  },
  /* Profil Production / Tech : il livre les projets, tient l'infrastructure
     (domaines, hébergements) et consulte les clients pour lesquels il
     travaille. Aucun accès à la finance, à la paie ni aux paramètres —
     ce n'est pas de la défiance, c'est le moindre privilège : ce qu'on
     ne peut pas atteindre ne peut pas être divulgué par erreur. */
  developpeur: {
    clients: { view: true },
    produits: READ_ONLY,
    domaines: READ_WRITE, hebergements: READ_WRITE,
    statistiques: { view: true },
  },
  viewer: {
    clients: READ_ONLY, prospects: READ_ONLY, factures: READ_ONLY,
    devis: READ_ONLY, statistiques: READ_ONLY,
  },
}

export const ROLE_LABELS: Record<Role, string> = {
  admin:      'Administrateur',
  manager:    'Manager',
  commercial: 'Commercial',
  comptable:  'Comptable',
  developpeur:'Développeur',
  viewer:     'Lecteur',
}

export const ROLE_COLORS: Record<Role, string> = {
  admin:      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  manager:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  commercial: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  comptable:  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  developpeur:'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  viewer:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export function can(role: Role, module: Module, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.[module]?.[action] ?? false
}

export function getRoleModules(role: Role): Module[] {
  return Object.entries(ROLE_PERMISSIONS[role])
    .filter(([, perms]) => perms?.view)
    .map(([mod]) => mod as Module)
}
