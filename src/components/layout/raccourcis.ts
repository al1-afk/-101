/**
 * LES QUATRE RACCOURCIS — définis une fois, affichés à deux endroits.
 *
 * La barre du bas du téléphone (BottomNav) et les raccourcis du bandeau
 * sur ordinateur (RaccourcisHeader) montrent la MÊME chose : les pages
 * qu'on ouvre le plus souvent. Recopier la liste dans les deux
 * composants, c'est se préparer à un jour où ils divergent — le
 * téléphone proposant une page que l'ordinateur ignore — sans que
 * personne ne l'ait décidé.
 *
 * La règle d'accès vit ici aussi, et pour la même raison : un compte
 * sans le module ne doit pas trouver ici un raccourci qu'on lui refuse
 * dans la barre latérale.
 */
import { DollarSign, FolderKanban, CreditCard, UserCheck } from 'lucide-react'

export interface Raccourci {
  label:  string
  href:   string
  icon:   React.ElementType
  /** Même clé que dans Sidebar.tsx. */
  module: string
}

export const RACCOURCIS_RAPIDES: Raccourci[] = [
  { label: 'Dépenses',  href: '/depenses',  icon: DollarSign,   module: 'depenses'  },
  { label: 'Projets',   href: '/projets',   icon: FolderKanban, module: 'projets'   },
  { label: 'Paiements', href: '/paiements', icon: CreditCard,   module: 'paiements' },
  { label: 'Prospects', href: '/prospects', icon: UserCheck,    module: 'prospects' },
]

/**
 * Mêmes règles que la barre latérale (Sidebar.filterItem) : un
 * administrateur voit tout ; un compte porteur d'une liste de modules
 * ne voit que les siens ; un compte sans liste (réglage jamais posé)
 * voit tout, comme avant l'existence du réglage.
 */
export function raccourcisVisibles(
  items: Raccourci[],
  role: string | null | undefined,
  allowedModules: string[] | null | undefined,
): Raccourci[] {
  return items.filter(item => {
    if (role === 'admin') return true
    if (Array.isArray(allowedModules)) return allowedModules.includes(item.module)
    return true
  })
}

/**
 * Première section du chemin, préfixe d'espace retiré.
 *
 * `/nextgital/projets/42` doit garder « Projets » en surbrillance :
 * comparer le chemin entier éteindrait le raccourci dès qu'on ouvre une
 * fiche, c'est-à-dire précisément quand on veut savoir où l'on est.
 */
export function sectionCourante(pathname: string, tenantSlug?: string): string {
  const sansEspace = tenantSlug ? pathname.replace(`/${tenantSlug}`, '') : pathname
  return '/' + (sansEspace.split('/').filter(Boolean)[0] || '')
}
