/**
 * SOP — Réseaux sociaux (45 tâches)
 * Rôle : Senior Social Media Manager — 30+ ans, IG/TikTok/FB, focus Maroc.
 */
import type { SopBlock } from '@/hooks/useSops'
import {
  introExpert, etape, finalCheck, qaCheck, promptCards,
  conseilsSenior, validationFinale, escalade, projectContext, h2,
} from './sopHelpers'

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
const ROLE = 'Senior Social Media Manager — 30+ ans, IG/TikTok/FB, marques Maroc 100k-1M followers'
const CANAL = 'Blocage → Projet → Discussion (canal Social)'

/* ─── COLLECTE (7 → 2 SOPs partagés) ──────────────────────────────────── */
const SOP_COLLECTE_IDENTITE_SOCIAL: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Récupérer logo, charte graphique, coordonnées, description, site',
    resultat: 'Kit identité complet dans Projet → Ressources',
    delai: '30 min',
    canal: CANAL,
    regle: 'Auto-fill depuis fiche projet. Compléter uniquement le manquant.',
    prerequis: ['Fiche projet à jour'],
  }),
  ...projectContext(['client.name', 'client.email', 'client.phone', 'client.company']),
  h2('Étapes'),
  ...etape('1. KIT IDENTITÉ + CHARTE', {
    objectif: 'Rassembler tous les assets',
    temps: '30 min',
    ou: 'Projet → Ressources',
    actions: [
      'Logo SVG + PNG transparent (versions horizontale + carrée)',
      'Couleurs HEX (primaire + secondaire + accent)',
      'Typographies (2 max : titre + corps)',
      'Description entreprise (150 chars max pour bio IG/FB)',
      'Site web URL + lien WhatsApp Business',
    ],
    resultat: 'Kit complet.',
    verification: ['Logo formats multiples', 'HEX précis', 'Bio 150 chars'],
    conseil: 'Bio 150 chars = même la plus longue plateforme. Rédige-la de suite.',
  }),
  ...finalCheck(['Logo SVG + PNG', 'HEX précis', '2 typos max', 'Bio 150 chars', 'URL + WhatsApp']),
  ...qaCheck(['Bio tient sur 150 chars ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Rédige bio réseaux 150 chars',
      prompt: 'Rédige bio Instagram/Facebook pour [ENTREPRISE SECTEUR] au Maroc. Contraintes : ≤ 150 chars, ligne 1 = accroche, ligne 2 = USP, ligne 3 = CTA. 1 émoji max début. Ton [TON].' },
  ]),
  ...conseilsSenior([
    'Bio 150 chars = standard multi-plateforme.',
    'Logo formats multiples = zéro friction.',
    'HEX précis, pas approximatifs.',
  ]),
  ...validationFinale('Kit identité complet.', 'Projet → Ressources / Kit-Social'),
  ...escalade('Charte graphique manquante', 'Créer projet identité visuelle en amont'),
]

const SOP_COLLECTE_CONTENUS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rassembler photos, vidéos, services/produits pour publications',
    resultat: 'Bibliothèque médias de base (30-50 assets) dans Projet → Ressources',
    delai: '2 h',
    canal: CANAL,
    regle: 'Photos verticales prioritaires (Reels/Stories = 9:16 native).',
    prerequis: ['Kit identité'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. BIBLIOTHÈQUE MÉDIA', {
    objectif: 'Photos + vidéos organisées',
    temps: '2 h',
    ou: 'Projet → Ressources',
    actions: [
      'Photos produits/services : 30+ photos HD, verticales prioritaires',
      'Vidéos courtes : 10+ clips 15-30s',
      'Photos équipe (portraits + team shots)',
      'Photos locaux / process',
      'Organiser par thème : produits / équipe / clients / process',
    ],
    resultat: 'Bibliothèque prête.',
    verification: ['30+ photos HD', '10+ vidéos', 'Organisé par thème'],
    conseil: 'Vertical 9:16 = format universel 2024. Horizontal = archives.',
  }),
  ...finalCheck(['30+ photos', '10+ vidéos', 'Vertical prioritaire', 'Organisé thématiquement']),
  ...qaCheck(['Photos HD ?', 'Vertical ≥ 60% ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Plan shoot photo/vidéo initial',
      prompt: 'Plan shoot 1 journée pour [ENTREPRISE SECTEUR] : 20 photos + 10 vidéos courtes. Sortie script détaillé : setup, poses, lieux, durée par shot.' },
  ]),
  ...conseilsSenior([
    'Vertical 9:16 = 2024.',
    '30+ assets = base saine 3 mois.',
    'Organiser par thème = productivité montage.',
  ]),
  ...validationFinale('Bibliothèque médias structurée.', 'Projet → Ressources / Medias-Social'),
  ...escalade('Photos existantes de mauvaise qualité', 'Shoot pro à programmer'),
]

/* ─── CRÉATION COMPTES (3 → 1 SOP) ────────────────────────────────────── */
const SOP_CREATION_COMPTES: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Créer les 3 comptes (FB Page + IG Business + TikTok Business)',
    resultat: 'Comptes actifs, vérifiés, liés au Business Manager',
    delai: '2 h',
    canal: CANAL,
    regle: 'Comptes au nom du client. Jamais agence.',
    prerequis: ['Kit identité + Meta Business Manager du client'],
  }),
  ...projectContext(['client.name', 'client.company', 'client.email', 'client.phone']),
  h2('Étapes'),
  ...etape('1. FACEBOOK PAGE', {
    objectif: 'Page pro FB',
    temps: '30 min',
    ou: 'facebook.com/pages/create',
    actions: [
      'Page → + Créer → Entreprise/Marque',
      'Nom = nom entreprise exact',
      'Catégorie précise (jamais générique)',
      'Photo profil = logo carré',
      'Cover = 1200x630 avec USP visuel',
      'Compléter Infos (site, tel, adresse, horaires)',
    ],
    resultat: 'Page FB active.',
    verification: ['Cover + profil', 'Infos complètes', 'Catégorie précise'],
    conseil: 'Cover FB → USP + CTA visuel. Pas juste une photo décorative.',
  }),
  ...etape('2. INSTAGRAM BUSINESS', {
    objectif: 'Compte IG converti Business',
    temps: '30 min',
    ou: 'App Instagram',
    actions: [
      'Créer compte IG ou convertir personnel → Professional',
      'Choix : Business (non Creator) pour full features',
      'Lien vers Page FB (Meta Business Suite)',
      'Bio 150 chars (voir SOP collecte)',
      'Lien : Linktree ou site direct',
    ],
    resultat: 'IG Business actif.',
    verification: ['Business (pas Creator)', 'Bio + lien', 'Lié FB Page'],
    conseil: 'Business > Creator pour Ads + Insights complets.',
  }),
  ...etape('3. TIKTOK BUSINESS', {
    objectif: 'Compte TikTok Business',
    temps: '30 min',
    ou: 'TikTok Business Center',
    actions: [
      'Créer compte TikTok classique',
      'Paramètres → Switch to Business Account',
      'Catégorie précise',
      'Bio + lien',
      'TikTok Business Center → ajouter compte (pour analytics)',
    ],
    resultat: 'TikTok Business.',
    verification: ['Business converti', 'Bio + lien', 'BC lié'],
    conseil: 'TikTok Business = insights + Ads. Non négociable pour pro.',
  }),
  ...finalCheck(['FB Page + cover + infos', 'IG Business + bio + lien FB', 'TikTok Business + BC', 'Toutes cohérentes (nom, ton, palette)']),
  ...qaCheck(['Cohérence marque partout ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Cover FB visual USP',
      prompt: 'Suggère 3 concepts cover Facebook 1200x630 pour [ENTREPRISE] : USP principal + CTA visuel. Chaque concept : palette + composition + éléments texte.' },
  ]),
  ...conseilsSenior([
    'Comptes au nom client.',
    'Business > Creator (features).',
    'Cover = USP + CTA visuel.',
  ]),
  ...validationFinale('3 comptes actifs et cohérents.', 'Section « Comptes sociaux » dans Projet → Infos & Accès'),
  ...escalade('IG rejette conversion Business', 'Vérifier catégorie + email/tel valides'),
]

/* ─── CONFIGURATION PROFILS (12 → 4 SOPs) ─────────────────────────────── */
const SOP_OPTIMISATION_PROFILS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Optimiser tous les éléments visibles : profil, cover, bio, coordonnées, liens, boutons',
    resultat: 'Profils complets, cohérents, incitant à l\'action',
    delai: '2 h',
    canal: CANAL,
    regle: 'Un profil incomplet convertit 2× moins.',
    prerequis: ['Comptes créés + kit identité'],
  }),
  ...projectContext(['client.name', 'client.phone', 'client.email', 'domain']),
  h2('Étapes'),
  ...etape('1. PROFIL + COVER + BIO PAR PLATEFORME', {
    objectif: 'Optimisation visuelle et textuelle',
    temps: '1 h',
    ou: 'FB / IG / TikTok',
    actions: [
      'Photo profil = logo carré 500x500 min (identique 3 plateformes)',
      'Cover FB 1200x630 + IG highlights covers (thèmes)',
      'Bio : accroche + USP + CTA + émojis discrets',
      'Cohérence texte + visuel entre 3 plateformes',
    ],
    resultat: 'Visuels + textes optimisés.',
    verification: ['Identité visuelle cohérente', 'Bio complète'],
    conseil: 'Cohérence visuelle 3 plateformes = crédibilité +50%.',
  }),
  ...etape('2. COORDONNÉES + LIENS + BOUTONS', {
    objectif: 'Facilite le contact',
    temps: '30 min',
    ou: 'Chaque plateforme',
    actions: [
      'Tel : format international +212...',
      'Email pro : contact@[domain].ma',
      'Site web dans bio (Linktree pour IG si multiple liens)',
      'Boutons action FB : Appeler / Envoyer message / Site',
      'Lien WhatsApp Business : wa.me/[tel]',
    ],
    resultat: 'Contact facilité.',
    verification: ['Tel + email + site', 'Boutons FB actifs', 'WhatsApp fonctionne'],
    conseil: 'Lien WhatsApp direct = -70% friction contact.',
  }),
  ...finalCheck(['Photo profil cohérente 3 plateformes', 'Cover FB + highlights IG', 'Bio complète + CTA', 'Tel + email + site + WA + boutons']),
  ...qaCheck(['Cohérence visuelle 3 plateformes ?', 'WhatsApp lien fonctionne ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Bio réseaux sociaux CTA',
      prompt: 'Bio [ENTREPRISE SECTEUR] pour IG + FB + TikTok. Contraintes : ≤ 150 chars, 3 lignes (accroche / USP / CTA), 1 émoji max début. Ton [TON]. Sortie 3 variantes par plateforme.' },
  ]),
  ...conseilsSenior([
    'Cohérence 3 plateformes = crédibilité.',
    'WhatsApp direct = friction -70%.',
    'Boutons FB actifs = conversion +30%.',
  ]),
  ...validationFinale('Profils optimisés partout.', 'Screenshots avant/après dans Projet → Documentation'),
  ...escalade('Comptes suspendus', 'Support plateforme + verification'),
]

const SOP_MBS_ACCES: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Configurer Meta Business Suite + liaison FB↔IG + accès collaborateurs + Pixel',
    resultat: 'BM configuré, comptes liés, accès équipe, Pixel installé si e-com',
    delai: '1 h',
    canal: CANAL,
    regle: 'Voir SOP Meta Ads « BM configuré » pour détails complets.',
    prerequis: ['Comptes créés'],
  }),
  ...projectContext(['client.name', 'client.company']),
  h2('Étapes'),
  ...etape('1. BM + LIAISONS + ACCÈS', {
    objectif: 'Meta écosystème structuré',
    temps: '1 h',
    ou: 'business.facebook.com',
    actions: [
      'BM au nom du client (voir SOP Meta Ads BM)',
      'Ajouter FB Page + IG Business comme assets',
      'Liaison FB ↔ IG : Business Suite → Accounts',
      'Accès collaborateurs : People → invite (rôles Admin / Employee)',
      'Pixel Meta si e-com : voir SOP Meta Ads Pixel',
    ],
    resultat: 'Meta config OK.',
    verification: ['Assets dans BM', 'FB ↔ IG liés', 'Accès équipe', 'Pixel si e-com'],
    conseil: 'BM propre = fondation Ads. Investis-le.',
  }),
  ...finalCheck(['BM au nom client', 'FB + IG liés', 'Accès équipe attribué', 'Pixel si applicable']),
  ...qaCheck(['Client Admin de son BM ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Explique BM au client',
      prompt: 'Explique Meta Business Suite au client [NOM] en 5 lignes : à quoi ça sert, pourquoi c\'est essentiel, quoi accepter. Ton rassurant.' },
  ]),
  ...conseilsSenior([
    'BM propre = fondation.',
    'Client Admin = philosophie partenariat.',
    'Pixel dès jour 1 si e-com.',
  ]),
  ...validationFinale('Meta configuré + liaisons.', 'Section Meta dans Projet → Infos & Accès'),
  ...escalade('BM verification stuck', 'Chef de projet — patience 3-7j + support'),
]

const SOP_VERIFICATION: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Obtenir badge de vérification IG/FB (blue check) si éligible',
    resultat: 'Comptes vérifiés OU justification écrite de non-éligibilité',
    delai: '1 h + 30 jours attente',
    canal: CANAL,
    regle: 'Vérification exige notoriété. Souvent client non-éligible en 2024.',
    prerequis: ['Comptes actifs 3+ mois'],
  }),
  ...projectContext(['client.name', 'client.company']),
  h2('Étapes'),
  ...etape('1. DEMANDE + JUSTIFICATIFS', {
    objectif: 'Soumettre demande officielle',
    temps: '1 h',
    ou: 'IG/FB Settings',
    actions: [
      'IG : Settings → Account → Request Verification',
      'FB : idem via Meta Verified (payant $12/mois)',
      'Justificatifs : ID gouvernement + articles presse + notoriété',
      'Attendre réponse 30 jours',
      'Si rejet : note raison et éligibilité future',
    ],
    resultat: 'Demande soumise.',
    verification: ['Justificatifs fournis', 'Ticket de suivi'],
    conseil: 'Meta Verified payant = quasi garanti si business légitime.',
  }),
  ...finalCheck(['Demande soumise', 'Justificatifs fournis', 'Notation dans Projet → Documentation']),
  ...qaCheck(['Éligibilité réaliste ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Évalue éligibilité vérification IG',
      prompt: 'Client [SECTEUR] avec [FOLLOWERS] followers depuis [DURÉE]. Évalue chances vérification IG/FB gratuite vs Meta Verified payant. Critères notoriété + presse + unique + complet.' },
  ]),
  ...conseilsSenior([
    'Vérification gratuite = rare 2024.',
    'Meta Verified payant = alternative fiable.',
    'Documente refus pour re-tenter plus tard.',
  ]),
  ...validationFinale('Vérification obtenue OU notée.', 'Section « Vérification » dans Projet → Documentation'),
  ...escalade('Client insiste sur vérification impossible', 'Meta Verified payant OU accepter'),
]

/* ─── CONTENU HEBDO (8 → 3 SOPs) ──────────────────────────────────────── */
const SOP_PUBLICATION_HEBDO: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Publier 1 post (feed) qualitatif sur IG + FB, planifié via Meta Business Suite',
    resultat: 'Post publié aux 3 plateformes, engagement > 3% attendu',
    delai: '2 h par post',
    canal: CANAL,
    regle: 'Aucun post sans caption + hashtags + CTA + planning.',
    prerequis: ['Visuel prêt', 'Copy prêt', 'Hashtags recherchés'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. VISUEL + COPY + HASHTAGS', {
    objectif: 'Éléments prêts',
    temps: '1 h',
    ou: 'Canva + Projet → Documentation',
    actions: [
      'Visuel : format 1080x1350 (4:5) IG feed + 1080x1080 FB feed',
      'Cohérent charte graphique (couleurs + typo)',
      'Copy : 220 chars visibles avant « voir plus » + CTA',
      '15-20 hashtags mix (5 précis + 5 moyens + 5 génériques)',
      'Tag partenaires si applicable',
    ],
    resultat: 'Éléments prêts.',
    verification: ['Formats corrects', '220 chars visibles', '15-20 hashtags'],
    conseil: 'Ligne 1 caption = accroche impactante ≤ 12 mots.',
  }),
  ...etape('2. PLANIFICATION + PUBLICATION', {
    objectif: 'Publier au meilleur moment',
    temps: '30 min',
    ou: 'Meta Business Suite',
    actions: [
      'Business Suite → Planning → nouveau post',
      'Sélectionner IG + FB simultanément',
      'Horaire optimal : Insights → heures actives audience (souvent 19-21h Maroc)',
      'Planifier ou publier immédiatement',
      'Cross-post TikTok en Reels si applicable',
    ],
    resultat: 'Post publié.',
    verification: ['Publié IG + FB', 'Horaire optimal'],
    conseil: '19-21h Maroc = pic engagement multi-secteurs.',
  }),
  ...etape('3. SUIVI + ENGAGEMENT 24H', {
    objectif: 'Interaction rapide = boost algo',
    temps: '30 min étalé sur 24h',
    ou: 'Business Suite',
    actions: [
      'Répondre commentaires < 15 min heures ouvrées',
      'Liker commentaires positifs',
      'Story repost si mention significative',
      'Note dans Projet → Documentation : engagement à 24h',
    ],
    resultat: 'Engagement traité.',
    verification: ['Réponses < 15 min', 'Story repost si applicable'],
    conseil: 'Réponse rapide = boost algo IG. 15 min règle d\'or.',
  }),
  ...finalCheck(['Visuel format correct', 'Copy + hashtags + CTA', 'Publié IG + FB horaire optimal', 'Engagement 24h traité']),
  ...qaCheck(['Ligne 1 accroche puissante ?', 'Réponses 15 min ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Caption IG optimisée',
      prompt: 'Publication : [BRIEF]. Rédige caption IG max 220 chars visibles + 15 hashtags. Contraintes : accroche 12 mots ligne 1, CTA final, 1 émoji début. Ton [TON]. Sortie séparée caption + hashtags.' },
  ]),
  ...conseilsSenior([
    'Réponse 15 min = algo IG boost.',
    '19-21h Maroc = pic engagement.',
    'Ligne 1 = 80% impact caption.',
  ]),
  ...validationFinale('Post publié + engagement traité.', 'Note engagement dans Projet → Documentation'),
  ...escalade('Engagement < 1% récurrent', 'Chef de projet — audit stratégie contenu'),
]

const SOP_VISUELS_HEBDO: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Créer visuels hebdo (3-5 posts + stories + Reels covers) sur Canva Pro',
    resultat: 'Bibliothèque visuels semaine dans Canva + PNG exportés',
    delai: '3-4 h',
    canal: CANAL,
    regle: 'Templates Canva réutilisables. Ne repars pas de zéro chaque semaine.',
    prerequis: ['Charte graphique + assets photos'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. TEMPLATES CANVA', {
    objectif: 'Système modulaire',
    temps: '2 h initial (une fois)',
    ou: 'Canva Pro',
    actions: [
      'Créer 5-8 templates par type : quote / product / testimonial / carousel / promo',
      'Palette couleurs client sauvegardée dans Brand Kit',
      'Typos client dans Brand Kit',
      'Templates dupliquables → productivité × 5',
    ],
    resultat: 'Templates prêts.',
    verification: ['Brand Kit configuré', '5-8 templates par type'],
    conseil: 'Templates réutilisables = clé productivité 2 ans.',
  }),
  ...etape('2. VISUELS SEMAINE', {
    objectif: 'Décliner templates avec contenu semaine',
    temps: '2 h',
    ou: 'Canva',
    actions: [
      'Dupliquer template pertinent par publication',
      'Personnaliser texte + image',
      'Export PNG @2x (haute qualité)',
      'Naming : YYYY-MM-DD_[type]_[client].png',
      'Archive Projet → Ressources / Visuels-Semaine',
    ],
    resultat: '3-5 visuels semaine.',
    verification: ['Exports HD', 'Naming cohérent'],
    conseil: 'PNG @2x → qualité mobile Retina display.',
  }),
  ...finalCheck(['Brand Kit Canva', 'Templates réutilisables', '3-5 visuels semaine', 'Naming cohérent']),
  ...qaCheck(['Templates réutilisables ?', 'Qualité @2x ?']),
  ...promptCards([
    { agent: 'Gemini', title: 'Suggère 5 concepts visuels semaine',
      prompt: 'Client [ENTREPRISE SECTEUR]. Suggère 5 concepts visuels pour la semaine : mix product + quote + testimonial + carousel + behind-the-scenes. Chaque concept : brief + palette + composition.' },
  ]),
  ...conseilsSenior([
    'Templates > design ad-hoc.',
    'Brand Kit Canva = automation.',
    '@2x pour qualité mobile.',
  ]),
  ...validationFinale('Visuels semaine prêts.', 'Projet → Ressources / Visuels-Semaine'),
  ...escalade('Manque photos brutes', 'Shoot ou banque images libre de droits'),
]

const SOP_COPY_HASHTAGS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger copywriting + rechercher hashtags optimaux pour chaque publication',
    resultat: 'Copy caption + 15-20 hashtags stratégiques prêts à intégrer',
    delai: '30 min par post',
    canal: CANAL,
    regle: 'Jamais 30 hashtags. 15-20 = sweet spot 2024.',
    prerequis: ['Brief publication'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. COPYWRITING + HASHTAGS', {
    objectif: 'Caption + hashtags stratégiques',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Ligne 1 : accroche 12 mots max, question ou statement fort',
      'Ligne 2-3 : contexte + bénéfice',
      'CTA final : « Découvrez... », « DM pour... »',
      '15-20 hashtags : 5 précis (< 100k) + 5 moyens (100k-1M) + 5 génériques (> 1M)',
      'Bannis hashtags interdits IG (change régulièrement, check ban list)',
    ],
    resultat: 'Caption + hashtags.',
    verification: ['≤ 220 chars caption visible', '15-20 hashtags mix'],
    conseil: '5 précis + 5 moyens + 5 génériques = mix optimal reach + qualité.',
  }),
  ...finalCheck(['Ligne 1 impactante', 'CTA final', '15-20 hashtags mix']),
  ...qaCheck(['Aucun hashtag banned ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Copywriting + hashtags IG',
      prompt: 'Publication IG : [BRIEF]. Rédige caption max 220 chars visibles + 15 hashtags optimisés (5 précis + 5 moyens + 5 génériques). Ton [TON] Maroc. Sortie séparée.' },
  ]),
  ...conseilsSenior([
    '15-20 hashtags > 30.',
    'Mix taille = reach + qualité.',
    'Check ban list régulièrement.',
  ]),
  ...validationFinale('Copy + hashtags prêts.', 'Fichier semaine dans Projet → Documentation'),
  ...escalade('Shadowban suspecté', 'Pause hashtags 7 jours + refresh liste'),
]

const SOP_PROGRAMMATION: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Planifier semaine complète via Business Suite / Later / Metricool',
    resultat: 'Calendrier semaine bouclé, publications automatiques aux heures optimales',
    delai: '1 h par semaine',
    canal: CANAL,
    regle: 'Programmer > publier manuel. Sauf pour Reels (algo préfère natif).',
    prerequis: ['Publications semaine prêtes'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. PLANIFIER 7 JOURS', {
    objectif: 'Semaine complète programmée',
    temps: '1 h',
    ou: 'Business Suite',
    actions: [
      'Business Suite → Planning → Créer publication',
      'Pour chaque post : plateforme (IG + FB) + horaire optimal',
      'Reels : préférer publish natif app (algo boost)',
      'Vérifier queue de la semaine',
      'Note dans Projet → Documentation planning',
    ],
    resultat: 'Semaine programmée.',
    verification: ['7 jours couverts', 'Horaires optimaux'],
    conseil: 'Business Suite gratuit = suffit 90% cas. Later/Metricool si multi-comptes.',
  }),
  ...finalCheck(['7 jours programmés', 'Horaires optimaux', 'Reels publish natif']),
  ...qaCheck(['Queue cohérente ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Calendrier social semaine',
      prompt: 'Génère calendrier social 7 jours pour [SECTEUR] : mix contenu (product/quote/testimonial/behind-the-scenes/promo), horaires optimaux Maroc, format tableau | Jour | Heure | Type | Brief |.' },
  ]),
  ...conseilsSenior([
    'Business Suite = free suffit.',
    'Reels publish natif = boost.',
    'Programmer = productivité.',
  ]),
  ...validationFinale('Semaine programmée.', 'Screenshot planning dans Projet → Documentation'),
  ...escalade('Business Suite bug scheduling', 'Basculer sur Later ou manuel'),
]

const SOP_AVIS_CLIENTS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Demander 3 avis clients par semaine (Google, FB, IG Highlights)',
    resultat: '3 avis authentiques collectés + republiés en Story/Reel',
    delai: '30 min par semaine',
    canal: CANAL,
    regle: 'Jamais faux avis. Toujours authentiques.',
    prerequis: ['CRM ou clients récents'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. DEMANDES + REPUBLICATIONS', {
    objectif: 'Collecter + amplifier',
    temps: '30 min',
    ou: 'WhatsApp + Google + FB + IG',
    actions: [
      'Identifier 5-10 clients satisfaits récents (< 30 jours)',
      'WhatsApp : message perso + lien Google Reviews + IG DM',
      'Republier avis reçus en Story IG + Reel testimonial',
      'Compter dans Projet → Documentation : avis collectés / semaine',
    ],
    resultat: '3+ nouveaux avis.',
    verification: ['3+ avis authentiques', 'Republiés Stories'],
    conseil: 'Message perso WhatsApp > formulaire automatique. Conversion 5-10× plus.',
  }),
  ...finalCheck(['3 nouveaux avis/semaine', 'Republiés en Stories/Reels', 'Métriques trackées']),
  ...qaCheck(['Avis authentiques ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Message demande avis WhatsApp',
      prompt: 'Rédige message WhatsApp perso pour demander avis Google à client [NOM] après achat/service. Contraintes : max 5 lignes, chaleureux, direct, lien Google Reviews à insérer. Ton Maroc.' },
  ]),
  ...conseilsSenior([
    'WhatsApp perso > formulaire.',
    'Republier = amplification 3×.',
    'Jamais faux avis.',
  ]),
  ...validationFinale('3+ avis/semaine collectés.', 'Compteur dans Projet → Documentation'),
  ...escalade('Aucun avis récolté 3 semaines', 'Audit qualité service'),
]

/* ─── STORIES & REELS (3 → 1 SOP) ─────────────────────────────────────── */
const SOP_STORIES_REELS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Publier Stories (5-10/sem) + Reels/vidéos courtes (2-3/sem)',
    resultat: 'Contenu vidéo régulier boostant reach et engagement',
    delai: '3 h par semaine',
    canal: CANAL,
    regle: 'Reels 15-30s = sweet spot 2024 (retention élevée).',
    prerequis: ['Vidéos brutes'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. STORIES QUOTIDIENNES', {
    objectif: 'Présence quotidienne',
    temps: '30 min/jour',
    ou: 'App IG',
    actions: [
      'Idées : behind-the-scenes + polls + quiz + reposts + promos',
      'Format 9:16 vertical natif',
      'Text overlay + stickers interactifs (poll, question)',
      'Highlights : catégoriser (Services / Avis / FAQ / Team)',
    ],
    resultat: 'Stories quotidiennes.',
    verification: ['5-10 stories/sem', 'Stickers interactifs', 'Highlights organisés'],
    conseil: 'Stickers interactifs = engagement 3× stories statiques.',
  }),
  ...etape('2. REELS 2-3 PAR SEMAINE', {
    objectif: 'Format qui explose reach 2024',
    temps: '2 h par Reel',
    ou: 'CapCut / IG natif',
    actions: [
      'Durée : 15-30s (retention max)',
      'Hook 3s puissant (question, statement, visuel choc)',
      'Sous-titres burnt-in (85% mobile no-sound)',
      'Musique tendance IG (Sound library)',
      'CTA final : « suis pour... »',
    ],
    resultat: '2-3 Reels/sem.',
    verification: ['15-30s', 'Sous-titres', 'Hook puissant'],
    conseil: 'Reels 15-30s > 60s. Retention divise-t-elle par 3 au-delà.',
  }),
  ...etape('3. TIKTOK CROSS-POST', {
    objectif: 'Recycler contenu vertical',
    temps: '30 min',
    ou: 'TikTok app',
    actions: [
      'Reposter Reels sur TikTok (SANS watermark IG — attention algo pénalise)',
      'Adapter caption pour TikTok (hashtags plus courts)',
      'Musique TikTok trending si possible',
    ],
    resultat: 'Cross-post TikTok.',
    verification: ['Sans watermark IG', 'Hashtags TikTok'],
    conseil: 'TikTok pénalise contenu avec watermark IG. Toujours version clean.',
  }),
  ...finalCheck(['5-10 Stories/sem', '2-3 Reels/sem', 'Highlights organisés', 'Cross-post TikTok clean']),
  ...qaCheck(['Sous-titres Reels ?', 'Aucun watermark IG sur TikTok ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Script Reel 30s',
      prompt: 'Rédige script Reel IG 30s pour [BRIEF]. Structure Hook 3s / Développement 15s / CTA 5s. Format : | Timecode | Voix off | Texte à l\'écran |. Ton [TON], français Maroc.' },
  ]),
  ...conseilsSenior([
    'Reels 15-30s > 60s.',
    'Hook 3s = 80% du succès.',
    'TikTok sans watermark IG.',
  ]),
  ...validationFinale('Stories + Reels + TikTok.', 'Compteur dans Projet → Documentation'),
  ...escalade('Retention Reels < 30%', 'Hook à retravailler prioritaire'),
]

/* ─── COMMUNITY MANAGEMENT (3 → 1 SOP) ────────────────────────────────── */
const SOP_CM: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Répondre commentaires + DM + modérer les 3 plateformes',
    resultat: 'Toutes interactions traitées en < 15 min heures ouvrées',
    delai: '1 h par jour ouvré',
    canal: CANAL,
    regle: 'Réponse < 15 min = signal fort à l\'algo + expérience user.',
    prerequis: ['Accès BM + notifications'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. RÉPONSES COMMENTAIRES', {
    objectif: 'Traiter chaque commentaire',
    temps: '30 min/jour',
    ou: 'Business Suite Inbox',
    actions: [
      'Business Suite → Inbox → filtres FB + IG',
      'Réponse personnalisée (jamais copier-coller)',
      'Positif : remercier + question ouverte pour prolonger',
      'Négatif : reconnaître + DM pour résoudre en privé',
      'Spam : signaler',
    ],
    resultat: 'Commentaires traités.',
    verification: ['0 commentaire ignoré 24h', 'Personnalisé'],
    conseil: 'Question ouverte en réponse = boost engagement algo.',
  }),
  ...etape('2. DM + MODÉRATION', {
    objectif: 'Messages privés + brand safety',
    temps: '30 min/jour',
    ou: 'Inbox + IG',
    actions: [
      'Répondre DM < 15 min heures ouvrées',
      'FAQ : templates prêts (mais toujours personnaliser 1 phrase)',
      'Modérer : masquer commentaires haineux / spam',
      'Signaler / bloquer utilisateurs abusifs',
      'Escalader plaintes graves au chef projet',
    ],
    resultat: 'DM + modération.',
    verification: ['< 15 min réponse DM', 'Modération active'],
    conseil: 'Un commentaire haineux non modéré = 10 clients perdus lecteurs.',
  }),
  ...finalCheck(['Commentaires traités < 24h', 'DM < 15 min heures ouvrées', 'Modération active', 'Escalade si besoin']),
  ...qaCheck(['0 message ignoré ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Réponse commentaire négatif',
      prompt: 'Commentaire négatif client : [COMMENT]. Rédige réponse pro : reconnaître + solution en DM + tonalité apaisante. Max 3 phrases. Français Maroc.' },
  ]),
  ...conseilsSenior([
    '< 15 min = boost algo.',
    'Question ouverte = engagement.',
    'Modération protège la marque.',
  ]),
  ...validationFinale('CM quotidien traité.', 'Log journalier dans Projet → Documentation'),
  ...escalade('Attaque coordonnée / crise', 'Chef de projet + gestion de crise'),
]

/* ─── DÉVELOPPEMENT COMMUNAUTÉ (4 → 1 SOP) ────────────────────────────── */
const SOP_COMMUNITY_GROWTH: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Faire grandir communauté : invitations, partages, interactions, veille concurrentielle',
    resultat: 'Croissance +50-100 followers/semaine organiques',
    delai: '2 h par semaine',
    canal: CANAL,
    regle: 'Croissance organique > acheter followers. Pas de raccourci.',
    prerequis: ['Contenu régulier'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. INVITATIONS + PARTAGES', {
    objectif: 'Amplification manuelle',
    temps: '1 h/semaine',
    ou: 'IG / FB',
    actions: [
      'FB Page : Inviter fans → « inviter à aimer »',
      'IG : Reposter mentions Stories → cercle vertueux',
      'Partager publications dans groupes FB pertinents (sans spam)',
      'Cross-promotion avec 2-3 comptes complémentaires (échange story)',
    ],
    resultat: 'Amplification manuelle.',
    verification: ['Invitations FB faites', 'Reposts', 'Cross-promo'],
    conseil: 'Cross-promotion = ROI + qualité followers massif.',
  }),
  ...etape('2. INTERACTIONS + VEILLE', {
    objectif: 'Présence proactive',
    temps: '1 h/semaine',
    ou: 'IG / TikTok',
    actions: [
      'Commenter posts 10 comptes complémentaires (non-concurrents)',
      'Répondre à posts partenaires',
      'Veille : suivre 5 concurrents → noter ce qui marche',
      'Note dans Projet → Documentation insights concurrents',
    ],
    resultat: 'Interactions + veille.',
    verification: ['10 commentaires/sem', 'Veille tracée'],
    conseil: 'Commentaires longs (2+ phrases) sur gros comptes = visibilité massive.',
  }),
  ...finalCheck(['Invitations + reposts', 'Cross-promotion', '10 commentaires/sem', 'Veille tracée']),
  ...qaCheck(['Cross-promotion active ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Cross-promotion pitch',
      prompt: 'Rédige DM pitch cross-promotion à compte complémentaire [DESCRIPTION]. Contraintes : max 5 phrases, propose échange story mutuel, ton pro. Français Maroc.' },
  ]),
  ...conseilsSenior([
    'Cross-promotion = golden.',
    'Commentaires 2+ phrases > likes.',
    'Veille = source d\'idées.',
  ]),
  ...validationFinale('Croissance active + veille.', 'Compteurs dans Projet → Documentation'),
  ...escalade('Stagnation 3+ semaines', 'Chef de projet — revoir stratégie contenu'),
]

/* ─── ANALYSE (5 → 2 SOPs) ────────────────────────────────────────────── */
const SOP_ANALYSE_STATS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Extraire statistiques 3 plateformes + analyser performance publications',
    resultat: 'Rapport analytics hebdo : portée, engagement, top posts, insights',
    delai: '1 h par semaine',
    canal: CANAL,
    regle: 'Chiffres sans insights = rapport inutile.',
    prerequis: ['Comptes Business (Insights actifs)'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. EXTRACTION MULTI-PLATEFORME', {
    objectif: 'Data 7 derniers jours',
    temps: '30 min',
    ou: 'Business Suite Insights + TikTok Analytics',
    actions: [
      'FB Insights : portée, engagement, followers, top posts',
      'IG Insights : impressions, reach, engagement, Reels/Stories perf',
      'TikTok Analytics : vues, likes, followers, top vidéos',
      'Métricool si multi-comptes',
    ],
    resultat: 'Data extraite.',
    verification: ['3 plateformes couvertes', '7 derniers jours'],
    conseil: 'Métricool > screenshots — historique + comparaison automatique.',
  }),
  ...etape('2. TOP POSTS + INSIGHTS', {
    objectif: 'Comprendre ce qui marche',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Top 3 posts semaine (par engagement rate)',
      'Analyser : format / horaire / hashtags / hook',
      'Bottom 3 posts semaine → apprendre du pire',
      '3 insights actionnables pour semaine suivante',
    ],
    resultat: 'Insights structurés.',
    verification: ['Top + Bottom 3', '3 insights actionnables'],
    conseil: 'Bottom posts apprennent autant que Top. Ne les ignore pas.',
  }),
  ...finalCheck(['Data 3 plateformes 7j', 'Top + Bottom 3', '3 insights actionnables']),
  ...qaCheck(['Insights vraiment actionnables ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Extract insights depuis stats',
      prompt: 'Voici stats IG 7j : [COLLE]. Extrait 3 insights actionnables : (1) format qui marche, (2) horaire optimal confirmé, (3) hashtag pattern gagnant. Sortie priorités actions.' },
  ]),
  ...conseilsSenior([
    'Bottom posts = leçons.',
    '3 insights > 30 chiffres.',
    'Métricool = productivité rapports.',
  ]),
  ...validationFinale('Analyse hebdo complète.', 'Fichier « Analyse_S[NUM].md » dans Projet → Documentation'),
  ...escalade('Stagnation 4 semaines', 'Chef de projet — refonte stratégie'),
]

const SOP_RAPPORT_SOCIAL: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rédiger rapport hebdo client + proposer améliorations',
    resultat: 'Rapport 1-pager + 3 propositions améliorations mois suivant',
    delai: '45 min',
    canal: CANAL,
    regle: 'Rapport avec propositions > rapport factuel.',
    prerequis: ['Analyse hebdo'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. RAPPORT + PROPOSITIONS', {
    objectif: '1-pager actionable',
    temps: '45 min',
    ou: 'Projet → Documentation',
    actions: [
      'Section 1 : KPIs (portée + engagement + followers gain)',
      'Section 2 : Top 3 posts + pourquoi',
      'Section 3 : 3 propositions améliorations semaine suivante',
      'Envoyer via Projet → Discussion + demande accusé',
    ],
    resultat: 'Rapport envoyé.',
    verification: ['1 page max', '3 propositions actionnables', 'Envoyé'],
    conseil: 'Chaque proposition = 1 action précise, pas générique.',
  }),
  ...finalCheck(['1 page max', '3 propositions', 'Envoyé + accusé demandé']),
  ...qaCheck(['Propositions actionnables ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Rapport social hebdo 1-pager',
      prompt: 'Data 7j : [COLLE]. Rédige rapport client 1-pager : KPIs + Top 3 posts + 3 propositions améliorations semaine suivante. Max 300 mots. Ton pro français.' },
  ]),
  ...conseilsSenior([
    'Propositions > chiffres.',
    '1 page A4 max.',
    'Accusé lecture = engagement client.',
  ]),
  ...validationFinale('Rapport livré + propositions.', 'Fichier PDF dans Projet → Documentation'),
  ...escalade('Client ne lit pas 3 semaines', 'Signal désengagement — chef projet'),
]

/* ═══════════════════════════════════════════════════════════════════════ */

export const SOP_INDEX_SOCIAL: Record<string, SopBlock[]> = {
  // Collecte (7 → 2)
  [norm('Récupérer le logo de l\'entreprise')]:                       SOP_COLLECTE_IDENTITE_SOCIAL,
  [norm('Charte graphique (couleurs et typographies)')]:              SOP_COLLECTE_IDENTITE_SOCIAL,
  [norm('Coordonnées (adresse, téléphone, e-mail)')]:                 SOP_COLLECTE_IDENTITE_SOCIAL,
  [norm('Site web / lien de destination')]:                           SOP_COLLECTE_IDENTITE_SOCIAL,
  [norm('Description de l\'entreprise')]:                             SOP_COLLECTE_IDENTITE_SOCIAL,
  [norm('Liste des services et produits')]:                           SOP_COLLECTE_CONTENUS,
  [norm('Photos et vidéos de base')]:                                 SOP_COLLECTE_CONTENUS,
  // Comptes (3 → 1)
  [norm('Création de la page Facebook')]:                             SOP_CREATION_COMPTES,
  [norm('Création du compte Instagram')]:                             SOP_CREATION_COMPTES,
  [norm('Création du compte TikTok')]:                                SOP_CREATION_COMPTES,
  // Config profils (12 → 3)
  [norm('Optimisation générale des profils')]:                        SOP_OPTIMISATION_PROFILS,
  [norm('Ajout de la photo de profil et de couverture')]:             SOP_OPTIMISATION_PROFILS,
  [norm('Rédaction de la biographie optimisée')]:                     SOP_OPTIMISATION_PROFILS,
  [norm('Ajout des coordonnées')]:                                    SOP_OPTIMISATION_PROFILS,
  [norm('Ajout du lien du site web')]:                                SOP_OPTIMISATION_PROFILS,
  [norm('Ajout du lien WhatsApp')]:                                   SOP_OPTIMISATION_PROFILS,
  [norm('Configuration des boutons d\'action')]:                      SOP_OPTIMISATION_PROFILS,
  [norm('Liaison Facebook ↔ Instagram')]:                             SOP_MBS_ACCES,
  [norm('Configuration du Meta Business Manager')]:                   SOP_MBS_ACCES,
  [norm('Attribution des accès aux collaborateurs')]:                 SOP_MBS_ACCES,
  [norm('Vérification des comptes (badge)')]:                         SOP_VERIFICATION,
  [norm('Installation du Pixel Meta (si nécessaire)')]:               SOP_MBS_ACCES,
  // Contenu hebdo (8 → 4)
  [norm('Publication #1 de la semaine')]:                             SOP_PUBLICATION_HEBDO,
  [norm('Publication #2 de la semaine')]:                             SOP_PUBLICATION_HEBDO,
  [norm('Publication #3 de la semaine')]:                             SOP_PUBLICATION_HEBDO,
  [norm('Création des visuels de la semaine')]:                       SOP_VISUELS_HEBDO,
  [norm('Rédaction des textes (copywriting)')]:                       SOP_COPY_HASHTAGS,
  [norm('Recherche des hashtags')]:                                   SOP_COPY_HASHTAGS,
  [norm('Programmation des publications')]:                           SOP_PROGRAMMATION,
  [norm('Demander 3 avis clients')]:                                  SOP_AVIS_CLIENTS,
  // Stories/Reels (3 → 1)
  [norm('Publication de Stories')]:                                   SOP_STORIES_REELS,
  [norm('Création de Reels / vidéos courtes')]:                       SOP_STORIES_REELS,
  [norm('Publication sur TikTok')]:                                   SOP_STORIES_REELS,
  // CM (3 → 1)
  [norm('Réponse aux commentaires')]:                                 SOP_CM,
  [norm('Réponse aux messages privés')]:                              SOP_CM,
  [norm('Modération des publications')]:                              SOP_CM,
  // Dev communauté (4 → 1)
  [norm('Invitation de nouveaux abonnés')]:                           SOP_COMMUNITY_GROWTH,
  [norm('Partage des publications')]:                                 SOP_COMMUNITY_GROWTH,
  [norm('Interaction avec la communauté')]:                           SOP_COMMUNITY_GROWTH,
  [norm('Veille concurrentielle')]:                                   SOP_COMMUNITY_GROWTH,
  // Analyse (5 → 2)
  [norm('Analyse des statistiques')]:                                 SOP_ANALYSE_STATS,
  [norm('Suivi de la portée et de l\'engagement')]:                   SOP_ANALYSE_STATS,
  [norm('Analyse des performances des publications')]:                SOP_ANALYSE_STATS,
  [norm('Rapport hebdomadaire au client')]:                           SOP_RAPPORT_SOCIAL,
  [norm('Proposition d\'améliorations')]:                             SOP_RAPPORT_SOCIAL,
}
