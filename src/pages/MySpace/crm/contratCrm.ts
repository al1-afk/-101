/**
 * Le contrat que les deux écrans du CRM commercial partagent.
 *
 * Pourquoi ce module de réexport plutôt qu'un import direct de
 * '@/lib/api' : les écrans de cet espace ont besoin d'un vocabulaire
 * légèrement plus large que le contrat serveur. La base porte sept
 * statuts de prospect ; le type publié par l'API n'en déclare que six
 * (« prospect » est un vestige encore présent sur des fiches réelles).
 * Passer par ce point unique permet d'élargir l'union à un seul endroit,
 * sans toucher au fichier d'API — qui appartient à la couche transport —
 * et sans disperser des `as` un peu partout dans les écrans.
 *
 * Tout ce qui est simplement relayé l'est à l'identique : ce fichier
 * n'ajoute aucune logique, il ne fait que nommer.
 */
export {
  myCrmApi,
} from '@/lib/api'

export type {
  CrmProspect,
  CrmProspectStatut,
  CrmProspectPriorite,
  CrmActivity,
  CrmActivityType,
  CrmClient,
  CrmDevis,
  MyCrmAbilities,
  MyCrmPermissions,
  MyCrmActivityType,
  MyCrmActivityInput,
  MyCrmProspectInput,
} from '@/lib/api'

/**
 * Sources proposées à la saisie quand l'espace n'en a encore aucune.
 *
 * Ce n'est PAS une liste fermée : `prospects.source` est du texte libre,
 * et les fiches existantes portent déjà « Instagram », « Facebook Ads »,
 * « Outbound Marketing »… Ces valeurs ne servent qu'à éviter la page
 * blanche au premier prospect créé depuis un téléphone, là où taper une
 * source à la main coûte cher.
 */
export const PROSPECT_SOURCES_FALLBACK = [
  'Recommandation',
  'Appel entrant',
  'Site web',
  'Instagram',
  'Facebook',
  'WhatsApp',
  'Prospection terrain',
  'Salon / événement',
  'Autre',
] as const
