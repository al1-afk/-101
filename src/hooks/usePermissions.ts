import { useMemo } from 'react'
import { useAuth } from './useAuth'
import { can, getRoleModules, type Role, type Module, type Action } from '@/lib/permissions'

export function usePermissions() {
  const { role: authRole } = useAuth()

  /* Repli sur `viewer`, JAMAIS sur `admin`.
     `authRole` est nul pendant tout l'intervalle où la session n'est pas
     encore résolue : au premier rendu, le temps que /api/auth/me réponde,
     après un rafraîchissement de page, et sur un jeton dont la charge utile
     ne porte pas de rôle. L'ancien défaut `admin` faisait donc apparaître —
     brièvement mais réellement — le menu, les boutons et les écrans d'un
     administrateur à n'importe quel commercial. Le serveur, lui, refusait
     bien ces appels : le défaut ouvert ne donnait pas les données, il donnait
     l'illusion des droits, ce qui suffit à faire fuiter la structure de
     l'application et à rendre l'interface incohérente une seconde plus tard.
     `viewer` est le rôle le moins doté : on n'affiche rien de plus que ce
     qu'on a la certitude d'avoir le droit d'afficher. */
  const role: Role = useMemo(() => (authRole ?? 'viewer') as Role, [authRole])

  return useMemo(() => ({
    role,
    can: (module: Module, action: Action) => can(role, module, action),
    modules: getRoleModules(role),
    isAdmin: role === 'admin',
    isManager: role === 'manager' || role === 'admin',
  }), [role])
}
