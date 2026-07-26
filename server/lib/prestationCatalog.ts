/**
 * Catalogue serveur des modèles de prestations (miroir léger de
 * src/lib/prestationTemplates.ts).
 *
 * On ne duplique PAS le contenu riche (éléments, objectifs) : le frontend
 * reste la source de vérité et matérialise les prestations via
 * `buildPrestationFromTemplate`. Ici on garde seulement ce dont le backend
 * a besoin :
 *   - la liste des clés VALIDES (pour brider l'IA — elle ne peut choisir
 *     que des modèles réels),
 *   - un libellé par clé (pour construire le prompt + la grille tarifaire),
 *   - le mapping type de projet → modèles recommandés,
 *   - le mapping option → modèle à inclure.
 *
 * Toute clé renvoyée par l'IA hors de ce catalogue est ignorée côté backend.
 */

export interface CatalogEntry {
  key:   string
  titre: string
}

/* Les 20 clés officielles (identiques à PRESTATION_TEMPLATES). */
export const PRESTATION_CATALOG: CatalogEntry[] = [
  { key: 'website',            titre: 'Site web professionnel' },
  { key: 'ecommerce',          titre: 'Site e-commerce' },
  { key: 'product_catalog',    titre: 'Catalogue produits' },
  { key: 'payment_delivery',   titre: 'Paiement et livraison' },
  { key: 'social_media',       titre: 'Création des réseaux sociaux' },
  { key: 'digital_marketing',  titre: 'Marketing digital' },
  { key: 'seo',                titre: 'Référencement naturel SEO' },
  { key: 'google_business',    titre: 'Google Business Profile' },
  { key: 'hosting',            titre: 'Nom de domaine et hébergement' },
  { key: 'maintenance',        titre: 'Maintenance et support technique' },
  { key: 'dedicated_team',     titre: 'Équipe dédiée et accompagnement' },
  { key: 'training',           titre: "Formation de l'équipe" },
  { key: 'ai_assistant',       titre: 'Assistant IA intégré' },
  { key: 'mobile_application', titre: 'Application mobile Android et iOS' },
  { key: 'web_application',    titre: 'Application web sur mesure' },
  { key: 'crm',                titre: 'Plateforme CRM' },
  { key: 'erp',                titre: 'Plateforme ERP' },
  { key: 'branding',           titre: 'Identité visuelle' },
  { key: 'content_creation',   titre: 'Création de contenu' },
  { key: 'custom',             titre: 'Prestation personnalisée' },
]

export const VALID_TEMPLATE_KEYS: Set<string> = new Set(PRESTATION_CATALOG.map(c => c.key))

export function isValidTemplateKey(key: unknown): key is string {
  return typeof key === 'string' && VALID_TEMPLATE_KEYS.has(key)
}

export function titreForKey(key: string): string {
  return PRESTATION_CATALOG.find(c => c.key === key)?.titre ?? key
}

/* Types de projet exposés dans la modale (détection auto = 'auto'). */
export const PROJECT_TYPES = [
  'auto', 'website', 'ecommerce', 'booking', 'webapp',
  'mobileapp', 'crm', 'erp', 'marketing', 'seo', 'other',
] as const
export type ProjectType = typeof PROJECT_TYPES[number]

/* Type de projet → modèles de base recommandés (ordre = ordre du devis).
   Aligné sur DEVIS_TEMPLATE_PRESETS quand un preset équivalent existe. */
export const PROJECT_TYPE_KEYS: Record<string, string[]> = {
  website:   ['website', 'content_creation', 'seo', 'google_business', 'hosting', 'training', 'maintenance'],
  ecommerce: ['ecommerce', 'product_catalog', 'payment_delivery', 'social_media', 'seo', 'hosting', 'dedicated_team', 'training', 'maintenance'],
  booking:   ['website', 'content_creation', 'hosting', 'training', 'maintenance'],
  webapp:    ['web_application', 'hosting', 'training', 'maintenance'],
  mobileapp: ['mobile_application', 'web_application', 'hosting', 'training', 'maintenance'],
  crm:       ['crm', 'hosting', 'training', 'maintenance'],
  erp:       ['erp', 'hosting', 'training', 'maintenance'],
  marketing: ['digital_marketing', 'social_media', 'content_creation', 'seo'],
  seo:       ['seo', 'google_business', 'content_creation'],
  other:     ['website', 'hosting', 'training', 'maintenance'],
}

/* Option cochée dans la modale → modèle à garantir dans le devis. */
export const OPTION_KEYS: Record<string, string> = {
  includeHosting:     'hosting',
  includeMaintenance: 'maintenance',
  includeTraining:    'training',
  includeSocial:      'social_media',
  includeSeo:         'seo',
  includeAiAssistant: 'ai_assistant',
}

/**
 * Construit la liste ordonnée et dédupliquée des clés de modèles pour un
 * devis, à partir : du type de projet, des options cochées, et des clés
 * suggérées par l'IA (uniquement celles du catalogue).
 *
 * L'IA peut réordonner / retirer, mais ne peut jamais introduire une clé
 * inexistante : c'est la garantie « pas de prestation inventée ».
 */
export function resolveTemplateKeys(input: {
  projectType?: string
  options?: Record<string, boolean>
  aiSuggestedKeys?: unknown[]
}): string[] {
  const { projectType = 'auto', options = {}, aiSuggestedKeys = [] } = input

  const aiKeys = (Array.isArray(aiSuggestedKeys) ? aiSuggestedKeys : [])
    .filter(isValidTemplateKey)

  // Base : suggestions IA valides si présentes, sinon le preset du type.
  const base = aiKeys.length > 0
    ? aiKeys
    : (PROJECT_TYPE_KEYS[projectType] ?? PROJECT_TYPE_KEYS.other)

  const ordered: string[] = [...base]

  // Garantit les modèles demandés par les options (ajoutés à la fin s'ils
  // ne sont pas déjà présents).
  for (const [opt, key] of Object.entries(OPTION_KEYS)) {
    if (options[opt] && !ordered.includes(key)) ordered.push(key)
  }

  // Dédup en conservant l'ordre.
  return [...new Set(ordered)]
}
