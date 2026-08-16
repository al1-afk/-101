/**
 * 7aty — catalogue des catégories de temps.
 *
 * Le catalogue vit ici, en TypeScript, et non en base : il évolue au
 * rythme du produit, il est identique pour tout le monde, et une clé
 * retirée reste lisible dans l'historique (les blocs stockent la clé
 * TEXT, pas une clé étrangère — cf. migration 087).
 *
 * ── La règle centrale : repos planifié ≠ temps perdu ────────────────
 * Une catégorie ne suffit JAMAIS à dire si du temps est perdu. Un film
 * à 21 h décidé la veille est du repos ; le même film à 14 h en pleine
 * journée de travail est du temps perdu. C'est le NIVEAU DE CONTRÔLE
 * qui tranche — d'où `suggestKind()` plus bas, qui croise les deux.
 */

/** Nature finale d'un bloc de temps — c'est elle qui alimente les totaux. */
export type TimeKind = 'valeur' | 'neutre' | 'repos' | 'perdu'

/** Comment le temps a été vécu — l'aveu honnête, pas la catégorie. */
export type ControlLevel = 'controle' | 'necessaire' | 'non_planifie' | 'perte_controle'

export type CategoryGroup = 'valeur' | 'vie' | 'distraction'

export interface TimeCategory {
  key:      string
  label:    string
  emoji:    string
  group:    CategoryGroup
  /** Nature proposée quand aucun niveau de contrôle n'est renseigné. */
  defaultKind: TimeKind
  /** Couleur de la catégorie (barres, graphiques) — hex, thème-agnostique. */
  color:    string
  /** Activités suggérées : remplissent le champ « nom » en un clic. */
  activities: string[]
}

export const TIME_KINDS: Record<TimeKind, { label: string; short: string; emoji: string; color: string }> = {
  valeur: { label: 'Temps à haute valeur', short: 'Haute valeur', emoji: '💰', color: '#2563EB' },
  neutre: { label: 'Temps neutre',          short: 'Neutre',       emoji: '🟡', color: '#A16207' },
  repos:  { label: 'Repos planifié',        short: 'Repos',        emoji: '🟢', color: '#10B981' },
  perdu:  { label: 'Temps perdu',           short: 'Perdu',        emoji: '🔴', color: '#DC2626' },
}

export const CONTROL_LEVELS: Record<ControlLevel, { label: string; emoji: string; hint: string; color: string }> = {
  controle: {
    label: 'Contrôlé', emoji: '🟢', color: '#10B981',
    hint: 'J\'ai choisi de le faire, pendant un temps de repos',
  },
  necessaire: {
    label: 'Nécessaire', emoji: '🟡', color: '#CA8A04',
    hint: 'C\'était nécessaire (appel, démarche, obligation)',
  },
  non_planifie: {
    label: 'Non planifié', emoji: '🟠', color: '#EA580C',
    hint: 'C\'est arrivé sans que ce soit prévu',
  },
  perte_controle: {
    label: 'Perte de contrôle', emoji: '🔴', color: '#DC2626',
    hint: 'J\'y suis entré sans le vouloir, et j\'ai continué',
  },
}

export const CATEGORY_GROUPS: Record<CategoryGroup, { label: string; emoji: string }> = {
  valeur:      { label: 'Travail & haute valeur', emoji: '💼' },
  vie:         { label: 'Vie & repos planifié',   emoji: '🌿' },
  distraction: { label: 'Distractions',           emoji: '⚠️' },
}

/* ── Le catalogue ────────────────────────────────────────────────── */
export const TIME_CATEGORIES: TimeCategory[] = [
  /* ─── Travail & haute valeur ─────────────────────────────────── */
  {
    key: 'sales', label: 'Sales / Vente', emoji: '💰', group: 'valeur',
    defaultKind: 'valeur', color: '#2563EB',
    activities: ['Appel prospect', 'Rendez-vous client', 'Relance', 'Négociation', 'Devis', 'Prospection terrain'],
  },
  {
    key: 'production', label: 'Production / Travail client', emoji: '💻', group: 'valeur',
    defaultKind: 'valeur', color: '#0891B2',
    activities: ['Développement', 'Design', 'Rédaction', 'Livraison projet', 'Correction bug', 'SEO'],
  },
  {
    key: 'management', label: 'Management / Équipe', emoji: '👥', group: 'valeur',
    defaultKind: 'valeur', color: '#6366F1',
    activities: ['Point équipe', 'Suivi des tâches', 'Recrutement', 'Formation interne', 'Feedback'],
  },
  {
    key: 'strategy', label: 'Stratégie', emoji: '🧠', group: 'valeur',
    defaultKind: 'valeur', color: '#7C3AED',
    activities: ['Réflexion stratégique', 'Analyse chiffres', 'Planification', 'Vision & objectifs'],
  },
  {
    key: 'learning', label: 'Apprentissage', emoji: '📚', group: 'valeur',
    defaultKind: 'valeur', color: '#0D9488',
    activities: ['Formation', 'Lecture pro', 'Veille', 'Cours en ligne', 'Documentation'],
  },
  {
    key: 'reunion', label: 'Réunions', emoji: '📅', group: 'valeur',
    defaultKind: 'neutre', color: '#475569',
    activities: ['Réunion interne', 'Réunion client', 'Visio', 'Point hebdo'],
  },
  {
    key: 'admin_task', label: 'Administratif', emoji: '🗂️', group: 'valeur',
    defaultKind: 'neutre', color: '#64748B',
    activities: ['Facturation', 'Comptabilité', 'Emails', 'Paperasse', 'Banque'],
  },
  {
    key: 'deplacement', label: 'Déplacement', emoji: '🚗', group: 'valeur',
    defaultKind: 'neutre', color: '#A16207',
    activities: ['Trajet client', 'Trajet bureau', 'Route', 'Attente transport'],
  },

  /* ─── Vie & repos planifié ───────────────────────────────────── */
  {
    key: 'famille', label: 'Famille', emoji: '👨‍👩‍👧', group: 'vie',
    defaultKind: 'repos', color: '#10B981',
    activities: ['Temps en famille', 'Repas ensemble', 'Sortie', 'Enfants', 'Visite famille'],
  },
  {
    key: 'repos', label: 'Repos planifié', emoji: '🧘', group: 'vie',
    defaultKind: 'repos', color: '#34D399',
    activities: ['Sieste', 'Pause', 'Détente', 'Film prévu', 'Soirée prévue', 'Lecture plaisir'],
  },
  {
    key: 'sport', label: 'Sport', emoji: '🏃', group: 'vie',
    defaultKind: 'repos', color: '#22C55E',
    activities: ['Salle de sport', 'Marche', 'Course', 'Football', 'Vélo'],
  },
  {
    key: 'spirituel', label: 'Spirituel & personnel', emoji: '🕌', group: 'vie',
    defaultKind: 'repos', color: '#059669',
    activities: ['Prière', 'Lecture', 'Méditation', 'Temps calme'],
  },

  /* ─── Distractions ───────────────────────────────────────────── */
  {
    key: 'social', label: 'Réseaux sociaux', emoji: '📱', group: 'distraction',
    defaultKind: 'perdu', color: '#EC4899',
    activities: ['Instagram', 'Facebook', 'TikTok', 'Snapchat', 'X (Twitter)', 'LinkedIn perso', 'Scroll général'],
  },
  {
    key: 'films', label: 'Films & Séries', emoji: '🎬', group: 'distraction',
    defaultKind: 'perdu', color: '#9333EA',
    activities: ['Film', 'Série', 'Netflix', 'YouTube Films', 'Vidéo longue'],
  },
  {
    key: 'youtube', label: 'Vidéos & YouTube', emoji: '▶️', group: 'distraction',
    defaultKind: 'perdu', color: '#DC2626',
    activities: ['YouTube divertissement', 'Shorts', 'Reels', 'Vidéos sans but précis'],
  },
  {
    key: 'navigation', label: 'Navigation', emoji: '🌐', group: 'distraction',
    defaultKind: 'perdu', color: '#F59E0B',
    activities: ['Surf sans but', 'Actualités non nécessaires', 'Recherche aléatoire', 'Sites ouverts au hasard'],
  },
  {
    key: 'jeux', label: 'Divertissement & Jeux', emoji: '🎮', group: 'distraction',
    defaultKind: 'perdu', color: '#84CC16',
    activities: ['Jeux vidéo', 'Jeu mobile', 'Application de loisir', 'Contenu fun'],
  },
  {
    key: 'conversations', label: 'Conversations', emoji: '💬', group: 'distraction',
    defaultKind: 'perdu', color: '#FB923C',
    activities: ['Discussion non nécessaire', 'Appel non nécessaire', 'Messages hors travail', 'WhatsApp perso'],
  },
  {
    key: 'temps_perdu', label: 'Temps perdu', emoji: '⏳', group: 'distraction',
    defaultKind: 'perdu', color: '#94A3B8',
    activities: ['Attente', 'Dispersion', 'Changement de tâche', 'Je ne savais pas quoi faire', 'Procrastination'],
  },
]

const BY_KEY = new Map(TIME_CATEGORIES.map(c => [c.key, c]))

/** Catégorie inconnue (clé retirée du catalogue) → repli lisible. */
const UNKNOWN: TimeCategory = {
  key: 'inconnu', label: 'Autre', emoji: '•', group: 'distraction',
  defaultKind: 'neutre', color: '#94A3B8', activities: [],
}

export function getCategory(key: string | null | undefined): TimeCategory {
  return (key && BY_KEY.get(key)) || UNKNOWN
}

export function categoriesOfGroup(group: CategoryGroup): TimeCategory[] {
  return TIME_CATEGORIES.filter(c => c.group === group)
}

export function isDistraction(key: string): boolean {
  return getCategory(key).group === 'distraction'
}

/**
 * Nature proposée pour un bloc, à partir de la catégorie ET du niveau
 * de contrôle. C'est la traduction de la règle « repos planifié ≠ temps
 * perdu » :
 *
 *   🎬 Film + 🟢 contrôlé        → repos planifié, pas une perte
 *   🎬 Film + 🟠 non planifié    → temps perdu
 *   📱 Instagram + 🟡 nécessaire → neutre (réponse à un client)
 *   n'importe quoi + 🔴 perte de contrôle → temps perdu
 *
 * L'interface ne fait que PROPOSER : la nature reste modifiable à la
 * main, parce que la personne est seule à savoir ce qui s'est passé.
 */
export function suggestKind(categoryKey: string, control: ControlLevel | null | undefined): TimeKind {
  const cat = getCategory(categoryKey)

  /* La perte de contrôle disqualifie tout, même une catégorie « utile » :
     trois heures de veille technique subies ne sont pas de la stratégie. */
  if (control === 'perte_controle') return 'perdu'

  if (cat.group !== 'distraction') {
    /* Un bloc de travail « non planifié » reste du travail — il n'est
       simplement pas stratégique : on le déclasse en neutre. */
    if (control === 'non_planifie' && cat.defaultKind === 'valeur') return 'neutre'
    return cat.defaultKind
  }

  switch (control) {
    case 'controle':   return 'repos'
    case 'necessaire': return 'neutre'
    case 'non_planifie': return 'perdu'
    default:           return cat.defaultKind
  }
}

/** Quick Log — enregistrement en un clic des sources les plus fréquentes. */
export const QUICK_LOG: { label: string; categoryKey: string; emoji: string }[] = [
  { label: 'Instagram',   categoryKey: 'social',       emoji: '📱' },
  { label: 'Film',        categoryKey: 'films',        emoji: '🎬' },
  { label: 'YouTube',     categoryKey: 'youtube',      emoji: '▶️' },
  { label: 'Navigation',  categoryKey: 'navigation',   emoji: '🌐' },
  { label: 'Jeu',         categoryKey: 'jeux',         emoji: '🎮' },
  { label: 'Distraction', categoryKey: 'temps_perdu',  emoji: '⏳' },
]
