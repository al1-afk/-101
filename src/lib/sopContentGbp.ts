/**
 * SOP — Google Business Profile / GMB (61 tâches)
 * Rôle : Consultant SEO Local Senior — 30+ ans, 500+ fiches gérées Maroc/francophone.
 */
import type { SopBlock } from '@/hooks/useSops'
import {
  introExpert, etape, finalCheck, qaCheck, promptCards,
  conseilsSenior, validationFinale, escalade, projectContext, h2,
} from './sopHelpers'

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
const ROLE = 'Consultant SEO Local Senior — 30+ ans, 500+ fiches GBP gérées, focus Maroc'
const CANAL = 'Blocage → Projet → Discussion (canal SEO Local)'

/* ─── COLLECTE (15 → 3 SOPs) ──────────────────────────────────────────── */
const SOP_COLLECTE_NAP: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Collecter NAP (Name, Address, Phone) + email + site + catégories',
    resultat: 'Fiche NAP complète cohérente avec site + réseaux sociaux',
    delai: '30 min',
    canal: CANAL,
    regle: 'NAP identique partout : GBP + site + FB + IG + annuaires. Sinon Google confuse.',
    prerequis: ['Fiche projet à jour'],
  }),
  ...projectContext(['client.name', 'client.company', 'client.phone', 'client.email', 'domain']),
  h2('Étapes'),
  ...etape('1. NAP + INFOS BASE', {
    objectif: 'Uniformiser NAP',
    temps: '30 min',
    ou: 'Projet → Vue d\'ensemble + Documentation',
    actions: [
      'Nom exact (identique registre commerce)',
      'Adresse complète (numéro + rue + quartier + ville + code postal + pays)',
      'Téléphone format international +212...',
      'Email pro : contact@[domain].ma',
      'Site web HTTPS complet',
      'Catégorie principale : la plus spécifique possible (« Photographe mariage » > « Photographe »)',
      'Catégories secondaires (max 9)',
    ],
    resultat: 'NAP + catégories complètes.',
    verification: ['NAP cohérent site/réseaux', 'Catégorie principale spécifique'],
    erreurs: [['Catégorie générique', 'Perte position. Toujours spécifique.']],
    conseil: 'Catégorie principale = signal ranking le plus fort. Choisis minutieusement.',
  }),
  ...finalCheck(['Nom exact', 'Adresse complète', 'Tel international', 'Email pro', 'Site HTTPS', 'Catégorie spécifique']),
  ...qaCheck(['NAP identique site + réseaux ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Choisir catégorie GBP spécifique',
      prompt: 'Business [DESCRIPTION] au Maroc. Recherche catégories GBP disponibles + propose LA plus spécifique (pas générique) + 2-3 secondaires. Justifie chaque choix.' },
  ]),
  ...conseilsSenior([
    'NAP incohérent = confusion Google.',
    'Catégorie principale = ranking factor #1.',
    'Spécifique > générique.',
  ]),
  ...validationFinale('NAP + catégories prêts pour GBP.', 'Projet → Vue d\'ensemble + Documentation'),
  ...escalade('Catégorie exacte n\'existe pas', 'Choisir la plus proche + secondaires précises'),
]

const SOP_COLLECTE_SERVICES_HORAIRES: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Structurer horaires + services + produits + zone d\'intervention',
    resultat: 'Grille horaires + liste services structurée + zone géo',
    delai: '30 min',
    canal: CANAL,
    regle: 'Horaires réels. Google check et pénalise incohérences.',
    prerequis: ['Client accessible'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. HORAIRES + SERVICES + ZONE', {
    objectif: 'Info opérationnelle',
    temps: '30 min',
    ou: 'Projet → Documentation',
    actions: [
      'Horaires : jours + heures + pauses déjeuner + jours fériés',
      'Zone d\'intervention (rayon km OU liste villes)',
      'Services : liste 5-20 avec description 100 mots + prix si publiable',
      'Produits : liste 5-20 avec photos HD + prix',
    ],
    resultat: 'Grille + listes.',
    verification: ['Horaires réels', 'Services > 5', 'Zone précise'],
    conseil: 'Zone d\'intervention rayon 10km > toute la ville. Google local préfère précis.',
  }),
  ...finalCheck(['Horaires précis', 'Services 5+', 'Produits 5+', 'Zone géo définie']),
  ...qaCheck(['Horaires réels ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Structure liste services GBP',
      prompt: 'Services bruts [COLLE]. Structure pour GBP : Nom | Description 100 mots | Prix (si publiable). 5-20 services. Ton commercial.' },
  ]),
  ...conseilsSenior([
    'Horaires réels ou pénalité.',
    'Zone rayon > ville complète.',
    'Services 5-20 sweet spot.',
  ]),
  ...validationFinale('Horaires + services + zone prêts.', 'Projet → Documentation'),
  ...escalade('Horaires variables (saisonniers)', 'Configurer horaires spéciaux GBP'),
]

const SOP_COLLECTE_VISUELS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Rassembler logo, photo couverture, photos entreprise (10+), réseaux sociaux',
    resultat: 'Kit visuel : logo + cover + 10-30 photos HD + URLs réseaux',
    delai: '2 h',
    canal: CANAL,
    regle: 'Photos avec géotag EXIF + timestamp = boost SEO local.',
    prerequis: ['Photographe OU photos existantes HD'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. PHOTOS + LOGO + COVER + RÉSEAUX', {
    objectif: 'Kit complet',
    temps: '2 h',
    ou: 'Projet → Ressources',
    actions: [
      'Logo : PNG carré 500x500 min',
      'Cover : paysage 1080x608 (16:9)',
      'Photos entreprise : intérieur (5+) + extérieur (3+) + équipe (2+) + produits (5+)',
      'Résolution min 720x720 (4:3 privilégié)',
      'Géotag EXIF avec coordonnées réelles (script si nécessaire)',
      'URLs réseaux sociaux',
    ],
    resultat: 'Kit visuel prêt.',
    verification: ['10+ photos HD', 'Géotag EXIF', 'Format 4:3'],
    conseil: 'Google filtre photos sans géotag comme suspectes. Toujours géotag.',
  }),
  ...finalCheck(['Logo carré', 'Cover 16:9', '10+ photos géotag', 'URLs réseaux']),
  ...qaCheck(['Photos géotaggées ?']),
  ...promptCards([
    { agent: 'Claude Code', title: 'Script géotag EXIF batch',
      prompt: 'Script Python pour ajouter géotag EXIF (lat/long) à batch photos JPEG. Input : dossier + coordonnées GPS + timestamp. Utilise piexif. Sortie code complet + usage.' },
  ]),
  ...conseilsSenior([
    'Géotag EXIF = boost SEO local.',
    'Photos 4:3 > 16:9 pour Google.',
    'Intérieur + extérieur + équipe = trinité.',
  ]),
  ...validationFinale('Kit visuel géotaggé.', 'Projet → Ressources / GBP-Visuels'),
  ...escalade('Photos trop faible qualité', 'Shoot pro à programmer'),
]

/* ─── CRÉATION FICHE (14 → 2 SOPs) ────────────────────────────────────── */
const SOP_CREATION_FICHE: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Créer fiche GBP + tous les champs (catégories, horaires, services, produits, attributs, photos)',
    resultat: 'Fiche 100% complète (Google score complet), soumise pour vérification',
    delai: '2 h',
    canal: CANAL,
    regle: 'Fiche incomplète = ranking pénalisé. Vise 100% completion.',
    prerequis: ['Toutes infos collectées'],
  }),
  ...projectContext(['client.name', 'client.company', 'client.phone', 'domain']),
  h2('Étapes'),
  ...etape('1. CRÉER + REMPLIR FICHE', {
    objectif: 'Fiche 100% complète',
    temps: '2 h',
    ou: 'business.google.com',
    actions: [
      'Créer fiche : Business Profile Manager → + Créer',
      'Renseigner Nom + Catégorie principale + Adresse',
      'Choisir : Business avec adresse physique OU zone service',
      'Compléter Contact (tel + email + site)',
      'Horaires : semaine + jours spéciaux (jours fériés)',
      'Description SEO (750 chars max) avec KW naturels',
      'Services + Produits (voir SOP suivant pour ajouts massifs)',
      'Attributs (WiFi, parking, accessibilité PMR, etc.)',
      'Upload logo + cover + 10+ photos géotaggées',
      'Lier WhatsApp (si applicable via Chat Google Business)',
    ],
    resultat: 'Fiche complète prête pour vérification.',
    verification: ['Score completion 100%', 'Photos ≥ 10', 'Description ≤ 750 chars'],
    conseil: 'Description : KW principaux dans 100 premiers chars = boost.',
  }),
  ...finalCheck(['Nom + catégorie + adresse', 'Horaires + description', 'Services + produits + attributs', '10+ photos géotag', 'Logo + cover', 'Score 100%']),
  ...qaCheck(['Description KW dans 100 premiers chars ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Description GBP SEO 750 chars',
      prompt: 'Business [DESCRIPTION SECTEUR MAROC]. Rédige description GBP 750 chars max. Contraintes : KW principal « [KW] » dans 100 premiers chars, USPs, zone géo, CTA. Ton commercial + local.' },
  ]),
  ...conseilsSenior([
    '100% completion = ranking boost.',
    'KW dans 100 premiers chars description.',
    'Attributs = signaux additionnels ranking.',
  ]),
  ...validationFinale('Fiche 100% complète.', 'Screenshot dans Projet → Documentation'),
  ...escalade('Duplicate fiche détectée', 'Chef de projet — réclamer merger via support Google'),
]

const SOP_VERIFICATION_FICHE: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Vérifier la fiche (postcard / phone / email / video)',
    resultat: 'Fiche vérifiée avec check bleu Google',
    delai: '5-30 jours selon méthode',
    canal: CANAL,
    regle: 'Video verification = méthode préférée Google 2024.',
    prerequis: ['Fiche créée + accès physique OU vidéo possible'],
  }),
  ...projectContext(['client.name', 'client.phone', 'client.email']),
  h2('Étapes'),
  ...etape('1. VÉRIFICATION + SUIVI', {
    objectif: 'Obtenir le check',
    temps: '30 min setup + 5-30j attente',
    ou: 'Google Business Profile',
    actions: [
      'Choisir méthode : Video (préféré) > Phone > Email > Postcard',
      'Video : filmer 30-60s montrant lieu + signalétique + preuve d\'activité',
      'Postcard : 5-10j Maroc (adresse doit être valide)',
      'Ne PAS modifier fiche pendant attente vérification',
      'Vérifier statut : Business Profile → Verification',
    ],
    resultat: 'Fiche vérifiée.',
    verification: ['Check Google', 'Notification réussite'],
    erreurs: [['Modifier pendant vérif', 'Reset process. Attends toujours fin.']],
    conseil: 'Video verif > Postcard depuis 2023 (plus rapide + fiable).',
  }),
  ...finalCheck(['Méthode choisie', 'Preuves fournies', 'Fiche vérifiée + check bleu']),
  ...qaCheck(['Aucune modif pendant attente ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Script video verification',
      prompt: 'Script video verification GBP 30-60s : filmer lieu + signalétique + preuve activité. Contraintes : montrer nom entreprise, adresse visible, activité en cours. Format storyboard 5 shots.' },
  ]),
  ...conseilsSenior([
    'Video > Postcard 2024.',
    'Zéro modif pendant attente.',
    'Preuves solides = validation rapide.',
  ]),
  ...validationFinale('Fiche vérifiée.', 'Section Vérification dans Projet → Infos & Accès'),
  ...escalade('Vérification rejetée 2 fois', 'Support Google + reprendre preuves'),
]

/* ─── CONFIG TRACKING (5 → 2 SOPs) ────────────────────────────────────── */
const SOP_UTM_TRACKING: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Créer UTM pour tracker trafic GBP + connecter SC/GA4',
    resultat: 'UTM sur lien site fiche, GA4 identifie source « gbp »',
    delai: '30 min',
    canal: CANAL,
    regle: 'Sans UTM, impossible de mesurer ROI GBP.',
    prerequis: ['GA4 configuré'],
  }),
  ...projectContext(['client.name', 'domain']),
  h2('Étapes'),
  ...etape('1. UTM + SC + GA4', {
    objectif: 'Tracking bout-en-bout',
    temps: '30 min',
    ou: 'GBP + GA4',
    actions: [
      'Générer UTM : https://[domain].ma/?utm_source=google&utm_medium=organic&utm_campaign=gbp',
      'GBP → Modifier profil → Site web → coller URL avec UTM',
      'GA4 → vérifier Traffic Source → source=google apparaît',
      'Search Console : voir SOP SEO Search Console',
    ],
    resultat: 'Tracking actif.',
    verification: ['UTM dans URL GBP', 'GA4 identifie', 'SC connecté'],
    conseil: 'UTM = seule façon de séparer GBP du SEO organique dans GA4.',
  }),
  ...finalCheck(['UTM configuré GBP', 'GA4 identifie source', 'SC connecté']),
  ...qaCheck(['GA4 sépare bien GBP du SEO ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Générateur UTM structure',
      prompt: 'Génère UTM pour tracking GBP (Google Business Profile). Format : utm_source + medium + campaign + term + content. Explique chaque paramètre. Exemple pour [DOMAIN].' },
  ]),
  ...conseilsSenior([
    'UTM = ROI mesurable.',
    'Source « google » medium « organic » distinctif.',
  ]),
  ...validationFinale('Tracking UTM opérationnel.', 'Section Tracking dans Projet → Documentation'),
  ...escalade('GA4 ne sépare pas GBP du SEO', 'Vérifier UTM parameters bien passés'),
]

const SOP_VERIF_FINALE_INDEX: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Vérification finale infos + indexation site (si non fait)',
    resultat: 'Fiche cohérente + site indexé Google',
    delai: '30 min',
    canal: CANAL,
    regle: 'Voir SOP SEO Sitemap + Search Console pour détails.',
    prerequis: ['Fiche + site prêts'],
  }),
  ...projectContext(['client.name', 'domain']),
  h2('Étapes'),
  ...etape('1. AUDIT FINAL + SUBMISSION', {
    objectif: 'Zéro incohérence',
    temps: '30 min',
    ou: 'GBP + SC',
    actions: [
      'Audit final NAP : site vs GBP vs réseaux (utiliser BrightLocal / manuel)',
      'Vérifier catégorie principale confirmée',
      'Search Console → Sitemap soumis',
      'URL Inspection → Request indexing pour pages critiques',
    ],
    resultat: 'Tout cohérent + indexé.',
    verification: ['NAP identique 3+ sources', 'Sitemap soumis', 'Pages requested indexing'],
    conseil: 'Incohérence NAP = Google confuse = ranking dilué.',
  }),
  ...finalCheck(['NAP cohérent partout', 'Sitemap soumis SC', 'Pages critiques requested indexing']),
  ...qaCheck(['NAP identique 100% ?']),
  ...promptCards([
    { agent: 'Claude Code', title: 'Audit NAP cohérence',
      prompt: 'NAP entreprise : [DONNEES]. Compare avec ce que je vois sur : (1) GBP, (2) site web, (3) FB, (4) IG, (5) annuaires. Liste incohérences détectées (ponctuation, format tel, adresse). Sortie tableau.' },
  ]),
  ...conseilsSenior([
    'NAP incohérent = ranking cassé.',
    'BrightLocal automatise audit.',
    'Request indexing accélère.',
  ]),
  ...validationFinale('Vérif finale + indexation.', 'Rapport dans Projet → Documentation'),
  ...escalade('Incohérences NAP répandues', 'Audit + correction annuaires (BrightLocal Fixer)'),
]

/* ─── PUBLICATIONS HEBDO (5 → 2 SOPs) ─────────────────────────────────── */
const SOP_GOOGLE_POST: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Publier Google Post hebdo avec photo + copy + CTA',
    resultat: 'Post publié GBP, visible SERP local pendant 7 jours',
    delai: '30 min',
    canal: CANAL,
    regle: 'Google Posts expirent 7 jours. Publie régulièrement (min 1/sem).',
    prerequis: ['Photo + copy prêts'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. VISUEL + COPY + CTA', {
    objectif: 'Post complet',
    temps: '20 min',
    ou: 'Business Profile Manager',
    actions: [
      'Photo 1200x900 (4:3) HD',
      'Copy : max 1500 chars, KW principal, CTA clair',
      'CTA button : Book / Order / Learn more / Sign up / Call now',
      'Lien : page pertinente avec UTM',
      'Alt text photo descriptif + KW',
    ],
    resultat: 'Post prêt.',
    verification: ['Photo 4:3', 'CTA button', 'UTM lien'],
    conseil: 'CTA « Call now » = +50% appels vs Learn more pour local.',
  }),
  ...etape('2. PUBLICATION + SUIVI', {
    objectif: 'Publier + tracker perf',
    temps: '10 min',
    ou: 'GBP',
    actions: [
      'GBP → Publications → + Créer',
      'Choisir type : Actualité / Offre / Événement',
      'Publier immédiatement',
      'Noter métrique semaine suivante (vues, clics)',
    ],
    resultat: 'Post publié + suivi.',
    verification: ['Statut Published', 'Métriques 7j tracées'],
    conseil: 'Type « Offre » booste conversions vs Actualité.',
  }),
  ...finalCheck(['Photo 4:3 HD', 'Copy KW + CTA', 'Type post pertinent', 'Métrics 7j tracées']),
  ...qaCheck(['CTA aligné avec objectif ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Google Post copy 1500 chars',
      prompt: 'Business [SECTEUR MAROC]. Rédige Google Post : accroche + bénéfice + CTA. Max 1500 chars, KW principal « [KW] » naturel, type [offer/news/event]. Ton commercial local.' },
  ]),
  ...conseilsSenior([
    'Google Posts expirent 7j.',
    '« Offre » > « Actualité » conversion.',
    '« Call now » CTA = +50% appels.',
  ]),
  ...validationFinale('Post publié + tracké.', 'Log dans Projet → Documentation'),
  ...escalade('Post rejeté policy', 'Vérifier claims non conformes'),
]

const SOP_OFFRES_ACTUS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Ajouter actualités entreprise + promouvoir offres/services spéciaux',
    resultat: 'Actualités hebdo publiées, offres visibles SERP',
    delai: '30 min par semaine',
    canal: CANAL,
    regle: 'Type « Offre » avec dates début/fin + code promo si applicable.',
    prerequis: ['Info actualité/offre client'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. TYPE OFFRE / ACTUALITÉ', {
    objectif: 'Post structuré',
    temps: '30 min',
    ou: 'GBP',
    actions: [
      'Actualité : ancre événement récent (nouveau service, ouverture, milestone)',
      'Offre : dates début-fin, code promo, réduction %, terms',
      'Photo attractive',
      'CTA aligné (Book, Buy, Redeem)',
    ],
    resultat: 'Post pertinent.',
    verification: ['Type approprié', 'Dates pour offres', 'CTA aligné'],
    conseil: 'Offre avec dates limitées = urgence = +30% conversions.',
  }),
  ...finalCheck(['Type approprié', 'Dates + code si offre', 'Photo + CTA']),
  ...qaCheck(['Urgence bien communiquée ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Post offre limitée dans le temps',
      prompt: 'Offre : [DÉTAILS]. Rédige Google Post type Offer : accroche urgence + bénéfice + dates + code promo + CTA. Max 1500 chars. Français Maroc.' },
  ]),
  ...conseilsSenior([
    'Dates limitées = urgence.',
    'Code promo optionnel.',
    'Type « Offer » spécial.',
  ]),
  ...validationFinale('Actualité/offre publiée.', 'Log dans Projet → Documentation'),
  ...escalade('Offre récurrente refusée policy', 'Reformuler sans « toujours »'),
]

/* ─── PHOTOS & VIDÉOS HEBDO (3 → 1 SOP) ───────────────────────────────── */
const SOP_MEDIAS_HEBDO: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Ajouter 2-3 nouvelles photos/vidéos par semaine + optimiser légendes',
    resultat: 'Fiche fraîche, médias géotaggés, KW dans légendes',
    delai: '30 min par semaine',
    canal: CANAL,
    regle: 'Photos géotaggées avec EXIF timestamp = signal fort SEO local.',
    prerequis: ['Photos/vidéos disponibles'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. UPLOAD + LÉGENDES', {
    objectif: 'Fraîcheur + SEO',
    temps: '30 min',
    ou: 'GBP',
    actions: [
      '2-3 nouvelles photos HD 4:3 par semaine',
      'Géotag EXIF + timestamp actuel',
      'Vidéos 30s max, format vertical possible',
      'Légendes descriptives + KW naturels',
      'Alt text si champs disponible',
    ],
    resultat: 'Médias frais.',
    verification: ['2-3/sem', 'Géotag', 'Légendes KW'],
    conseil: 'Google favorise fiches actives (nouveaux médias hebdo).',
  }),
  ...finalCheck(['2-3 médias/sem', 'Géotag EXIF', 'Légendes KW', 'Timestamps récents']),
  ...qaCheck(['Géotag présent ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Légendes GBP KW naturels',
      prompt: '10 photos [DESCRIPTION]. Rédige 10 légendes GBP : descriptives + KW « [KW] » naturel. Max 100 chars chacune. Pas de stuffing.' },
  ]),
  ...conseilsSenior([
    'Géotag EXIF non négociable.',
    'Fiche active = boost ranking.',
    'Alt text si champs dispo.',
  ]),
  ...validationFinale('Médias hebdo publiés.', 'Compteur Projet → Documentation'),
  ...escalade('Photos rejetées « inappropriate »', 'Vérifier absence texte/logo excessif'),
]

/* ─── AVIS CLIENTS HEBDO (3 → 1 SOP) ──────────────────────────────────── */
const SOP_AVIS: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Demander 3 nouveaux avis + répondre TOUS avis + signaler faux',
    resultat: '3+ nouveaux avis/sem, tous avis répondus 24h, faux avis signalés',
    delai: '1 h par semaine',
    canal: CANAL,
    regle: 'Réponse < 24h à tous les avis, positifs ET négatifs. Google le voit.',
    prerequis: ['CRM clients récents + notifications GBP'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. DEMANDER 3 AVIS', {
    objectif: 'Récolter authentiques',
    temps: '15 min',
    ou: 'CRM + WhatsApp',
    actions: [
      'Identifier 5-10 clients récents satisfaits',
      'WhatsApp message perso + lien Google Review URL',
      'Générer URL via GBP → Partager profil → Copier lien',
      '3 nouveaux avis visés par semaine',
    ],
    resultat: '3+ avis.',
    verification: ['3+ nouveaux avis/sem', 'Authentiques'],
    conseil: 'Message WhatsApp perso > formulaire automatique. Conversion 5-10× plus.',
  }),
  ...etape('2. RÉPONDRE TOUS AVIS', {
    objectif: 'Chaque avis répondu 24h',
    temps: '30 min',
    ou: 'GBP → Reviews',
    actions: [
      'Avis positif : merci personnel + citer détail précis + KW naturel',
      'Avis négatif : reconnaître + solution + inviter DM',
      'Neutre : merci + inviter suite',
      'JAMAIS générique « merci pour votre avis »',
      'Max 500 chars réponse',
    ],
    resultat: 'Tous répondus.',
    verification: ['0 avis non répondu 48h', 'Personnalisé'],
    conseil: 'Détail précis dans la réponse = signal Google qualité + confiance client.',
  }),
  ...etape('3. SIGNALER FAUX AVIS', {
    objectif: 'Nettoyage',
    temps: '15 min',
    ou: 'GBP → Reviews → Flag',
    actions: [
      'Détecter faux avis : jamais client, spam, off-topic, concurrence',
      'Report via GBP → Flag inappropriate',
      'Suivre 3-7 jours pour retrait',
      'Si refusé : escalader via Twitter @GoogleMyBiz',
    ],
    resultat: 'Faux signalés.',
    verification: ['Signalements faits', 'Suivi retrait'],
    conseil: 'Twitter @GoogleMyBiz plus réactif que support classique.',
  }),
  ...finalCheck(['3+ nouveaux avis/sem', 'Tous avis répondus 24h personnalisés', 'Faux avis signalés']),
  ...qaCheck(['Aucune réponse générique ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Réponse avis positif KW',
      prompt: 'Avis client positif : [AVIS]. Note [X/5]. Business [SECTEUR VILLE]. Rédige réponse GBP <300 chars : merci perso + détail précis + KW « [KW] » naturel + invitation retour.' },
    { agent: 'ChatGPT', title: 'Réponse avis négatif diplomate',
      prompt: 'Avis négatif : [AVIS]. Note [X/5]. Rédige réponse GBP <300 chars : reconnaître + apologies + solution + inviter contact DM/tel. Ton apaisant.' },
  ]),
  ...conseilsSenior([
    'WhatsApp perso > formulaire.',
    'Détail précis = signal qualité.',
    'Twitter @GoogleMyBiz > support.',
  ]),
  ...validationFinale('Avis gérés + faux signalés.', 'Compteur dans Projet → Documentation'),
  ...escalade('Avis négatif menaçant', 'Chef de projet + support Google'),
]

/* ─── SEO LOCAL HEBDO (4 → 1 SOP) ─────────────────────────────────────── */
const SOP_SEO_LOCAL: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Vérifier positions KW locaux + optim description + ajouter services + contrôler catégories',
    resultat: 'Positions monitorées, fiche affinée, ranking en progression',
    delai: '1 h par semaine',
    canal: CANAL,
    regle: 'Local Falcon > GBP Insights pour tracking positions par lieu.',
    prerequis: ['Fiche vérifiée + KW cibles définis'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. TRACK + AFFINER', {
    objectif: 'Amélioration continue',
    temps: '1 h',
    ou: 'Local Falcon + GBP',
    actions: [
      'Local Falcon : scan grid → positions KW principaux par lieu',
      'Note delta vs semaine précédente',
      'Affiner description si KW pas dans top 100 chars',
      'Ajouter services/produits manquants',
      'Vérifier catégorie principale toujours pertinente',
    ],
    resultat: 'Fiche affinée + tracking.',
    verification: ['Positions trackées', 'Description affinée si besoin', 'Catégories vérifiées'],
    conseil: 'Local Falcon révèle « pockets géographiques » où tu perds vs top 3.',
  }),
  ...finalCheck(['Positions trackées', 'Description affinée', 'Services/produits à jour', 'Catégories vérifiées']),
  ...qaCheck(['Delta vs sem dernière noté ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Optimiser description depuis positions',
      prompt: 'Positions actuelles KW : [DATA]. Description actuelle : [COLLE]. Propose 3 optimisations : (1) KW ajouter dans 100 premiers chars, (2) USP à renforcer, (3) CTA plus fort. Sortie avant/après.' },
  ]),
  ...conseilsSenior([
    'Local Falcon > Insights natifs.',
    'Description 100 premiers chars critiques.',
    'Catégorie principale = ranking #1.',
  ]),
  ...validationFinale('Fiche affinée + tracking.', 'Rapport hebdo dans Projet → Documentation'),
  ...escalade('Positions chutent > 5 places', 'Audit possible pénalité / concurrence'),
]

/* ─── SUIVI STATS HEBDO (5 → 1 SOP) ───────────────────────────────────── */
const SOP_STATS_HEBDO: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Suivre stats GBP : appels, clics site, itinéraires, messages',
    resultat: 'Rapport stats hebdo trackant les 4 métriques principales',
    delai: '30 min par semaine',
    canal: CANAL,
    regle: 'Stats sans action = données mortes.',
    prerequis: ['GBP Insights actif'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. EXTRACTION + INSIGHTS', {
    objectif: 'Comprendre performance',
    temps: '30 min',
    ou: 'GBP → Perspectives',
    actions: [
      'Extraire 7 derniers jours : appels, clics site, itinéraires, messages',
      'Comparer vs semaine précédente + moyenne 4 semaines',
      'Identifier tendances (jour de la semaine, heures pics)',
      'Note dans Projet → Documentation : tableau + 3 insights',
    ],
    resultat: 'Data + insights.',
    verification: ['4 métriques trackées', '3 insights actionnables'],
    conseil: 'Pic appels vendredi 17-19h Maroc = signal fort planification promo.',
  }),
  ...finalCheck(['4 métriques 7j', 'Comparaison sem précédente + 4 sem', '3 insights actionnables']),
  ...qaCheck(['Insights actionnables ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Extract insights GBP stats',
      prompt: 'Data stats GBP 7j : [COLLE]. Extrait 3 insights : (1) heure/jour pic activité, (2) source top trafic, (3) opportunité inexploitée. Sortie priorités actions.' },
  ]),
  ...conseilsSenior([
    'Stats = base des propositions.',
    'Pics horaires révèlent audience.',
    'Sans action, data mortes.',
  ]),
  ...validationFinale('Stats + insights.', 'Rapport dans Projet → Documentation'),
  ...escalade('Baisse > 30% vs sem précédente', 'Audit urgent (pénalité ? saison ? concurrence ?)'),
]

/* ─── MAINTENANCE HEBDO (4 → 1 SOP) ───────────────────────────────────── */
const SOP_MAINTENANCE: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Vérifier horaires (jours fériés), coordonnées, erreurs signalées, cohérence site',
    resultat: 'Fiche sans anomalies, alignée avec site web',
    delai: '30 min par semaine',
    canal: CANAL,
    regle: 'Google notifie erreurs. Ignorer = pénalité.',
    prerequis: ['Fiche vérifiée'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. AUDIT + CORRECTIONS', {
    objectif: 'Zéro anomalie',
    temps: '30 min',
    ou: 'GBP + site',
    actions: [
      'Vérifier horaires spéciaux (jours fériés à venir + exceptions)',
      'Coordonnées : tel + email actuels',
      'Google alertes : erreurs suggérées par communauté / algo',
      'Cohérence site web : NAP + horaires alignés',
      'Corriger toute anomalie détectée',
    ],
    resultat: 'Fiche propre.',
    verification: ['Horaires à jour', 'Coordonnées OK', 'Erreurs Google traitées'],
    conseil: 'Google suggestions communauté = signal fort. Traite < 24h.',
  }),
  ...finalCheck(['Horaires spéciaux à jour', 'Coordonnées vérifiées', 'Erreurs Google traitées', 'NAP aligné site']),
  ...qaCheck(['0 suggestion Google ignorée ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Calendrier horaires spéciaux Maroc',
      prompt: 'Génère calendrier 3 mois horaires spéciaux GBP Maroc : jours fériés (religieux + civils) + exceptions typiques secteur [SECTEUR]. Format : Date | Événement | Horaires suggérés (fermé/spécial).' },
  ]),
  ...conseilsSenior([
    'Suggestions communauté < 24h.',
    'Jours fériés à programmer 1 mois avant.',
    'NAP identique site + GBP obligatoire.',
  ]),
  ...validationFinale('Maintenance à jour.', 'Log dans Projet → Documentation'),
  ...escalade('Modification refusée par Google', 'Support GBP + réclamer'),
]

/* ─── RAPPORT CLIENT HEBDO (3 → 1 SOP) ────────────────────────────────── */
const SOP_RAPPORT_GBP: SopBlock[] = [
  ...introExpert({
    role: ROLE,
    objectif: 'Préparer rapport hebdo + présenter au client + proposer améliorations',
    resultat: 'Rapport 1-pager + visio 15 min + validation client',
    delai: '1 h par semaine',
    canal: CANAL,
    regle: 'Chiffres + insights + propositions = trilogie du rapport pro.',
    prerequis: ['Stats + insights collectés'],
  }),
  ...projectContext(['client.name']),
  h2('Étapes'),
  ...etape('1. RAPPORT + PRÉSENTATION + PROPOSITIONS', {
    objectif: 'Communiquer valeur',
    temps: '1 h',
    ou: 'Projet → Documentation + visio',
    actions: [
      'Rapport 1-pager : KPIs (appels + itinéraires + clics + messages) + Top 3 insights + 3 propositions semaine suivante',
      'Envoyer 24h avant visio',
      'Visio 15-30 min : présenter + Q/A',
      'Signature écrite « ok pour la suite »',
    ],
    resultat: 'Rapport livré + validé.',
    verification: ['1 page A4', '3 propositions actionnables', 'Signature écrite'],
    conseil: 'Un rapport lu > un rapport envoyé. Force la visio.',
  }),
  ...finalCheck(['1 page A4', 'KPIs + insights + propositions', 'Visio tenue', 'Signature écrite']),
  ...qaCheck(['Client comprend valeur ?']),
  ...promptCards([
    { agent: 'ChatGPT', title: 'Rapport GBP hebdo 1-pager',
      prompt: 'Stats GBP 7j : [COLLE]. Rédige rapport 1-pager client : (1) KPIs vs sem précédente, (2) 3 insights, (3) 3 propositions améliorations. Max 300 mots. Ton pro.' },
  ]),
  ...conseilsSenior([
    'Chiffres + insights + propositions.',
    'Visio > email.',
    'Signature écrite = engagement.',
  ]),
  ...validationFinale('Rapport présenté + validé.', 'Fichier PDF dans Projet → Documentation'),
  ...escalade('Client refuse visio 3 sem', 'Signal désengagement — chef projet'),
]

/* ═══════════════════════════════════════════════════════════════════════ */

export const SOP_INDEX_GBP: Record<string, SopBlock[]> = {
  // Collecte (15 → 3)
  [norm('Nom exact de l\'entreprise')]:                          SOP_COLLECTE_NAP,
  [norm('Catégorie principale + catégories secondaires')]:       SOP_COLLECTE_NAP,
  [norm('Adresse complète')]:                                    SOP_COLLECTE_NAP,
  [norm('Numéro de téléphone')]:                                 SOP_COLLECTE_NAP,
  [norm('Adresse e-mail')]:                                      SOP_COLLECTE_NAP,
  [norm('Site web')]:                                            SOP_COLLECTE_NAP,
  [norm('Horaires d\'ouverture')]:                               SOP_COLLECTE_SERVICES_HORAIRES,
  [norm('Description optimisée SEO')]:                           SOP_COLLECTE_SERVICES_HORAIRES,
  [norm('Zone d\'intervention géographique')]:                   SOP_COLLECTE_SERVICES_HORAIRES,
  [norm('Liste des services')]:                                  SOP_COLLECTE_SERVICES_HORAIRES,
  [norm('Liste des produits')]:                                  SOP_COLLECTE_SERVICES_HORAIRES,
  [norm('Logo de l\'entreprise')]:                               SOP_COLLECTE_VISUELS,
  [norm('Photo de couverture')]:                                 SOP_COLLECTE_VISUELS,
  [norm('Photos de l\'entreprise (intérieur/extérieur)')]:       SOP_COLLECTE_VISUELS,
  [norm('Liens des réseaux sociaux')]:                           SOP_COLLECTE_VISUELS,
  // Création fiche (14 → 2)
  [norm('Création de la fiche Google Business Profile')]:        SOP_CREATION_FICHE,
  [norm('Configuration complète du profil')]:                    SOP_CREATION_FICHE,
  [norm('Ajout des catégories (principale + secondaires)')]:     SOP_CREATION_FICHE,
  [norm('Ajout des services détaillés')]:                        SOP_CREATION_FICHE,
  [norm('Ajout des produits')]:                                  SOP_CREATION_FICHE,
  [norm('Ajout des horaires')]:                                  SOP_CREATION_FICHE,
  [norm('Ajout des attributs (WiFi, parking, etc.)')]:           SOP_CREATION_FICHE,
  [norm('Ajout du logo')]:                                       SOP_CREATION_FICHE,
  [norm('Ajout de la photo de couverture')]:                     SOP_CREATION_FICHE,
  [norm('Ajout des premières photos (10 minimum)')]:             SOP_CREATION_FICHE,
  [norm('Vérification de la fiche (carte postale/tel/mail)')]:   SOP_VERIFICATION_FICHE,
  [norm('Liaison avec le site web')]:                            SOP_CREATION_FICHE,
  [norm('Ajout du lien WhatsApp')]:                              SOP_CREATION_FICHE,
  [norm('Activation de la messagerie (si disponible)')]:         SOP_CREATION_FICHE,
  // Config tracking (5 → 2)
  [norm('Création des UTM pour le suivi')]:                      SOP_UTM_TRACKING,
  [norm('Connexion à Google Search Console')]:                   SOP_UTM_TRACKING,
  [norm('Connexion à Google Analytics')]:                        SOP_UTM_TRACKING,
  [norm('Vérification finale des informations')]:                SOP_VERIF_FINALE_INDEX,
  [norm('Indexation du site (si non fait)')]:                    SOP_VERIF_FINALE_INDEX,
  // Publications hebdo (5 → 2)
  [norm('Publier Google Post #1 de la semaine')]:                SOP_GOOGLE_POST,
  [norm('Publier Google Post #2 de la semaine')]:                SOP_GOOGLE_POST,
  [norm('Publier Google Post #3 de la semaine')]:                SOP_GOOGLE_POST,
  [norm('Ajouter les actualités de l\'entreprise')]:             SOP_OFFRES_ACTUS,
  [norm('Promouvoir une offre ou un service')]:                  SOP_OFFRES_ACTUS,
  // Photos vidéos hebdo (3 → 1)
  [norm('Ajouter de nouvelles photos')]:                         SOP_MEDIAS_HEBDO,
  [norm('Ajouter des vidéos')]:                                  SOP_MEDIAS_HEBDO,
  [norm('Optimiser les légendes (alt, mots-clés)')]:             SOP_MEDIAS_HEBDO,
  // Avis clients hebdo (3 → 1)
  [norm('Demander 3 nouveaux avis clients')]:                    SOP_AVIS,
  [norm('Répondre à tous les avis reçus')]:                      SOP_AVIS,
  [norm('Signaler les avis frauduleux si nécessaire')]:          SOP_AVIS,
  // SEO local hebdo (4 → 1)
  [norm('Vérifier les positions des mots-clés')]:                SOP_SEO_LOCAL,
  [norm('Optimiser la description si besoin')]:                  SOP_SEO_LOCAL,
  [norm('Ajouter de nouveaux services ou produits')]:            SOP_SEO_LOCAL,
  [norm('Contrôler les catégories')]:                            SOP_SEO_LOCAL,
  // Suivi stats hebdo (5 → 1)
  [norm('Vérifier les statistiques Google Business')]:           SOP_STATS_HEBDO,
  [norm('Suivre les appels reçus')]:                             SOP_STATS_HEBDO,
  [norm('Suivre les clics vers le site')]:                       SOP_STATS_HEBDO,
  [norm('Suivre les demandes d\'itinéraire')]:                   SOP_STATS_HEBDO,
  [norm('Suivre les messages reçus')]:                           SOP_STATS_HEBDO,
  // Maintenance hebdo (4 → 1)
  [norm('Vérifier les horaires (jours fériés, exceptions)')]:    SOP_MAINTENANCE,
  [norm('Vérifier les informations de contact')]:                SOP_MAINTENANCE,
  [norm('Corriger les éventuelles erreurs signalées')]:          SOP_MAINTENANCE,
  [norm('Contrôler la cohérence avec le site web')]:             SOP_MAINTENANCE,
  // Rapport client hebdo (3 → 1)
  [norm('Préparer un rapport hebdomadaire')]:                    SOP_RAPPORT_GBP,
  [norm('Présenter les performances au client')]:                SOP_RAPPORT_GBP,
  [norm('Proposer les actions d\'amélioration')]:                SOP_RAPPORT_GBP,
}
