/**
 * Templates de tâches par type de prestation.
 * Quand on crée un projet, on coche les templates → toutes les tâches
 * sont créées automatiquement (non assignées), prêtes à être distribuées.
 */
import type { TaskPriority } from '@/hooks/useTeamMemberTasks'
import type { TaskRecurrence } from '@/lib/taskRecurrence'
import type { SopBlock } from '@/hooks/useSops'

export interface TaskTemplate {
  title:       string
  priority?:   TaskPriority
  /** Si défini, la tâche est créée avec ce motif de récurrence. */
  recurrence?: TaskRecurrence
  /** Blocs riches (BlockEditor : titres, listes, images, tableaux, code…) —
      injectés tels quels dans la description de la tâche créée. */
  blocks?:     SopBlock[]
  /** Sous-tâches pré-remplies. */
  subtasks?:   string[]
  /** Liens / pièces jointes (Drive, Figma, docs…). */
  attachments?: { label: string; url: string }[]
  /** Prompt IA — bloc code dédié à la fin de la description. */
  prompt?:     string
}

export interface ProjetTemplate {
  key:        string
  label:      string
  emoji:      string
  description:string
  groups:     { category: string; tasks: TaskTemplate[] }[]
}

export const PROJET_TEMPLATES: ProjetTemplate[] = [
  {
    key:         'wordpress',
    label:       'Site WordPress',
    emoji:       '🌐',
    description: 'Workflow complet WordPress — de la collecte à la mise en ligne (44 tâches)',
    groups: [
      {
        category: 'Collecte des informations',
        tasks: [
          { title: "Récupérer le nom de l'entreprise",                priority: 'high'   },
          { title: 'Récupérer le logo',                                priority: 'high'   },
          { title: 'Définir les couleurs de la marque',                priority: 'normal' },
          { title: 'Coordonnées (adresse, téléphone, e-mail)',         priority: 'high'   },
          { title: 'Liens des réseaux sociaux',                        priority: 'normal' },
          { title: 'Liste des services et informations utiles',        priority: 'high'   },
        ],
      },
      {
        category: 'Maquette (Mockup / UI)',
        tasks: [
          { title: 'Conception de la maquette',                        priority: 'high'   },
          { title: 'Présentation de la maquette au client',            priority: 'high'   },
          { title: 'Validation client avant développement',            priority: 'urgent' },
        ],
      },
      {
        category: 'Domaine & Hébergement',
        tasks: [
          { title: 'Réservation ou transfert du nom de domaine',       priority: 'high'   },
          { title: "Configuration de l'hébergement",                   priority: 'high'   },
          { title: 'Installation du certificat SSL',                   priority: 'high'   },
        ],
      },
      {
        category: 'Développement',
        tasks: [
          { title: 'Installation et configuration de WordPress',       priority: 'high'   },
          { title: 'Génération / personnalisation du thème (Claude Code)', priority: 'high'   },
          { title: 'Création du Header, Footer et menus',              priority: 'high'   },
          { title: 'Création de toutes les pages',                     priority: 'high'   },
          { title: 'Intégration des fonctionnalités demandées',        priority: 'normal' },
        ],
      },
      {
        category: 'Contenu',
        tasks: [
          { title: 'Rédaction et intégration des contenus',            priority: 'high'   },
          { title: 'Optimisation des images',                          priority: 'normal' },
          { title: 'Optimisation des appels à l\'action (CTA)',        priority: 'normal' },
        ],
      },
      {
        category: 'Optimisation',
        tasks: [
          { title: 'Responsive (mobile, tablette, desktop)',           priority: 'high'   },
          { title: 'Optimisation SEO on-page',                         priority: 'high'   },
          { title: 'Optimisation des performances (vitesse)',          priority: 'high'   },
        ],
      },
      {
        category: 'Intégrations',
        tasks: [
          { title: 'Bouton WhatsApp flottant',                         priority: 'normal' },
          { title: 'Formulaire de contact',                            priority: 'high'   },
          { title: 'Google Maps sur la page contact',                  priority: 'normal' },
          { title: 'Liens vers réseaux sociaux',                       priority: 'normal' },
          { title: 'Configuration SMTP (envoi des e-mails)',           priority: 'high'   },
          { title: 'Création et test des e-mails professionnels',      priority: 'high'   },
          { title: 'Connexion Google Search Console',                  priority: 'normal' },
          { title: 'Installation Google Analytics',                    priority: 'normal' },
        ],
      },
      {
        category: 'Vérifications',
        tasks: [
          { title: 'Contrôle de tous les liens',                       priority: 'high'   },
          { title: 'Test des formulaires',                             priority: 'high'   },
          { title: "Test d'envoi et réception des e-mails",            priority: 'high'   },
          { title: 'Vérification responsive sur plusieurs appareils',  priority: 'high'   },
          { title: 'Vérification des performances (PageSpeed)',        priority: 'normal' },
          { title: 'Vérification SEO (audit final)',                   priority: 'normal' },
          { title: 'Validation finale interne',                        priority: 'urgent' },
        ],
      },
      {
        category: 'Mise en ligne',
        tasks: [
          { title: 'Migration vers l\'hébergement de production',      priority: 'urgent' },
          { title: 'Configuration finale du nom de domaine',           priority: 'urgent' },
          { title: 'Mise en production',                               priority: 'urgent' },
          { title: 'Tests finaux en production',                       priority: 'high'   },
          { title: 'Indexation du site sur Google',                    priority: 'normal' },
          { title: 'Livraison au client + formation',                  priority: 'high'   },
        ],
      },
    ],
  },

  {
    key:         'seo',
    label:       'SEO On-Page',
    emoji:       '🔍',
    description: 'Référencement complet : audit, mots-clés, optimisation, contenu',
    groups: [
      {
        category: 'Audit',
        tasks: [
          { title: 'Audit technique SEO',          priority: 'high'   },
          { title: 'Audit contenu existant',       priority: 'normal' },
          { title: 'Audit concurrents',            priority: 'normal' },
        ],
      },
      {
        category: 'Mots-clés',
        tasks: [
          { title: 'Recherche mots-clés principaux', priority: 'high'   },
          { title: 'Recherche mots-clés longue traîne', priority: 'normal' },
          { title: 'Mapping mots-clés / pages',    priority: 'normal' },
        ],
      },
      {
        category: 'Optimisation On-Page',
        tasks: [
          { title: 'Meta Title optimisés',         priority: 'high'   },
          { title: 'Meta Descriptions',            priority: 'high'   },
          { title: 'Balises H1/H2/H3',             priority: 'normal' },
          { title: 'Alt texts images',             priority: 'normal' },
          { title: 'Liens internes',               priority: 'normal' },
          { title: 'Schema.org / Rich Snippets',   priority: 'normal' },
        ],
      },
      {
        category: 'Technique',
        tasks: [
          { title: 'Vitesse de chargement',        priority: 'high'   },
          { title: 'Sitemap.xml',                  priority: 'normal' },
          { title: 'Robots.txt',                   priority: 'normal' },
          { title: 'HTTPS / SSL vérifié',          priority: 'normal' },
          { title: 'Google Search Console',        priority: 'high'   },
          { title: 'Google Analytics 4',           priority: 'normal' },
        ],
      },
      {
        category: 'Suivi',
        tasks: [
          { title: 'Rapport positions mensuel',    priority: 'normal' },
          { title: 'Recommandations contenu',      priority: 'normal' },
        ],
      },
    ],
  },

  {
    key:         'gmb',
    label:       'Google Business / GMB',
    emoji:       '📍',
    description: 'Setup complet + gestion hebdomadaire récurrente (SEO local, avis, posts)',
    groups: [
      /* ═════════ PARTIE 1 — Tâches à effectuer une seule fois ═════════ */
      {
        category: '1️⃣ Collecte des informations',
        tasks: [
          { title: "Nom exact de l'entreprise",                        priority: 'high'   },
          { title: 'Catégorie principale + catégories secondaires',    priority: 'high'   },
          { title: 'Adresse complète',                                 priority: 'high'   },
          { title: 'Numéro de téléphone',                              priority: 'high'   },
          { title: 'Adresse e-mail',                                   priority: 'normal' },
          { title: 'Site web',                                         priority: 'high'   },
          { title: "Horaires d'ouverture",                             priority: 'high'   },
          { title: 'Description optimisée SEO',                        priority: 'high'   },
          { title: 'Zone d\'intervention géographique',                priority: 'normal' },
          { title: 'Liste des services',                               priority: 'high'   },
          { title: 'Liste des produits',                               priority: 'normal' },
          { title: 'Logo de l\'entreprise',                            priority: 'high'   },
          { title: 'Photo de couverture',                              priority: 'high'   },
          { title: 'Photos de l\'entreprise (intérieur/extérieur)',    priority: 'high'   },
          { title: 'Liens des réseaux sociaux',                        priority: 'normal' },
        ],
      },
      {
        category: '2️⃣ Création de la fiche',
        tasks: [
          { title: 'Création de la fiche Google Business Profile',     priority: 'urgent' },
          { title: 'Configuration complète du profil',                 priority: 'high'   },
          { title: 'Ajout des catégories (principale + secondaires)',  priority: 'high'   },
          { title: 'Ajout des services détaillés',                     priority: 'high'   },
          { title: 'Ajout des produits',                               priority: 'normal' },
          { title: 'Ajout des horaires',                               priority: 'high'   },
          { title: 'Ajout des attributs (WiFi, parking, etc.)',        priority: 'normal' },
          { title: 'Ajout du logo',                                    priority: 'high'   },
          { title: 'Ajout de la photo de couverture',                  priority: 'high'   },
          { title: 'Ajout des premières photos (10 minimum)',          priority: 'high'   },
          { title: 'Vérification de la fiche (carte postale/tel/mail)', priority: 'urgent' },
          { title: 'Liaison avec le site web',                         priority: 'high'   },
          { title: 'Ajout du lien WhatsApp',                           priority: 'normal' },
          { title: 'Activation de la messagerie (si disponible)',      priority: 'normal' },
        ],
      },
      {
        category: '3️⃣ Configuration tracking',
        tasks: [
          { title: 'Création des UTM pour le suivi',                   priority: 'normal' },
          { title: 'Connexion à Google Search Console',                priority: 'high'   },
          { title: 'Connexion à Google Analytics',                     priority: 'high'   },
          { title: 'Vérification finale des informations',             priority: 'high'   },
          { title: 'Indexation du site (si non fait)',                 priority: 'normal' },
        ],
      },

      /* ═════════ PARTIE 2 — Tâches hebdomadaires récurrentes ═════════ */
      {
        category: '📝 Publications (hebdo)',
        tasks: [
          { title: 'Publier Google Post #1 de la semaine',   priority: 'high',   recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Publier Google Post #2 de la semaine',   priority: 'high',   recurrence: { type: 'weekly', weekdays: [3] } },
          { title: 'Publier Google Post #3 de la semaine',   priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Ajouter les actualités de l\'entreprise', priority: 'normal', recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Promouvoir une offre ou un service',      priority: 'normal', recurrence: { type: 'weekly', weekdays: [3] } },
        ],
      },
      {
        category: '📸 Photos & Vidéos (hebdo)',
        tasks: [
          { title: 'Ajouter de nouvelles photos',            priority: 'normal', recurrence: { type: 'weekly', weekdays: [2] } },
          { title: 'Ajouter des vidéos',                     priority: 'normal', recurrence: { type: 'weekly', weekdays: [4] } },
          { title: 'Optimiser les légendes (alt, mots-clés)', priority: 'normal', recurrence: { type: 'weekly', weekdays: [2] } },
        ],
      },
      {
        category: '⭐ Avis clients (hebdo)',
        tasks: [
          { title: 'Demander 3 nouveaux avis clients',       priority: 'high',   recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Répondre à tous les avis reçus',         priority: 'high',   recurrence: { type: 'weekly', weekdays: [1, 3, 5] } },
          { title: 'Signaler les avis frauduleux si nécessaire', priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
        ],
      },
      {
        category: '🔍 SEO Local (hebdo)',
        tasks: [
          { title: 'Vérifier les positions des mots-clés',    priority: 'normal', recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Optimiser la description si besoin',      priority: 'normal', recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Ajouter de nouveaux services ou produits', priority: 'normal', recurrence: { type: 'weekly', weekdays: [3] } },
          { title: 'Contrôler les catégories',                priority: 'normal', recurrence: { type: 'weekly', weekdays: [3] } },
        ],
      },
      {
        category: '📊 Suivi statistiques (hebdo)',
        tasks: [
          { title: 'Vérifier les statistiques Google Business', priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Suivre les appels reçus',                   priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Suivre les clics vers le site',             priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Suivre les demandes d\'itinéraire',         priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Suivre les messages reçus',                 priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
        ],
      },
      {
        category: '🔧 Maintenance (hebdo)',
        tasks: [
          { title: 'Vérifier les horaires (jours fériés, exceptions)', priority: 'normal', recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Vérifier les informations de contact',              priority: 'normal', recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Corriger les éventuelles erreurs signalées',        priority: 'high',   recurrence: { type: 'weekly', weekdays: [3] } },
          { title: 'Contrôler la cohérence avec le site web',           priority: 'normal', recurrence: { type: 'weekly', weekdays: [3] } },
        ],
      },
      {
        category: '📈 Rapport client (hebdo)',
        tasks: [
          { title: 'Préparer un rapport hebdomadaire',       priority: 'high', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Présenter les performances au client',   priority: 'high', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Proposer les actions d\'amélioration',   priority: 'high', recurrence: { type: 'weekly', weekdays: [5] } },
        ],
      },
    ],
  },

  {
    key:         'identite',
    label:       'Identité visuelle / Logo',
    emoji:       '🎨',
    description: 'Logo + charte graphique complète',
    groups: [
      {
        category: 'Brief',
        tasks: [
          { title: 'Brief créatif client',         priority: 'high'   },
          { title: 'Recherche concurrence',        priority: 'normal' },
          { title: 'Moodboard / inspirations',     priority: 'normal' },
        ],
      },
      {
        category: 'Création',
        tasks: [
          { title: 'Croquis 3 propositions',       priority: 'high'   },
          { title: 'Présentation client',          priority: 'high'   },
          { title: 'Itérations / corrections',     priority: 'normal' },
          { title: 'Validation finale',            priority: 'high'   },
        ],
      },
      {
        category: 'Déclinaisons',
        tasks: [
          { title: 'Logo couleur / noir / blanc',  priority: 'normal' },
          { title: 'Logo horizontal + carré',      priority: 'normal' },
          { title: 'Favicon',                      priority: 'normal' },
          { title: 'Charte graphique PDF',         priority: 'high'   },
        ],
      },
      {
        category: 'Livraison',
        tasks: [
          { title: 'Fichiers vectoriels (AI / SVG)', priority: 'high'   },
          { title: 'Fichiers PNG / JPG (HD + web)', priority: 'normal' },
          { title: 'Mockups de présentation',      priority: 'normal' },
          { title: 'Remise client + formation usage', priority: 'high'   },
        ],
      },
    ],
  },

  {
    key:         'ads-facebook',
    label:       'Ads Facebook / Instagram',
    emoji:       '📱',
    description: 'Campagne publicitaire Meta complète',
    groups: [
      {
        category: 'Stratégie',
        tasks: [
          { title: 'Brief client objectifs',       priority: 'high'   },
          { title: 'Définition audience cible',    priority: 'high'   },
          { title: 'Budget + planning',            priority: 'normal' },
        ],
      },
      {
        category: 'Création',
        tasks: [
          { title: 'Visuels publicitaires (5+)',   priority: 'high'   },
          { title: 'Vidéo courte (Reels/Stories)', priority: 'high'   },
          { title: 'Copywriting accroches',        priority: 'normal' },
        ],
      },
      {
        category: 'Setup',
        tasks: [
          { title: 'Business Manager configuré',   priority: 'high'   },
          { title: 'Pixel Meta installé',          priority: 'high'   },
          { title: 'Audiences créées',             priority: 'normal' },
          { title: 'Catalogue produits (si e-com)', priority: 'normal' },
        ],
      },
      {
        category: 'Diffusion',
        tasks: [
          { title: 'Lancement campagne',           priority: 'high'   },
          { title: 'A/B testing visuels',          priority: 'normal' },
          { title: 'Optimisation quotidienne',     priority: 'high'   },
        ],
      },
      {
        category: 'Reporting',
        tasks: [
          { title: 'Rapport hebdomadaire',         priority: 'normal' },
          { title: 'Bilan fin de campagne',        priority: 'normal' },
        ],
      },
    ],
  },

  {
    key:         'ads-google',
    label:       'Google Ads',
    emoji:       '🎯',
    description: 'Campagne Google Search + Display',
    groups: [
      {
        category: 'Stratégie',
        tasks: [
          { title: 'Audit compte Google Ads',      priority: 'high'   },
          { title: 'Étude mots-clés',              priority: 'high'   },
          { title: 'Budget + enchères',            priority: 'normal' },
        ],
      },
      {
        category: 'Setup',
        tasks: [
          { title: 'Création compte / accès',      priority: 'high'   },
          { title: 'Conversions + tracking',       priority: 'high'   },
          { title: 'Audiences personnalisées',     priority: 'normal' },
          { title: 'Extensions d\'annonces',       priority: 'normal' },
        ],
      },
      {
        category: 'Annonces',
        tasks: [
          { title: 'Groupes d\'annonces',          priority: 'high'   },
          { title: 'Rédaction annonces (3 versions)', priority: 'high' },
          { title: 'Mots-clés négatifs',           priority: 'normal' },
        ],
      },
      {
        category: 'Suivi',
        tasks: [
          { title: 'Optimisation enchères',        priority: 'high'   },
          { title: 'A/B testing annonces',         priority: 'normal' },
          { title: 'Rapport mensuel',              priority: 'normal' },
        ],
      },
    ],
  },

  {
    key:         'social_media',
    label:       'Réseaux sociaux',
    emoji:       '📱',
    description: 'Création et gestion — setup complet + gestion hebdomadaire récurrente',
    groups: [
      /* ═════════ PARTIE 1 — Tâches à effectuer une seule fois ═════════ */
      {
        category: '1️⃣ Collecte des informations',
        tasks: [
          { title: "Récupérer le logo de l'entreprise",                priority: 'high'   },
          { title: 'Charte graphique (couleurs et typographies)',      priority: 'high'   },
          { title: 'Coordonnées (adresse, téléphone, e-mail)',         priority: 'high'   },
          { title: 'Site web / lien de destination',                   priority: 'normal' },
          { title: "Description de l'entreprise",                      priority: 'high'   },
          { title: 'Liste des services et produits',                   priority: 'high'   },
          { title: 'Photos et vidéos de base',                         priority: 'normal' },
        ],
      },
      {
        category: '2️⃣ Création des comptes',
        tasks: [
          { title: 'Création de la page Facebook',                     priority: 'high'   },
          { title: 'Création du compte Instagram',                     priority: 'high'   },
          { title: 'Création du compte TikTok',                        priority: 'normal' },
        ],
      },
      {
        category: '3️⃣ Configuration des profils',
        tasks: [
          { title: 'Optimisation générale des profils',                priority: 'high'   },
          { title: 'Ajout de la photo de profil et de couverture',     priority: 'high'   },
          { title: 'Rédaction de la biographie optimisée',             priority: 'high'   },
          { title: 'Ajout des coordonnées',                            priority: 'normal' },
          { title: 'Ajout du lien du site web',                        priority: 'normal' },
          { title: 'Ajout du lien WhatsApp',                           priority: 'normal' },
          { title: "Configuration des boutons d'action",               priority: 'normal' },
          { title: 'Liaison Facebook ↔ Instagram',                     priority: 'high'   },
          { title: 'Configuration du Meta Business Manager',           priority: 'high'   },
          { title: 'Attribution des accès aux collaborateurs',         priority: 'normal' },
          { title: 'Vérification des comptes (badge)',                 priority: 'normal' },
          { title: 'Installation du Pixel Meta (si nécessaire)',       priority: 'normal' },
        ],
      },

      /* ═════════ PARTIE 2 — Tâches hebdomadaires récurrentes ═════════ */
      {
        category: '📝 Création de contenu (hebdo)',
        tasks: [
          { title: 'Publication #1 de la semaine',       priority: 'high',   recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Publication #2 de la semaine',       priority: 'high',   recurrence: { type: 'weekly', weekdays: [3] } },
          { title: 'Publication #3 de la semaine',       priority: 'high',   recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Création des visuels de la semaine', priority: 'high',   recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Rédaction des textes (copywriting)', priority: 'high',   recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Recherche des hashtags',             priority: 'normal', recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Programmation des publications',     priority: 'normal', recurrence: { type: 'weekly', weekdays: [1] } },
          { title: 'Demander 3 avis clients',            priority: 'normal', recurrence: { type: 'weekly', weekdays: [1] } },
        ],
      },
      {
        category: '🎬 Stories & Reels (hebdo)',
        tasks: [
          { title: 'Publication de Stories',             priority: 'normal', recurrence: { type: 'weekly', weekdays: [1, 3, 5] } },
          { title: 'Création de Reels / vidéos courtes', priority: 'high',   recurrence: { type: 'weekly', weekdays: [2] } },
          { title: 'Publication sur TikTok',             priority: 'normal', recurrence: { type: 'weekly', weekdays: [4] } },
        ],
      },
      {
        category: '💬 Community Management (hebdo)',
        tasks: [
          { title: 'Réponse aux commentaires',           priority: 'high',   recurrence: { type: 'weekly', weekdays: [1, 2, 3, 4, 5] } },
          { title: 'Réponse aux messages privés',        priority: 'high',   recurrence: { type: 'weekly', weekdays: [1, 2, 3, 4, 5] } },
          { title: 'Modération des publications',        priority: 'normal', recurrence: { type: 'weekly', weekdays: [1, 3, 5] } },
        ],
      },
      {
        category: '🚀 Développement communauté (hebdo)',
        tasks: [
          { title: 'Invitation de nouveaux abonnés',     priority: 'normal', recurrence: { type: 'weekly', weekdays: [2] } },
          { title: 'Partage des publications',           priority: 'normal', recurrence: { type: 'weekly', weekdays: [3] } },
          { title: 'Interaction avec la communauté',     priority: 'normal', recurrence: { type: 'weekly', weekdays: [1, 4] } },
          { title: 'Veille concurrentielle',             priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
        ],
      },
      {
        category: '📊 Analyse (hebdo)',
        tasks: [
          { title: 'Analyse des statistiques',                priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: "Suivi de la portée et de l'engagement",   priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Analyse des performances des publications', priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
          { title: 'Rapport hebdomadaire au client',          priority: 'high',   recurrence: { type: 'weekly', weekdays: [5] } },
          { title: "Proposition d'améliorations",             priority: 'normal', recurrence: { type: 'weekly', weekdays: [5] } },
        ],
      },
    ],
  },

  {
    key:         'claude_app',
    label:       'App custom (Claude Code)',
    emoji:       '🤖',
    description: 'Développement d\'application sur mesure — Démo → Validation → Prod (47 tâches)',
    groups: [
      {
        category: '1️⃣ Analyse du projet',
        tasks: [
          {
            title:    'Collecte des besoins du client',
            priority: 'urgent',
            prompt: `💡 PROMPT — Interview client (Product Discovery)

Agis comme un Product Manager senior.
Mène un entretien structuré avec le client pour comprendre son besoin en profondeur.

Questions à couvrir :
1. Quel problème concret cherches-tu à résoudre ?
2. Qui sont tes utilisateurs cibles ? (personas, contexte d'usage)
3. Quel est ton objectif business mesurable dans 3 mois / 6 mois ?
4. Quelles sont les fonctionnalités indispensables (MVP) ?
5. Quelles sont les fonctionnalités "cool but nice-to-have" ?
6. Contraintes : budget, délai, technologies imposées ?
7. Concurrents ou inspirations ? (montre-moi 2-3 exemples)
8. Comment mesures-tu le succès ? (KPI clairs)

Livrable : synthèse en 1 page avec objectifs + périmètre + critères de succès.`,
          },
          {
            title:    'Définition des fonctionnalités',
            priority: 'high',
            prompt: `💡 PROMPT — Priorisation des fonctionnalités (MoSCoW)

Agis comme un Product Manager expérimenté.

Sur la base des besoins collectés, dresse la liste complète des fonctionnalités
et priorise-les selon la méthode MoSCoW :

- Must have (indispensables pour le MVP)
- Should have (importantes mais reportables)
- Could have (bonus si le temps le permet)
- Won't have (hors périmètre — assumé)

Pour chaque fonctionnalité, précise :
- 1 phrase d'user story ("En tant que X, je veux Y pour Z")
- Estimation grossière : XS / S / M / L / XL
- Dépendances éventuelles avec d'autres fonctionnalités

Livrable : tableau clair, prêt à être transformé en tickets de développement.`,
          },
          {
            title:    'Cahier des charges détaillé (avec Claude Code)',
            priority: 'high',
            prompt: `💡 PROMPT — Cahier des charges Product-Manager

Agis comme un Product Manager senior spécialisé dans les applications web
et mobile orientées business.

Je veux un cahier des charges clair, structuré et directement exploitable
par un développeur pour construire un produit réel (pas théorique).

Contexte du projet :
- Type : [ex : application taxi / plateforme e-commerce / SaaS…]
- Objectif principal : [générer des leads / réservations / ventes]
- Cible : [ex : chauffeurs taxi en France / clients locaux / entreprises]

Ta mission — créer un document structuré, concret et orienté exécution avec :
1. Objectifs business (clairs et mesurables)
2. Utilisateurs cibles + leurs problèmes
3. Fonctionnalités PRIORITAIRES (MVP d'abord) + secondaires
4. Parcours utilisateur simples et efficaces (UX)
5. Structure des pages / écrans (pas juste description, mais logique réelle)
6. Stack technique recommandée (simple, rapide, scalable)
7. Contraintes réelles (budget, temps, complexité)
8. Roadmap de développement (étapes concrètes, pas vague)
9. Livrables attendus à chaque étape
10. Critères de validation (quand on considère que c'est OK)

Important :
- Évite le blabla théorique
- Donne des décisions concrètes
- Priorise la rapidité et le ROI
- Pense comme une agence qui doit livrer vite et bien`,
          },
          {
            title:    'Prompt principal partagé avec Claude Code dans VS Code',
            priority: 'high',
            prompt: `💡 PROMPT — Contexte projet pour Claude Code (à coller dans CLAUDE.md)

Tu es un développeur senior full-stack. Tu travailles sur ce projet dans VS Code
avec Claude Code. Voici le contexte permanent à garder en tête :

## Stack
- Frontend : [React + Vite + Tailwind + shadcn/ui]
- Backend  : [Node.js + Express + TypeScript]
- DB       : [PostgreSQL avec migrations SQL]
- Auth     : [JWT + refresh tokens]
- Deploy   : [Dokploy sur VPS]

## Contraintes
- Code TypeScript strict, pas de \`any\` sauf justifié
- Composants React fonctionnels + hooks
- Nommage clair, commentaires en français
- Pas de sur-ingénierie : simple, direct, maintenable
- Chaque feature = 1 migration + 1 route + 1 composant

## Style de collaboration
- Explique brièvement avant chaque changement
- Vérifie la compilation avant de valider
- Propose des commits atomiques avec message clair
- En cas de doute → pose une question précise avant de coder

## Fichiers à toujours lire avant de modifier
- CLAUDE.md (ce fichier)
- server/index.ts
- src/App.tsx
- src/lib/api.ts`,
          },
        ],
      },
      {
        category: '2️⃣ Développement version Démo',
        tasks: [
          { title: 'Création de la structure du projet',                   priority: 'high'   },
          { title: 'Développement du Frontend',                            priority: 'high'   },
          { title: 'Développement du Backend (API)',                       priority: 'high'   },
          { title: 'Données fictives (Mock Data / JSON)',                  priority: 'normal' },
          { title: 'Authentification et gestion des utilisateurs',         priority: 'high'   },
          { title: 'Gestion des rôles et permissions (RBAC)',              priority: 'high'   },
          { title: 'Gestion des fichiers et médias',                       priority: 'normal' },
          { title: 'Intégration des API externes',                         priority: 'normal' },
          { title: 'Création du tableau de bord',                          priority: 'high'   },
          { title: 'Création des modules métier',                          priority: 'high'   },
          { title: 'Création des rapports et exports PDF / Excel',         priority: 'normal' },
          { title: "Configuration des variables d'environnement (.env)",   priority: 'high'   },
        ],
      },
      {
        category: '3️⃣ Sécurité',
        tasks: [
          { title: 'Authentification JWT',                                 priority: 'high'   },
          { title: 'Validation des données (schemas + sanitize)',          priority: 'high'   },
          { title: 'Protection des routes (middleware auth)',              priority: 'high'   },
          { title: 'Journalisation (logs applicatifs)',                    priority: 'normal' },
        ],
      },
      {
        category: '4️⃣ Déploiement Démo',
        tasks: [
          { title: 'Git push vers GitHub',                                 priority: 'high'   },
          { title: 'Déploiement sur le VPS',                               priority: 'high'   },
          { title: 'Configuration du domaine',                             priority: 'high'   },
          { title: 'Configuration SSL (Let\'s Encrypt)',                   priority: 'high'   },
          { title: 'Configuration SMTP (envoi e-mails)',                   priority: 'normal' },
          { title: 'Configuration des sauvegardes automatiques',           priority: 'high'   },
          { title: 'Mise en ligne de la version Démo',                     priority: 'urgent' },
        ],
      },
      {
        category: '5️⃣ Validation client',
        tasks: [
          { title: 'Présentation de la version Démo',                      priority: 'urgent' },
          { title: 'Collecte des remarques du client',                     priority: 'high'   },
          { title: 'Corrections demandées',                                priority: 'high'   },
          { title: 'Validation finale du client (écrite)',                 priority: 'urgent' },
        ],
      },
      {
        category: '6️⃣ Base de données réelle',
        tasks: [
          { title: 'Conception de la BDD selon les fonctionnalités validées', priority: 'high' },
          { title: 'Création de la base de données',                          priority: 'high' },
          { title: 'Création des migrations',                                 priority: 'high' },
          { title: 'Intégration de la BDD dans le code',                      priority: 'high' },
          { title: 'Remplacement des données Mock/JSON par la BDD réelle',    priority: 'high' },
        ],
      },
      {
        category: '7️⃣ Tests',
        tasks: [
          { title: 'Vérification des fonctionnalités',                     priority: 'high'   },
          { title: 'Tests Backend (endpoints, sécurité)',                  priority: 'high'   },
          { title: 'Tests Frontend (parcours utilisateur)',                priority: 'high'   },
          { title: 'Correction des bugs identifiés',                       priority: 'urgent' },
          { title: 'Optimisation des performances',                        priority: 'normal' },
          { title: 'Tests responsive (mobile, tablette, desktop)',         priority: 'high'   },
          { title: 'Validation finale',                                    priority: 'urgent' },
        ],
      },
      {
        category: '8️⃣ Mise en production',
        tasks: [
          { title: 'Git push vers GitHub (branche main)',                  priority: 'urgent' },
          { title: 'Déploiement de la version finale sur le VPS',          priority: 'urgent' },
          { title: 'Vérification de la production (smoke tests)',          priority: 'urgent' },
          { title: 'Livraison de l\'application au client',                priority: 'urgent' },
        ],
      },
    ],
  },
]

export function findTemplate(key: string): ProjetTemplate | undefined {
  return PROJET_TEMPLATES.find(t => t.key === key)
}
