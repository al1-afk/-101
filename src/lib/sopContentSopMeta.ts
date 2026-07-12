/**
 * SOP — Création de SOP (25 tâches, méta)
 * Rôle : Consultant Excellence Opérationnelle Senior — 30+ ans, 1000+ SOPs.
 */
import type { SopBlock } from '@/hooks/useSops'
import {
  introExpert, etape, finalCheck, qaCheck, promptCards,
  conseilsSenior, validationFinale, escalade, projectContext, h2,
} from './sopHelpers'

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
const ROLE = 'Consultant Excellence Opérationnelle — 30+ ans, ISO 9001, Toyota Kata, 1000+ SOPs'
const CANAL = 'Blocage → Projet → Discussion (canal Documentation)'

/* ─── CADRAGE ─────────────────────────────────────────────────────────── */
const SOP_IDENTIFIER: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Cadrer précisément la tâche à documenter avant même de commencer à écrire',
    resultat: 'Fiche cadrage : titre exact, rôle exécutant, fréquence, résultat attendu, critères de succès',
    delai: '30 min',
    canal: CANAL,
    regle: 'Sans cadrage clair, le SOP dérive. La 1ère heure gagnée = 3 heures économisées après.',
    prerequis: ['Accès au processus réel', 'Autorité pour documenter'],
  }),
  ...projectContext(['project.name', 'project.responsable']),
  h2('Étapes'),
  ...etape('1. FICHE CADRAGE 8 CHAMPS', {
    objectif: 'Documenter le périmètre exact',
    temps: '30 min',
    ou: 'Projet → Documentation → « Cadrage SOP »',
    actions: [
      'Titre précis (verbe d\'action + objet + contexte)',
      'Rôle exécutant : qui fait la tâche ? (stagiaire / senior / manager)',
      'Fréquence : ponctuelle / hebdo / mensuelle',
      'Trigger : quel événement déclenche ?',
      'Résultat attendu : à quoi ressemble « fini » ?',
      'Livrables : quel fichier/action prouve la fin ?',
      'Critères succès : chiffrable si possible',
      'Périmètre exclu : ce qui n\'est PAS dans ce SOP',
    ],
    resultat: 'Fiche cadrage validée.',
    verification: ['8 champs remplis', 'Chiffrable'],
    conseil: 'Le champ « périmètre exclu » évite 50% des dérives ultérieures.',
  }),
  ...finalCheck(['Titre précis', 'Rôle défini', 'Résultat chiffrable', 'Périmètre exclu explicite']),
  ...qaCheck(['Périmètre exclu défini ?', 'Résultat chiffrable ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Fiche cadrage tâche',
      prompt: 'Voici une tâche à documenter : [DESCRIPTION]. Génère fiche cadrage 8 champs : titre précis, rôle, fréquence, trigger, résultat attendu, livrables, critères succès chiffrables, périmètre exclu. Format tableau.' },
  ]),
  ...conseilsSenior([
    '1h de cadrage = 3h économisées.',
    'Périmètre exclu > périmètre inclus.',
    'Verbe d\'action dans le titre. Pas de nom substantif.',
  ]),
  ...validationFinale('Fiche cadrage 8 champs signée par responsable.', 'Fichier « Cadrage_SOP_[Titre].md » dans Projet → Documentation'),
  ...escalade('Responsable ne peut pas définir le résultat attendu', 'Chef de projet — signal que le processus n\'est pas mûr'),
]

const SOP_INTERVIEWER: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Extraire le savoir tacite de l\'expert qui exécute la tâche',
    resultat: 'Transcription complète + captures écran d\'écran + patterns identifiés',
    delai: '90 min interview + 60 min post-processing',
    canal: CANAL,
    regle: 'L\'expert oublie 40% de ce qu\'il fait. Observe + questionne, ne suppose jamais.',
    prerequis: ['Expert disponible + accès à son écran'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. ENREGISTREMENT + SCREEN SHARE', {
    objectif: 'Capturer geste ET intention',
    temps: '90 min',
    ou: 'Visio (lien archivé dans Projet → Documentation)',
    actions: [
      'Enregistre la visio (accord expert)',
      'Demande partage écran',
      'Consigne : « fais la tâche comme d\'habitude, dis à voix haute ce que tu penses »',
      'Questions type « why-loops » : 5 pourquoi pour chaque décision',
      'Note timestamps intéressants',
      'Screenshots des étapes clés',
    ],
    resultat: 'Interview enregistrée + captures.',
    verification: ['Enregistrement > 60 min', '15+ screenshots', '5 pourquoi documentés'],
    conseil: 'La méthode « thinking out loud » révèle 3× plus que « comment fais-tu X ? ».',
  }),
  ...etape('2. TRANSCRIPTION + PATTERNS', {
    objectif: 'Extraire la structure',
    temps: '60 min',
    ou: 'Projet → Documentation',
    actions: [
      'Transcription audio via Whisper / outil natif',
      'Identifie répétitions dans le discours : ce sont des étapes',
      'Identifie exceptions : « sauf si », « attention à », « ne fais jamais »',
      'Note métaphores utilisées par l\'expert (souvent = essence)',
    ],
    resultat: 'Transcription structurée.',
    verification: ['Étapes identifiées', 'Exceptions listées', 'Métaphores relevées'],
    conseil: 'Les métaphores de l\'expert (« c\'est comme cuisiner ») = essence du savoir. Note-les.',
  }),
  ...finalCheck(['Enregistrement + transcription', 'Screenshots', 'Étapes + exceptions', 'Métaphores relevées']),
  ...qaCheck(['5 pourquoi appliqués ?', 'Screenshots suffisants ?']),
  ...promptCards([
    { agent: 'Claude Code', title: 'Structure transcription en étapes',
      prompt: 'Transcription brute interview expert : [COLLE]. Extrait : (1) étapes chronologiques, (2) points de décision (if/else), (3) exceptions ("sauf si", "attention"), (4) métaphores utilisées, (5) 5 pourquoi structurés. Sortie Markdown structuré.' },
  ]),
  ...conseilsSenior([
    'L\'expert oublie 40% de ce qu\'il fait automatiquement.',
    'Thinking out loud > interrogation directe.',
    'Métaphores = essence du savoir. Note-les.',
  ]),
  ...validationFinale('Interview complète transcrite et structurée.', 'Fichier « Interview_[Expert]_[Date].md » dans Projet → Documentation'),
  ...escalade('Expert refuse d\'être enregistré', 'Chef de projet — reformater en notes prise en direct'),
]

const SOP_MEDIAS_REELS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Collecter screenshots, vidéos, exemples réels illustrant chaque étape',
    resultat: 'Bibliothèque médias : 1 capture par étape critique + 3-5 exemples de livrables réels',
    delai: '2 h',
    canal: CANAL,
    regle: 'Une image annotée > 100 mots. Investis les captures.',
    prerequis: ['Cadrage + interview'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. CAPTURES ÉTAPES CRITIQUES', {
    objectif: 'Screen chaque écran clé + annotations',
    temps: '1 h',
    ou: 'CleanShot / Snagit / macOS Shift+Cmd+4',
    actions: [
      '1 capture par étape critique du SOP (5-10 captures total)',
      'Annote directement : flèches, cadres rouges, numéros',
      'Cadrage propre : max 800 px largeur',
      'Filename descriptif : [step-num]_[action]_[timestamp].png',
    ],
    resultat: 'Bibliothèque captures annotées.',
    verification: ['5-10 captures', 'Annotations claires', 'Nommage cohérent'],
    conseil: 'CleanShot X = outil de référence Mac. Snagit pour Windows.',
  }),
  ...etape('2. EXEMPLES LIVRABLES + VIDÉOS COURTES', {
    objectif: 'Ajouter exemples réels de livrables + demo 30s si complexe',
    temps: '1 h',
    ou: 'Loom / QuickTime + Projet → Ressources',
    actions: [
      '3-5 exemples de livrables finaux réels (docs, PDFs, fichiers)',
      'Anonymise si nécessaire (clients, montants)',
      'Vidéo 30-60s si étape complexe (Loom facilite)',
      'Archive dans Projet → Ressources / SOP-Medias',
    ],
    resultat: 'Bibliothèque complète.',
    verification: ['3-5 exemples livrables', 'Vidéos si étapes complexes', 'Archivé Projet → Ressources'],
    conseil: 'Une vidéo Loom 60s remplace 3 pages de texte + captures.',
  }),
  ...finalCheck(['5-10 captures annotées', '3-5 exemples livrables', 'Vidéos étapes complexes', 'Archivé Projet → Ressources']),
  ...qaCheck(['Captures cadrées + annotées ?', 'Exemples anonymisés si sensibles ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Choisis les 5 étapes à screenshoter',
      prompt: 'Voici les 15 étapes d\'un SOP : [COLLE]. Identifie les 5 étapes qui bénéficient LE PLUS d\'une capture d\'écran (décision visuelle, interface complexe, résultat inattendu). Justifie chaque choix en 1 phrase.' },
  ]),
  ...conseilsSenior([
    'Une image annotée > 100 mots.',
    'Loom 60s > 3 pages texte.',
    'Anonymise avant archivage. Non négociable.',
  ]),
  ...validationFinale('Bibliothèque médias complète.', 'Dossier « SOP-Medias-[Titre] » dans Projet → Ressources'),
  ...escalade('Étape non-visible (backend / téléphone)', 'Filmer avec téléphone en travelling'),
]

/* ─── RÉDACTION DES 14 SECTIONS ───────────────────────────────────────── */
const SOP_SECTION_OBJECTIF: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 1 : Objectif — raison d\'être + livrable + critères de succès',
    resultat: '3 lignes max : « Cette procédure permet de X, produit Y, réussi si Z ».',
    delai: '20 min',
    canal: CANAL,
    regle: 'Section 1 = pitch. Si un nouveau ne comprend pas, tout le SOP est mort.',
    prerequis: ['Cadrage fait'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. FORMULE 3 LIGNES', {
    objectif: 'Objectif clair en 3 phrases',
    temps: '20 min',
    ou: 'Projet → Documentation',
    actions: [
      'Ligne 1 : « Ce SOP permet de [ACTION] pour [BÉNÉFICIAIRE] »',
      'Ligne 2 : « Livrable : [OBJET CONCRET] »',
      'Ligne 3 : « Critères de succès : [CHIFFRABLE] »',
      'Aucun jargon métier non expliqué',
    ],
    resultat: 'Section 1 rédigée.',
    verification: ['3 lignes max', 'Chiffrable', 'Sans jargon'],
    conseil: 'Le pitch fait, tout le reste coule. Passe 20 min ici, pas 5.',
  }),
  ...finalCheck(['3 lignes max', 'Livrable concret', 'Critères chiffrables']),
  ...qaCheck(['Un nouveau comprend-il en 30 secondes ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Rédige section Objectif SOP',
      prompt: 'Tâche : [DESCRIPTION]. Rédige section « Objectif » en 3 lignes : (1) ce que le SOP permet, (2) livrable concret, (3) critères de succès chiffrables. Sans jargon. Ton direct.' },
  ]),
  ...conseilsSenior([
    'Le pitch fait, tout le reste coule.',
    '3 lignes max. Sinon tu perds le lecteur.',
    'Chiffrable > adjectifs.',
  ]),
  ...validationFinale('Section Objectif validée par responsable.', 'Section 1 dans SOP dans Projet → Documentation'),
  ...escalade('Impossible de chiffrer le critère succès', 'Retour cadrage — processus non mûr'),
]

const SOP_SECTION_PREREQUIS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 2 : Prérequis — accès, comptes, outils, droits nécessaires',
    resultat: 'Liste exhaustive : sans quoi le SOP est bloqué dès l\'étape 1',
    delai: '30 min',
    canal: CANAL,
    regle: 'Si un prérequis manque, le SOP échoue. Rends-les visibles dès le début.',
    prerequis: ['Interview expert faite'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. LISTE EXHAUSTIVE', {
    objectif: 'Catégoriser tout ce qu\'il faut',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Accès : compte plateforme X, VPN, réseau interne',
      'Droits : admin / éditeur / lecteur ?',
      'Outils : logiciels installés, versions minimum',
      'Données : quel fichier source, quel formulaire prérempli',
      'Personne : validateur, expert de secours',
    ],
    resultat: 'Section 2 exhaustive.',
    verification: ['5 catégories couvertes', 'Aucun implicite'],
    conseil: 'Un prérequis oublié = SOP bloqué à mi-parcours. Rare = grave.',
  }),
  ...finalCheck(['Accès + droits + outils + données + personnes', 'Aucun implicite']),
  ...qaCheck(['Testable par un nouvel employé ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Génère section Prérequis',
      prompt: 'Tâche : [DESCRIPTION]. Rédige section « Prérequis » en 5 catégories : Accès, Droits, Outils, Données, Personnes. Sois exhaustif, aucun implicite. Format liste plate.' },
  ]),
  ...conseilsSenior([
    'Prérequis oublié = SOP bloqué.',
    '5 catégories couvre 95% des cas.',
    'Aucun implicite. Nomme tout.',
  ]),
  ...validationFinale('Section Prérequis exhaustive.', 'Section 2 dans SOP'),
  ...escalade('Prérequis inaccessibles au débutant', 'Créer sous-SOP « Onboarding accès »'),
]

const SOP_SECTION_OUTILS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 3 : Outils utilisés — fonction + configuration + bonnes pratiques',
    resultat: 'Pour chaque outil : à quoi ça sert, comment le configurer, 3 tips d\'expert',
    delai: '45 min',
    canal: CANAL,
    regle: 'Un outil = 1 paragraphe. Sinon transforme en SOP séparé.',
    prerequis: ['Prérequis définis'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. FICHE PAR OUTIL', {
    objectif: 'Documenter chaque outil sur 1 paragraphe',
    temps: '45 min',
    ou: 'Projet → Documentation',
    actions: [
      'Outil A : Nom + version + URL + fonction en 1 phrase',
      'Configuration initiale (settings, plugins, thème)',
      '3 tips d\'expert (raccourcis, réglages non-obvious, pièges)',
      'Alternative (si l\'outil devient indisponible)',
    ],
    resultat: 'Section outils prête.',
    verification: ['1 paragraphe par outil', '3 tips par outil', 'Alternative citée'],
    conseil: 'Les 3 tips d\'expert = ce qui distingue un pro d\'un débutant. Investis-les.',
  }),
  ...finalCheck(['1 paragraphe par outil', 'Config initiale', '3 tips', 'Alternative']),
  ...qaCheck(['Débutant peut-il installer + configurer ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Fiche outil pour SOP',
      prompt: 'Outil : [NOM]. Rédige fiche 1 paragraphe : (1) fonction en 1 phrase, (2) config initiale essentielle, (3) 3 tips d\'expert (raccourcis / réglages non-obvious), (4) alternative si outil down. Direct.' },
  ]),
  ...conseilsSenior([
    '3 tips d\'expert = valeur du SOP.',
    '1 paragraphe max. Sinon sous-SOP séparé.',
    'Toujours cite alternative.',
  ]),
  ...validationFinale('Section Outils complète.', 'Section 3 dans SOP'),
  ...escalade('Outil trop complexe pour 1 paragraphe', 'Créer sous-SOP dédié'),
]

const SOP_SECTION_PROCESSUS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 4 : Processus — étapes numérotées, chaque clic documenté',
    resultat: 'Séquence claire, 5-8 étapes max, chaque étape actionnable + vérification',
    delai: '2-3 h',
    canal: CANAL,
    regle: 'Max 7 étapes principales (chunking cognitif). Au-delà, découpe en sous-processus.',
    prerequis: ['Interview + captures faites'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. STRUCTURATION 5-8 ÉTAPES', {
    objectif: 'Découper le processus en étapes atomiques',
    temps: '1 h',
    ou: 'Projet → Documentation',
    actions: [
      'Chaque étape : verbe d\'action + objet + résultat',
      'Max 7 étapes principales (chunking)',
      'Sous-étapes si nécessaire (mais préfère découpage)',
      'Screenshot par étape critique',
    ],
    resultat: 'Squelette 5-8 étapes.',
    verification: ['Max 7 étapes', 'Verbe d\'action', 'Screenshots'],
    conseil: '7 ± 2 étapes = limite mémoire de travail humaine. Respecte cette limite.',
  }),
  ...etape('2. RÉDACTION ÉTAPE PAR ÉTAPE', {
    objectif: 'Détail chaque étape avec précision chirurgicale',
    temps: '1-2 h',
    ou: 'Projet → Documentation',
    actions: [
      'Chaque étape : Objectif · Temps · Où · Actions numérotées · Résultat · Vérification',
      'Actions = clics précis (« clique « Enregistrer » en haut à droite »)',
      'Vérification = observable (« la barre passe au vert »)',
      'Ajoute erreurs fréquentes + solutions',
    ],
    resultat: 'Étapes rédigées.',
    verification: ['Chaque étape a Objectif/Temps/Où/Actions/Résultat/Vérif', 'Actions atomiques'],
    conseil: 'Un « clique là » ambigu = SOP raté. Sois chirurgical.',
  }),
  ...finalCheck(['5-8 étapes principales', 'Verbe d\'action + résultat', 'Screenshots', 'Vérifications observables']),
  ...qaCheck(['Un nouveau peut-il suivre sans questionner ?']),
  ...promptCards([
    { agent: 'Claude Code', title: 'Détaille étape SOP',
      prompt: 'Étape brute : [DESCRIPTION]. Reformate en structure SOP : Objectif · Temps · Où · Actions numérotées atomiques (chaque clic) · Résultat observable · Vérification. Ton chirurgical.' },
  ]),
  ...conseilsSenior([
    '7 ± 2 étapes = limite mémoire humaine.',
    'Vérification observable > ambiguë.',
    'Un « clique là » ambigu = SOP raté.',
  ]),
  ...validationFinale('Section Processus complète.', 'Section 4 dans SOP'),
  ...escalade('Processus > 12 étapes', 'Découper en 2-3 sous-SOPs'),
]

const SOP_SECTION_QC: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 5 : Contrôle qualité — checklist exhaustive avant livraison',
    resultat: '10-20 checkpoints observables, groupés par phase (avant/pendant/après)',
    delai: '30 min',
    canal: CANAL,
    regle: 'QC observable > QC subjectif. « Le texte est bien » = raté. « Aucune faute repérée par LanguageTool » = OK.',
    prerequis: ['Processus rédigé'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. LISTE QC OBSERVABLE', {
    objectif: '10-20 checkpoints mesurables',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Groupe par phase : Prévu · En cours · Fini',
      'Chaque item = observable (case à cocher, chiffre, screenshot)',
      'Bannis « bien », « correctement », « suffisamment »',
      'Ajoute 2-3 checks « anti-fraude » (limites naturelles)',
    ],
    resultat: 'Checklist QC 10-20 items.',
    verification: ['10-20 items', 'Chaque observable', 'Groupé par phase'],
    conseil: 'La checklist QC vaut plus que le SOP lui-même dans 30% des cas.',
  }),
  ...finalCheck(['10-20 items', 'Observable', 'Groupé par phase', 'Anti-fraude']),
  ...qaCheck(['Aucun « bien / correctement » ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Génère checklist QC observable',
      prompt: 'Processus : [DESCRIPTION]. Génère checklist QC 10-20 items OBSERVABLES (case à cocher, chiffre, screenshot). Groupe par phase (Prévu/En cours/Fini). BANNIS « bien / correctement / suffisamment ». Format checkbox Markdown.' },
  ]),
  ...conseilsSenior([
    'Checklist QC vaut plus que le SOP dans 30% des cas.',
    'Observable > subjectif. Toujours.',
    'Groupe par phase = ergonomie.',
  ]),
  ...validationFinale('Section QC complète.', 'Section 5 dans SOP'),
  ...escalade('Impossible de rendre QC observable', 'Cadrage à revoir — critère de succès flou'),
]

const SOP_SECTION_ERREURS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 6 : Gestion des erreurs — problème / cause / solution / prévention',
    resultat: '5-10 erreurs fréquentes documentées, chacune avec les 4 champs',
    delai: '45 min',
    canal: CANAL,
    regle: 'Seulement les erreurs qui arrivent VRAIMENT. Pas d\'erreurs hypothétiques.',
    prerequis: ['3-6 mois de retour d\'expérience OU interview expert'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. LISTER LES 5-10 ERREURS RÉELLES', {
    objectif: 'Compiler les vraies erreurs terrain',
    temps: '45 min',
    ou: 'Projet → Documentation',
    actions: [
      'Format ligne : Problème observé | Cause probable | Solution éprouvée | Prévention',
      'Trie par fréquence (les 5 qui arrivent le plus souvent)',
      'Priorise erreurs impactantes (blocantes > mineures)',
      'Ajoute code d\'erreur si applicable',
    ],
    resultat: 'Tableau erreurs terrain.',
    verification: ['5-10 erreurs', '4 champs par erreur', 'Trié par fréquence'],
    conseil: 'Les erreurs hypothétiques ne servent à rien. Seulement le vécu.',
  }),
  ...finalCheck(['5-10 erreurs réelles', 'Problème / Cause / Solution / Prévention', 'Trié par fréquence']),
  ...qaCheck(['Erreurs vécues (pas hypothétiques) ?']),
  ...promptCards([
    { agent: 'Claude Code', title: 'Structure erreurs terrain',
      prompt: 'Voici 15 retours d\'expérience terrain : [COLLE]. Structure en tableau : Problème | Cause probable | Solution éprouvée | Prévention. Trie par fréquence apparente. Garde les 5-10 les plus fréquents.' },
  ]),
  ...conseilsSenior([
    'Erreurs vécues > hypothétiques.',
    'Prévention est le vrai gain.',
    '5-10 max. Sinon tu dilues.',
  ]),
  ...validationFinale('Section Erreurs complète.', 'Section 6 dans SOP'),
  ...escalade('Aucune erreur récurrente identifiée', 'Attendre 3-6 mois de terrain'),
]

const SOP_SECTION_OPTIM: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 7 : Optimisation — quoi automatiser, déléguer, confier à l\'IA',
    resultat: 'Tableau : Étape | Automatisable ? | Délégable ? | IA-able ? | Gain estimé',
    delai: '30 min',
    canal: CANAL,
    regle: 'Automatise ce qui est répétitif ET stable. Délégue ce qui est répétitif ET variable.',
    prerequis: ['Processus rédigé'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. AUDIT ÉTAPES → OPTIM POSSIBLES', {
    objectif: 'Identifier les gains 80/20',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Pour chaque étape du processus : type action (mécanique / créative / décisionnelle)',
      'Automatisable si : mécanique + répétitive + stable (script, API, RPA)',
      'Délégable si : bien documentée + apprentissage < 1 jour',
      'IA-able si : rédactionnelle, analyse texte, extraction data',
      'Note gain estimé en minutes/mois',
    ],
    resultat: 'Tableau optimisations.',
    verification: ['Chaque étape évaluée', 'Gain chiffré'],
    conseil: 'Automatiser ce qui bouge encore = fragilité. Attends stabilité.',
  }),
  ...finalCheck(['Chaque étape évaluée', 'Gain chiffré', 'Priorisation impact/effort']),
  ...qaCheck(['Recommandations réalistes ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Identifie optimisations processus',
      prompt: 'Processus : [ÉTAPES]. Pour chaque étape, évalue : Automatisable ? (script/API), Délégable ? (junior), IA-able ? (rédac/analyse). Gain estimé min/mois. Sortie tableau + top 3 recommandations.' },
  ]),
  ...conseilsSenior([
    'Automatise stable, délègue variable.',
    'IA excelle en rédac + analyse text.',
    'Gain > 30 min/mois pour justifier automation.',
  ]),
  ...validationFinale('Section Optimisation complète.', 'Section 7 dans SOP'),
  ...escalade('Processus instable', 'Attendre 3 mois de stabilité avant optimiser'),
]

const SOP_SECTION_PROMPTS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 8 : Prompts IA prêts — Claude / ChatGPT / Gemini / Cursor',
    resultat: '3-5 prompts par outil, chacun testé et validé, avec inputs/outputs types',
    delai: '1 h',
    canal: CANAL,
    regle: 'Un prompt qui n\'a pas été testé n\'est pas un prompt.',
    prerequis: ['Processus rédigé'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. IDENTIFIER MOMENTS IA', {
    objectif: 'Trouver 3-5 moments dans le processus où l\'IA aide',
    temps: '20 min',
    ou: 'Projet → Documentation',
    actions: [
      'Rédaction (email, meta desc, article)',
      'Analyse (extraction data, résumé, classification)',
      'Créativité (brainstorming, variations)',
      'Debug (code, formule, config)',
    ],
    resultat: 'Liste 3-5 moments.',
    verification: ['Diversité usages'],
    conseil: 'IA excelle en rédac + analyse. Moyen en créativité. Faible en calcul.',
  }),
  ...etape('2. RÉDIGER PROMPTS TESTÉS', {
    objectif: 'Chaque prompt structuré + testé',
    temps: '40 min',
    ou: 'Outils IA',
    actions: [
      'Structure : Rôle + Contexte + Instruction + Format sortie',
      'Test chaque prompt avec vrais inputs',
      'Note variantes selon agent (Claude vs ChatGPT vs Gemini vs Cursor)',
      'Documente input/output type',
    ],
    resultat: '3-5 prompts testés.',
    verification: ['Prompts structurés Rôle+Contexte+Instruction+Format', 'Testés réellement'],
    conseil: 'Chaque prompt cité doit avoir été testé. Sinon = faux SOP.',
  }),
  ...finalCheck(['3-5 moments IA identifiés', 'Prompts structurés', 'Testés', 'Variantes par agent']),
  ...qaCheck(['Prompts vraiment testés ?']),
  ...promptCards([
    { agent: 'Claude Code', title: 'Structure prompt pour SOP',
      prompt: 'Voici un besoin : [DESCRIPTION]. Rédige prompt IA structuré Rôle + Contexte + Instruction + Format sortie. Ajoute 3 variantes ChatGPT / Claude / Gemini avec petits ajustements optim pour chaque agent.' },
  ]),
  ...conseilsSenior([
    'Prompt non testé = prompt invalide.',
    'Structure Rôle+Contexte+Instruction+Format universelle.',
    'Chaque agent a ses forces. Adapte.',
  ]),
  ...validationFinale('Section Prompts IA testés.', 'Section 8 dans SOP'),
  ...escalade('IA ne délivre pas la qualité attendue', 'Reformuler prompt ou noter que la tâche est humaine'),
]

const SOP_SECTION_LIVRABLES: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 9 : Livrables — fichiers, nommage, emplacement, résolution',
    resultat: 'Liste précise : chaque fichier livré, son format, son nommage, où l\'archiver',
    delai: '20 min',
    canal: CANAL,
    regle: 'Un livrable non nommé = livrable perdu dans 3 mois.',
    prerequis: ['Processus fini'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. TABLEAU LIVRABLES', {
    objectif: 'Documenter chaque livrable',
    temps: '20 min',
    ou: 'Projet → Documentation',
    actions: [
      'Colonnes : Nom | Format | Résolution | Nommage | Emplacement | Qui reçoit',
      'Convention nommage : [client]_[type]_[date-iso].[ext]',
      'Emplacement : chemin exact dans Projet → Ressources ou Documentation',
      'Attribue destinataire (interne / client / archive)',
    ],
    resultat: 'Tableau livrables.',
    verification: ['Chaque livrable a 6 champs remplis', 'Convention nommage claire'],
    conseil: 'Un livrable non nommé = livrable perdu dans 3 mois.',
  }),
  ...finalCheck(['Chaque livrable a 6 champs', 'Convention nommage cohérente', 'Emplacement précis']),
  ...qaCheck(['Retrouvable dans 6 mois ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Génère convention nommage livrables',
      prompt: 'Livrables : [LISTE]. Propose convention nommage cohérente et courte : [client]_[type]_[date]. Format 5 exemples + règle. Directement archivable.' },
  ]),
  ...conseilsSenior([
    'Livrable non nommé = perdu dans 3 mois.',
    'Convention courte > longue.',
    'Emplacement précis, pas approximatif.',
  ]),
  ...validationFinale('Section Livrables complète.', 'Section 9 dans SOP'),
  ...escalade('Emplacement unclear', 'Créer arborescence Projet → Ressources dédiée'),
]

const SOP_SECTION_VERIF: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 10 : Vérification finale — checklist avant livraison',
    resultat: '5-10 checks observables avant de dire « fini »',
    delai: '15 min',
    canal: CANAL,
    regle: 'Différent de la QC : la Vérif finale = ce qui empêche livraison en état non-livrable.',
    prerequis: ['Processus rédigé'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. CHECKLIST FINALE', {
    objectif: 'Ce qui doit être vrai avant livraison',
    temps: '15 min',
    ou: 'Projet → Documentation',
    actions: [
      '5-10 items « pas livrer si NOT OK »',
      'Ex : « fichier ouvert dans le format cible », « client a reçu email de confirmation »',
      'Différent de la QC (qui est procédurale)',
      'Chaque item observable',
    ],
    resultat: 'Checklist finale.',
    verification: ['5-10 items observables'],
    conseil: 'Vérif finale = filet de sécurité. Une seule case non-cochée bloque livraison.',
  }),
  ...finalCheck(['5-10 items', 'Observable', 'Bloque livraison si NOT OK']),
  ...qaCheck(['Peut-on livrer sans ces checks ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Génère vérification finale',
      prompt: 'Processus : [DESCRIPTION]. Génère checklist 5-10 items « ce qui doit être TRUE avant livraison ». Chaque observable. Chaque bloquant si NOT OK.' },
  ]),
  ...conseilsSenior([
    'Vérif finale = filet de sécurité.',
    '1 case non-cochée = pas de livraison.',
    'Différent de la QC procédurale.',
  ]),
  ...validationFinale('Section Vérif finale complète.', 'Section 10 dans SOP'),
  ...escalade('Impossible de définir vérifs observables', 'Retour cadrage — résultat attendu flou'),
]

const SOP_SECTION_TEMPS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 11 : Temps estimé — débutant / intermédiaire / expert',
    resultat: 'Fourchettes chiffrées par niveau, basées sur mesure réelle',
    delai: '15 min',
    canal: CANAL,
    regle: 'Ne devine pas. Mesure avec 3 personnes de niveaux différents.',
    prerequis: ['Processus testé par 2-3 personnes'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. MESURE + ESTIMATION 3 NIVEAUX', {
    objectif: '3 fourchettes réalistes',
    temps: '15 min',
    ou: 'Projet → Documentation',
    actions: [
      'Débutant (jamais fait) : mesure sur 1 personne',
      'Intermédiaire (2-5 fois) : mesure sur 1 personne',
      'Expert (10+ fois) : mesure sur 1 personne',
      'Note fourchettes larges (min-max)',
    ],
    resultat: '3 estimations.',
    verification: ['Basé sur mesure réelle', 'Fourchettes claires'],
    conseil: 'Estimation devinée = pénalité de crédibilité. Mesure.',
  }),
  ...finalCheck(['3 niveaux estimés', 'Basé sur mesure', 'Fourchettes claires']),
  ...qaCheck(['Basé sur mesure réelle ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Format estimation temps SOP',
      prompt: 'J\'ai mesuré 3 temps pour même tâche : débutant [X min], intermédiaire [Y], expert [Z]. Rédige section « Temps estimé » avec fourchette + justif chacun.' },
  ]),
  ...conseilsSenior([
    'Mesure > devine.',
    'Fourchettes larges > chiffres uniques.',
    'Ajouter temps de pause / vérif.',
  ]),
  ...validationFinale('Section Temps mesurée.', 'Section 11 dans SOP'),
  ...escalade('Aucune mesure possible', 'Faire test avec 3 nouvelles personnes'),
]

const SOP_SECTION_PRIORITE: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 12 : Priorité — 🔴🟠🟢 + justification',
    resultat: 'Niveau de priorité clair + justification 3 lignes',
    delai: '10 min',
    canal: CANAL,
    regle: 'Toujours justifier — sinon la priorité est arbitraire.',
    prerequis: ['Contexte business connu'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. ATTRIBUTION + JUSTIFICATION', {
    objectif: 'Justifier le niveau',
    temps: '10 min',
    ou: 'Projet → Documentation',
    actions: [
      '🔴 = bloquant / critique / risque financier',
      '🟠 = important / risque qualité',
      '🟢 = confort / optimisation',
      '3 lignes de justif',
    ],
    resultat: 'Priorité justifiée.',
    verification: ['Emoji cohérent', '3 lignes justif'],
    conseil: 'Sans justif, la priorité est arbitraire.',
  }),
  ...finalCheck(['Emoji clair', 'Justif 3 lignes']),
  ...qaCheck(['Justif tient la route ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Justifie priorité tâche',
      prompt: 'Tâche : [DESCRIPTION]. Contexte : [CTX]. Attribue priorité 🔴🟠🟢 + justification 3 lignes (impact financier, qualité, risque).' },
  ]),
  ...conseilsSenior([
    'Justif > emoji.',
    'Priorité arbitraire = décrédibilise SOP.',
  ]),
  ...validationFinale('Section Priorité justifiée.', 'Section 12 dans SOP'),
  ...escalade('Priorité contestée en équipe', 'Réunion cadrage business'),
]

const SOP_SECTION_BONNES_PRATIQUES: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 13 : Bonnes pratiques — réflexes de 30+ ans',
    resultat: '5-7 tips concis venant de l\'expérience, non-évidents pour un débutant',
    delai: '30 min',
    canal: CANAL,
    regle: 'Seulement du non-évident. Le trivial (« bien noter les infos ») n\'a rien à faire ici.',
    prerequis: ['Expert interviewé'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. EXTRACTION 5-7 TIPS NON-ÉVIDENTS', {
    objectif: 'Distiller expertise',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Reprends interview expert',
      'Note ce qui n\'est PAS dans le processus formel',
      'Astuce / raccourci / erreur évitée récurrente',
      '5-7 tips max, 1 phrase chacun',
    ],
    resultat: 'Section BP.',
    verification: ['5-7 tips', 'Chaque non-évident', 'Chaque 1 phrase'],
    conseil: 'Le trivial ne mérite pas cette section. Seulement du savoir tacite.',
  }),
  ...finalCheck(['5-7 tips', 'Non-évidents', '1 phrase']),
  ...qaCheck(['Un débutant ne saurait pas ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Distille BP depuis interview',
      prompt: 'Interview expert : [COLLE]. Extrait 5-7 tips NON-ÉVIDENTS (astuces, raccourcis, erreurs évitées). Chacun en 1 phrase. Bannis le trivial.' },
  ]),
  ...conseilsSenior([
    'Non-évident > évident. Toujours.',
    '5-7 max. Sinon dilution.',
    'La rareté fait la valeur.',
  ]),
  ...validationFinale('Section BP distillée.', 'Section 13 dans SOP'),
  ...escalade('Aucun tip non-évident', 'Interview supplémentaire — poser plus de 5 pourquoi'),
]

const SOP_SECTION_CONSEILS_EXPERT: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger section 14 : Conseils d\'expert — méthodes des meilleures agences',
    resultat: '3-5 recommandations stratégiques, niveau senior, applicables long terme',
    delai: '20 min',
    canal: CANAL,
    regle: 'Section stratégique, pas tactique. Vue de haut.',
    prerequis: ['SOP fini'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. 3-5 CONSEILS STRATÉGIQUES', {
    objectif: 'Vue senior applicable',
    temps: '20 min',
    ou: 'Projet → Documentation',
    actions: [
      'Chaque conseil = vision niveau senior',
      'Applicable long terme (pas 1 semaine)',
      'Cite exemple concret si possible',
      '3-5 max',
    ],
    resultat: 'Section CE.',
    verification: ['3-5 conseils', 'Stratégique', 'Applicable'],
    conseil: 'Stratégique = 5 ans. Tactique = 5 jours. Distingue.',
  }),
  ...finalCheck(['3-5 conseils', 'Stratégiques', 'Exemples concrets']),
  ...qaCheck(['Vraiment stratégique ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Conseils senior sur processus',
      prompt: 'Processus : [DESCRIPTION]. Rédige 3-5 conseils d\'expert (niveau senior 30 ans expérience) applicables long terme (5 ans). Chaque cite exemple concret. Vue stratégique, pas tactique.' },
  ]),
  ...conseilsSenior([
    'Stratégique > tactique.',
    'Cite exemples.',
    'Rare > commun.',
  ]),
  ...validationFinale('Section CE finale.', 'Section 14 dans SOP'),
  ...escalade('Difficile de distinguer strat / tactique', 'Consulter senior externe'),
]

/* ─── TEST NOUVEL EMPLOYÉ ─────────────────────────────────────────────── */
const SOP_TEST_NOUVEL: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Faire exécuter le SOP par un « nouvel employé fictif » qui ne peut poser AUCUNE question',
    resultat: 'Log des blocages + reformulations à faire',
    delai: 'Temps SOP × 1.5 (pour observer)',
    canal: CANAL,
    regle: 'Silence total pendant le test. Chaque question posée = SOP incomplet.',
    prerequis: ['SOP rédigé', 'Testeur naif disponible'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. BRIEF TESTEUR + EXÉCUTION SILENCE', {
    objectif: 'Le testeur exécute seul, tu observes',
    temps: 'Selon SOP',
    ou: 'Environnement réel + observation',
    actions: [
      'Brief testeur : « suis le SOP à la lettre, ne me demande rien »',
      'Enregistre l\'écran',
      'Note chaque fois qu\'il hésite / questionne mentalement',
      'Timer chaque étape',
      'Silence total de ta part',
    ],
    resultat: 'Test exécuté + log blocages.',
    verification: ['Silence respecté', 'Chaque hésitation notée'],
    conseil: 'Une question posée = 1 zone à réécrire.',
  }),
  ...finalCheck(['Silence total respecté', 'Blocages notés', 'Timings mesurés']),
  ...qaCheck(['Testeur vraiment naif (pas expert) ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Brief testeur SOP',
      prompt: 'Rédige brief 5 lignes pour testeur SOP : consignes (silence, questions notées, temps), objectif du test, format retour. Ton direct.' },
  ]),
  ...conseilsSenior([
    'Silence > aide.',
    'Question posée = zone à réécrire.',
    'Enregistrement clé pour analyse.',
  ]),
  ...validationFinale('Test réalisé avec log complet.', 'Enregistrement + log dans Projet → Documentation'),
  ...escalade('Testeur bloqué complet', 'Section SOP à refaire prioritaire'),
]

const SOP_CONSIGNER_BLOCAGES: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Structurer les blocages du testeur en actions correctives',
    resultat: 'Tableau : Zone problème | Cause probable | Action corrective | Priorité',
    delai: '30 min',
    canal: CANAL,
    regle: 'Chaque blocage = 1 action corrective. Pas de vue « bof, il comprendra ».',
    prerequis: ['Log test disponible'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. TRANSFORMER LOG EN PLAN', {
    objectif: 'Chaque blocage → action',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Ordonner blocages par timestamp',
      'Pour chaque : cause probable (jargon / manque étape / capture manquante)',
      'Action corrective précise (ex : « réécrire étape 3 »)',
      'Priorité 🔴 si bloquant, 🟠 si ralentissant, 🟢 si esthétique',
    ],
    resultat: 'Plan actions correctives.',
    verification: ['Chaque blocage = 1 action', 'Priorité claire'],
    conseil: 'La liste devient ta roadmap de réécriture.',
  }),
  ...finalCheck(['Chaque blocage transformé', 'Priorité 🔴🟠🟢']),
  ...qaCheck(['Aucun blocage ignoré ?']),
  ...promptCards([
    { agent: 'Claude Code', title: 'Structure blocages en actions',
      prompt: 'Log blocages testeur : [COLLE]. Structure en tableau : Zone problème | Cause probable | Action corrective précise | Priorité 🔴🟠🟢. Trie par priorité.' },
  ]),
  ...conseilsSenior([
    'Chaque blocage compte.',
    'Priorité éclaire la roadmap.',
    'Vue « il comprendra » = SOP mort.',
  ]),
  ...validationFinale('Plan actions correctives prêt.', 'Fichier « Blocages_[SOP].md » dans Projet → Documentation'),
  ...escalade('Trop de blocages (> 20)', 'Refonte complète du SOP'),
]

const SOP_REECRIRE: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Réécrire les sections problématiques identifiées lors du test',
    resultat: 'Sections réécrites intégrant les correctifs, version SOP v2',
    delai: '30 min par section',
    canal: CANAL,
    regle: 'Une réécriture = 1 objectif clair. Sinon tu déranges d\'autres zones.',
    prerequis: ['Plan actions correctives'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. RÉÉCRIRE SECTION PAR SECTION', {
    objectif: 'Correctif ciblé, pas refonte globale',
    temps: '30 min par section',
    ou: 'Projet → Documentation',
    actions: [
      'Ouvre la section problématique',
      'Applique le correctif précis (ex : ajouter capture, préciser action, retirer jargon)',
      'Ne touche PAS le reste',
      'Note V2 dans historique',
    ],
    resultat: 'Sections V2 prêtes.',
    verification: ['Correctif ciblé', 'Historique V1 → V2'],
    conseil: 'Ne réécris JAMAIS le SOP entier. Correctifs chirurgicaux.',
  }),
  ...finalCheck(['Correctifs ciblés', 'Historique versions', 'Aucune section intacte touchée']),
  ...qaCheck(['Correctifs ne cassent pas d\'autres zones ?']),
  ...promptCards([
    { agent: 'Claude Code', title: 'Applique correctif à section',
      prompt: 'Section SOP actuelle : [COLLE]. Correctif à appliquer : [ACTION PRÉCISE]. Réécris uniquement cette section en intégrant le correctif. Ne touche pas ce qui va bien. Sortie section V2.' },
  ]),
  ...conseilsSenior([
    'Correctif ciblé > refonte.',
    'Historique versions vital.',
    'Ne casse pas ce qui marche.',
  ]),
  ...validationFinale('SOP V2 prêt pour re-test.', 'Fichier « SOP_v2_[Titre].md » dans Projet → Documentation'),
  ...escalade('Réécriture impacte autres sections', 'Refonte partielle du SOP'),
]

const SOP_RETESTER: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Refaire le test avec nouveau testeur jusqu\'à zéro blocage',
    resultat: 'Test successful : nouvel employé exécute le SOP sans questionner',
    delai: 'Temps SOP × 1.5',
    canal: CANAL,
    regle: 'Boucle test → correctif → test jusqu\'à zéro blocage. Pas de raccourci.',
    prerequis: ['SOP V2 prêt', 'Nouveau testeur (jamais vu)'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. NOUVEAU TESTEUR + RE-TEST', {
    objectif: 'Test propre',
    temps: 'Selon SOP',
    ou: 'Environnement réel',
    actions: [
      'Choisis testeur différent de la 1ère fois (biais)',
      'Applique protocole SOP_TEST_NOUVEL',
      'Zéro blocage = validé',
      '≥ 1 blocage = retour SOP_CONSIGNER_BLOCAGES',
    ],
    resultat: 'Re-test complet.',
    verification: ['Nouveau testeur', 'Silence respecté', 'Blocages logés'],
    conseil: 'Boucle jusqu\'à zéro. Souvent 2-3 itérations suffisent.',
  }),
  ...finalCheck(['Nouveau testeur', 'Zéro blocage OU nouvelle itération lancée', 'Historique tests']),
  ...qaCheck(['Vraiment nouveau testeur ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Compare 2 tests SOP',
      prompt: 'Log test 1 : [COLLE]. Log test 2 : [COLLE]. Compare : (1) blocages communs, (2) blocages nouveaux, (3) progrès chiffré (temps + blocages). Sortie synthèse 5 lignes.' },
  ]),
  ...conseilsSenior([
    'Boucle jusqu\'à zéro blocage.',
    '2-3 itérations souvent suffisent.',
    'Testeur différent chaque fois.',
  ]),
  ...validationFinale('Zéro blocage atteint OU nouvelle itération planifiée.', 'Historique tests dans Projet → Documentation'),
  ...escalade('> 3 itérations sans zéro blocage', 'Refonte complète nécessaire'),
]

/* ─── VALIDATION & PUBLICATION ────────────────────────────────────────── */
const SOP_RELECTURE: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Relecture par responsable métier avant publication officielle',
    resultat: 'Validation écrite du responsable, corrections mineures intégrées',
    delai: '1 h',
    canal: CANAL,
    regle: 'Sans validation métier, le SOP peut contenir des erreurs factuelles.',
    prerequis: ['SOP zéro blocage'],
  }),
  ...projectContext(['project.name', 'project.responsable']),
  h2('Étapes'),
  ...etape('1. ENVOI + RÉUNION 30 MIN', {
    objectif: 'Validation métier',
    temps: '1 h',
    ou: 'Projet → Discussion + visio',
    actions: [
      'Envoie SOP au responsable métier',
      'Réunion 30 min : relecture ensemble',
      'Note corrections factuelles nécessaires',
      'Attends validation écrite',
    ],
    resultat: 'Validation métier.',
    verification: ['Corrections mineures intégrées', 'Signature écrite'],
    conseil: 'Le responsable métier peut voir des erreurs invisibles au consultant.',
  }),
  ...finalCheck(['Relecture faite', 'Corrections intégrées', 'Signature écrite responsable']),
  ...qaCheck(['Erreurs factuelles corrigées ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Prépare relecture responsable',
      prompt: 'SOP à relire : [COLLE]. Prépare 10 questions à poser au responsable métier pour vérifier justesse factuelle : outils cités, chiffres, tips, contexte business. Sortie liste.' },
  ]),
  ...conseilsSenior([
    'Responsable métier voit ce que consultant rate.',
    'Signature écrite = crédibilité future.',
    'Corrections mineures OK. Refonte = signal problème.',
  ]),
  ...validationFinale('Validation métier signée.', 'Message dans Projet → Discussion'),
  ...escalade('Responsable exige refonte', 'Retour phase interview + cadrage'),
]

const SOP_PUBLICATION: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Ajouter le SOP à la base de connaissances interne (Projet → Documentation)',
    resultat: 'SOP publié, indexé, retrouvable par tous les utilisateurs autorisés',
    delai: '30 min',
    canal: CANAL,
    regle: 'La base doit rester interne (jamais externe type Notion/Drive).',
    prerequis: ['Validation métier'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. PUBLIER + TAGS + INDEXATION', {
    objectif: 'Rendre découvrable',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Publie dans Projet → Documentation',
      'Ajoute tags : catégorie / niveau / fréquence',
      'Ajoute au sommaire des SOPs (index base connaissance)',
      'Version + date de publication',
      'Programme revue automatique dans 3 mois',
    ],
    resultat: 'SOP publié + indexé.',
    verification: ['Tags cohérents', 'Sommaire mis à jour', 'Revue programmée'],
    conseil: 'Un SOP non trouvable n\'existe pas.',
  }),
  ...finalCheck(['Publié dans Projet → Documentation', 'Tags + sommaire', 'Revue programmée 3 mois']),
  ...qaCheck(['Retrouvable en 30s via recherche ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Génère tags + résumé SOP',
      prompt: 'SOP : [COLLE début]. Génère : (1) 5 tags courts (catégorie + niveau + fréquence), (2) résumé 3 lignes pour sommaire base, (3) mots-clés recherche interne.' },
  ]),
  ...conseilsSenior([
    'SOP non trouvable = SOP mort.',
    'Tags + résumé cohérents = base saine.',
    'Revue 3 mois obligatoire.',
  ]),
  ...validationFinale('SOP publié + indexé + revue programmée.', 'Dans Projet → Documentation avec tags'),
  ...escalade('Base de connaissance non structurée', 'Créer sommaire dédié + convention nommage'),
]

const SOP_FORMATION: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Former l\'équipe au nouveau SOP en 30 min max',
    resultat: 'Équipe formée, questions répondues, adhésion',
    delai: '30 min',
    canal: CANAL,
    regle: 'Formation courte + questions ouvertes. Pas de monologue.',
    prerequis: ['SOP publié'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. FORMATION EXPRESS 30 MIN', {
    objectif: 'Adoption équipe',
    temps: '30 min',
    ou: 'Visio équipe',
    actions: [
      '5 min : pourquoi ce SOP (résout quel problème)',
      '15 min : parcours étapes clés',
      '10 min : Q/A libre',
      'Enregistre pour rediffuser',
    ],
    resultat: 'Équipe formée.',
    verification: ['Enregistrement dispo', 'Questions ouvertes traitées'],
    conseil: 'Question ouverte > monologue. Adhésion + qualité.',
  }),
  ...finalCheck(['30 min max', 'Enregistré', 'Q/A ouvert', 'Adhésion visible']),
  ...qaCheck(['Enregistrement partagé équipe ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Structure formation express SOP',
      prompt: 'SOP à former : [DESCRIPTION]. Rédige structure formation 30 min : 5 min pourquoi + 15 min parcours + 10 min Q/A. Format script.' },
  ]),
  ...conseilsSenior([
    'Question ouverte > monologue.',
    'Enregistrement = ressource future.',
    'Court > long. 30 min max.',
  ]),
  ...validationFinale('Équipe formée + enregistrement.', 'Enregistrement dans Projet → Ressources'),
  ...escalade('Adhésion faible / résistance', 'Discussion 1-1 avec sceptiques'),
]

const SOP_REVUE_3M: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Programmer revue automatique SOP dans 3 mois pour mise à jour',
    resultat: 'Task récurrente ERP créée, prochaine revue calendarisée',
    delai: '10 min',
    canal: CANAL,
    regle: 'Un SOP non revu > 6 mois est probablement obsolète.',
    prerequis: ['SOP publié'],
  }),
  ...projectContext(['project.name']),
  h2('Étapes'),
  ...etape('1. TASK ERP RÉCURRENTE', {
    objectif: 'Automatiser rappel',
    temps: '10 min',
    ou: 'ERP → Tâches',
    actions: [
      'Créer tâche récurrente ERP : « Revue SOP [Titre] » tous les 3 mois',
      'Assigner responsable métier',
      'Priorité 🟠',
      'Checklist revue : outils changés ? processus modifié ? nouveaux blocages ? tips à ajouter ?',
    ],
    resultat: 'Revue programmée.',
    verification: ['Tâche récurrente créée', 'Assignée', 'Checklist revue prête'],
    conseil: 'SOP jamais revu = SOP mort à 6 mois.',
  }),
  ...finalCheck(['Récurrence 3 mois', 'Assigné', 'Checklist revue']),
  ...qaCheck(['Rappel automatique fonctionne ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Checklist revue SOP 3 mois',
      prompt: 'Rédige checklist 10 items pour revue trimestrielle SOP : outils cités (encore valides ?), processus (changement ?), captures (obsolètes ?), tips (nouveau à ajouter ?), blocages (rapportés depuis 3 mois ?). Format checkbox.' },
  ]),
  ...conseilsSenior([
    'SOP jamais revu = mort à 6 mois.',
    'Checklist revue = économie de temps.',
    'Assigné toujours à un humain, pas « équipe ».',
  ]),
  ...validationFinale('Revue programmée dans ERP.', 'Tâche récurrente visible dans Projet → Tâches'),
  ...escalade('ERP ne supporte pas récurrence', 'Créer rappel calendrier + assignation manuelle'),
]

/* ═══════════════════════════════════════════════════════════════════════ */

export const SOP_INDEX_SOP_META: Record<string, SopBlock[]> = {
  [norm('Identifier précisément la tâche à documenter')]:      SOP_IDENTIFIER,
  [norm('Interviewer l\'expert qui réalise la tâche')]:        SOP_INTERVIEWER,
  [norm('Recueillir screenshots, vidéos et exemples réels')]:  SOP_MEDIAS_REELS,
  [norm('Section 1 — Objectif (raison d\'être + livrable + critères de réussite)')]: SOP_SECTION_OBJECTIF,
  [norm('Section 2 — Prérequis (accès, comptes, outils, droits)')]:                  SOP_SECTION_PREREQUIS,
  [norm('Section 3 — Outils utilisés (fonction + configuration + bonnes pratiques)')]: SOP_SECTION_OUTILS,
  [norm('Section 4 — Processus complet (étapes numérotées, chaque clic)')]:          SOP_SECTION_PROCESSUS,
  [norm('Section 5 — Contrôle qualité (checklist exhaustive)')]:                     SOP_SECTION_QC,
  [norm('Section 6 — Gestion des erreurs (problème / cause / solution / prévention)')]: SOP_SECTION_ERREURS,
  [norm('Section 7 — Optimisation (quoi automatiser, déléguer, confier à l\'IA)')]:  SOP_SECTION_OPTIM,
  [norm('Section 8 — Prompts IA prêts (Claude / ChatGPT / Gemini / Cursor)')]:       SOP_SECTION_PROMPTS,
  [norm('Section 9 — Livrables (fichiers, nommage, emplacement, résolution)')]:      SOP_SECTION_LIVRABLES,
  [norm('Section 10 — Vérification finale (checklist avant livraison)')]:            SOP_SECTION_VERIF,
  [norm('Section 11 — Temps estimé (débutant / intermédiaire / expert)')]:           SOP_SECTION_TEMPS,
  [norm('Section 12 — Niveau de priorité (🔴🟠🟢 + justification)')]:                SOP_SECTION_PRIORITE,
  [norm('Section 13 — Bonnes pratiques (réflexes de 30+ ans de terrain)')]:          SOP_SECTION_BONNES_PRATIQUES,
  [norm('Section 14 — Conseils d\'expert (méthodes des meilleures agences)')]:       SOP_SECTION_CONSEILS_EXPERT,
  [norm('Faire exécuter le SOP par un « nouvel employé fictif »')]:                  SOP_TEST_NOUVEL,
  [norm('Consigner les blocages et incompréhensions')]:                              SOP_CONSIGNER_BLOCAGES,
  [norm('Réécrire les sections problématiques')]:                                     SOP_REECRIRE,
  [norm('Refaire le test jusqu\'à zéro blocage')]:                                    SOP_RETESTER,
  [norm('Relecture par le responsable métier')]:                                      SOP_RELECTURE,
  [norm('Ajout du SOP à la base de connaissances (Notion / ERP / Drive)')]:          SOP_PUBLICATION,
  [norm('Formation express de l\'équipe (30 min max)')]:                             SOP_FORMATION,
  [norm('Planifier une revue du SOP dans 3 mois (mise à jour)')]:                    SOP_REVUE_3M,
}
