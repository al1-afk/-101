/**
 * Clés d'identité d'une personne assignée à un projet.
 *
 * projet_assignees stocke la cible dans DEUX colonnes exclusives —
 * team_member_id ou stagiaire_id (contrainte projet_assignees_target_ck,
 * migration 063). Côté UI on manipule une clé unique préfixée, seule façon
 * de mettre membres et stagiaires dans une même liste sans confondre deux
 * ids identiques venus de tables différentes.
 *
 * Hors du fichier du composant : react-refresh exige qu'un module de
 * composant n'exporte que des composants.
 */
import type { ProjetTaskAccess } from '@/hooks/useProjetAssignees'

export type AssigneeKey = `m:${string}` | `s:${string}`

export interface AssigneePick {
  key:         AssigneeKey
  task_access: ProjetTaskAccess
}

export const memberKey    = (id: string) => `m:${id}` as AssigneeKey
export const stagiaireKey = (id: string) => `s:${id}` as AssigneeKey

/** Traduit une clé en LA colonne à renseigner. Les deux colonnes étant
    exclusives en base, on n'envoie jamais l'autre, même à null. */
export function keyToColumn(key: AssigneeKey): { team_member_id: string } | { stagiaire_id: string } {
  const id = key.slice(2)
  return key.startsWith('m:') ? { team_member_id: id } : { stagiaire_id: id }
}

/** Clé d'une ligne projet_assignees existante, ou null si elle ne porte
    ni membre ni stagiaire (ligne aberrante — on la laisse tranquille). */
export function assigneeToKey(
  a: { team_member_id: string | null; stagiaire_id: string | null },
): AssigneeKey | null {
  return a.team_member_id ? memberKey(a.team_member_id)
       : a.stagiaire_id   ? stagiaireKey(a.stagiaire_id)
       : null
}
