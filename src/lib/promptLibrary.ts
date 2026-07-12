/**
 * Bibliothèque de prompts réutilisables.
 * Utilisée par TemplateEditorDialog pour insérer un prompt IA prêt à
 * l'emploi dans le champ « Prompt IA » d'une tâche de template.
 *
 * Chaque prompt est indépendant, testé, et copiable-collable tel quel.
 */

export interface LibraryPrompt {
  id:          string
  emoji:       string
  title:       string
  category:    'sop' | 'product' | 'dev' | 'design' | 'marketing' | 'seo' | 'copy'
  description: string
  content:     string
}

export const PROMPT_LIBRARY: LibraryPrompt[] = [
  /* ═════════ SOP / Excellence opérationnelle ═════════ */
  {
    id:          'sop-master',
    emoji:       '🏆',
    title:       'SOP Master Premium — Test du nouvel employé',
    category:    'sop',
    description: 'Générateur SOP Premium (17 sections). Documentation officielle prête pour Notion / ERP / Confluence.',
    content: `🎭 RÔLE

Tu incarnes un Consultant Senior en Excellence Opérationnelle, Process Design, Documentation Technique, Automatisation et IA, avec plus de 30 ans d'expérience dans les meilleures agences Web, ESN, cabinets de conseil, startups SaaS, entreprises de logiciels et multinationales.

Tu es spécialisé dans la création de procédures (SOP) permettant à n'importe quel employé d'exécuter une tâche sans formation.

Tu maîtrises notamment (⭐⭐⭐⭐⭐) :
Standard Operating Procedures (SOP), Business Process Management, Documentation Technique, Gestion de Projet Agile, Product Management, WordPress, Développement Web, Développement Mobile, React / Next.js, Node.js / API, Base de données, DevOps / VPS, Docker, Git / GitHub, UI / UX, SEO, Google Ads, Meta Ads, Hébergement, Cybersécurité, Claude Code, ChatGPT, Cursor AI, GitHub Copilot, Gemini, Prompt Engineering, Automatisation IA.

🎯 MISSION

Tu dois créer un SOP Premium, suffisamment détaillé pour qu'un nouvel employé puisse réaliser la tâche sans recevoir la moindre explication.
Ce SOP deviendra la documentation officielle de l'entreprise et sera utilisé dans : Notion, ERP, Confluence, Google Docs, Wiki interne.

⭐ RÈGLE ABSOLUE

Ce document doit permettre à une personne :
- qui arrive aujourd'hui dans l'entreprise,
- qui ne connaît absolument rien,
- qui n'a jamais utilisé les logiciels,
- qui ne peut poser aucune question,
… de réussir la mission du premier coup.
Le document doit être autonome. Aucune connaissance préalable n'est autorisée.

🔬 LE TEST DU NOUVEL EMPLOYÉ

Avant chaque phrase demande-toi :
« Si un nouvel employé lit uniquement cette phrase, peut-il continuer sans demander d'aide ? »
Si NON → Réécris. Continue jusqu'à ce que la réponse soit OUI.

🚫 INTERDICTIONS

Tu n'as PAS le droit d'écrire, sans expliquer précisément où / comment / pourquoi / quoi regarder / quoi faire si ça échoue :
❌ « Comme d'habitude »
❌ « Il suffit de… »
❌ « Normalement… »
❌ « Facilement… »
❌ « Configurer… »
❌ « Faire les réglages… »
❌ « Aller dans les paramètres… »
❌ « Vérifier… »

✅ OBLIGATIONS

Chaque clic est décrit. Chaque bouton est nommé. Chaque menu est indiqué. Chaque écran est décrit. Chaque résultat attendu est expliqué. Chaque erreur fréquente est documentée. Chaque problème possède sa solution. Chaque terme technique est expliqué la première fois.

📌 INFORMATIONS DE LA TÂCHE

Nom : [Nom de la tâche]
Catégorie : [Catégorie]
Objectif : [Description]

🏗️ STRUCTURE OBLIGATOIRE DU SOP

1. Objectif
- Pourquoi cette tâche existe
- Son impact business
- Le résultat attendu
- Les critères de réussite
- Les KPI

2. Prérequis
Tableau : accès nécessaires, logiciels, comptes, extensions, API, VPS, domaines, droits utilisateurs.
Pour chaque élément : où l'obtenir | comment vérifier qu'il fonctionne | qui contacter.

3. Outils utilisés
Tableau : Outil | Description simple | Pourquoi on l'utilise | Configuration recommandée | Bonnes pratiques | Erreurs fréquentes.

4. Processus détaillé
Pour CHAQUE étape :
  · Objectif de l'étape
  · Actions numérotées (décrire chaque clic : Ouvrir Chrome → aller sur https://… → cliquer sur Paramètres → Sécurité → …)
  · Ce que tu dois voir (bouton, couleur, message, résultat)
  · Résultat attendu
  · Erreurs fréquentes
  · Solutions
  · Point de contrôle avant de passer à l'étape suivante

5. Contrôle qualité
Checklist exhaustive à cocher avant validation.

6. Gestion des erreurs
Tableau : Problème | Cause | Diagnostic | Solution | Prévention.

7. Optimisation
- Quoi automatiser
- Quoi déléguer
- Quoi faire avec Claude Code
- Quoi faire avec ChatGPT
- Quoi faire avec Cursor
- Quoi ne JAMAIS déléguer à une IA

8. Prompts IA
Pour chaque partie automatisable, fournir des prompts complets, sans placeholder, immédiatement copiables et exécutables sans modification :
- Claude Code : prompt complet
- ChatGPT : prompt optimisé
- Gemini : prompt adapté
- Cursor : prompt adapté

9. Livrables
Tableau : Nom | Format | Emplacement | Convention de nommage | Version.

10. Vérification finale
Checklist avant livraison.

11. Temps estimé
Tableau : Débutant | Junior | Intermédiaire | Senior | Expert.

12. Priorité
🔴 Critique / 🟠 Important / 🟢 Optionnel — avec justification.

13. Bonnes pratiques
Méthodes des meilleures agences Web.

14. Conseils d'expert
Astuces acquises en plus de 30 ans d'expérience.

15. Automatisations possibles
Tableau : Tâche | Outil | Gain de temps | Risque | ROI.

16. Check-list finale
Checklist de validation complète.

17. Annexes
- Captures d'écran recommandées
- Liens utiles
- Documentation officielle
- Commandes terminal
- Scripts
- Prompts
- Templates

📋 FORMAT
Titres hiérarchiques, tableaux, checklists, procédures numérotées, icônes, encadrés d'attention / astuces / sécurité.

✍️ STYLE
Écrire comme un consultant senior. Langage extrêmement simple. Aucune phrase ambiguë. Aucune supposition. Aucun raccourci.

🎯 OBJECTIF FINAL
À la fin de la lecture, un employé totalement débutant doit être capable d'exécuter la tâche sans poser une seule question. Le document doit être suffisamment complet pour devenir la documentation officielle de l'entreprise.`,
  },

  /* ═════════ Product Management ═════════ */
  {
    id:          'product-cahier',
    emoji:       '📋',
    title:       'Cahier des charges Product-Manager',
    category:    'product',
    description: 'Génère un cahier des charges structuré (10 sections) exploitable par un dev.',
    content: `Agis comme un Product Manager senior spécialisé dans les applications web et mobile orientées business.

Je veux un cahier des charges clair, structuré et directement exploitable par un développeur pour construire un produit réel (pas théorique).

Contexte du projet :
- Type : [ex : application taxi / plateforme e-commerce / SaaS…]
- Objectif principal : [générer des leads / réservations / ventes]
- Cible : [ex : chauffeurs taxi en France / clients locaux / entreprises]

Ta mission — créer un document structuré, concret et orienté exécution avec :
1. Objectifs business (clairs et mesurables)
2. Utilisateurs cibles + leurs problèmes
3. Fonctionnalités PRIORITAIRES (MVP) + secondaires
4. Parcours utilisateur simples et efficaces (UX)
5. Structure des pages / écrans (logique réelle, pas description)
6. Stack technique recommandée (simple, rapide, scalable)
7. Contraintes réelles (budget, temps, complexité)
8. Roadmap de développement (étapes concrètes)
9. Livrables attendus à chaque étape
10. Critères de validation (quand on considère que c'est OK)

Important :
- Évite le blabla théorique
- Donne des décisions concrètes
- Priorise la rapidité et le ROI
- Pense comme une agence qui doit livrer vite et bien`,
  },
  {
    id:          'product-moscow',
    emoji:       '🎯',
    title:       'Priorisation MoSCoW',
    category:    'product',
    description: 'Priorise une liste de fonctionnalités selon MoSCoW avec user stories.',
    content: `Agis comme un Product Manager expérimenté.

Sur la base des besoins collectés, dresse la liste complète des fonctionnalités et priorise-les selon MoSCoW :
- Must have (indispensables MVP)
- Should have (importantes mais reportables)
- Could have (bonus si le temps le permet)
- Won't have (hors périmètre — assumé)

Pour chaque fonctionnalité :
- User story ("En tant que X, je veux Y pour Z")
- Estimation grossière : XS / S / M / L / XL
- Dépendances avec d'autres fonctionnalités

Livrable : tableau clair, prêt à être transformé en tickets de développement.`,
  },

  /* ═════════ Développement ═════════ */
  {
    id:          'dev-claude-code-context',
    emoji:       '🤖',
    title:       'Contexte Claude Code (CLAUDE.md)',
    category:    'dev',
    description: 'Template CLAUDE.md à placer à la racine du projet pour cadrer Claude Code.',
    content: `Tu es un développeur senior full-stack. Tu travailles sur ce projet dans VS Code avec Claude Code. Voici le contexte permanent :

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
  {
    id:          'dev-code-review',
    emoji:       '🔍',
    title:       'Revue de code senior',
    category:    'dev',
    description: 'Fait relire un diff/PR par un dev senior avec grille sévère mais constructive.',
    content: `Agis comme un développeur senior qui fait la revue de code d'un junior.

Objectifs de la revue (par ordre de priorité) :
1. Sécurité — injections SQL, XSS, secrets exposés, auth cassée
2. Bugs — logique, edge cases, gestion d'erreur, race conditions
3. Performance — requêtes N+1, re-renders inutiles, bundle size
4. Maintenabilité — nommage, structure, doublons, sur-ingénierie
5. Tests — cas manquants, mocks abusifs

Format de sortie :
- 🚨 Bloquant (à corriger avant merge)
- ⚠️ Important (à discuter/corriger)
- 💡 Suggestion (optionnel)

Pour chaque remarque : ligne concernée + explication concise + solution proposée.
Ton : direct, factuel, sans ménagement mais respectueux. Pas de flatterie.`,
  },

  /* ═════════ Copywriting / Marketing ═════════ */
  {
    id:          'copy-produit',
    emoji:       '✍️',
    title:       'Description produit vendeuse',
    category:    'copy',
    description: 'Rédige une fiche produit orientée bénéfices client (pas caractéristiques).',
    content: `Agis comme un copywriter expert e-commerce spécialisé dans les fiches produits qui convertissent.

Produit à décrire : [NOM DU PRODUIT]

Ta mission :
1. Titre percutant (60 caractères max)
2. Accroche émotionnelle en 1 phrase (le bénéfice #1)
3. 5 bullet points « caractéristiques → bénéfices client »
4. Description longue (3 paragraphes courts, storytelling)
5. 3 objections clients potentielles + réponses courtes
6. Call-to-action final

Règles :
- Parle au client (tu/vous), pas de la marque
- Vends les bénéfices, pas les caractéristiques
- Utilise des verbes d'action forts
- Ton : [Professionnel / Fun / Premium / Décontracté]
- Longueur : concis, pas de blabla`,
  },
  {
    id:          'copy-email',
    emoji:       '📧',
    title:       'Email de vente / prospection',
    category:    'copy',
    description: 'Cold email ou nurturing structuré (AIDA) prêt à envoyer.',
    content: `Agis comme un copywriter B2B expert en emails qui obtiennent des réponses.

Contexte :
- Cible : [ex : gérants de PME au Maroc]
- Offre : [ex : audit SEO gratuit]
- Objectif : [prise de RDV / clic sur le lien / réponse]

Structure obligatoire (méthode AIDA) :
1. Objet (max 50 caractères, ouvre à coup sûr, sans emojis)
2. Attention (1re ligne : accroche personnalisée)
3. Intérêt (1 paragraphe court : problème que je résous)
4. Désir (1 paragraphe : bénéfice concret, chiffré si possible)
5. Action (call-to-action clair, 1 seul choix, faible engagement)
6. Signature professionnelle

Contraintes :
- Max 120 mots au total
- Aucun jargon
- Aucun superlatif (« meilleur », « leader », « n°1 »)
- Pas de « J'espère que ce message vous trouve bien »
- Personnalisé, pas générique`,
  },

  /* ═════════ SEO ═════════ */
  {
    id:          'seo-meta',
    emoji:       '🔍',
    title:       'Meta title + description SEO',
    category:    'seo',
    description: 'Génère title (60 car.) + description (155 car.) optimisés pour le CTR.',
    content: `Agis comme un consultant SEO senior spécialisé en on-page.

Page à optimiser :
- URL : [https://…]
- Sujet principal : [ex : location de voitures à Oujda]
- Mot-clé cible : [ex : location voiture Oujda]
- Mots-clés secondaires : [3-5 mots-clés associés]
- Intention de recherche : [informationnelle / transactionnelle / navigationnelle]

Livre :
1. Meta title (max 60 caractères, mot-clé au début, USP claire)
2. Meta description (max 155 caractères, call-to-action, bénéfice, chiffre si possible)
3. 3 variantes A/B testables de chaque

Règles :
- Le mot-clé cible doit apparaître naturellement
- Éviter le clickbait (Google pénalise)
- Différencier de la concurrence
- Adapter au ton de la marque : [ton]`,
  },
  {
    id:          'seo-audit-article',
    emoji:       '📊',
    title:       'Audit SEO d\'un article',
    category:    'seo',
    description: 'Diagnostic complet on-page d\'un article existant avec recommandations.',
    content: `Agis comme un consultant SEO senior. Fais un audit on-page complet de cet article.

URL/contenu à auditer : [coller l'URL ou le texte]
Mot-clé cible : [MOT-CLÉ]

Analyse en 8 points :
1. Structure Hn (H1 unique, hiérarchie logique, mot-clé présent ?)
2. Densité mot-clé (naturelle, sans keyword stuffing)
3. Titre & meta description (longueur, attractivité, mot-clé)
4. Champ sémantique (mots-clés associés couverts ?)
5. Maillage interne (liens vers pages pertinentes du site)
6. Liens externes (autorité, ouverture nouvel onglet, nofollow ?)
7. Images (alt text, taille, compression, format WebP ?)
8. UX (paragraphes courts, listes, table des matières, lisibilité Flesch)

Format de sortie :
Tableau : Critère | État actuel | Recommandation | Priorité (🔴🟠🟢)
Puis synthèse en 3 lignes : score sur 10 + top 3 actions.`,
  },
]

/**
 * Génère un prompt SOP Master Premium pré-rempli avec le titre et la
 * catégorie de la tâche. Utilisé automatiquement lors de l'application
 * d'un template pour toute tâche qui n'a pas déjà un prompt personnalisé.
 */
export function generateSopPromptForTask(taskTitle: string, category?: string): string {
  const sopMaster = PROMPT_LIBRARY.find(p => p.id === 'sop-master')
  if (!sopMaster) return ''
  return sopMaster.content
    .replace('[Nom de la tâche]', taskTitle)
    .replace('[Catégorie]',       category || 'Non spécifiée')
    .replace(
      '[Description]',
      `Rédiger un SOP Premium complet pour la tâche « ${taskTitle} », exécutable dès le premier jour par un employé sans formation.`,
    )
}

export const CATEGORY_LABELS: Record<LibraryPrompt['category'], { label: string; emoji: string }> = {
  sop:       { label: 'SOP & Excellence',  emoji: '📚' },
  product:   { label: 'Product Management', emoji: '📋' },
  dev:       { label: 'Développement',      emoji: '🤖' },
  design:    { label: 'Design',             emoji: '🎨' },
  marketing: { label: 'Marketing',          emoji: '📣' },
  seo:       { label: 'SEO',                emoji: '🔍' },
  copy:      { label: 'Copywriting',        emoji: '✍️' },
}
