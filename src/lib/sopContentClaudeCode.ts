/**
 * SOPs Premium pour le template « App custom (Claude Code) » — 47 tâches.
 * Chaque SOP suit la structure : Délai · Canal · Règle absolue · Étapes détaillées ·
 * Checklist finale · Escalade. Format identique à SOP_DEPLOY_DOKPLOY.
 *
 * Chaque SOP est indexé par titre normalisé dans SOP_INDEX_CLAUDE.
 */
import type { SopBlock } from '@/hooks/useSops'

const h2 = (text: string): SopBlock => ({ type: 'heading2', text })
const h3 = (text: string): SopBlock => ({ type: 'heading3', text })
const p  = (text: string): SopBlock => ({ type: 'paragraph', text })
const li = (items: string[]): SopBlock => ({ type: 'list', items })
const num = (items: string[]): SopBlock => ({ type: 'numbered', items })
const check = (items: string[]): SopBlock => ({ type: 'checklist', items })
const code = (text: string): SopBlock => ({ type: 'code', text })
const table = (headers: string[], rows: string[][]): SopBlock => ({ type: 'table', table: { headers, rows } })
const tip = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'tip', title, text })
const warn = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'warning', title, text })
const info = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'info', title, text })
const success = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'success', title, text })
const danger = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'danger', title, text })
const div = (): SopBlock => ({ type: 'divider' })

/** Construit une étape avec ses 6 sous-blocs standard. */
function etape(title: string, opts: {
  objectif: string
  temps:    string
  ou:       string
  actions:  string[]
  code?:    string
  voir:     string
  erreurs?: string
  next?:    string
}): SopBlock[] {
  const out: SopBlock[] = [
    h3(title),
    p(`🎯 **Objectif** : ${opts.objectif}. ⏱️ **Temps** : ${opts.temps}.`),
    p(`🖥️ **Où** : ${opts.ou}`),
    num(opts.actions),
  ]
  if (opts.code) out.push(code(opts.code))
  out.push(success('✅ Vérification', opts.voir))
  if (opts.erreurs) out.push(warn('⚠️ Problèmes fréquents', opts.erreurs))
  if (opts.next) out.push(p(`➡️ **Étape suivante** : ${opts.next}.`))
  out.push(div())
  return out
}

/** Intro standard : 3 callouts + heading « Étapes ». */
function intro(role: string, delai: string, canal: string, regle: string): SopBlock[] {
  return [
    p(`**Rôle : ${role}.** SOP exécutable dès le premier jour, sans formation orale.`),
    info('⏱️ Délai', delai),
    info('📞 Canal', canal),
    danger('🚫 Règle absolue', regle),
    h2('Étapes — dans l\'ordre'),
  ]
}

function finalCheck(items: string[]): SopBlock[] {
  return [
    h2('Checklist de validation'),
    check(items),
  ]
}

function escalade(text: string): SopBlock {
  return danger('🚨 Escalade', text)
}

/* ═══════════════════════════════════════════════════════════════════
   CATÉGORIE 1️⃣ — ANALYSE DU PROJET
═══════════════════════════════════════════════════════════════════ */

const SOP_COLLECTE_BESOINS: SopBlock[] = [
  ...intro(
    'Product Manager senior',
    'Interview client 60-90 min + synthèse 2h',
    'Compte-rendu → Documentation du projet. Blocage → Projet → Discussion (Produit).',
    'Ne JAMAIS présumer les besoins. Toujours reformuler et faire valider par écrit.',
  ),
  ...etape('1. PRÉPARATION DE L\'INTERVIEW', {
    objectif: 'Arriver avec un guide et le contexte du client', temps: '30 min',
    ou: 'Projet → Documentation → template « Discovery Interview »',
    actions: [
      'Ouvrir Projet → Documentation → dupliquer le template "Discovery Interview"',
      'Renommer : `Discovery – [Nom client] – YYYY-MM-DD`',
      'Rechercher le client : site web, réseaux sociaux, LinkedIn, concurrents',
      'Noter 5 questions ciblées basées sur les indices trouvés',
      'Vérifier que le lien Meet/Zoom est actif 24h avant',
    ],
    voir: 'Document dans Projet → Documentation prêt avec 5 questions personnalisées + lien Meet testé.',
    erreurs: 'Pas de contexte → interview générique. Solution : 20 min de recherche minimum.',
    next: 'mener l\'interview',
  }),
  ...etape('2. INTERVIEW STRUCTURÉE', {
    objectif: 'Comprendre le problème, la cible et le résultat business attendu',
    temps: '60 à 90 min', ou: 'Visioconférence (lien dans Projet → Documentation) / Zoom (enregistrer avec accord)',
    actions: [
      'Icebreaker 2 min : mise en confiance',
      'Contexte (5 min) : "raconte-moi ton entreprise"',
      'Problème (10 min) : "qu\'est-ce qui ne fonctionne pas aujourd\'hui ?"',
      'Utilisateurs (10 min) : "qui utilise ? combien de fois par jour ?"',
      'Objectif business (10 min) : "comment sais-tu si c\'est un succès dans 6 mois ?"',
      'Périmètre MVP (15 min) : "si tu ne peux avoir que 3 fonctionnalités, lesquelles ?"',
      'Contraintes (5 min) : budget, délai, technos imposées',
      'Concurrents (5 min) : "montre-moi 2 exemples qui t\'inspirent"',
      'Prochaines étapes (3 min) : "je t\'envoie une synthèse sous 48h"',
    ],
    voir: 'Enregistrement + prise de notes complète dans Projet → Documentation. Client confirme les prochaines étapes.',
    erreurs: 'Client répond en solutions ("je veux un bouton bleu") → recentrer sur le problème.',
    next: 'synthèse écrite',
  }),
  ...etape('3. SYNTHÈSE 1 PAGE', {
    objectif: 'Produire un document validable en 5 min de lecture', temps: '2h',
    ou: 'Projet → Documentation → nouvelle page',
    actions: [
      'Rédiger : Problème · Cible · Objectif business · Fonctionnalités MVP · Fonctionnalités nice-to-have · Contraintes · Critères de succès mesurables',
      'Limiter à 1 page (max 500 mots)',
      'Faire relire par un pair (30 min)',
      'Envoyer au client par email avec bouton "Valider par retour de mail"',
      'Attendre validation écrite avant de passer à la suite',
    ],
    voir: 'Email client "OK on peut avancer" reçu et archivé dans le CRM.',
    erreurs: 'Client tarde → relance ferme après 3 jours. Silence 7 jours → réunion imposée.',
  }),
  ...finalCheck([
    'Interview enregistrée + notes complètes',
    'Synthèse 1 page rédigée',
    'Validation écrite du client obtenue',
    'Document archivé dans Documentation du projet + fiche Client',
    'Prochaine tâche assignée (définition des fonctionnalités)',
  ]),
  escalade('Client indécis > 7 jours OU changement de périmètre > 3× → escalader au chef de projet. Ne pas commencer le développement sans écrit signé.'),
]

const SOP_DEFINITION_FONCTIONNALITES: SopBlock[] = [
  ...intro(
    'Product Manager expérimenté (méthode MoSCoW)',
    '3-4 h de travail focus',
    'Liste → Documentation du projet. Décisions → chef de projet.',
    'Ne jamais accepter "toutes les fonctionnalités sont indispensables". Forcer la priorisation.',
  ),
  ...etape('1. LISTER TOUTES LES FONCTIONNALITÉS', {
    objectif: 'Brainstorm exhaustif sans jugement', temps: '1h',
    ou: 'Projet → Documentation → tableau Base de fonctionnalités',
    actions: [
      'Reprendre la synthèse discovery',
      'Créer un tableau dans Projet → Documentation : ID | Feature | User Story | Priorité (à définir) | Estimation',
      'Écrire chaque idée en user story : "En tant que [X], je veux [Y] pour [Z]"',
      'Ne rien filtrer à ce stade — capturer TOUT',
      'Cible : 30-60 features listées',
    ],
    voir: 'Tableau avec au moins 30 features, chacune en user story.',
    next: 'prioriser MoSCoW',
  }),
  ...etape('2. PRIORISATION MoSCoW', {
    objectif: 'Classer chaque feature : Must / Should / Could / Won\'t have',
    temps: '1h30', ou: 'Même tableau dans Projet → Documentation',
    actions: [
      'Pour chaque feature, poser 3 questions : "Si absent, l\'app ne peut pas fonctionner ?" (M) — "Sans, l\'app est utilisable mais moins efficace ?" (S) — "Bonus si le temps le permet ?" (C) — "Hors périmètre ?" (W)',
      'Estimer chaque Must + Should : XS (<2h) / S (<1j) / M (1-3j) / L (1sem) / XL (>1sem)',
      'Identifier dépendances entre features (ex : "profil" avant "commentaires")',
      'Total Must ne doit pas dépasser 60 % du budget alloué (garder marge)',
    ],
    voir: 'Chaque feature a une lettre M/S/C/W et une taille XS-XL.',
    erreurs: 'Trop de Must (> 60%) → arbitrage forcé avec le client.',
    next: 'validation client',
  }),
  ...etape('3. VALIDATION CLIENT + PROPOSITION MVP', {
    objectif: 'Faire signer le périmètre MVP', temps: '1h + réunion 30min',
    ou: 'Réunion visio avec le client',
    actions: [
      'Extraire les Must en un document PDF "Périmètre MVP proposé"',
      'Réunion visio : présenter la liste, expliquer les arbitrages',
      'Négocier : si le client insiste sur un Should, retirer un autre Should ou déplacer en V2',
      'Faire signer le PDF (DocuSign ou email de validation)',
      'Archiver dans Documentation du projet + fiche Client',
    ],
    voir: 'PDF signé par le client, archivé dans le dossier projet.',
  }),
  ...finalCheck([
    'Liste exhaustive des features',
    'Chaque feature en user story',
    'Priorité MoSCoW attribuée',
    'Estimation XS-XL',
    'MVP validé par écrit',
    'Périmètre archivé',
  ]),
  escalade('Client refuse toute priorisation → escalader. Ne pas commencer avec un périmètre flou.'),
]

const SOP_CAHIER_CHARGES: SopBlock[] = [
  ...intro(
    'Product Manager senior + Consultant technique',
    '1 journée complète',
    'Cahier des charges → Projet → Documentation (commentaires activés). Blocage → chef de projet.',
    'Ne jamais commencer le développement sans cahier des charges validé signé.',
  ),
  ...etape('1. UTILISER LE PROMPT CLAUDE CODE', {
    objectif: 'Générer un premier draft via IA en 15 min', temps: '30 min',
    ou: 'Claude Desktop ou claude.ai',
    actions: [
      'Ouvrir claude.ai',
      'Coller le prompt "Cahier des charges Product-Manager" (disponible dans la bibliothèque de prompts)',
      'Remplacer [placeholders] par les infos du client',
      'Générer → lire attentivement',
      'Sauvegarder le résultat brut dans Projet → Documentation',
    ],
    code: `# Contexte du projet
- Type : [application XYZ]
- Objectif : [générer des ventes / RDV / leads]
- Cible : [chauffeurs taxi / clients locaux / entreprises]

Ta mission : cahier des charges structuré avec :
1. Objectifs business (mesurables)
2. Utilisateurs cibles + problèmes
3. Fonctionnalités MVP + secondaires
4. Parcours utilisateur
5. Structure des pages
6. Stack technique
7. Contraintes
8. Roadmap
9. Livrables
10. Critères de validation`,
    voir: 'Document dans Projet → Documentation avec 10 sections remplies.',
    next: 'enrichir et personnaliser',
  }),
  ...etape('2. ENRICHIR AVEC LE CONTEXTE CLIENT', {
    objectif: 'Personnaliser le draft avec les détails métier', temps: '3h',
    ou: 'Projet → Documentation',
    actions: [
      'Créer un document dans Projet → Documentation "Cahier des charges — [Client]"',
      'Copier le draft Claude',
      'Enrichir chaque section avec des détails du discovery',
      'Ajouter les user stories du MoSCoW',
      'Ajouter la stack technique NG : React + Node + PostgreSQL + Dokploy',
      'Estimer la roadmap : Semaine 1-2 = démo, S3 = validation, S4-5 = BDD réelle, S6 = tests, S7 = prod',
    ],
    voir: 'Projet → Documentation 5-10 pages, sections complètes, roadmap chiffrée.',
    erreurs: 'Trop générique → chaque section doit contenir des références au projet spécifique.',
    next: 'validation interne puis client',
  }),
  ...etape('3. VALIDATION INTERNE + CLIENT', {
    objectif: 'Faire relire, corriger, signer', temps: '2h + réunion',
    ou: 'Meet avec lead dev + réunion client',
    actions: [
      'Partager le doc à Ibrahim (lead) pour relecture technique 24h',
      'Intégrer les corrections',
      'Réunion visio client : parcourir chapitre par chapitre',
      'Noter les remarques dans le doc en Track Changes',
      'V2 du doc → envoyer à signer via DocuSign',
      'Archiver la version signée en PDF dans Projet → Ressources / Docs',
    ],
    voir: 'PDF signé et archivé.',
  }),
  ...finalCheck([
    'Draft Claude généré',
    'Doc personnalisé 5-10 pages',
    'Validation technique par lead',
    'Validation client',
    'Signature électronique obtenue',
    'PDF archivé dans Drive',
  ]),
  escalade('Refus de signer → arrêter tout dev, escalader au chef de projet.'),
]

const SOP_PROMPT_CLAUDE_CODE: SopBlock[] = [
  ...intro(
    'Lead Developer maîtrisant Claude Code + prompt engineering',
    '1h de rédaction + tests',
    'CLAUDE.md à la racine du repo. Question → Projet → Discussion (Dev).',
    'Ne JAMAIS mettre de secrets ou API keys dans CLAUDE.md (c\'est versionné).',
  ),
  ...etape('1. CRÉER LE FICHIER CLAUDE.md', {
    objectif: 'Point d\'entrée du contexte pour toutes les sessions Claude Code',
    temps: '15 min', ou: 'VS Code → racine du projet',
    actions: [
      'Ouvrir VS Code sur le projet',
      'Créer le fichier `CLAUDE.md` à la racine',
      'Copier le template ci-dessous',
      'Adapter à la stack et aux conventions du projet',
    ],
    code: `# Contexte projet — [Nom du projet]

## Stack
- Frontend : React + Vite + TypeScript + Tailwind + shadcn/ui
- Backend  : Node.js + Express + TypeScript
- DB       : PostgreSQL avec migrations SQL (dossier supabase/migrations)
- Auth     : JWT + refresh tokens
- Deploy   : Dokploy sur VPS

## Conventions
- Composants React fonctionnels + hooks
- TypeScript strict, éviter \`any\`
- Nommage en français pour les libellés, anglais pour les identifiants
- Commentaires en français
- Une feature = 1 migration + 1 route + 1 composant + 1 test

## Fichiers à toujours lire avant toute modification
- CLAUDE.md (ce fichier)
- server/index.ts
- src/App.tsx
- src/lib/api.ts
- package.json

## Ne jamais faire sans validation
- Modifier server/middleware/auth.ts
- Modifier une migration existante (créer une nouvelle)
- Supprimer une route API
- Modifier package.json (sauf ajout de dépendance)`,
    voir: 'Fichier CLAUDE.md créé, commité dans Git.',
    next: 'tester avec une petite tâche',
  }),
  ...etape('2. TESTER LE PROMPT AVEC UNE TÂCHE SIMPLE', {
    objectif: 'Valider que Claude Code lit et respecte le contexte', temps: '30 min',
    ou: 'Terminal VS Code + Claude Code',
    actions: [
      'Lancer Claude Code : `claude` dans le terminal du projet',
      'Demander une tâche simple : "Ajoute un endpoint GET /api/health qui retourne { status: ok }"',
      'Observer si Claude lit bien CLAUDE.md avant de coder',
      'Vérifier que le code produit respecte les conventions',
      'Si non → ajuster CLAUDE.md, refaire test',
    ],
    voir: 'Claude cite CLAUDE.md dans sa réflexion et produit du code TypeScript strict.',
    erreurs: 'Claude ignore les conventions → CLAUDE.md pas assez explicite. Ajouter des exemples concrets.',
  }),
  ...etape('3. PARTAGER AVEC L\'ÉQUIPE', {
    objectif: 'Homogénéiser l\'usage de Claude Code', temps: '30 min',
    ou: 'Projet → Discussion (Dev)',
    actions: [
      'Commit CLAUDE.md sur main (via PR)',
      'Poster dans #dev : lien vers CLAUDE.md + résumé des conventions',
      'Organiser un onboarding 30 min sur Claude Code pour les nouveaux',
    ],
    voir: 'Message posté dans Projet → Discussion, équipe informée.',
  }),
  ...finalCheck([
    'CLAUDE.md créé et commit',
    'Aucun secret dans le fichier',
    'Test avec tâche simple concluant',
    'Équipe formée',
    'PR mergée',
  ]),
  escalade('Claude Code produit du code non conforme malgré CLAUDE.md → escalader à Ibrahim, retravailler ensemble le prompt.'),
]

/* ═══════════════════════════════════════════════════════════════════
   CATÉGORIE 2️⃣ — DÉVELOPPEMENT VERSION DÉMO
═══════════════════════════════════════════════════════════════════ */

const SOP_STRUCTURE_PROJET: SopBlock[] = [
  ...intro(
    'Lead Full-Stack (React + Node)',
    '2-3h', 'GitHub → repo créé. Bloc → Projet → Discussion (Dev).',
    'Ne JAMAIS commit dans main. Toujours passer par PR.',
  ),
  ...etape('1. CRÉER LE REPO GITHUB', {
    objectif: 'Repo privé prêt', temps: '15 min',
    ou: 'github.com/nextgital',
    actions: [
      'github.com/nextgital → New repository',
      'Nom : [projet-client] · Privé · Add README',
      'Ajouter .gitignore Node',
      'Ajouter LICENSE (MIT si accord client)',
      'Cloner en local : `git clone git@github.com:nextgital/[projet].git`',
    ],
    voir: 'Repo visible sur GitHub, clone réussi localement.',
    next: 'scaffolder Vite',
  }),
  ...etape('2. SCAFFOLDER FRONTEND', {
    objectif: 'React + Vite + TypeScript + Tailwind', temps: '30 min',
    ou: 'Terminal',
    actions: [
      '`npm create vite@latest . -- --template react-ts`',
      '`npm install`',
      '`npm install -D tailwindcss postcss autoprefixer` et `npx tailwindcss init -p`',
      'Configurer tailwind.config.js et src/index.css',
      'Créer src/components, src/pages, src/hooks, src/lib',
      '`npm run dev` → vérifier http://localhost:5173',
    ],
    voir: 'Page Vite React affichée en local avec styles Tailwind actifs.',
    next: 'scaffolder backend',
  }),
  ...etape('3. SCAFFOLDER BACKEND', {
    objectif: 'Express + TypeScript prêt', temps: '30 min', ou: 'Terminal',
    actions: [
      'mkdir server && cd server',
      '`npm init -y` puis `npm install express cors dotenv jsonwebtoken pg`',
      '`npm install -D typescript @types/node @types/express ts-node nodemon`',
      'Créer server/index.ts avec Express + endpoint /api/health',
      'tsconfig.json + script `dev`',
      '`npm run dev` → tester GET /api/health',
    ],
    voir: 'GET http://localhost:4000/api/health retourne {status:"ok"}.',
    next: 'commit initial',
  }),
  ...etape('4. COMMIT INITIAL + PROTECTION BRANCHE', {
    objectif: 'Repo propre + workflow sécurisé', temps: '15 min',
    ou: 'GitHub Settings + terminal',
    actions: [
      '`git add . && git commit -m "chore: initial scaffolding"`',
      '`git push origin main`',
      'GitHub → Settings → Branches → Add branch protection rule pour main',
      'Cocher : Require pull request before merging, Require review, Require status checks',
    ],
    voir: 'Branch main protégée dans Settings.',
  }),
  ...finalCheck([
    'Repo GitHub créé et cloné',
    'Frontend Vite React opérationnel',
    'Backend Express opérationnel',
    'Endpoint /api/health répond',
    'Commit initial pushé',
    'Branch main protégée',
    'README à jour',
  ]),
  escalade('Erreur permissions GitHub → contacter Ibrahim, ne pas essayer avec un compte perso.'),
]

const SOP_DEV_FRONTEND: SopBlock[] = [
  ...intro(
    'Lead Frontend React senior',
    '3-5 jours pour le squelette', 'PR → GitHub. Question UI → Figma. Bloc → Projet → Discussion (Front).',
    'Jamais de commit direct sur main. Chaque feature = 1 branche + 1 PR.',
  ),
  ...etape('1. ROUTING + LAYOUT', {
    objectif: 'Structure de navigation', temps: '4h',
    ou: 'src/App.tsx + src/components/layout',
    actions: [
      'npm install react-router-dom',
      'Créer AppLayout avec Sidebar + Content',
      'Définir les routes de base : /, /login, /dashboard, /:module',
      'Lazy load des pages avec React.lazy + Suspense',
      'Ajouter ErrorBoundary global',
    ],
    voir: 'Navigation fluide entre pages, sidebar visible.',
    next: 'design system',
  }),
  ...etape('2. DESIGN SYSTEM (shadcn/ui)', {
    objectif: 'Composants UI cohérents', temps: '3h', ou: 'src/components/ui',
    actions: [
      '`npx shadcn@latest init`',
      'Installer les composants clés : button, input, dialog, select, table, card, badge, dropdown-menu, toast',
      'Configurer le thème dans tailwind.config.js',
      'Créer un Storybook léger ou une page /demo listant tous les composants',
    ],
    voir: 'Tous les composants shadcn installés et documentés.',
    next: 'state management',
  }),
  ...etape('3. STATE + DATA FETCHING', {
    objectif: 'React Query + Zustand configurés', temps: '2h', ou: 'src/lib/queryClient.ts',
    actions: [
      '`npm install @tanstack/react-query`',
      'Créer QueryClient avec cache 5min par défaut',
      'Wrapper l\'app dans QueryClientProvider',
      'Créer src/lib/api.ts avec fetch wrapper (auth headers, baseURL)',
      'Créer premier hook : useMe() qui fetch /api/me',
    ],
    voir: 'Hook useMe() affiche les infos user dans le header.',
    next: 'pages métier',
  }),
  ...etape('4. PAGES MÉTIER MVP', {
    objectif: 'Créer les 3-5 pages du MVP', temps: '3-5 jours',
    ou: 'src/pages',
    actions: [
      'Pour chaque page MVP : créer un fichier Page.tsx',
      'Structure : Header + filters + Table/List + Dialog CRUD',
      'Utiliser BlockEditor si besoin de description riche',
      'Toast Sonner pour feedback utilisateur',
      'Responsive : tester sur mobile via DevTools',
    ],
    voir: 'Chaque page MVP navigable et responsive.',
  }),
  ...finalCheck([
    'Routing avec lazy load',
    'ErrorBoundary global',
    'Design system shadcn',
    'React Query configuré',
    'Toutes les pages MVP créées',
    'Responsive testé mobile + desktop',
    'Aucune erreur console',
    'Lint pass',
  ]),
  escalade('UI Figma manquant ou ambigu → réunion Design 30min avant de développer.'),
]

const SOP_DEV_BACKEND: SopBlock[] = [
  ...intro(
    'Lead Backend Node/Express senior',
    '3-5 jours', 'PR → GitHub. Bloc → Projet → Discussion (Back).',
    'Jamais d\'endpoint sans validation d\'input. Jamais de query SQL sans paramètres nommés.',
  ),
  ...etape('1. STRUCTURE + MIDDLEWARE GLOBAUX', {
    objectif: 'Squelette Express robuste', temps: '4h', ou: 'server/',
    actions: [
      'Installer helmet, cors, express-rate-limit, cookie-parser',
      'server/index.ts : app.use(helmet(), cors(), rateLimit())',
      'Créer server/middleware/auth.ts (vérif JWT)',
      'Créer server/middleware/errorHandler.ts',
      'Créer server/db/pool.ts (pg Pool)',
    ],
    voir: 'Serveur démarre sans erreur, GET /api/health OK.',
    next: 'routes CRUD',
  }),
  ...etape('2. ROUTES CRUD GÉNÉRIQUES', {
    objectif: 'Endpoints REST par entité', temps: '2 jours',
    ou: 'server/routes/',
    actions: [
      'Pour chaque table : GET, POST, PATCH, DELETE',
      'Utiliser un fichier crud.ts générique avec whitelist des tables',
      'Validation avec Zod ou express-validator',
      'Filtres par tenant_id (multi-tenancy)',
      'Pagination : ?limit, ?offset, ?orderBy',
    ],
    voir: 'curl POST/GET/PATCH/DELETE fonctionne pour toutes les tables.',
    next: 'endpoints spécifiques',
  }),
  ...etape('3. ENDPOINTS MÉTIER', {
    objectif: 'Routes business logic', temps: '3-5 jours', ou: 'server/routes/',
    actions: [
      'Pour chaque feature MVP : créer un fichier de routes dédié',
      'Ex : server/routes/auth.ts, /finance.ts, /projets.ts',
      'Composer avec les middlewares : requireAuth, rateLimit spécifique, RBAC',
      'Tests Postman pour chaque endpoint',
    ],
    voir: 'Collection Postman avec tous les endpoints verts.',
  }),
  ...finalCheck([
    'helmet + cors + rate-limit',
    'Middleware auth JWT',
    'Routes CRUD génériques',
    'Validation input systématique',
    'Multi-tenancy respecté',
    'Postman collection à jour',
    'Aucune erreur au démarrage',
  ]),
  escalade('Faille de sécurité identifiée → arrêter, escalader à Ibrahim.'),
]

const SOP_MOCK_DATA: SopBlock[] = [
  ...intro(
    'Développeur Full-Stack',
    '1 journée', 'Mock JSON → src/mocks/. Bloc → Projet → Discussion (Dev).',
    'Ne jamais mélanger mock et réel. Utiliser un flag NODE_ENV.',
  ),
  ...etape('1. CRÉER LES FICHIERS JSON', {
    objectif: 'Données réalistes pour chaque entité', temps: '3h',
    ou: 'src/mocks/',
    actions: [
      'Créer src/mocks/users.json, clients.json, produits.json…',
      'Générer 10-20 items par entité avec faker.js',
      'Respecter la structure attendue par les composants',
      'Ajouter des cas edge : nom long, email vide, date passée',
    ],
    voir: 'Chaque JSON contient 10-20 items valides et divers.',
    next: 'brancher au frontend',
  }),
  ...etape('2. BRANCHER AU FRONTEND', {
    objectif: 'Basculer entre mock et API réelle', temps: '2h',
    ou: 'src/lib/api.ts',
    actions: [
      'Ajouter USE_MOCK dans .env : true en démo, false en prod',
      'Dans api.ts : si USE_MOCK, retourner le JSON avec un delay 300ms (simuler réseau)',
      'Vérifier que toutes les pages MVP fonctionnent en mode mock',
    ],
    voir: 'Toutes les pages affichent les données mock, UI complète.',
    erreurs: 'Oubli de désactiver USE_MOCK en prod → catastrophe. Ajouter test dans CI.',
  }),
  ...finalCheck([
    'JSON créés par entité',
    'Données réalistes + edge cases',
    'Flag USE_MOCK dans .env',
    'Delay simulé pour UX',
    'Test que USE_MOCK=false désactive tout',
  ]),
  escalade('Données sensibles mockées (vrais emails, noms) → utiliser faker.js uniquement.'),
]

const SOP_AUTH_USERS: SopBlock[] = [
  ...intro(
    'Lead Auth & Security',
    '2-3 jours', 'Bug auth → immédiatement Projet → Discussion (Alerte).',
    'Mots de passe : bcrypt cost 12+. Jamais de log de mot de passe.',
  ),
  ...etape('1. TABLES + MIGRATION', {
    objectif: 'Schéma users + tenant_users', temps: '2h', ou: 'supabase/migrations/',
    actions: [
      'Créer 001_users.sql : id UUID, email UNIQUE, password_hash TEXT, name TEXT, is_active BOOLEAN, created_at TIMESTAMPTZ',
      'Créer 002_tenants.sql avec tenants + tenant_users (role admin/manager/…)',
      'psql "$DATABASE_URL" -f ces fichiers',
      'Vérifier les tables : \\dt',
    ],
    voir: '\\dt liste users, tenants, tenant_users.',
    next: 'endpoints register / login',
  }),
  ...etape('2. ENDPOINTS REGISTER + LOGIN', {
    objectif: 'Créer compte + JWT', temps: '4h', ou: 'server/routes/auth.ts',
    actions: [
      'POST /api/auth/register : validate → bcrypt.hash cost 12 → insert users',
      'POST /api/auth/login : bcrypt.compare → si OK, signer JWT (15min) + refresh (7j)',
      'Refresh token en httpOnly cookie',
      'GET /api/me : requireAuth → retourner user',
      'Tests Postman de chaque endpoint',
    ],
    voir: 'Register + Login retournent token + user.',
    erreurs: 'JWT expiration trop longue → risque. 15 min max pour access token.',
    next: 'frontend forms',
  }),
  ...etape('3. FRONTEND FORMULAIRES + FLOW', {
    objectif: 'Login/Register pages + gestion état', temps: '4h',
    ou: 'src/pages/Auth.tsx + src/contexts/AuthContext.tsx',
    actions: [
      'Page /auth avec 2 modes : Login / Register',
      'Zod validation côté client',
      'Sauvegarder token dans localStorage (ou secure cookie)',
      'ProtectedRoute qui redirige vers /auth si pas de token',
      'Auto-refresh du token 1min avant expiration',
    ],
    voir: 'Flow complet : register → login → dashboard → logout.',
  }),
  ...finalCheck([
    'Table users créée',
    'Bcrypt cost ≥ 12',
    'JWT 15min + refresh 7j',
    'httpOnly cookie pour refresh',
    'Rate-limit login (5/min)',
    'ProtectedRoute fonctionnel',
    'Test flow complet',
  ]),
  escalade('Faille auth suspectée → arrêter, escalader à Ibrahim immédiatement.'),
]

const SOP_RBAC: SopBlock[] = [
  ...intro(
    'Security Engineer',
    '1 journée', 'Bug permissions → Projet → Discussion (Alerte).',
    'RBAC toujours enforced côté serveur. Le frontend est un hint UX, pas la sécurité.',
  ),
  ...etape('1. MATRICE DES RÔLES', {
    objectif: 'Définir qui peut quoi', temps: '2h', ou: 'server/middleware/rbac.ts',
    actions: [
      'Lister les rôles : admin, manager, commercial, comptable, viewer',
      'Créer un tableau : table × action (view/create/edit/delete) × [rôles autorisés]',
      'Valider avec le chef de projet',
      'Documenter dans docs/rbac.md',
    ],
    code: `const TABLE_ACL = {
  clients: matrix(ALL, ['admin','manager','commercial'], …),
  factures: matrix(ALL, ['admin','manager','comptable'], …),
}`,
    voir: 'Matrice validée et documentée.',
    next: 'middleware',
  }),
  ...etape('2. MIDDLEWARE serverside', {
    objectif: 'Enforcement automatique', temps: '3h',
    ou: 'server/middleware/rbac.ts',
    actions: [
      'Créer tableRbac middleware qui lit table + action + role',
      'Retourner 403 si non autorisé',
      'Attacher sur toutes les routes /api/:table via router.use',
      'Ajouter tests unitaires par rôle',
    ],
    voir: 'Test viewer → GET OK, POST retourne 403.',
    next: 'frontend hide',
  }),
  ...etape('3. FRONTEND : MASQUER BOUTONS', {
    objectif: 'UX cohérente avec permissions', temps: '2h',
    ou: 'src/lib/permissions.ts + composants',
    actions: [
      'Créer usePermissions() hook qui retourne canDo(table, action)',
      'Dans chaque page : masquer boutons Créer/Modifier/Supprimer si !can',
      'Jamais se reposer là-dessus pour la sécurité',
    ],
    voir: 'Viewer ne voit pas les boutons d\'action.',
  }),
  ...finalCheck([
    'Matrice documentée',
    'Middleware serveur enforce',
    'Tests par rôle',
    'Frontend hint UX',
    'Documentation à jour',
  ]),
  escalade('Escalade de privilège détectée → immédiatement Ibrahim + audit sécurité.'),
]

const SOP_FICHIERS_MEDIA: SopBlock[] = [
  ...intro(
    'Lead Full-Stack',
    '1-2 jours', 'Bug upload → Projet → Discussion (Dev).',
    'Toujours valider mimetype ET taille avant stockage. Jamais de path traversal.',
  ),
  ...etape('1. STOCKAGE : DOKPLOY VOLUMES OU S3', {
    objectif: 'Décider et configurer', temps: '2h', ou: 'Dokploy → Volumes',
    actions: [
      'Décider : local (volume Dokploy) ou S3 (Wasabi/Backblaze/Scaleway)',
      'Si local : créer volume /uploads dans Dokploy',
      'Si S3 : créer bucket + IAM user avec s3:PutObject / s3:GetObject uniquement',
      'Stocker credentials dans Environment Dokploy',
    ],
    voir: 'Volume ou bucket créé et accessible.',
    next: 'endpoint upload',
  }),
  ...etape('2. ENDPOINT UPLOAD', {
    objectif: 'POST /api/upload avec validation', temps: '3h',
    ou: 'server/routes/upload.ts',
    actions: [
      'Installer multer',
      'Configurer fileFilter : accepter uniquement image/*, application/pdf',
      'Limite : 10 MB',
      'Générer nom aléatoire : `${uuid}-${Date.now()}.${ext}`',
      'Stocker path en DB dans une table files (id, url, size, mimetype, uploader_id)',
    ],
    voir: 'Upload fichier via Postman → URL retournée + row en DB.',
    erreurs: 'Filename XSS → toujours régénérer le nom.',
    next: 'frontend UI',
  }),
  ...etape('3. FRONTEND UPLOAD UI', {
    objectif: 'Drag-drop + preview', temps: '3h',
    ou: 'src/components/FileUpload.tsx',
    actions: [
      'Composant FileUpload avec drag-drop',
      'Preview image ou icône PDF',
      'Progress bar pendant upload',
      'Toast succès/erreur',
    ],
    voir: 'Drag-drop fonctionne, preview visible.',
  }),
  ...finalCheck([
    'Stockage configuré',
    'Endpoint sécurisé',
    'Validation mimetype + taille',
    'Nom fichier régénéré',
    'Row en DB',
    'UI drag-drop',
    'Progress bar',
  ]),
  escalade('Fichier suspect (malware) détecté → mise en quarantaine + admin averti.'),
]

const SOP_API_EXTERNES: SopBlock[] = [
  ...intro(
    'Lead Full-Stack + intégrations',
    'Variable (1h-3j selon API)', 'Bug → doc API officielle + Projet → Discussion.',
    'Jamais d\'API key en clair dans le code. Toujours process.env.',
  ),
  ...etape('1. INVENTAIRE + AUTHENTIFICATION', {
    objectif: 'Lister les API + obtenir les keys', temps: '2h', ou: 'Documentation du projet',
    actions: [
      'Lister toutes les API tierces : Stripe, Twilio, Resend, Google Maps, etc.',
      'Créer un compte pour chaque + noter les endpoints utilisés',
      'Générer les API keys en environnement Test d\'abord',
      'Stocker dans Environment Dokploy (jamais Git)',
    ],
    voir: 'Tableau Projet → Documentation avec API, endpoint, key location.',
    next: 'wrapper',
  }),
  ...etape('2. WRAPPERS TYPÉS', {
    objectif: '1 wrapper par API', temps: '2-4h par API',
    ou: 'server/services/',
    actions: [
      'Créer server/services/stripe.ts, twilio.ts, resend.ts',
      'Wrapper minimal : init client + méthodes typées',
      'Retry avec backoff exponentiel (max 3 tentatives)',
      'Timeout raisonnable (10s max)',
      'Log structuré avec masking des données sensibles',
    ],
    voir: 'chaque wrapper testé isolément (fichier test).',
    erreurs: 'Réponse HTML au lieu de JSON → l\'API a un problème. Ne pas retenter en boucle.',
  }),
  ...finalCheck([
    'API listées et documentées',
    'Keys en environnement uniquement',
    'Mode test avant prod',
    'Wrappers typés',
    'Retry + timeout',
    'Logs avec masking',
  ]),
  escalade('API 500 en continu → contact support de l\'API, ne pas retenter.'),
]

const SOP_TABLEAU_BORD: SopBlock[] = [
  ...intro(
    'Lead Product + Frontend',
    '2 jours', 'Design → Figma. Bug → Projet → Discussion (Front).',
    'Le dashboard doit charger en < 2s. Optimiser avec React Query cache.',
  ),
  ...etape('1. IDENTIFIER LES 5-7 KPI CLÉS', {
    objectif: 'Aligner avec les objectifs business du cahier des charges',
    temps: '2h', ou: 'Documentation du projet',
    actions: [
      'Reprendre les critères de succès du cahier des charges',
      'Choisir 5-7 métriques clés (pas plus)',
      'Ex : nombre de clients, CA mois, factures impayées, projets en cours',
      'Valider avec le chef de projet',
    ],
    voir: 'Liste 5-7 KPI validée.',
    next: 'endpoints',
  }),
  ...etape('2. ENDPOINTS D\'AGRÉGATION', {
    objectif: 'API rapides et cache', temps: '4h',
    ou: 'server/routes/dashboard.ts',
    actions: [
      'GET /api/dashboard/kpis retourne tous les KPI en 1 seule requête',
      'Requêtes SQL agrégées (COUNT, SUM, AVG)',
      'Cache en mémoire 60s (KPI peuvent avoir 1 min de retard)',
      'Filtres date : ?from=YYYY-MM-DD&to=…',
    ],
    voir: 'Endpoint retourne JSON en < 300ms.',
    next: 'frontend cards',
  }),
  ...etape('3. UI CARDS + GRAPHIQUES', {
    objectif: 'Dashboard visuel', temps: '1 jour', ou: 'src/pages/Dashboard.tsx',
    actions: [
      'Layout : grille 3-4 colonnes',
      'Cards KPI : icon + label + valeur + variation vs période précédente',
      'Graphiques : Recharts (LineChart, BarChart)',
      'Skeleton pendant loading',
      'Responsive : cards passent en 2 colonnes puis 1 sur mobile',
    ],
    voir: 'Dashboard charge en < 2s avec tous les KPI visibles.',
  }),
  ...finalCheck([
    'KPI définis et validés',
    'Endpoint 1 requête agrégée',
    'Cache 60s',
    'Skeleton loading',
    'Responsive',
    'Load < 2s',
  ]),
  escalade('Load > 5s malgré cache → escalader, optimisation SQL nécessaire.'),
]

const SOP_MODULES_METIER: SopBlock[] = [
  ...intro(
    'Développeur Full-Stack',
    '1-2 semaines total', 'PR par module. Bloc → Projet → Discussion (Dev).',
    'Chaque module = migration + route + hook + page. Pas de raccourci.',
  ),
  ...etape('1. LISTE PRIORISÉE DES MODULES', {
    objectif: 'Ordre d\'implémentation clair', temps: '1h',
    ou: 'Documentation du projet',
    actions: [
      'Reprendre les Must du MoSCoW',
      'Ordonner par dépendance (Clients avant Devis avant Factures)',
      'Assigner à chaque module un développeur + estimation',
      'Créer les issues GitHub correspondantes',
    ],
    voir: 'Kanban Projet → Tâches (ou GitHub côté dev) avec toutes les issues.',
    next: 'implémentation itérative',
  }),
  ...etape('2. IMPLÉMENTER MODULE PAR MODULE', {
    objectif: 'Livrer un module fonctionnel à la fois', temps: '1-3j par module',
    ou: 'Repo projet',
    actions: [
      'Créer une branche : feat/module-clients',
      'Migration SQL (nouvelle, jamais modifier l\'existant)',
      'Routes CRUD via crud.ts + endpoint(s) métier spécifique(s)',
      'Hook useClients() côté frontend',
      'Page /clients avec table + dialog CRUD',
      'Toast Sonner + validation Zod',
      'PR avec description : What, Why, How to test',
      'Merge après review',
    ],
    voir: 'Module utilisable end-to-end.',
    erreurs: 'Vouloir faire tous les modules en parallèle → conflits. 1 à 1.',
  }),
  ...finalCheck([
    'Modules listés et priorisés',
    '1 module = 1 branche = 1 PR',
    'Migrations en nouveaux fichiers',
    'Review avant merge',
    'Kanban à jour',
  ]),
  escalade('Retard > 30% sur estimation → re-estimer avec le chef de projet.'),
]

const SOP_RAPPORTS_EXPORTS: SopBlock[] = [
  ...intro(
    'Développeur Full-Stack + Data',
    '3-4 jours', 'Format libraries → jsPDF (PDF) / ExcelJS (Excel).',
    'Toujours filtrer par tenant_id AVANT l\'export. Jamais tout exporter sans filtre.',
  ),
  ...etape('1. IDENTIFIER LES EXPORTS ATTENDUS', {
    objectif: 'Liste priorisée par utilité', temps: '1h', ou: 'Projet → Documentation',
    actions: [
      'Interviewer le client : quels rapports imprime-t-il aujourd\'hui ?',
      'Prioriser : Devis PDF, Facture PDF, Rapport mensuel Excel, Export clients CSV',
      'Récupérer des exemples visuels (papier, ancien logiciel)',
    ],
    voir: 'Liste avec 4-6 exports validés.',
    next: 'PDF',
  }),
  ...etape('2. GÉNÉRATION PDF avec jsPDF', {
    objectif: 'PDF pixel-perfect côté client', temps: '1 jour par PDF',
    ou: 'src/lib/pdf/',
    actions: [
      '`npm install jspdf jspdf-autotable`',
      'Créer src/lib/pdf/facture.ts export generateFacturePdf(facture)',
      'Header : logo + coordonnées entreprise',
      'Contenu : autoTable pour lignes',
      'Footer : mentions légales + numérotation pages',
      'Test avec vraie facture',
    ],
    voir: 'PDF téléchargé et bien formaté.',
    next: 'Excel',
  }),
  ...etape('3. EXPORT EXCEL avec ExcelJS', {
    objectif: 'Fichier .xlsx propre', temps: '4h',
    ou: 'server/routes/exports.ts',
    actions: [
      '`npm install exceljs`',
      'Endpoint GET /api/export/clients.xlsx (côté serveur pour gros volumes)',
      'Créer workbook + worksheet + headers avec style',
      'Freeze row 1 + auto-filter',
      'Colonnes larges automatiquement (autoFit)',
      'Retourner en Content-Disposition: attachment',
    ],
    voir: 'Fichier .xlsx téléchargé, ouvert dans Excel sans erreur.',
  }),
  ...finalCheck([
    'Liste exports validée',
    'PDF pixel-perfect',
    'Excel bien formaté',
    'Filtrage tenant_id',
    'Test client réel',
  ]),
  escalade('Export > 10 000 lignes → streaming côté serveur, pas jsPDF.'),
]

const SOP_ENV_VARS: SopBlock[] = [
  ...intro(
    'Lead Backend + DevOps',
    '2h', 'Env vars → Dokploy Environment. NE PAS commit .env.',
    'RÈGLE ABSOLUE : jamais de secret dans Git. Toujours .env.local en local.',
  ),
  ...etape('1. INVENTAIRE + .env.example', {
    objectif: 'Documenter toutes les variables', temps: '1h', ou: 'racine du projet',
    actions: [
      'Créer .env.example avec TOUTES les variables, sans valeurs sensibles',
      'Grouper par domaine : # Database, # Auth, # APIs externes, # SMTP',
      'Commit .env.example dans Git',
      'Ajouter .env, .env.local, .env.production dans .gitignore',
    ],
    code: `# ── Database ──
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=[nom_db]
PG_USER=[user]
PG_PASSWORD=[password]

# ── Auth ──
JWT_SECRET=[générer via: openssl rand -hex 64]
JWT_REFRESH_SECRET=[différent du précédent]

# ── SMTP ──
RESEND_API_KEY=[re_xxx]
RESEND_FROM="Nom Client <noreply@monsite.ma>"

# ── APIs externes ──
STRIPE_SECRET=sk_test_xxx`,
    voir: '.env.example présent, commité, .env absent du Git.',
    next: 'local + production',
  }),
  ...etape('2. CONFIGURATION LOCAL + PROD', {
    objectif: 'Environnements séparés', temps: '1h', ou: 'Terminal + Dokploy',
    actions: [
      'Local : cp .env.example .env.local puis remplir',
      'Vérifier que .env.local est bien ignoré : `git status` ne le montre pas',
      'Prod : Dokploy → Service → Environment → coller les mêmes clés avec valeurs prod',
      'Utiliser des valeurs différentes en dev/prod (JWT_SECRET, DATABASE, etc.)',
    ],
    voir: 'Local charge .env.local, prod charge Dokploy Env.',
    erreurs: 'Même JWT_SECRET dev/prod → risque. Toujours différents.',
  }),
  ...finalCheck([
    '.env.example commité',
    '.env.* dans .gitignore',
    '.env.local rempli en dev',
    'Env vars en Dokploy pour prod',
    'Secrets différents dev vs prod',
    'Aucun secret en clair dans code',
  ]),
  escalade('Secret leaké dans Git (accidentel) → révoquer immédiatement + rotation.'),
]

/* ═══════════════════════════════════════════════════════════════════
   CATÉGORIE 3️⃣ — SÉCURITÉ
═══════════════════════════════════════════════════════════════════ */

const SOP_JWT: SopBlock[] = [
  ...intro(
    'Security Engineer',
    '4h', 'Alerte sécurité → Projet → Discussion (Alerte).',
    'RÈGLE : access token 15min max, refresh 7j max, refresh en httpOnly cookie uniquement.',
  ),
  ...etape('1. GÉNÉRER LES SECRETS', {
    objectif: 'Secrets forts, uniques', temps: '10 min', ou: 'Terminal',
    actions: [
      'Générer JWT_SECRET : `openssl rand -hex 64`',
      'Générer JWT_REFRESH_SECRET : `openssl rand -hex 64` (différent)',
      'Coller dans .env.local (dev) et Dokploy Environment (prod)',
    ],
    voir: '2 secrets de 128 caractères hex.',
    next: 'implémentation',
  }),
  ...etape('2. FONCTIONS SIGN / VERIFY', {
    objectif: 'Sécuriser création et validation', temps: '2h',
    ou: 'server/middleware/auth.ts',
    actions: [
      '`npm install jsonwebtoken @types/jsonwebtoken`',
      'signAccessToken(payload) → expire 15min',
      'signRefreshToken(payload) → expire 7j',
      'requireAuth middleware : lit header Authorization: Bearer',
      'jwt.verify avec try/catch, retourner 401 si token invalide/expiré',
    ],
    voir: 'Middleware bloque les requêtes sans token.',
    next: 'refresh flow',
  }),
  ...etape('3. FLOW DE REFRESH', {
    objectif: 'Renouveler sans re-login', temps: '2h',
    ou: 'server/routes/auth.ts + frontend',
    actions: [
      'POST /api/auth/refresh : lit refresh cookie → vérifie → émet nouveau access token',
      'Cookie httpOnly + Secure + SameSite=Lax',
      'Frontend : intercepteur qui appelle /refresh à 401 puis retry',
      'Backend : révocation via table refresh_tokens (blacklist logout)',
    ],
    voir: 'Access token expire à 15min, refresh automatique transparent.',
  }),
  ...finalCheck([
    'Secrets 128 chars uniques dev/prod',
    'Access 15min, refresh 7j',
    'httpOnly cookie',
    'Refresh flow transparent',
    'Blacklist logout fonctionne',
  ]),
  escalade('Compromission secret suspectée → rotation immédiate + invalidation de tous les tokens.'),
]

const SOP_VALIDATION_SANITIZE: SopBlock[] = [
  ...intro(
    'Security Engineer',
    '3h', 'Faille XSS/SQL → Projet → Discussion (Alerte).',
    'RÈGLE : valider TOUS les inputs. Jamais faire confiance au client.',
  ),
  ...etape('1. ZOD SCHEMAS PAR ENDPOINT', {
    objectif: 'Contrat de données strict', temps: '2h',
    ou: 'server/schemas/',
    actions: [
      '`npm install zod`',
      'Créer un schema Zod par endpoint POST/PATCH',
      'Middleware validateBody(schema) qui parse req.body',
      'Retourner 400 avec détail si invalide',
    ],
    code: `const CreateClientSchema = z.object({
  nom: z.string().min(1).max(200),
  email: z.string().email().optional(),
  telephone: z.string().regex(/^[+0-9 ]+$/).optional(),
})
router.post('/', validateBody(CreateClientSchema), async (req, res) => { … })`,
    voir: 'Requête POST avec email invalide retourne 400 avec message clair.',
    next: 'sanitize XSS',
  }),
  ...etape('2. SANITIZE ANTI-XSS', {
    objectif: 'Nettoyer avant stockage', temps: '1h',
    ou: 'server/middleware/security.ts',
    actions: [
      'Middleware sanitizeBody qui strip <script>, javascript:, on\\w+=',
      'Appliquer sur toutes les routes après le parse',
      'Frontend : jamais dangerouslySetInnerHTML sur input user',
    ],
    voir: 'Input <script>alert(1)</script> devient vide en DB.',
  }),
  ...finalCheck([
    'Zod schema par endpoint',
    'Validation systématique',
    'Sanitize XSS global',
    'Jamais dangerouslySetInnerHTML',
    'Test avec payloads malveillants',
  ]),
  escalade('XSS confirmé en prod → hotfix immédiat + audit.'),
]

const SOP_PROTECTION_ROUTES: SopBlock[] = [
  ...intro(
    'Security Engineer',
    '2h', 'Bug auth → Projet → Discussion (Alerte).',
    'Toute route non-publique = requireAuth. Aucune exception.',
  ),
  ...etape('1. IDENTIFIER ROUTES PUBLIQUES vs PRIVÉES', {
    objectif: 'Liste blanche stricte', temps: '30 min',
    ou: 'docs/routes-public.md',
    actions: [
      'Lister les routes publiques : /api/auth/login, /api/auth/register, /api/health, /api/public/*',
      'Toutes les autres = privées avec requireAuth',
      'Documenter dans le README',
    ],
    voir: 'Liste écrite, moins de 10 routes publiques.',
    next: 'appliquer middleware',
  }),
  ...etape('2. APPLIQUER requireAuth', {
    objectif: 'Middleware attaché', temps: '1h',
    ou: 'server/index.ts',
    actions: [
      'Chaque routeur privé : router.use(requireAuth)',
      'Vérifier avec curl chaque route publique et privée',
      'Ajouter tests d\'intégration pour non-authenticated',
    ],
    voir: 'curl sans token → 401 sur toutes les routes privées.',
  }),
  ...etape('3. RATE LIMIT DIFFÉRENCIÉ', {
    objectif: 'Freiner brute force', temps: '30 min',
    ou: 'server/middleware/security.ts',
    actions: [
      '`npm install express-rate-limit`',
      'Global : 300 req/15min',
      'Login : 5 req/min par IP',
      'Register : 3 req/heure par IP',
      'Passer keyGenerator custom si derrière proxy (X-Forwarded-For)',
    ],
    voir: '6e tentative de login en 1 min retourne 429.',
  }),
  ...finalCheck([
    'Routes publiques listées',
    'requireAuth partout ailleurs',
    'Rate-limit global + login',
    'Test brute force bloqué',
  ]),
  escalade('Brute force massif détecté → bloquer l\'IP + investigation.'),
]

const SOP_LOGS: SopBlock[] = [
  ...intro(
    'DevOps / Site Reliability',
    '3h', 'Logs → Dokploy → Logs tab. Alerte → Projet → Discussion.',
    'JAMAIS logger de mot de passe, token, ou donnée personnelle sensible.',
  ),
  ...etape('1. LOGGER STRUCTURÉ (pino ou winston)', {
    objectif: 'Format JSON parsable', temps: '1h',
    ou: 'server/lib/logger.ts',
    actions: [
      '`npm install pino pino-pretty`',
      'Créer logger.ts qui exporte un logger avec format JSON en prod, pretty en dev',
      'Niveaux : trace / debug / info / warn / error / fatal',
    ],
    voir: 'Log JSON en prod, coloré en dev.',
    next: 'events clés',
  }),
  ...etape('2. LOGGER LES EVENTS CLÉS', {
    objectif: 'Traçabilité sans bruit', temps: '2h',
    ou: 'server/routes/*.ts',
    actions: [
      'Auth : login OK, login FAIL, logout, refresh',
      'CRUD critique : create/update/delete sur factures, paiements, users',
      'Erreurs serveur (500) avec stack trace',
      'Requêtes API externes : call + response status',
      'Toujours inclure userId + tenantId dans le contexte',
    ],
    voir: 'Logs consultables filtrables par userId/action.',
    erreurs: 'Trop de logs debug en prod → augmente les coûts. Level info ou warn minimum en prod.',
  }),
  ...finalCheck([
    'Logger JSON en prod',
    'Events auth et CRUD critiques loggés',
    'Aucun secret dans les logs',
    'Level adapté à l\'environnement',
    'Logs accessibles depuis Dokploy',
  ]),
  escalade('Erreur récurrente inconnue → alerter dans Projet → Discussion + créer issue.'),
]

/* ═══════════════════════════════════════════════════════════════════
   CATÉGORIE 4️⃣ — DÉPLOIEMENT DÉMO
═══════════════════════════════════════════════════════════════════ */

const SOP_GIT_PUSH: SopBlock[] = [
  ...intro(
    'Lead Developer',
    '15 min', 'Bug push → Projet → Discussion (Dev).',
    'JAMAIS push --force sur main. JAMAIS commit direct sans PR (sauf main protégée).',
  ),
  ...etape('1. VÉRIFIER L\'ÉTAT', {
    objectif: 'Rien de sensible n\'est ajouté', temps: '5 min', ou: 'Terminal',
    actions: [
      '`git status` → vérifier les fichiers',
      '`git diff` → relire les changements',
      'Vérifier qu\'aucun .env ou secret n\'est ajouté',
    ],
    voir: 'Seuls les fichiers attendus sont modifiés.',
    next: 'commit + push',
  }),
  ...etape('2. COMMIT + PUSH', {
    objectif: 'Commit propre et pushé', temps: '5 min', ou: 'Terminal',
    actions: [
      'Créer une branche : `git checkout -b feat/nom-clair`',
      '`git add .` (attention aux secrets)',
      '`git commit -m "feat(module): description courte du changement"`',
      '`git push -u origin feat/nom-clair`',
      'Ouvrir la PR sur GitHub via le lien affiché',
    ],
    voir: 'Push réussi, PR créée.',
    erreurs: 'push refusé (protected branch) → passer par PR obligatoirement.',
  }),
  ...etape('3. PULL REQUEST', {
    objectif: 'Faire relire avant merge', temps: '5 min', ou: 'github.com',
    actions: [
      'Titre : convention conventional commits (feat/fix/chore/…)',
      'Description : What / Why / How to test',
      'Assigner un reviewer',
      'Attendre l\'approbation + status checks verts',
      'Merger via "Squash and merge"',
    ],
    voir: 'PR mergée, main à jour.',
  }),
  ...finalCheck([
    'Aucun secret commité',
    'Message clair',
    'PR créée',
    'Review obtenue',
    'Status checks verts',
    'Squash merge',
  ]),
  escalade('Push --force accidentel sur main → chercher le commit dans le reflog + escalader immédiatement.'),
]

const SOP_CONFIG_DOMAINE: SopBlock[] = [
  ...intro(
    'DevOps',
    '30-60 min (attendre propagation)', 'DNS → registrar du client. Alerte → Projet → Discussion (Infra).',
    'Toujours vérifier propagation avant d\'ajouter le domaine dans Dokploy.',
  ),
  ...etape('1. RÉCUPÉRER L\'IP DU VPS', {
    objectif: 'Adresse cible', temps: '5 min', ou: 'Dokploy → Server → Overview',
    actions: [
      'Dokploy → Server → copier l\'IP publique',
      'Vérifier : `ping <IP>` répond',
    ],
    voir: 'IP notée.',
    next: 'DNS registrar',
  }),
  ...etape('2. AJOUTER RECORD A DNS', {
    objectif: 'Pointer le domaine vers le VPS', temps: '10 min',
    ou: 'Panel du registrar (OVH, Namecheap, Cloudflare…)',
    actions: [
      'Se connecter au registrar avec compte client',
      'DNS Zone Editor',
      'Ajouter record A : @ → IP du VPS (TTL 3600)',
      'Ajouter record A : www → IP du VPS',
      'Sauvegarder',
    ],
    voir: 'Records apparaissent dans la liste.',
    erreurs: 'CDN Cloudflare actif → mettre en mode DNS only pour SSL Let\'s Encrypt.',
    next: 'attendre propagation',
  }),
  ...etape('3. VÉRIFIER PROPAGATION', {
    objectif: 'Attendre que le DNS soit visible mondialement', temps: '5-30 min',
    ou: 'Terminal + https://dnschecker.org',
    actions: [
      '`dig +short monsite.ma` → doit retourner l\'IP du VPS',
      'https://dnschecker.org → vérifier ≥ 80% des serveurs mondiaux',
      'Si non propagé, attendre 15 min et retester',
    ],
    voir: 'IP correcte sur ≥ 5 serveurs différents.',
    next: 'ajouter dans Dokploy (voir SOP SSL)',
  }),
  ...finalCheck([
    'IP VPS identifiée',
    'Records A ajoutés',
    'TTL raisonnable',
    'Propagation vérifiée',
    'CDN désactivé si applicable',
  ]),
  escalade('Propagation > 1h → contacter support registrar.'),
]

const SOP_BACKUPS: SopBlock[] = [
  ...intro(
    'DevOps / Site Reliability',
    '2h', 'Backup fail → alerte Projet → Discussion (Infra).',
    'BACKUP OR DIE. Sans backup testé restauré, l\'app n\'est PAS en prod.',
  ),
  ...etape('1. DÉCIDER LA STRATÉGIE', {
    objectif: 'Choix format + fréquence + rétention', temps: '30 min',
    ou: 'Documentation du projet',
    actions: [
      'Format : pg_dump SQL compressé (.sql.gz)',
      'Fréquence : quotidien à 3h du matin (creux d\'activité)',
      'Rétention : 7 quotidiens + 4 hebdomadaires + 3 mensuels',
      'Destination : S3 (Wasabi/Backblaze) offsite',
    ],
    voir: 'Stratégie documentée.',
    next: 'script backup',
  }),
  ...etape('2. SCRIPT + CRON', {
    objectif: 'Automatisation', temps: '1h',
    ou: 'VPS SSH ou Dokploy scheduled task',
    actions: [
      'Écrire script /usr/local/bin/backup-db.sh',
      'Contenu : pg_dump | gzip | aws s3 cp -',
      'Rotation : supprimer les backups > 90j en S3 via lifecycle policy',
      'Cron : 0 3 * * * /usr/local/bin/backup-db.sh',
      'Vérifier les logs après première exécution',
    ],
    code: `#!/bin/bash
DATE=$(date +%Y%m%d-%H%M)
pg_dump "$DATABASE_URL" | gzip | \\
  aws s3 cp - s3://backup-nextgital/[client]-$DATE.sql.gz \\
  --endpoint-url=https://s3.wasabisys.com
[ $? -eq 0 ] && echo "OK $DATE" >> /var/log/backup.log || \\
  curl -X POST $SLACK_WEBHOOK -d "{\"text\":\"🚨 Backup FAIL $DATE\"}"`,
    voir: 'Fichier apparaît dans le bucket S3.',
    next: 'test de restauration',
  }),
  ...etape('3. TEST DE RESTAURATION', {
    objectif: 'Confirmer que le backup est utilisable', temps: '30 min',
    ou: 'DB de staging',
    actions: [
      'Créer une DB vide de staging',
      'Récupérer le dernier backup S3',
      'gunzip + psql pour restaurer',
      'Vérifier que les tables + rows sont présentes',
      'Documenter la procédure',
    ],
    voir: 'DB restaurée identique à la source.',
    erreurs: 'Backup corrompu → jamais découvrir en prod. Test hebdomadaire.',
  }),
  ...finalCheck([
    'Stratégie 7/4/3 documentée',
    'Script fonctionnel',
    'Cron quotidien 3h',
    'S3 offsite avec lifecycle',
    'Alerte Projet → Discussion si échec',
    'Test de restauration effectué',
    'Doc procédure restaure',
  ]),
  escalade('Backup fail 2 nuits consécutives → intervention immédiate.'),
]

const SOP_MISE_EN_LIGNE_DEMO: SopBlock[] = [
  ...intro(
    'Lead Full-Stack + Chef de projet',
    '2h', 'Bug prod → Projet → Discussion (Alerte).',
    'Ne JAMAIS mettre en ligne sans smoke tests. Toujours annoncer au client.',
  ),
  ...etape('1. CHECK-LIST AVANT MISE EN LIGNE', {
    objectif: 'Rien d\'oublié', temps: '30 min', ou: 'Dokploy + navigateur',
    actions: [
      'Tous les tests locaux passent',
      'Env vars complètes en Dokploy',
      'DB migrations appliquées',
      'SSL 🟢 sur tous les domaines',
      'SMTP configuré et testé',
      'Backup fonctionnel',
    ],
    voir: 'Toutes les cases cochées.',
    next: 'déploiement',
  }),
  ...etape('2. DEPLOY + SMOKE TESTS', {
    objectif: 'Vérifier que tout fonctionne', temps: '1h',
    ou: 'Dokploy Deploy + navigateur incognito',
    actions: [
      'Dokploy → Deploy',
      'Suivre les logs en temps réel',
      'Attendre le passage en 🟢',
      'Test flow complet : accueil → login → CRUD → logout',
      'Tester en mobile + desktop',
      'Vérifier console : 0 erreur rouge',
    ],
    voir: 'Toutes les fonctionnalités testées OK.',
    next: 'annonce client',
  }),
  ...etape('3. ANNONCE + ACCÈS CLIENT', {
    objectif: 'Communiquer à l\'équipe et au client', temps: '30 min',
    ou: 'Projet → Discussion + Email',
    actions: [
      'Créer un compte "démo" pour le client (permissions manager)',
      'Envoyer email : URL + identifiants + 5 features clés à tester',
      'Fixer réunion de démo dans 48h',
      'Projet → Discussion (Général) : annonce que la démo est en ligne',
    ],
    voir: 'Email envoyé, RDV pris.',
  }),
  ...finalCheck([
    'Check-list pré-déploiement complète',
    'Deploy 🟢',
    'Smoke tests passés',
    'Compte démo créé',
    'Email envoyé',
    'RDV démo fixé',
  ]),
  escalade('Bug bloquant après déploiement → rollback immédiat (voir SOP rollback).'),
]

/* ═══════════════════════════════════════════════════════════════════
   CATÉGORIE 5️⃣ — VALIDATION CLIENT
═══════════════════════════════════════════════════════════════════ */

const SOP_PRESENTATION_DEMO: SopBlock[] = [
  ...intro(
    'Chef de projet + Product Manager',
    '60-90 min (préparation 2h + réunion 1h)',
    'Réunion → Visioconférence enregistrée (lien archivé dans Projet → Documentation). Notes → Projet → Documentation.',
    'Ne JAMAIS présenter sans avoir testé le flow complet 30 min avant.',
  ),
  ...etape('1. PRÉPARER LE SCRIPT DE DÉMO', {
    objectif: 'Storytelling clair', temps: '1h', ou: 'Projet → Documentation',
    actions: [
      'Écrire un script en 5 actes : Contexte → Problème → Solution → Démonstration → Prochaines étapes',
      'Préparer les données de démo cohérentes (nommer les clients avec des noms réels-crédibles)',
      'Anticiper les 5 questions probables du client + réponses',
      'Répéter à voix haute une fois',
    ],
    voir: 'Script écrit + répété.',
    next: 'réunion démo',
  }),
  ...etape('2. RÉUNION DE DÉMONSTRATION', {
    objectif: 'Impressionner + faire tester', temps: '1h', ou: 'Visioconférence (lien dans Projet → Documentation)',
    actions: [
      'Test technique 10 min avant : caméra, son, écran',
      'Rappeler le contexte et les objectifs business',
      'Démo en live avec partage d\'écran',
      'Inviter le client à prendre la main en fin de démo',
      'Enregistrer la réunion',
      'Prendre des notes sur les réactions',
    ],
    voir: 'Client engagé, questions constructives.',
    erreurs: 'Bug pendant la démo → rester calme, expliquer, prendre note.',
  }),
  ...etape('3. SUIVI IMMÉDIAT', {
    objectif: 'Ne pas perdre le momentum', temps: '30 min',
    ou: 'Email + Projet → Documentation',
    actions: [
      'Envoyer email dans les 2h après la réunion :',
      '  - Récap des 3 points clés discutés',
      '  - Lien vers la démo pour tester',
      '  - Formulaire pour remonter les remarques',
      '  - Date limite pour retour (7 jours)',
      'Archiver la vidéo dans Projet → Ressources / Réunions',
    ],
    voir: 'Email envoyé, vidéo archivée.',
  }),
  ...finalCheck([
    'Script écrit et répété',
    'Test technique OK',
    'Réunion enregistrée',
    'Notes prises',
    'Email de suivi envoyé sous 2h',
    'Vidéo archivée',
  ]),
  escalade('Client insatisfait ou hostile → escalader au chef de projet, réunion de crise 24h.'),
]

const SOP_COLLECTE_REMARQUES: SopBlock[] = [
  ...intro(
    'Chef de projet',
    '2h par tour de feedback', 'Remarques → Projet → Documentation. Blocage → Projet → Discussion (Produit).',
    'Chaque remarque = 1 ticket. Aucune remarque non capturée.',
  ),
  ...etape('1. CENTRALISER LES CANAUX', {
    objectif: 'Ne rien perdre', temps: '30 min', ou: 'Projet → Documentation',
    actions: [
      'Créer un tableau dans Projet → Documentation "Feedback démo [Client]"',
      'Colonnes : ID | Remarque | Source (email/appel/meet) | Type (bug/UX/feature) | Priorité (must/should/nice)',
      'Reprendre toutes les remarques : emails, notes de réunion, messages',
      'Attribuer un ID unique à chacune',
    ],
    voir: 'Tableau à jour avec toutes les remarques.',
    next: 'clarifier',
  }),
  ...etape('2. CLARIFIER LES REMARQUES AMBIGUES', {
    objectif: 'Comprendre le vrai besoin', temps: '1h',
    ou: 'Appel / email au client',
    actions: [
      'Pour chaque remarque floue, poser 3 questions : Quel est le problème ? Dans quelle situation ? Quel serait l\'idéal ?',
      'Reformuler par écrit et faire valider',
      'Ne jamais interpréter → toujours faire confirmer',
    ],
    voir: 'Aucune remarque ambiguë.',
    next: 'catégoriser',
  }),
  ...etape('3. CATÉGORISER ET PRIORISER', {
    objectif: 'Décider quoi corriger dans cette itération', temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Type : Bug / UX / Feature manquante / Autre',
      'Priorité : Must (à corriger avant validation) / Should (V1.1) / Nice (V2)',
      'Estimation grossière',
      'Envoyer le tableau au client + attendre validation ("on corrige ça avant la validation finale")',
    ],
    voir: 'Tableau catégorisé validé par le client.',
  }),
  ...finalCheck([
    'Toutes les remarques centralisées',
    'Ambiguïtés levées',
    'Catégorisées + priorisées',
    'Validation client sur le périmètre',
  ]),
  escalade('Nouvelles features majeures hors périmètre → escalader (avenant contractuel).'),
]

const SOP_CORRECTIONS: SopBlock[] = [
  ...intro(
    'Développeur Full-Stack',
    'Variable selon volume', 'PR par correction. Bug → Projet → Discussion (Dev).',
    'Chaque correction = 1 branche + 1 PR + tests. Pas de fix "vite fait" sur main.',
  ),
  ...etape('1. PLANIFIER LE SPRINT CORRECTIF', {
    objectif: 'Ordre optimal', temps: '30 min',
    ou: 'Projet → Tâches (ou GitHub Issues côté dev)',
    actions: [
      'Reprendre le tableau Projet → Documentation des remarques Must',
      'Créer une issue GitHub par correction',
      'Assigner et estimer',
      'Grouper les corrections proches (économie de temps)',
    ],
    voir: 'Toutes les corrections en tickets GitHub.',
    next: 'exécuter',
  }),
  ...etape('2. EXÉCUTER CORRECTION PAR CORRECTION', {
    objectif: 'Ne rien casser', temps: 'variable',
    ou: 'Repo projet',
    actions: [
      'Branche fix/issue-XX',
      'Reproduire le bug avec un test si applicable',
      'Corriger',
      'Vérifier localement + tests',
      'PR + review + merge',
      'Fermer l\'issue avec commentaire',
    ],
    voir: 'Chaque correction fusionnée + issue fermée.',
    erreurs: 'Fix qui casse ailleurs → rollback et re-analyse.',
    next: 'déployer sur démo',
  }),
  ...etape('3. DÉPLOYER + NOTIFIER LE CLIENT', {
    objectif: 'Client peut retester', temps: '30 min',
    ou: 'Dokploy + email',
    actions: [
      'Deploy sur la démo',
      'Smoke tests',
      'Email au client : liste des corrections déployées',
      'Demander une deuxième passe de validation',
    ],
    voir: 'Client informé, corrections en ligne.',
  }),
  ...finalCheck([
    'Toutes les corrections Must faites',
    'Chaque correction en PR mergée',
    'Aucune régression',
    'Déployé sur démo',
    'Client notifié',
  ]),
  escalade('Bug qui revient malgré correction → réunion technique dédiée.'),
]

const SOP_VALIDATION_FINALE_CLIENT: SopBlock[] = [
  ...intro(
    'Chef de projet',
    '30 min', 'Signature → email + PDF. Blocage → Projet → Discussion (Alerte).',
    'AUCUN passage en BDD réelle sans validation écrite du client.',
  ),
  ...etape('1. PROPOSER LE PV DE VALIDATION', {
    objectif: 'Doc formel à signer', temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Rédiger un procès-verbal de validation démo :',
      '  - Périmètre initial',
      '  - Fonctionnalités livrées',
      '  - Remarques traitées',
      '  - Remarques reportées (avec accord)',
      '  - Prochaines étapes',
      'Exporter en PDF',
    ],
    voir: 'PV PDF prêt.',
    next: 'signature',
  }),
  ...etape('2. FAIRE SIGNER', {
    objectif: 'Trace juridique', temps: '5-15 min',
    ou: 'DocuSign / email',
    actions: [
      'Envoyer via DocuSign (traçable) OU email formel',
      'Client répond "je valide" par écrit',
      'Sauvegarder la réponse dans Projet → Ressources / Contrats',
    ],
    voir: 'PV signé archivé.',
    erreurs: 'Signature verbale au téléphone → refuser, exiger écrit.',
    next: 'lancer phase BDD réelle',
  }),
  ...finalCheck([
    'PV rédigé',
    'PV envoyé pour signature',
    'Réponse écrite du client obtenue',
    'PV signé archivé',
    'Prochaine phase lancée',
  ]),
  escalade('Client refuse de valider → réunion de crise avec Ibrahim, ne pas avancer.'),
]

/* ═══════════════════════════════════════════════════════════════════
   CATÉGORIE 6️⃣ — BASE DE DONNÉES RÉELLE
═══════════════════════════════════════════════════════════════════ */

const SOP_CONCEPTION_BDD: SopBlock[] = [
  ...intro(
    'Data Architect senior',
    '1-2 jours', 'Schema → dbdiagram.io. Validation → lead dev.',
    'Toujours normaliser (3NF minimum). Toujours FK explicites. Toujours index sur les colonnes de jointure.',
  ),
  ...etape('1. LISTER LES ENTITÉS', {
    objectif: 'Vue d\'ensemble', temps: '1h', ou: 'Projet → Documentation',
    actions: [
      'Reprendre les modules validés (clients, produits, factures…)',
      'Pour chaque entité, lister les attributs',
      'Marquer les relations : 1-1, 1-N, N-N',
    ],
    voir: 'Liste des entités + relations.',
    next: 'schéma visuel',
  }),
  ...etape('2. SCHÉMA VISUEL avec dbdiagram.io', {
    objectif: 'Diagramme validable', temps: '2h',
    ou: 'https://dbdiagram.io',
    actions: [
      'Créer un compte dbdiagram.io',
      'Écrire le DSL : Table users { id uuid pk … } Ref: … }',
      'Exporter en PNG et SQL',
      'Faire relire par un pair + le chef de projet',
      'Archiver dans Projet → Documentation',
    ],
    voir: 'Diagramme validé et archivé.',
    next: 'contraintes',
  }),
  ...etape('3. CONTRAINTES + INDEX', {
    objectif: 'Performance et intégrité', temps: '2h', ou: 'dbdiagram.io + SQL',
    actions: [
      'FK avec ON DELETE (CASCADE / SET NULL selon logique)',
      'UNIQUE sur email, code produit, etc.',
      'NOT NULL sur colonnes essentielles',
      'CHECK constraints pour valeurs bornées',
      'Index sur toutes les FK + colonnes de recherche fréquente',
      'Index composite pour requêtes multi-critères',
    ],
    voir: 'Chaque table a ses contraintes et index documentés.',
  }),
  ...finalCheck([
    'Toutes les entités listées',
    'Relations claires',
    'Diagramme visuel validé',
    'FK + UNIQUE + NOT NULL + CHECK',
    'Index sur FK + colonnes de recherche',
    'Doc archivée',
  ]),
  escalade('Schema complexe (> 30 tables) → réunion design avec Ibrahim.'),
]

const SOP_CREATION_BDD: SopBlock[] = [
  ...intro(
    'DevOps / DB Admin',
    '30 min', 'Bug → Projet → Discussion (Infra).',
    'JAMAIS de mot de passe faible. TOUJOURS backup avant toute opération dangereuse.',
  ),
  ...etape('1. PROVISIONNER LE SERVICE PostgreSQL DANS Dokploy', {
    objectif: 'DB isolée créée', temps: '15 min', ou: 'Dokploy',
    actions: [
      'Dokploy → projet → Create Service → PostgreSQL',
      'Nom : [projet]-db',
      'Version : 15',
      'User : [projet]_api',
      'Password : générer 32 chars aléatoires',
      'Database : [projet]_prod',
      'Deploy',
      'Copier les credentials dans 1Password immédiatement',
    ],
    voir: 'Service DB 🟢 dans Dokploy.',
    next: 'test connexion',
  }),
  ...etape('2. TESTER LA CONNEXION', {
    objectif: 'Confirmer accès', temps: '10 min', ou: 'Terminal du service',
    actions: [
      'Dans Dokploy → service DB → Terminal',
      '`psql -U [projet]_api -d [projet]_prod`',
      'Taper `\\dt` (aucune table normal)',
      'Taper `\\q` pour quitter',
    ],
    voir: 'Connexion réussie, prompt psql.',
    erreurs: 'password authentication failed → refaire copie propre du mdp.',
    next: 'ajouter à l\'API',
  }),
  ...etape('3. CONFIGURER L\'API POUR CETTE DB', {
    objectif: 'API peut se connecter', temps: '5 min', ou: 'Dokploy Environment',
    actions: [
      'Récupérer Internal Host de la DB',
      'Environment du service API : PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD',
      'Save + Deploy l\'API',
      'Test : GET /api/health répond',
    ],
    voir: 'API redémarrée, endpoint health OK.',
  }),
  ...finalCheck([
    'Service DB provisionné',
    'Credentials en 1Password',
    'Connexion psql testée',
    'API configurée + déployée',
    'Health check OK',
  ]),
  escalade('Impossible de se connecter → escalader à Ibrahim, ne pas persister.'),
]

const SOP_MIGRATIONS: SopBlock[] = [
  ...intro(
    'Backend Developer',
    'Variable', 'PR par migration. Blocage → Projet → Discussion (Dev).',
    'JAMAIS modifier une migration existante en prod. Toujours en créer une nouvelle.',
  ),
  ...etape('1. STRUCTURE DES FICHIERS', {
    objectif: 'Convention claire', temps: '10 min',
    ou: 'supabase/migrations/',
    actions: [
      'Créer supabase/migrations/ à la racine',
      'Convention : NNN_description_courte.sql (ex : 001_users_table.sql)',
      'NNN sur 3 chiffres pour tri correct',
      'Commit le dossier vide avec .gitkeep',
    ],
    voir: 'Dossier créé + convention documentée.',
    next: 'écrire la 1re migration',
  }),
  ...etape('2. ÉCRIRE UNE MIGRATION', {
    objectif: 'Migration idempotente et sûre', temps: '30 min par migration',
    ou: 'VS Code + fichier .sql',
    actions: [
      'Fichier 001_users_table.sql (par exemple)',
      'Toujours CREATE TABLE IF NOT EXISTS ou CREATE INDEX IF NOT EXISTS',
      'Pas de suppression brutale (utiliser des migrations d\'invalidation)',
      'Commentaire en tête : rôle, auteur, date',
    ],
    code: `-- 001_users_table.sql
-- Crée la table users + index email
-- Auteur : [X] · Date : YYYY-MM-DD

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
    voir: 'Fichier .sql prêt.',
    next: 'appliquer',
  }),
  ...etape('3. APPLIQUER LES MIGRATIONS', {
    objectif: 'DB en sync avec le code', temps: '5 min',
    ou: 'Terminal du service API',
    actions: [
      'Dokploy → service API → Terminal',
      '`for f in $(ls /app/supabase/migrations/*.sql | sort); do psql "$DATABASE_URL" -f "$f"; done`',
      'Vérifier avec `psql "$DATABASE_URL" -c "\\dt"`',
    ],
    voir: 'Toutes les tables créées.',
    erreurs: 'Migration échoue → CORRIGER + créer NEW migration, jamais éditer l\'existant.',
  }),
  ...finalCheck([
    'Structure migrations/ créée',
    'Convention NNN respectée',
    'IF NOT EXISTS partout',
    'Chaque migration commentée',
    'Application testée',
  ]),
  escalade('Migration prod échoue → rollback DB depuis dernier backup.'),
]

const SOP_INTEGRATION_BDD_CODE: SopBlock[] = [
  ...intro(
    'Backend Developer',
    '2-3 jours', 'Bug → Projet → Discussion (Dev).',
    'JAMAIS de SQL en clair concaténé. TOUJOURS query paramétrée.',
  ),
  ...etape('1. POOL DE CONNEXION', {
    objectif: 'Réutilisation efficace', temps: '30 min',
    ou: 'server/db/pool.ts',
    actions: [
      '`npm install pg`',
      'Créer Pool avec max: 20, idleTimeoutMillis: 30000',
      'Wrapper helper query(sql, params) qui log en debug',
      'Wrapper transaction(callback) pour BEGIN/COMMIT/ROLLBACK',
    ],
    voir: 'Fichier pool.ts + query.ts.',
    next: 'remplacer mocks',
  }),
  ...etape('2. REMPLACER LES MOCK PAR VRAIES QUERIES', {
    objectif: 'Endpoints utilisent la DB', temps: '2 jours',
    ou: 'server/routes/',
    actions: [
      'Pour chaque endpoint, remplacer const data = mockJson par await query("SELECT …")',
      'Passer les params via $1, $2… JAMAIS de template string',
      'Tester chaque endpoint après remplacement',
      'Retirer les imports de mocks une fois tout OK',
    ],
    code: `// AVANT (mock)
const clients = clientsMock

// APRÈS (DB)
const clients = await query(
  'SELECT * FROM clients WHERE tenant_id = $1 ORDER BY created_at DESC',
  [req.user.tenantId]
)`,
    voir: 'Toutes les routes utilisent la DB.',
    erreurs: 'Concaténation SQL → risque injection. TOUJOURS $1 $2.',
  }),
  ...finalCheck([
    'Pool configuré',
    'Query paramétrée partout',
    'Transactions pour opérations multiples',
    'Mock complètement retirés',
    'Tests d\'intégration passent',
  ]),
  escalade('SQL injection détectée en audit → hotfix + audit complet.'),
]

const SOP_REMPLACEMENT_MOCK: SopBlock[] = [
  ...intro(
    'Backend Developer',
    '1 journée', 'Bug → Projet → Discussion (Dev).',
    'Toute donnée mock doit disparaître. USE_MOCK=false partout.',
  ),
  ...etape('1. RECHERCHER LES DERNIERS APPELS MOCK', {
    objectif: 'Ne rien laisser', temps: '1h', ou: 'VS Code Search',
    actions: [
      '`grep -r "mock" src/ server/`',
      '`grep -r "USE_MOCK" src/ server/`',
      'Lister tous les endroits + valider avec le dev',
    ],
    voir: 'Liste exhaustive.',
    next: 'remplacer',
  }),
  ...etape('2. REMPLACER + SUPPRIMER', {
    objectif: 'Code propre', temps: '4h', ou: 'src/ + server/',
    actions: [
      'Pour chaque occurence : remplacer par vraie query',
      'Supprimer les fichiers mock/*.json une fois tous utilisés',
      'Retirer le flag USE_MOCK du code (mais garder .env.example)',
      'Vérifier avec ESLint que rien de mort',
    ],
    voir: 'Aucun import de mock, aucun flag USE_MOCK dans code.',
  }),
  ...etape('3. TESTS COMPLETS', {
    objectif: 'App marche 100% avec DB', temps: '3h',
    ou: 'App locale + prod',
    actions: [
      'Rebuild : `npm run build` en local',
      'Test flow complet toutes les pages',
      'Aucune erreur console',
      'Vérifier les temps de réponse (< 500ms sur endpoints simples)',
    ],
    voir: 'App fonctionne parfaitement sans mock.',
  }),
  ...finalCheck([
    'Aucun import mock',
    'Aucun flag USE_MOCK actif',
    'Fichiers mock/ supprimés',
    'Build sans erreur',
    'Tests end-to-end passent',
  ]),
  escalade('Régressions détectées → bloquer la mise en prod jusqu\'à fix.'),
]

/* ═══════════════════════════════════════════════════════════════════
   CATÉGORIE 7️⃣ — TESTS
═══════════════════════════════════════════════════════════════════ */

const SOP_VERIFICATION_FONCTIONNELLE: SopBlock[] = [
  ...intro(
    'QA Engineer',
    '1 journée', 'Bug → Projet → Discussion (QA).',
    'Test avec des vraies données, pas seulement les cas heureux.',
  ),
  ...etape('1. PLAN DE TESTS', {
    objectif: 'Couverture systématique', temps: '2h', ou: 'Projet → Documentation',
    actions: [
      'Reprendre les user stories du MoSCoW',
      'Pour chaque : lister le happy path + 3 cas d\'erreur + 2 edge cases',
      'Créer tableau Projet → Documentation : ID | Feature | Étapes | Résultat attendu | Status',
    ],
    voir: 'Plan de tests exhaustif.',
    next: 'exécuter',
  }),
  ...etape('2. EXÉCUTION MANUELLE', {
    objectif: 'Confirmer chaque cas', temps: '4h', ou: 'App déployée',
    actions: [
      'Pour chaque test : exécuter, capture d\'écran si bug',
      'Marquer OK / KO / BLOQUÉ',
      'Ouvrir un ticket GitHub par bug',
    ],
    voir: 'Tableau à jour, tickets créés.',
  }),
  ...etape('3. RAPPORT', {
    objectif: 'Synthèse pour l\'équipe', temps: '1h', ou: 'Projet → Documentation',
    actions: [
      'Nombre de tests OK / KO / bloquants',
      'Liste des bugs par sévérité',
      'Estimation de temps pour corriger',
      'Feu vert / rouge pour la suite',
    ],
    voir: 'Rapport envoyé à l\'équipe.',
  }),
  ...finalCheck([
    'Plan de tests écrit',
    'Tous les tests exécutés',
    'Bugs en tickets',
    'Rapport synthétique',
  ]),
  escalade('Bugs bloquants > 5 → réunion de crise.'),
]

const SOP_TESTS_BACKEND: SopBlock[] = [
  ...intro(
    'Backend QA',
    '2 jours', 'Bug → Projet → Discussion (Back).',
    'Chaque endpoint = 1 test minimum. Tester les 401/403/404/500.',
  ),
  ...etape('1. SETUP VITEST + SUPERTEST', {
    objectif: 'Environnement de test', temps: '1h',
    ou: 'server/',
    actions: [
      '`npm install -D vitest supertest`',
      'Créer server/tests/ avec un setup DB de test',
      'Ajouter script "test" dans package.json',
    ],
    voir: '`npm test` retourne "no tests found".',
    next: 'écrire les tests',
  }),
  ...etape('2. TESTS PAR ENDPOINT', {
    objectif: 'Couverture > 60%', temps: '1.5 jour',
    ou: 'server/tests/*.test.ts',
    actions: [
      'Pour chaque route : happy path + 401 (non auth) + 403 (mauvais rôle) + 400 (input invalide) + 404 (id inconnu)',
      'Setup/teardown de DB entre tests',
      'Fixtures : users test, tenant test',
      'Assertions strictes sur status + body',
    ],
    voir: '`npm test` passe tous les tests.',
    erreurs: 'Tests flaky (parfois échec) → isoler la cause (état partagé ?).',
  }),
  ...etape('3. COVERAGE + CI', {
    objectif: 'Automatiser', temps: '1h',
    ou: 'GitHub Actions',
    actions: [
      '`vitest --coverage`',
      'Créer .github/workflows/test.yml qui lance sur chaque PR',
      'Bloquer merge si tests fail',
    ],
    voir: 'Coverage > 60%, CI verte sur les PR.',
  }),
  ...finalCheck([
    'Vitest + supertest configurés',
    'Test par endpoint',
    'Couverture > 60%',
    'CI bloque les PR fail',
    'Fixtures propres',
  ]),
  escalade('Tests régressent en cascade → isolation d\'un fichier avant merge suivant.'),
]

const SOP_TESTS_FRONTEND: SopBlock[] = [
  ...intro(
    'Frontend QA',
    '1-2 jours', 'Bug UI → Projet → Discussion (Front).',
    'Focus sur les parcours utilisateur clés, pas sur chaque bouton.',
  ),
  ...etape('1. PLAYWRIGHT SETUP', {
    objectif: 'E2E fiable', temps: '2h', ou: 'tests/',
    actions: [
      '`npm install -D @playwright/test`',
      '`npx playwright install`',
      'Créer tests/e2e/ avec un fichier .spec.ts par flow',
      'Configurer playwright.config.ts',
    ],
    voir: 'npx playwright test lance et échoue proprement.',
    next: 'flows critiques',
  }),
  ...etape('2. FLOWS CRITIQUES', {
    objectif: '5-8 tests essentiels', temps: '1 jour',
    ou: 'tests/e2e/',
    actions: [
      'Test 1 : Login → Dashboard',
      'Test 2 : Créer un client',
      'Test 3 : Créer un devis pour ce client',
      'Test 4 : Convertir en facture',
      'Test 5 : Marquer facture payée',
      'Chaque test : setup données → actions → assertions visuelles + réseau',
    ],
    voir: 'Tous les tests passent.',
  }),
  ...etape('3. CI + RÉGRESSION VISUELLE', {
    objectif: 'Auto sur PR', temps: '1h', ou: 'GitHub Actions',
    actions: [
      'Ajouter step Playwright dans le workflow',
      'Optionnel : screenshots pour régression visuelle',
      'Upload artifacts si échec',
    ],
    voir: 'CI complète tourne sur chaque PR.',
  }),
  ...finalCheck([
    'Playwright installé',
    'Flows critiques couverts',
    'CI intègre les tests E2E',
    'Screenshots pour debug',
  ]),
  escalade('Test flaky récurrent → désactiver + créer issue, ne pas tolérer.'),
]

const SOP_CORRECTION_BUGS: SopBlock[] = [
  ...intro(
    'Développeur assigné',
    'Variable', 'Bug bloquant → Projet → Discussion (Alerte).',
    'Reproduire avant de corriger. Ajouter un test qui aurait attrapé le bug.',
  ),
  ...etape('1. REPRODUIRE', {
    objectif: 'Comprendre le bug', temps: '15-45 min',
    ou: 'Local + logs',
    actions: [
      'Lire le ticket',
      'Reproduire pas à pas en local',
      'Si non reproductible : demander plus d\'infos (env, données, screenshots)',
      'Écrire les étapes exactes dans le ticket',
    ],
    voir: 'Bug reproduit + documenté.',
    next: 'corriger',
  }),
  ...etape('2. CORRIGER + AJOUTER TEST', {
    objectif: 'Éviter régression', temps: 'variable',
    ou: 'Repo',
    actions: [
      'Branche fix/nom-court',
      'Écrire d\'abord un test qui échoue (démontre le bug)',
      'Corriger le code jusqu\'à ce que le test passe',
      'Vérifier que rien d\'autre ne casse',
      'PR',
    ],
    voir: 'Test rouge → vert, PR ouverte.',
    erreurs: 'Correction qui casse autre chose → analyser, rollback si besoin.',
  }),
  ...finalCheck([
    'Bug reproduit',
    'Test qui échoue écrit',
    'Correction appliquée',
    'Test passe',
    'Aucune régression',
    'PR mergée',
    'Ticket fermé',
  ]),
  escalade('Bug de sécurité → arrêter tout, escalader Ibrahim, hotfix.'),
]

const SOP_OPTIMISATION_PERF: SopBlock[] = [
  ...intro(
    'Performance Engineer',
    '2 jours', 'Metric → Lighthouse + Postman.',
    'Mesurer AVANT d\'optimiser. Sinon on optimise à l\'aveugle.',
  ),
  ...etape('1. MESURER LE POINT DE DÉPART', {
    objectif: 'Baseline', temps: '2h',
    ou: 'Chrome DevTools + Postman',
    actions: [
      'Lighthouse audit sur les 5 pages clés',
      'Postman : temps de réponse moyen sur 10 requêtes des endpoints principaux',
      'Noter dans Projet → Documentation',
    ],
    voir: 'Tableau avec scores actuels.',
    next: 'optimiser frontend',
  }),
  ...etape('2. OPTIMISATIONS FRONTEND', {
    objectif: 'Lighthouse ≥ 85', temps: '4h',
    ou: 'src/',
    actions: [
      'Lazy load des routes lourdes',
      'Images : formats modernes (WebP/AVIF), lazy loading, srcset',
      'Bundler : rollup-plugin-visualizer pour identifier gros modules',
      'Code splitting par route',
      'Cache HTTP correct sur les assets statiques',
    ],
    voir: 'Lighthouse ≥ 85 sur toutes les pages testées.',
    next: 'optimiser backend',
  }),
  ...etape('3. OPTIMISATIONS BACKEND', {
    objectif: '< 200ms sur endpoints critiques', temps: '4h',
    ou: 'server/',
    actions: [
      'Ajouter EXPLAIN ANALYZE sur les slow queries (> 100ms)',
      'Créer index composites si manquants',
      'Éliminer N+1 (batch load des relations)',
      'Cache mémoire pour données rarement modifiées (5 min)',
      'Compression gzip via Nginx',
    ],
    voir: 'Endpoints critiques < 200ms.',
  }),
  ...finalCheck([
    'Baseline mesurée',
    'Frontend Lighthouse ≥ 85',
    'Backend endpoints < 200ms',
    'Cache en place',
    'Compression active',
    'Bundler analysé',
  ]),
  escalade('Performance ne s\'améliore pas malgré optimisations → audit externe.'),
]

const SOP_TESTS_RESPONSIVE: SopBlock[] = [
  ...intro(
    'Frontend Developer',
    '4h', 'Bug UI mobile → Projet → Discussion (Front).',
    'Toujours tester sur vrais appareils, pas juste DevTools.',
  ),
  ...etape('1. MATRICE DE TESTS', {
    objectif: 'Couvrir les écrans usuels', temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Mobile : iPhone SE (petit), iPhone 15, Samsung',
      'Tablette : iPad, iPad Pro',
      'Desktop : 1280×720, 1920×1080',
      'Orientation portrait + paysage sur tablette/mobile',
    ],
    voir: 'Tableau des écrans à tester.',
    next: 'tester',
  }),
  ...etape('2. TESTER + CAPTURER', {
    objectif: 'Screenshots preuves', temps: '3h',
    ou: 'Chrome DevTools + vrais appareils',
    actions: [
      'DevTools : tester chaque page dans chaque résolution',
      'Vérifier : pas de scroll horizontal, textes lisibles, boutons cliquables',
      'Sur vrai iPhone : tester scroll fluide, formulaires, keyboard',
      'Capture d\'écran des cas problématiques',
    ],
    voir: 'Screenshots archivés dans Drive.',
    erreurs: 'Fonctionne sur DevTools mais pas sur vrai mobile → tester Safari iOS avec ngrok.',
  }),
  ...etape('3. CORRIGER', {
    objectif: 'Toutes les résolutions OK', temps: 'variable',
    ou: 'src/',
    actions: [
      'Utiliser Tailwind responsive (sm:/md:/lg:/xl:)',
      'Grille flex-wrap sur cards',
      'Font-size en clamp() pour scaling',
      'Menus mobile en Sheet plutôt que Sidebar',
      'Tester à nouveau après corrections',
    ],
    voir: 'Toutes les pages OK sur toutes les résolutions.',
  }),
  ...finalCheck([
    'Matrice de tests définie',
    'Tests DevTools + vrais appareils',
    'Screenshots des cas problématiques',
    'Corrections faites',
    'Retest OK',
  ]),
  escalade('Bug spécifique iOS → tester avec Safari iOS distant, potentiellement webkit issue.'),
]

const SOP_VALIDATION_FINALE_TEST: SopBlock[] = [
  ...intro(
    'Lead QA + Chef de projet',
    '4h', 'Go/No-Go → chef de projet.',
    'Aucune mise en prod sans PV signé de validation finale.',
  ),
  ...etape('1. CHECKLIST GLOBALE', {
    objectif: 'Rien oublié', temps: '2h',
    ou: 'Projet → Documentation',
    actions: [
      'Vérifier : tous les MoSCoW Must implémentés',
      'Tous les bugs critiques fermés',
      'Backend + Frontend tests passent',
      'Backup fonctionnel',
      'SSL 🟢',
      'Env vars complets',
      'Documentation à jour',
      'Compte de démo fonctionne',
    ],
    voir: 'Checklist 100% cochée.',
    next: 'PV',
  }),
  ...etape('2. PV DE VALIDATION INTERNE', {
    objectif: 'Trace formelle', temps: '1h',
    ou: 'Projet → Documentation',
    actions: [
      'Rédiger PV : périmètre livré, tests passés, bugs restants (aucun bloquant), formations faites',
      'Signature du chef de projet + lead dev',
      'Archiver dans Drive',
    ],
    voir: 'PV signé.',
    next: 'go/no-go',
  }),
  ...etape('3. GO/NO-GO MEETING', {
    objectif: 'Décision collective', temps: '1h',
    ou: 'Meet équipe',
    actions: [
      'Réunion 30 min avec Ibrahim, chef projet, lead dev, QA',
      'Présenter la checklist et le PV',
      'Chacun donne son GO ou NO-GO argumenté',
      'Si tous les GO : autoriser la mise en prod',
      'Sinon : lister les blocages + refaire une session dans 48h',
    ],
    voir: 'Décision documentée.',
  }),
  ...finalCheck([
    'Checklist globale 100%',
    'PV interne signé',
    'Réunion GO/NO-GO tenue',
    'Décision consignée',
  ]),
  escalade('NO-GO répété malgré corrections → revoir périmètre avec le client.'),
]

/* ═══════════════════════════════════════════════════════════════════
   CATÉGORIE 8️⃣ — MISE EN PRODUCTION
═══════════════════════════════════════════════════════════════════ */

const SOP_GIT_PUSH_MAIN: SopBlock[] = [
  ...intro(
    'Lead Developer',
    '15 min', 'Bug → Projet → Discussion (Dev).',
    'Le push sur main = trigger deploy production. Impact réel utilisateurs.',
  ),
  ...etape('1. VÉRIFIER LA BRANCHE MAIN', {
    objectif: 'S\'assurer que la version testée est bien celle mergée',
    temps: '10 min', ou: 'GitHub',
    actions: [
      'GitHub → repo → main → vérifier le dernier commit',
      'C\'est bien le résultat des PR validées ? OUI = OK',
      'Vérifier que la CI est verte sur main',
      'Vérifier qu\'aucun revert n\'est nécessaire',
    ],
    voir: 'CI verte, dernier commit conforme.',
    erreurs: 'Rouge sur main → corriger AVANT de mettre en prod.',
    next: 'trigger deploy',
  }),
  ...etape('2. TRIGGER DEPLOY', {
    objectif: 'Lancer le pipeline', temps: '5 min',
    ou: 'Dokploy webhook OU push manuel',
    actions: [
      'Si webhook configuré : le merge de la PR a déclenché automatiquement',
      'Sinon : Dokploy → service prod → Deploy',
      'Suivre les logs Dokploy en temps réel',
    ],
    voir: 'Build en cours dans Dokploy.',
  }),
  ...finalCheck([
    'main verte',
    'Dernier commit vérifié',
    'Deploy déclenché',
    'Logs suivis',
  ]),
  escalade('Push malencontreux sur main → hotfix immédiat OU revert commit.'),
]

const SOP_DEPLOY_FINAL: SopBlock[] = [
  ...intro(
    'Lead Full-Stack + DevOps',
    '30-60 min', 'Bug prod → immédiatement Projet → Discussion (Alerte).',
    'MISE EN PROD = ÉVÉNEMENT SÉRIEUX. Toujours 2 personnes. Toujours checklist. Toujours rollback plan prêt.',
  ),
  ...etape('1. PRE-DEPLOY CHECKLIST', {
    objectif: 'Rien oublié', temps: '15 min',
    ou: 'Projet → Documentation + Dokploy',
    actions: [
      'Backup DB fraîchement fait (< 1h)',
      'Env vars prod à jour',
      'Migrations testées en staging',
      'Feature flags configurés si applicable',
      'Rollback plan écrit et compris',
      'Réunion 5 min avec l\'équipe : « on met en prod, restez sur Projet → Discussion »',
    ],
    voir: 'Toutes les cases cochées.',
    next: 'deploy',
  }),
  ...etape('2. DEPLOY + MONITORING', {
    objectif: 'Livrer sans casse', temps: '15-30 min',
    ou: 'Dokploy',
    actions: [
      'Deploy',
      'Suivre les logs en LIVE, ne pas quitter l\'écran',
      'Après passage 🟢 : vérifier /api/health',
      'Vérifier l\'accueil charge',
      'Login test',
      'CRUD test rapide',
    ],
    voir: 'App accessible et fonctionnelle.',
    erreurs: 'Erreurs 500 en cascade → ROLLBACK immédiat.',
    next: 'annonce interne',
  }),
  ...etape('3. ANNONCE + MONITORING J+1', {
    objectif: 'Surveiller les premières heures',
    temps: '30 min + surveillance',
    ou: 'Projet → Discussion + Dokploy logs',
    actions: [
      'Projet → Discussion (Général) : « Version prod déployée. Signaler tout comportement anormal. »',
      'Vérifier les logs toutes les 30 min pendant 4h',
      'Vérifier les uptime metrics',
      'Rester joignable 24h après le deploy',
    ],
    voir: 'Aucune anomalie dans les premières heures.',
  }),
  ...finalCheck([
    'Backup < 1h avant',
    'Env vars complètes',
    'Migrations sûres',
    'Rollback plan prêt',
    'Deploy 🟢',
    'Smoke tests OK',
    'Annonce Projet → Discussion',
    'Surveillance 4h',
  ]),
  escalade('Erreur bloquante → ROLLBACK en < 15 min. Ne PAS tenter de fix en prod.'),
]

const SOP_SMOKE_TESTS_PROD: SopBlock[] = [
  ...intro(
    'QA + Chef de projet',
    '30 min', 'Bug → Projet → Discussion (Alerte).',
    'Tester en conditions réelles avec un compte test.',
  ),
  ...etape('1. FLOW UTILISATEUR CRITIQUE', {
    objectif: 'Valider parcours end-to-end', temps: '20 min',
    ou: 'App prod avec compte test',
    actions: [
      'Se logger avec compte test',
      'Créer un client → vérifier apparition',
      'Créer un devis → PDF téléchargeable',
      'Convertir en facture',
      'Marquer facture payée',
      'Envoyer une notification email → vérifier réception',
      'Se logger avec compte admin → dashboard KPI corrects',
    ],
    voir: 'Flow complet OK sans erreur.',
    next: 'monitoring',
  }),
  ...etape('2. CONTRÔLES TECHNIQUES', {
    objectif: 'Infra saine', temps: '10 min',
    ou: 'Dokploy + navigateur',
    actions: [
      'GET /api/health OK',
      'Cadenas 🔒 sur toutes les pages',
      'DB accessible',
      'Backup planifié affiche next run',
      'Aucune erreur 500 dans les logs récents',
      'Response time API < 500ms',
    ],
    voir: 'Toutes les métriques vertes.',
  }),
  ...finalCheck([
    'Flow utilisateur end-to-end OK',
    'Cadenas SSL 🟢',
    'Health check OK',
    'Backup planifié',
    'Logs propres',
    'Performance OK',
  ]),
  escalade('Bug fonctionnel détecté → rollback + fix + redéploy.'),
]

const SOP_LIVRAISON_CLIENT: SopBlock[] = [
  ...intro(
    'Chef de projet',
    '2h', 'Email → CRM.',
    'Livrer proprement = référence pour futures références.',
  ),
  ...etape('1. DOCUMENTATION UTILISATEUR', {
    objectif: 'Guide simple pour utiliser l\'app', temps: '1h',
    ou: 'Projet → Documentation (export PDF possible)',
    actions: [
      'Rédiger un guide 5-10 pages : Login → Dashboard → Modules → FAQ',
      'Ajouter captures d\'écran',
      'Exporter en PDF',
      'Enregistrer une vidéo Loom 10 min qui parcourt tout',
    ],
    voir: 'PDF + vidéo prêts.',
    next: 'email livraison',
  }),
  ...etape('2. EMAIL DE LIVRAISON', {
    objectif: 'Handover formel', temps: '30 min',
    ou: 'Email + DocuSign',
    actions: [
      'Rédiger email : URL prod + identifiants + PDF + vidéo + liste des livrables',
      'Rappeler garantie / support inclus',
      'Ajouter le PV de recette à signer',
      'CC : Ibrahim + chef de projet',
    ],
    voir: 'Email envoyé.',
    next: 'formation live',
  }),
  ...etape('3. FORMATION LIVE 30 MIN', {
    objectif: 'Client autonome', temps: '30 min + prep',
    ou: 'Visioconférence (lien dans Projet → Documentation)',
    actions: [
      'Réunion visio dédiée',
      'Parcourir l\'app en live avec le client',
      'Répondre aux questions',
      'Confirmer que la vidéo Loom est utilisable pour former les employés du client',
    ],
    voir: 'Client rassuré et autonome.',
  }),
  ...finalCheck([
    'PDF guide',
    'Vidéo Loom',
    'Email livraison + PV recette',
    'Formation 30 min faite',
    'Réponse client positive',
    'Ticket ERP clôturé "livré"',
  ]),
  escalade('Client insatisfait de la livraison → réunion de crise avec Ibrahim.'),
]

/* ═══════════════════════════════════════════════════════════════════
   INDEX — mapping titre normalisé → SOP
═══════════════════════════════════════════════════════════════════ */

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const SOP_INDEX_CLAUDE_CODE: Record<string, SopBlock[]> = {
  // 1️⃣ Analyse
  [normalize('Collecte des besoins du client')]:                       SOP_COLLECTE_BESOINS,
  [normalize('Définition des fonctionnalités')]:                      SOP_DEFINITION_FONCTIONNALITES,
  [normalize('Cahier des charges détaillé (avec Claude Code)')]:      SOP_CAHIER_CHARGES,
  [normalize('Prompt principal partagé avec Claude Code dans VS Code')]: SOP_PROMPT_CLAUDE_CODE,

  // 2️⃣ Développement Démo
  [normalize('Création de la structure du projet')]:                   SOP_STRUCTURE_PROJET,
  [normalize('Développement du Frontend')]:                            SOP_DEV_FRONTEND,
  [normalize('Développement du Backend (API)')]:                       SOP_DEV_BACKEND,
  [normalize('Données fictives (Mock Data / JSON)')]:                  SOP_MOCK_DATA,
  [normalize('Authentification et gestion des utilisateurs')]:        SOP_AUTH_USERS,
  [normalize('Gestion des rôles et permissions (RBAC)')]:              SOP_RBAC,
  [normalize('Gestion des fichiers et médias')]:                       SOP_FICHIERS_MEDIA,
  [normalize('Intégration des API externes')]:                         SOP_API_EXTERNES,
  [normalize('Création du tableau de bord')]:                          SOP_TABLEAU_BORD,
  [normalize('Création des modules métier')]:                          SOP_MODULES_METIER,
  [normalize('Création des rapports et exports PDF / Excel')]:         SOP_RAPPORTS_EXPORTS,
  [normalize("Configuration des variables d'environnement (.env)")]:   SOP_ENV_VARS,

  // 3️⃣ Sécurité
  [normalize('Authentification JWT')]:                                 SOP_JWT,
  [normalize('Validation des données (schemas + sanitize)')]:         SOP_VALIDATION_SANITIZE,
  [normalize('Protection des routes (middleware auth)')]:              SOP_PROTECTION_ROUTES,
  [normalize('Journalisation (logs applicatifs)')]:                   SOP_LOGS,

  // 4️⃣ Déploiement Démo
  [normalize('Git push vers GitHub')]:                                 SOP_GIT_PUSH,
  [normalize('Configuration du domaine')]:                             SOP_CONFIG_DOMAINE,
  [normalize('Configuration des sauvegardes automatiques')]:          SOP_BACKUPS,
  [normalize('Mise en ligne de la version Démo')]:                    SOP_MISE_EN_LIGNE_DEMO,

  // 5️⃣ Validation client
  [normalize('Présentation de la version Démo')]:                     SOP_PRESENTATION_DEMO,
  [normalize('Collecte des remarques du client')]:                    SOP_COLLECTE_REMARQUES,
  [normalize('Corrections demandées')]:                                SOP_CORRECTIONS,
  [normalize('Validation finale du client (écrite)')]:                SOP_VALIDATION_FINALE_CLIENT,

  // 6️⃣ Base de données réelle
  [normalize('Conception de la BDD selon les fonctionnalités validées')]: SOP_CONCEPTION_BDD,
  [normalize('Création de la base de données')]:                       SOP_CREATION_BDD,
  [normalize('Création des migrations')]:                              SOP_MIGRATIONS,
  [normalize('Intégration de la BDD dans le code')]:                   SOP_INTEGRATION_BDD_CODE,
  [normalize('Remplacement des données Mock/JSON par la BDD réelle')]: SOP_REMPLACEMENT_MOCK,

  // 7️⃣ Tests
  [normalize('Vérification des fonctionnalités')]:                     SOP_VERIFICATION_FONCTIONNELLE,
  [normalize('Tests Backend (endpoints, sécurité)')]:                  SOP_TESTS_BACKEND,
  [normalize('Tests Frontend (parcours utilisateur)')]:                SOP_TESTS_FRONTEND,
  [normalize('Correction des bugs identifiés')]:                       SOP_CORRECTION_BUGS,
  [normalize('Optimisation des performances')]:                        SOP_OPTIMISATION_PERF,
  [normalize('Tests responsive (mobile, tablette, desktop)')]:         SOP_TESTS_RESPONSIVE,
  [normalize('Validation finale')]:                                    SOP_VALIDATION_FINALE_TEST,

  // 8️⃣ Mise en production
  [normalize('Git push vers GitHub (branche main)')]:                  SOP_GIT_PUSH_MAIN,
  [normalize('Vérification de la production (smoke tests)')]:          SOP_SMOKE_TESTS_PROD,
  [normalize("Livraison de l'application au client")]:                 SOP_LIVRAISON_CLIENT,
  // Note : Déploiement sur le VPS & Déploiement finale = SOP_DEPLOY_DOKPLOY (dans sopContent.ts)
  //        Configuration SSL & SMTP = déjà couverts dans sopContent.ts
}
