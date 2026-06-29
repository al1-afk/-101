/**
 * Templates de tâches par type de prestation.
 * Quand on crée un projet, on coche les templates → toutes les tâches
 * sont créées automatiquement (non assignées), prêtes à être distribuées.
 */
import type { TaskPriority } from '@/hooks/useTeamMemberTasks'

export interface TaskTemplate {
  title:     string
  priority?: TaskPriority
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
    description: 'Site vitrine WordPress avec Elementor (20 tâches)',
    groups: [
      {
        category: 'Analyse',
        tasks: [
          { title: 'Analyse du besoin client',     priority: 'high'   },
          { title: 'Cahier des charges',           priority: 'high'   },
          { title: 'Arborescence du site',         priority: 'normal' },
        ],
      },
      {
        category: 'Design',
        tasks: [
          { title: 'Maquette page d\'accueil',     priority: 'high'   },
          { title: 'Maquette pages internes',      priority: 'normal' },
          { title: 'Validation client maquettes',  priority: 'high'   },
        ],
      },
      {
        category: 'Développement',
        tasks: [
          { title: 'Installation WordPress',       priority: 'normal' },
          { title: 'Installation thème + Elementor', priority: 'normal' },
          { title: 'Développer page Accueil',      priority: 'high'   },
          { title: 'Développer page Services',     priority: 'normal' },
          { title: 'Développer page À propos',     priority: 'normal' },
          { title: 'Développer page Contact',      priority: 'normal' },
          { title: 'Optimisation responsive',      priority: 'high'   },
        ],
      },
      {
        category: 'SEO',
        tasks: [
          { title: 'Meta Title sur toutes pages',  priority: 'normal' },
          { title: 'Meta Description',             priority: 'normal' },
          { title: 'Schema.org markup',            priority: 'normal' },
          { title: 'Sitemap.xml',                  priority: 'normal' },
          { title: 'Connexion Google Search Console', priority: 'normal' },
        ],
      },
      {
        category: 'Mise en ligne',
        tasks: [
          { title: 'Sauvegarde complète',          priority: 'high'   },
          { title: 'Installation SSL',             priority: 'high'   },
          { title: 'Optimisation vitesse',         priority: 'normal' },
          { title: 'Livraison + formation client', priority: 'high'   },
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
    description: 'Fiche Google Business optimisée + SEO local',
    groups: [
      {
        category: 'Création fiche',
        tasks: [
          { title: 'Créer la fiche Google Business', priority: 'high'   },
          { title: 'Vérification (carte postale / téléphone)', priority: 'high' },
          { title: 'Catégorie principale + secondaires', priority: 'high'   },
          { title: 'Horaires d\'ouverture',        priority: 'normal' },
          { title: 'Zone de service',              priority: 'normal' },
        ],
      },
      {
        category: 'Optimisation',
        tasks: [
          { title: 'Description optimisée SEO',    priority: 'high'   },
          { title: 'Services / Produits détaillés', priority: 'normal' },
          { title: 'Photos professionnelles (10+)', priority: 'high'   },
          { title: 'Logo + photo de couverture',   priority: 'normal' },
          { title: 'Vidéo de présentation',        priority: 'normal' },
        ],
      },
      {
        category: 'Animation',
        tasks: [
          { title: 'Premier post Google',          priority: 'normal' },
          { title: 'Q&R préremplies',              priority: 'normal' },
          { title: 'Demande d\'avis aux clients',  priority: 'normal' },
        ],
      },
      {
        category: 'Suivi',
        tasks: [
          { title: 'Réponse aux avis (formation)', priority: 'normal' },
          { title: 'Rapport performances mensuel', priority: 'normal' },
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
]

export function findTemplate(key: string): ProjetTemplate | undefined {
  return PROJET_TEMPLATES.find(t => t.key === key)
}
