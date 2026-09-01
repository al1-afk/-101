/**
 * « Qui a ajouté / qui a modifié » une SOP.
 *
 * Règle produit : on affiche UNIQUEMENT le nom de la personne — pas son
 * email, pas son rôle, pas son avatar. L'objectif est de savoir qui a
 * fait la modification, rien de plus.
 *
 * Les noms viennent de sops.created_by_name / updated_by_name, estampillés
 * par le serveur (migration 094). Ils sont absents sur les SOPs seedées
 * par migration : dans ce cas on ne montre rien plutôt qu'un « — ».
 */
import { UserPlus, PencilLine } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  createdBy?: string | null
  updatedBy?: string | null
  /** Compact : une seule ligne, pour les cartes de liste. */
  compact?:   boolean
  className?: string
}

export function SopAuthorship({ createdBy, updatedBy, compact, className }: Props) {
  const added   = createdBy?.trim() || null
  const edited  = updatedBy?.trim() || null
  /* Tant que personne n'a modifié après la création, « modifié par » et
     « ajouté par » désignent la même personne : on n'affiche pas deux
     fois le même nom. */
  const showEdited = edited && edited !== added

  if (!added && !edited) return null

  if (compact) {
    const label = showEdited ? edited : added
    const Icon  = showEdited ? PencilLine : UserPlus
    return (
      <span className={cn('inline-flex items-center gap-1 min-w-0', className)} title={showEdited ? `Modifié par ${label}` : `Ajouté par ${label}`}>
        <Icon className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {added && (
        <span className="inline-flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          Ajouté par <strong className="font-semibold text-slate-700 dark:text-slate-200">{added}</strong>
        </span>
      )}
      {showEdited && (
        <span className="inline-flex items-center gap-1.5">
          <PencilLine className="w-3.5 h-3.5" />
          Modifié par <strong className="font-semibold text-slate-700 dark:text-slate-200">{edited}</strong>
        </span>
      )}
    </div>
  )
}

export default SopAuthorship
