/**
 * Bibliothèque de modèles de prestations pour les devis.
 *
 * Les modèles définis ici produisent de véritables `Prestation` (même structure
 * que celles saisies à la main : titre + blocs de description + quantité + prix).
 * Ils sont donc sauvegardés, affichés, imprimés et exportés en PDF exactement
 * comme les prestations existantes — aucun système parallèle.
 *
 * Un modèle est converti en `Prestation` via `buildPrestationFromTemplate`, qui
 * remplace les variables dynamiques ([NOM_ENTREPRISE], [VILLE]…) par les données
 * du devis quand elles existent, et conserve la variable sinon.
 */
import type { Prestation, DescriptionBlock } from '@/pages/Devis'

export type PrestationCategory =
  | 'Sites web'
  | 'E-commerce'
  | 'Applications'
  | 'CRM et ERP'
  | 'Intelligence artificielle'
  | 'Marketing digital'
  | 'Réseaux sociaux'
  | 'Référencement SEO'
  | 'Hébergement et sécurité'
  | 'Maintenance'
  | 'Formation et accompagnement'
  | 'Identité visuelle'
  | 'Prestations personnalisées'

export const PRESTATION_CATEGORIES: PrestationCategory[] = [
  'Sites web',
  'E-commerce',
  'Applications',
  'CRM et ERP',
  'Intelligence artificielle',
  'Marketing digital',
  'Réseaux sociaux',
  'Référencement SEO',
  'Hébergement et sécurité',
  'Maintenance',
  'Formation et accompagnement',
  'Identité visuelle',
  'Prestations personnalisées',
]

export interface PrestationTemplate {
  key:         string            // identifiant stable du modèle
  type:        string            // type technique (website, ecommerce…)
  category:    PrestationCategory
  titre:       string
  description: string            // phrase d'introduction
  elements:    string[]          // liste à puces
  objectif:    string
  prixDefaut:  number            // 0 = à remplir
  tvaDefaut:   number
  unite:       string
  unique:      boolean           // true = un seul exemplaire par devis
}

/* ─── Variables dynamiques ─────────────────────────────────────────── */
export const TEMPLATE_VARIABLES = [
  '[NOM_ENTREPRISE]',
  '[NOMBRE_PRODUITS]',
  '[VILLE]',
  '[SECTEUR_ACTIVITE]',
  '[DUREE_SUPPORT]',
  '[DELAI_REALISATION]',
  '[NOMBRE_PAGES]',
  '[NOMBRE_LANGUES]',
  '[NOMBRE_UTILISATEURS]',
] as const

export type TemplateVars = Partial<Record<string, string>>

/** Remplace les variables connues ; conserve les variables inconnues telles quelles. */
export function substituteVariables(text: string, vars: TemplateVars): string {
  return text.replace(/\[[A-Z0-9_]+\]/g, (m) => {
    const v = vars[m]
    return v != null && String(v).trim() !== '' ? String(v) : m
  })
}

/* ─── Les 20 modèles ───────────────────────────────────────────────── */
export const PRESTATION_TEMPLATES: PrestationTemplate[] = [
  {
    key: 'website', type: 'website', category: 'Sites web',
    titre: 'Site web professionnel',
    description: 'Création d’un site web moderne, rapide et adapté à l’identité et aux objectifs de l’entreprise.',
    elements: [
      'Conception d’une interface professionnelle',
      'Design personnalisé selon l’identité de l’entreprise',
      'Création des pages principales',
      'Version adaptée aux mobiles, tablettes et ordinateurs',
      'Formulaire de contact',
      'Intégration de WhatsApp',
      'Intégration des réseaux sociaux',
      'Optimisation de la vitesse',
      'Installation du certificat SSL',
      'Mise en ligne du site',
    ],
    objectif: 'Présenter l’entreprise de manière professionnelle et faciliter la prise de contact avec les clients.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'ecommerce', type: 'ecommerce', category: 'E-commerce',
    titre: 'Site e-commerce',
    description: 'Création d’une boutique en ligne complète permettant de présenter les produits et de recevoir des commandes.',
    elements: [
      'Design personnalisé de la boutique',
      'Création des catégories et sous-catégories',
      'Recherche et filtres produits',
      'Panier et validation des commandes',
      'Création des comptes clients',
      'Suivi des commandes',
      'Configuration des moyens de paiement',
      'Configuration des zones de livraison',
      'Version mobile et tablette',
      'Intégration de Google Analytics',
    ],
    objectif: 'Permettre à l’entreprise de vendre ses produits en ligne et de centraliser les commandes.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'product_catalog', type: 'product_catalog', category: 'E-commerce',
    titre: 'Catalogue — [NOMBRE_PRODUITS] produits',
    description: 'Organisation et intégration du catalogue des produits fourni par le client.',
    elements: [
      'Création de l’arborescence du catalogue',
      'Organisation des catégories et sous-catégories',
      'Intégration de [NOMBRE_PRODUITS] produits',
      'Ajout des références, noms et prix',
      'Ajout des photos et descriptions',
      'Configuration des marques et attributs',
      'Contrôle des doublons',
      'Vérification des informations',
      'Mise en ligne du catalogue',
    ],
    objectif: 'Présenter les produits dans un catalogue structuré et faciliter leur recherche par les clients.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'payment_delivery', type: 'payment_delivery', category: 'E-commerce',
    titre: 'Paiement et livraison',
    description: 'Configuration des moyens de paiement et des règles de livraison de la boutique.',
    elements: [
      'Paiement à la livraison',
      'Paiement par virement bancaire',
      'Possibilité de paiement par carte bancaire',
      'Configuration des zones de livraison',
      'Définition des frais par ville ou région',
      'Livraison gratuite selon un montant minimum',
      'Retrait en magasin si nécessaire',
      'Suivi du statut des commandes',
    ],
    objectif: 'Simplifier le processus de commande, de paiement et de livraison.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'social_media', type: 'social_media', category: 'Réseaux sociaux',
    titre: 'Création des réseaux sociaux',
    description: 'Création et configuration des comptes professionnels de l’entreprise sur les réseaux sociaux.',
    elements: [
      'Création ou optimisation de la page Facebook',
      'Configuration de Meta Business Manager',
      'Création du compte Instagram Business',
      'Création du compte TikTok Business',
      'Création des visuels de profil et de couverture',
      'Ajout des coordonnées de l’entreprise',
      'Liaison des comptes avec le site',
      'Configuration des outils de suivi disponibles',
    ],
    objectif: 'Construire une présence professionnelle et cohérente sur les réseaux sociaux.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'digital_marketing', type: 'digital_marketing', category: 'Marketing digital',
    titre: 'Marketing digital',
    description: 'Préparation et mise en place des outils nécessaires au développement de la visibilité et à l’acquisition de nouveaux clients.',
    elements: [
      'Analyse de la cible',
      'Définition des objectifs marketing',
      'Préparation des audiences publicitaires',
      'Installation des outils de suivi',
      'Configuration de Meta Pixel',
      'Création des campagnes publicitaires',
      'Suivi des résultats',
      'Rapport des performances',
      'Recommandations d’optimisation',
    ],
    objectif: 'Générer des prospects qualifiés et développer les ventes de l’entreprise.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'seo', type: 'seo', category: 'Référencement SEO',
    titre: 'Référencement naturel SEO',
    description: 'Optimisation du site afin d’améliorer sa visibilité dans les résultats des moteurs de recherche.',
    elements: [
      'Recherche des mots-clés',
      'Optimisation des titres et descriptions',
      'Optimisation des pages principales',
      'Structure des liens internes',
      'Optimisation des images',
      'Création du sitemap',
      'Configuration de Google Search Console',
      'Configuration de Google Analytics',
      'Optimisation du référencement local',
    ],
    objectif: 'Améliorer progressivement la visibilité du site sur Google.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'google_business', type: 'google_business', category: 'Référencement SEO',
    titre: 'Google Business Profile',
    description: 'Création ou optimisation de la fiche professionnelle de l’entreprise sur Google.',
    elements: [
      'Création ou récupération de la fiche',
      'Mise à jour des informations',
      'Ajout des services',
      'Ajout des photos et du logo',
      'Optimisation de la description',
      'Configuration des horaires',
      'Ajout du site et des coordonnées',
      'Optimisation du référencement local',
      'Accompagnement pour la validation',
    ],
    objectif: 'Améliorer la visibilité locale de l’entreprise sur Google et Google Maps.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: true,
  },
  {
    key: 'hosting', type: 'hosting', category: 'Hébergement et sécurité',
    titre: 'Nom de domaine et hébergement — 1 an',
    description: 'Mise en place de l’infrastructure nécessaire au fonctionnement du site.',
    elements: [
      'Nom de domaine .ma ou .com',
      'Hébergement professionnel',
      'Certificat SSL',
      'Configuration des adresses e-mail',
      'Sauvegardes automatiques',
      'Protection de sécurité',
      'Configuration technique du serveur',
      'Mise en ligne du projet',
    ],
    objectif: 'Garantir un hébergement sécurisé, stable et performant.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'an', unique: true,
  },
  {
    key: 'maintenance', type: 'maintenance', category: 'Maintenance',
    titre: 'Maintenance et support technique',
    description: 'Suivi technique du projet après sa mise en ligne.',
    elements: [
      'Mises à jour de sécurité',
      'Sauvegardes automatiques',
      'Surveillance du fonctionnement',
      'Correction des anomalies techniques',
      'Assistance par téléphone et WhatsApp',
      'Restauration en cas de problème',
      'Support prioritaire',
      'Rapport des interventions si nécessaire',
    ],
    objectif: 'Assurer la stabilité, la sécurité et la continuité du fonctionnement du projet.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'an', unique: true,
  },
  {
    key: 'dedicated_team', type: 'dedicated_team', category: 'Formation et accompagnement',
    titre: 'Équipe dédiée et accompagnement',
    description: 'Mise à disposition d’une équipe chargée de suivre le projet depuis son lancement jusqu’à sa mise en ligne.',
    elements: [
      'Chef de projet dédié',
      'Interlocuteur unique',
      'Suivi par téléphone et WhatsApp',
      'Présentation des maquettes',
      'Validation des étapes',
      'Coordination des intervenants',
      'Assistance après la livraison',
      'Accompagnement de l’équipe du client',
    ],
    objectif: 'Garantir un suivi clair et une communication continue pendant la réalisation du projet.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: true,
  },
  {
    key: 'training', type: 'training', category: 'Formation et accompagnement',
    titre: 'Formation de l’équipe',
    description: 'Formation des responsables du client à l’utilisation et à la gestion de la solution.',
    elements: [
      'Formation à la gestion du site',
      'Formation à la gestion des commandes',
      'Formation à l’ajout des produits',
      'Formation à la modification des prix',
      'Formation à la gestion du stock',
      'Formation à la consultation des statistiques',
      'Guide d’utilisation',
      'Assistance après la formation',
    ],
    objectif: 'Permettre à l’équipe du client d’utiliser la solution de manière autonome.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'session', unique: true,
  },
  {
    key: 'ai_assistant', type: 'ai_assistant', category: 'Intelligence artificielle',
    titre: 'Assistant IA intégré',
    description: 'Intégration d’un assistant intelligent permettant d’accueillir les visiteurs et de convertir davantage de prospects.',
    elements: [
      'Réponses automatiques aux questions 24 h/24',
      'Présentation et recommandation des produits ou services',
      'Collecte du nom, du téléphone et du besoin',
      'Transmission des demandes à l’équipe via WhatsApp',
      'Fonctionnement en français et en arabe',
      'Formation de l’équipe incluse',
    ],
    objectif: 'Améliorer le service client et convertir davantage de visiteurs en prospects.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: true,
  },
  {
    key: 'mobile_application', type: 'mobile_application', category: 'Applications',
    titre: 'Application mobile Android et iOS',
    description: 'Conception et développement d’une application mobile adaptée aux besoins de l’entreprise.',
    elements: [
      'Analyse des besoins',
      'Conception des interfaces',
      'Développement Android',
      'Développement iOS',
      'Connexion avec l’API',
      'Gestion des comptes utilisateurs',
      'Notifications push',
      'Tests sur différents appareils',
      'Publication selon les conditions prévues',
    ],
    objectif: 'Permettre aux utilisateurs d’accéder aux services de l’entreprise depuis leur téléphone.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'web_application', type: 'web_application', category: 'Applications',
    titre: 'Application web sur mesure',
    description: 'Développement d’une application web adaptée aux processus internes de l’entreprise.',
    elements: [
      'Analyse des processus',
      'Conception de l’architecture',
      'Création des interfaces',
      'Développement du tableau de bord',
      'Gestion des utilisateurs',
      'Gestion des rôles et permissions',
      'Base de données sécurisée',
      'Rapports et statistiques',
      'Déploiement sur serveur',
    ],
    objectif: 'Digitaliser les opérations de l’entreprise et centraliser les informations.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'crm', type: 'crm', category: 'CRM et ERP',
    titre: 'Plateforme CRM',
    description: 'Création d’une plateforme centralisée pour gérer les prospects, les clients et les opportunités commerciales.',
    elements: [
      'Gestion des prospects',
      'Gestion des clients',
      'Historique des échanges',
      'Pipeline commercial',
      'Attribution des prospects',
      'Suivi des tâches',
      'Rappels automatiques',
      'Rapports commerciaux',
      'Gestion des rôles et permissions',
    ],
    objectif: 'Améliorer le suivi commercial et augmenter le taux de conversion des prospects.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'erp', type: 'erp', category: 'CRM et ERP',
    titre: 'Plateforme ERP',
    description: 'Développement d’une plateforme de gestion centralisée adaptée aux opérations de l’entreprise.',
    elements: [
      'Gestion des employés',
      'Gestion des clients',
      'Gestion des fournisseurs',
      'Gestion des stocks',
      'Gestion des ventes',
      'Gestion des achats',
      'Facturation',
      'Trésorerie',
      'Rapports et tableaux de bord',
      'Gestion des rôles et permissions',
    ],
    objectif: 'Centraliser les processus de l’entreprise dans un seul système sécurisé.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'branding', type: 'branding', category: 'Identité visuelle',
    titre: 'Identité visuelle',
    description: 'Création d’une identité graphique professionnelle et cohérente pour l’entreprise.',
    elements: [
      'Création du logo',
      'Définition de la palette de couleurs',
      'Sélection des typographies',
      'Création de la charte graphique',
      'Déclinaisons du logo',
      'Visuels pour les réseaux sociaux',
      'Carte de visite',
      'Livraison des fichiers sources prévus',
    ],
    objectif: 'Construire une image de marque professionnelle et reconnaissable.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'content_creation', type: 'content_creation', category: 'Prestations personnalisées',
    titre: 'Création de contenu',
    description: 'Préparation des textes et des éléments visuels nécessaires à la présentation de l’entreprise.',
    elements: [
      'Rédaction des textes du site',
      'Présentation des services',
      'Rédaction des appels à l’action',
      'Optimisation des textes',
      'Préparation des contenus SEO',
      'Sélection des images',
      'Adaptation du contenu aux différents supports',
    ],
    objectif: 'Présenter clairement l’entreprise, ses services et ses avantages.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
  {
    key: 'custom', type: 'custom', category: 'Prestations personnalisées',
    titre: 'Nouvelle prestation',
    description: 'Description de la prestation personnalisée.',
    elements: [
      'Élément à modifier',
      'Élément à modifier',
      'Élément à modifier',
    ],
    objectif: 'Objectif à définir.',
    prixDefaut: 0, tvaDefaut: 20, unite: 'projet', unique: false,
  },
]

/* ─── Modèles complets de devis ────────────────────────────────────── */
export interface DevisTemplatePreset {
  key:       string
  label:     string
  desc:      string
  modelKeys: string[]
}

export const DEVIS_TEMPLATE_PRESETS: DevisTemplatePreset[] = [
  {
    key: 'vitrine', label: 'Site vitrine',
    desc: 'Site professionnel + contenu, SEO, Google, hébergement, formation et maintenance.',
    modelKeys: ['website', 'content_creation', 'seo', 'google_business', 'hosting', 'training', 'maintenance'],
  },
  {
    key: 'ecommerce', label: 'E-commerce',
    desc: 'Boutique complète : catalogue, paiement, réseaux, SEO, hébergement, équipe, formation, IA.',
    modelKeys: ['ecommerce', 'product_catalog', 'payment_delivery', 'social_media', 'seo', 'hosting', 'dedicated_team', 'training', 'maintenance', 'ai_assistant'],
  },
  {
    key: 'mobile', label: 'Application mobile',
    desc: 'App Android/iOS + back-office web, API, hébergement, formation et maintenance.',
    modelKeys: ['mobile_application', 'web_application', 'hosting', 'training', 'maintenance'],
  },
  {
    key: 'crm', label: 'CRM',
    desc: 'Plateforme CRM + hébergement, formation et maintenance.',
    modelKeys: ['crm', 'hosting', 'training', 'maintenance'],
  },
  {
    key: 'erp', label: 'ERP',
    desc: 'Plateforme ERP + hébergement, formation et maintenance.',
    modelKeys: ['erp', 'hosting', 'training', 'maintenance'],
  },
  {
    key: 'marketing', label: 'Marketing digital',
    desc: 'Marketing digital + réseaux sociaux, contenu et SEO.',
    modelKeys: ['digital_marketing', 'social_media', 'content_creation', 'seo'],
  },
]

/* ─── Conversion modèle → Prestation ───────────────────────────────── */
let _seq = 0
function uid(): string {
  _seq += 1
  // pas de Date.now() partagé ici : suffixe séquentiel pour garantir l'unicité
  // même si plusieurs modèles sont insérés dans la même milliseconde.
  return `tpl-${Date.now()}-${_seq}`
}

/** Construit une `Prestation` complète à partir d'un modèle, variables remplacées. */
export function buildPrestationFromTemplate(tpl: PrestationTemplate, vars: TemplateVars = {}): Prestation {
  const sub = (s: string) => substituteVariables(s, vars)
  const description: DescriptionBlock[] = []
  if (tpl.description.trim()) {
    description.push({ id: uid(), type: 'paragraph', content: sub(tpl.description) })
  }
  if (tpl.elements.length) {
    description.push({ id: uid(), type: 'list', content: tpl.elements.map(sub).join('\n') })
  }
  if (tpl.objectif.trim()) {
    description.push({ id: uid(), type: 'paragraph', content: `<strong>Objectif :</strong> ${sub(tpl.objectif)}` })
  }
  return {
    id:            uid(),
    titre:         sub(tpl.titre),
    description,
    quantite:      1,
    prix_unitaire: tpl.prixDefaut,
    showQuantite:  true,
    showPrixUnit:  true,
  }
}

export function getTemplateByKey(key: string): PrestationTemplate | undefined {
  return PRESTATION_TEMPLATES.find(t => t.key === key)
}

/* ─── Modèles stockés en base (table prestation_models) ────────────── */
export interface PrestationModel {
  id:          string
  tenant_id?:  string
  source_key:  string | null
  titre:       string
  type:        string
  category:    string
  description: string
  elements:    string[]
  objectif:    string
  prix_defaut: number
  tva_defaut:  number
  unite:       string
  is_unique:   boolean
  actif:       boolean
  position:    number
  created_at?: string
  updated_at?: string
}

/** Ligne DB → modèle utilisable par la bibliothèque (clé = id de la ligne). */
export function dbModelToTemplate(m: PrestationModel): PrestationTemplate {
  return {
    key: m.id,
    type: m.type || 'custom',
    category: (PRESTATION_CATEGORIES.includes(m.category as PrestationCategory)
      ? m.category
      : 'Prestations personnalisées') as PrestationCategory,
    titre: m.titre,
    description: m.description ?? '',
    elements: Array.isArray(m.elements) ? m.elements : [],
    objectif: m.objectif ?? '',
    prixDefaut: Number(m.prix_defaut) || 0,
    tvaDefaut: Number(m.tva_defaut) || 20,
    unite: m.unite || 'projet',
    unique: !!m.is_unique,
  }
}

/** Charge utile d'insertion d'un modèle par défaut (pour le « restaurer les défauts »). */
export function defaultSeedPayload(tpl: PrestationTemplate, position: number) {
  return {
    source_key:  tpl.key,
    titre:       tpl.titre,
    type:        tpl.type,
    category:    tpl.category,
    description: tpl.description,
    elements:    tpl.elements,
    objectif:    tpl.objectif,
    prix_defaut: tpl.prixDefaut,
    tva_defaut:  tpl.tvaDefaut,
    unite:       tpl.unite,
    is_unique:   tpl.unique,
    actif:       true,
    position,
  }
}

/** Titre « de base » d'un modèle (sans la partie variable) pour la détection de doublon. */
export function templateBaseTitle(tpl: PrestationTemplate): string {
  return tpl.titre.replace(/\[[A-Z0-9_]+\]/g, '').replace(/—\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
}
