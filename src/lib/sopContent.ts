/**
 * Bibliothèque de SOPs pré-rédigés (structure 17 sections « SOP Master Premium »).
 * Chaque SOP est stocké comme SopBlock[] et injecté dans le champ blocks
 * de la tâche correspondante lors de l'application d'un template.
 *
 * Convention : la clé correspond au titre exact de la tâche dans le template.
 * Recherche insensible à la casse et aux accents.
 */
import type { SopBlock } from '@/hooks/useSops'
import { SOP_INDEX_CLAUDE_CODE }  from './sopContentClaudeCode'
import { SOP_INDEX_WORDPRESS }    from './sopContentWordPress'
import { SOP_INDEX_SEO }          from './sopContentSeo'
import { SOP_INDEX_GBP }          from './sopContentGbp'
import { SOP_INDEX_LOGO }         from './sopContentLogo'
import { SOP_INDEX_META_ADS }     from './sopContentMetaAds'
import { SOP_INDEX_GOOGLE_ADS }   from './sopContentGoogleAds'
import { SOP_INDEX_SOCIAL }       from './sopContentSocial'
import { SOP_INDEX_SOP_META }     from './sopContentSopMeta'

/* Helpers pour construire des blocs de façon lisible. */
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
const div = (): SopBlock => ({ type: 'divider' })

/* ═══════════════════════════════════════════════════════════════════
   SOP #1 — Configuration SSL (Let's Encrypt) sur VPS
═══════════════════════════════════════════════════════════════════ */
const SOP_SSL: SopBlock[] = [
  h2('1. 🎯 Objectif'),
  p('Assurer que le site répond en HTTPS avec un cadenas 🔒 vert, sur toutes les pages.'),
  li([
    'Impact business : +15 % de conversion, prérequis Search Console, obligation RGPD',
    'Résultat : cadenas 🔒 sur toutes les URL',
    'Critère : note A ou A+ sur SSL Labs',
    'KPI : 0 alerte "certificat expiré" pendant 90 jours',
  ]),

  h2('2. 📋 Prérequis'),
  table(
    ['Élément', 'Où l\'obtenir', 'Vérification'],
    [
      ['Accès SSH VPS',   '1Password → VPS-Prod',       '`ssh root@ip` répond'],
      ['Domaine actif',   'Registrar (OVH, Namecheap)', '`dig monsite.ma` retourne l\'IP'],
      ['Ports 80 + 443',  'Firewall VPS',               '`nmap -p 80,443 ip` = open'],
      ['Dokploy installé','https://dokploy…',           'Dashboard accessible'],
    ],
  ),

  h2('3. 🛠️ Outils'),
  table(
    ['Outil', 'Rôle', 'Piège'],
    [
      ['Dokploy',       'Panneau VPS + Traefik',          'Toujours ajouter www ET racine'],
      ['Traefik',       'Reverse proxy + auto-renouvel',  'Rate-limit Let\'s Encrypt : 5 échecs/heure'],
      ['Let\'s Encrypt','Autorité de certification',      'Cert valable 90j, auto-renouvel à J-30'],
      ['SSL Labs',      'Audit externe',                  'Cache 2h après test'],
    ],
  ),

  h2('4. ⚙️ Processus détaillé'),

  h3('Étape 1 — Vérifier propagation DNS'),
  num([
    'Ouvrir Terminal',
    'Taper : `dig +short monsite.ma`',
    'Vérifier que l\'IP retournée = IP du VPS',
  ]),
  info('Résultat attendu', 'Une seule ligne avec l\'IP correcte du VPS.'),

  h3('Étape 2 — Ajouter le domaine dans Dokploy'),
  num([
    'Aller sur https://nextgital.tech/dashboard',
    'Cliquer sur le projet → environnement production',
    'Cliquer sur le service concerné',
    'Onglet Domains → bouton + Add Domain',
    'Host = monsite.ma · Port = 4000 · HTTPS ✅ · Provider = Let\'s Encrypt',
    'Cliquer sur Create',
  ]),
  info('Confirmation visuelle', 'Cercle 🟡 jaune "Provisioning" pendant 30-90s puis 🟢 vert "Active".'),

  h3('Étape 3 — Ajouter le www'),
  num([
    'Répéter l\'étape 2 avec Host = www.monsite.ma',
    'Redirect to = monsite.ma (canonique)',
  ]),

  h3('Étape 4 — Vérifier la redirection HTTP → HTTPS'),
  num([
    'Ouvrir un onglet incognito (Cmd+Shift+N)',
    'Taper : http://monsite.ma (bien http)',
    'Vérifier que ça bascule automatiquement en https://',
  ]),

  h3('Étape 5 — Audit SSL Labs'),
  num([
    'Aller sur https://www.ssllabs.com/ssltest/',
    'Entrer monsite.ma → Submit',
    'Attendre 1-2 min → viser note A ou A+',
  ]),

  h2('5. ✅ Contrôle qualité'),
  check([
    'https://monsite.ma avec 🔒',
    'https://www.monsite.ma avec 🔒',
    'http → https testé en incognito',
    'Note SSL Labs ≥ A',
    'Date expiration ≥ 60 jours',
    'Auto-renew activé',
  ]),

  h2('6. 🚨 Gestion des erreurs'),
  table(
    ['Problème', 'Cause', 'Solution'],
    [
      ['too many requests',       '5 échecs/h chez Let\'s Encrypt', 'Attendre 1h, corriger DNS'],
      ['Contenu mixte (🔒 partiel)','Assets en http:// dans WP',    'Search & replace en BDD'],
      ['ERR_TOO_MANY_REDIRECTS',  'Double redirection WP + Traefik','Désactiver plugin "Really Simple SSL"'],
      ['Certificat expiré',       'Cron cassé',                    'Redémarrer service Traefik'],
    ],
  ),

  h2('7. ⚡ Optimisation'),
  li([
    'À automatiser : monitoring hebdo SSL Labs',
    'À déléguer : ajout de nouveaux domaines (junior)',
    'Claude Code : script alerte Projet → Discussion à J-15',
    'NE JAMAIS déléguer à l\'IA : SSH root, manipulation cert directe',
  ]),

  h2('8. 🤖 Prompts IA'),
  h3('Claude Code'),
  code(`Tu es un DevOps senior spécialiste Traefik/Let's Encrypt.
Écris un script Bash qui : 1) liste les domaines dans /etc/traefik/traefik.yml,
2) vérifie via openssl s_client la date d'expiration, 3) alerte Projet → Discussion via webhook
si < 15 jours, 4) log dans /var/log/ssl-check.log. Fournis aussi la crontab.`),
  h3('ChatGPT'),
  code(`Rédige une config Traefik dynamique YAML pour : HSTS max-age=31536000
includeSubDomains preload, TLS 1.2+ minimum, HTTP/2 et HTTP/3, headers de sécurité
(X-Frame-Options, X-Content-Type-Options, Referrer-Policy).`),

  h2('9. 📦 Livrables'),
  table(
    ['Nom', 'Format', 'Emplacement', 'Nommage'],
    [
      ['Rapport audit SSL',    'PDF',  'Projet → Ressources / SSL', '[C]_SSL_YYYY-MM-DD.pdf'],
      ['Config Traefik',       'YAML', 'GitHub/infra/traefik/',   '[domaine].yml'],
      ['Screenshot SSL Labs',  'PNG',  'Projet → Ressources / Preuves','[domaine]_ssllabs_YYYY-MM-DD.png'],
    ],
  ),

  h2('10. 🔍 Vérification finale'),
  check([
    'Rapport PDF déposé',
    'Screenshot SSL Labs envoyé au client',
    'Domaine enregistré dans ERP',
    'Alerte renouvellement configurée',
    'Email confirmation client',
  ]),

  h2('11. ⏱️ Temps estimé'),
  table(
    ['Niveau', 'Durée'],
    [['Débutant', '45 min'], ['Junior', '20 min'], ['Intermédiaire', '12 min'], ['Senior', '8 min'], ['Expert', '5 min']],
  ),

  h2('12. 🎯 Priorité'),
  warn('🔴 Critique', 'Sans SSL : Chrome marque "Non sécurisé" → 88% de perte, Google déclasse, formulaires bloqués RGPD.'),

  h2('13. 🏅 Bonnes pratiques'),
  li([
    'Toujours www ET racine (2 lignes Dokploy)',
    'Rediriger vers une seule URL canonique',
    'Activer HSTS après 1 mois stable',
    'Tester en incognito (cache trompe)',
    'Config Traefik commitée dans Git',
  ]),

  h2('14. 💎 Conseils d\'expert'),
  li([
    'Wildcard SSL : uniquement si ≥ 10 sous-domaines',
    'CAA record : `0 issue "letsencrypt.org"` empêche les certificats pirates',
    'HSTS preload : uniquement sur domaines matures (impossible à retirer)',
    'Renouvellement à J-60 si campagnes Ads actives',
  ]),

  h2('15. 🤖 Automatisations possibles'),
  table(
    ['Tâche', 'Outil', 'Gain', 'ROI'],
    [
      ['Renouvellement auto',   'Traefik + cron',   '100 %',        '⭐⭐⭐⭐⭐'],
      ['Alerte J-15',           'Script + Projet → Discussion',   'Prévient inc.', '⭐⭐⭐⭐⭐'],
      ['Audit SSL Labs hebdo',  'GitHub Actions',   '30 min/sem.',   '⭐⭐⭐⭐'],
    ],
  ),

  h2('16. ✅ Check-list finale'),
  check([
    'Domaine racine 🟢',
    'Domaine www 🟢',
    'http → https en incognito ✓',
    'SSL Labs ≥ A',
    'Config Git',
    'Alerte renouvellement',
    'Email client',
    'Ticket ERP clôturé',
  ]),

  h2('17. 📎 Annexes'),
  h3('Commandes utiles'),
  code(`# Propagation DNS
dig +short monsite.ma

# Expiration certificat
openssl s_client -connect monsite.ma:443 -servername monsite.ma < /dev/null 2>/dev/null \\
  | openssl x509 -noout -dates

# Logs Traefik
docker logs dokploy-traefik --tail 100 | grep -i acme`),
  li([
    'SSL Labs : https://www.ssllabs.com/ssltest/',
    'Let\'s Encrypt limits : https://letsencrypt.org/docs/rate-limits/',
    'HSTS Preload : https://hstspreload.org',
  ]),
]

/* ═══════════════════════════════════════════════════════════════════
   SOP #2 — Configuration SMTP (Resend)
═══════════════════════════════════════════════════════════════════ */
const SOP_SMTP: SopBlock[] = [
  h2('1. 🎯 Objectif'),
  p('Permettre au site/application d\'envoyer des emails transactionnels (formulaires, reçus, alertes) via Resend, avec un domaine vérifié.'),
  li([
    'Impact : formulaire de contact fonctionnel, reçus de commande, notifications',
    'Résultat : test d\'envoi réussi depuis le domaine du client',
    'Critères : DKIM + SPF + DMARC ✅, taux de délivrabilité > 95 %',
    'KPI : 0 email marqué SPAM sur 30 jours',
  ]),

  h2('2. 📋 Prérequis'),
  table(
    ['Élément', 'Où l\'obtenir', 'Vérification'],
    [
      ['Compte Resend',        'https://resend.com',              'Login OK, quota affiché'],
      ['Accès DNS du client',  'Registrar (OVH, Namecheap…)',     'Peut ajouter TXT / CNAME'],
      ['Domaine à vérifier',   'ex : monsite.ma',                 'Accessible publiquement'],
      ['API key Resend',       'Resend → API Keys',               'Commence par re_'],
    ],
  ),

  h2('3. 🛠️ Outils'),
  table(
    ['Outil', 'Rôle', 'Piège'],
    [
      ['Resend',    'Service SMTP moderne (100 emails/j gratuits)', 'Quota strict'],
      ['DKIM',      'Signature crypto anti-usurpation',              'CNAME dans DNS'],
      ['SPF',       'Liste des serveurs autorisés à envoyer',        'TXT dans DNS'],
      ['DMARC',     'Politique en cas d\'échec SPF/DKIM',            'TXT dans DNS'],
      ['mxtoolbox', 'Auditeur externe',                              'Cache DNS 15 min'],
    ],
  ),

  h2('4. ⚙️ Processus détaillé'),

  h3('Étape 1 — Créer/vérifier le compte Resend'),
  num([
    'Aller sur https://resend.com → Sign in',
    'Login avec compte Google/GitHub',
    'Sur le dashboard, cliquer "Add Domain"',
    'Entrer le domaine du client (ex : monsite.ma) → Add',
  ]),

  h3('Étape 2 — Copier les enregistrements DNS'),
  num([
    'Resend affiche 3 lignes : SPF (TXT), DKIM (CNAME), et parfois MX',
    'Copier chaque ligne (Name + Value) une par une',
    'Garder la fenêtre ouverte',
  ]),

  h3('Étape 3 — Ajouter les DNS chez le registrar'),
  num([
    'Se connecter au panel du registrar (OVH, Namecheap…)',
    'Aller dans DNS / Zone Editor du domaine',
    'Ajouter les 3 records copiés depuis Resend',
    'Sauvegarder',
  ]),
  warn('⚠️ TTL', 'Utiliser TTL = 3600 ou automatique. Ne pas mettre 60 (surcharge).'),

  h3('Étape 4 — Attendre propagation et vérifier'),
  num([
    'Attendre 5 à 30 min',
    'Retourner sur Resend → domaine → cliquer "Verify DNS Records"',
    'Les 3 lignes doivent passer au vert ✅',
  ]),

  h3('Étape 5 — Créer une API Key et l\'ajouter à l\'app'),
  num([
    'Resend → API Keys → + Create API Key',
    'Nom = [nom du projet]-prod · Permission = Sending access',
    'Copier la clé (commence par re_...) — visible UNE seule fois',
    'Dans Dokploy → service → Environment, ajouter :',
    'RESEND_API_KEY=re_xxx',
    'RESEND_FROM=Nom Client <noreply@monsite.ma>',
    'Save + Deploy',
  ]),

  h3('Étape 6 — Test d\'envoi'),
  num([
    'Depuis l\'app, envoyer un email test (formulaire contact ou endpoint /test)',
    'Vérifier dans Resend → Emails que le statut passe à "delivered"',
    'Vérifier la réception dans la boîte du destinataire (pas en SPAM)',
  ]),

  h2('5. ✅ Contrôle qualité'),
  check([
    'SPF ✅ dans Resend',
    'DKIM ✅ dans Resend',
    'DMARC ✅ dans Resend (si applicable)',
    'API Key stockée dans Environment (jamais en clair dans le code)',
    'Test réel envoyé et reçu (pas SPAM)',
    'Adresse d\'expédition contient bien le domaine du client',
  ]),

  h2('6. 🚨 Gestion des erreurs'),
  table(
    ['Problème', 'Cause', 'Solution'],
    [
      ['DNS non vérifié après 1h', 'TTL trop long ou erreur de copie',  'Comparer caractère par caractère avec Resend'],
      ['Emails en SPAM',            'DMARC manquant ou score bas',       'Ajouter DMARC v=DMARC1;p=quarantine'],
      ['Rejected (403)',            'API Key périmée ou révoquée',       'Régénérer, mettre à jour env, Deploy'],
      ['Rate limit atteint',        '> 100/j sur plan gratuit',          'Passer au plan payant ou batcher'],
    ],
  ),

  h2('7. ⚡ Optimisation'),
  li([
    'À automatiser : monitoring quota Resend via API',
    'À déléguer : ajout de nouveaux domaines (junior avec ce SOP)',
    'Claude Code : template email HTML avec MJML',
    'NE JAMAIS déléguer à l\'IA : gestion des API Keys sensibles',
  ]),

  h2('8. 🤖 Prompts IA'),
  h3('Claude Code'),
  code(`Écris une fonction Node.js/TypeScript sendEmail(to, subject, html, text?)
utilisant l'API Resend. Gestion d'erreur robuste, retry avec backoff,
logs structurés. La clé est dans process.env.RESEND_API_KEY.`),

  h2('9. 📦 Livrables'),
  table(
    ['Nom', 'Format', 'Emplacement'],
    [
      ['Rapport config email',      'PDF', 'Projet → Ressources / Email'],
      ['Screenshot DNS vérifiés',   'PNG', 'Projet → Ressources / Preuves'],
      ['Test d\'email reçu',        'EML/PNG', 'Projet → Ressources / Preuves'],
    ],
  ),

  h2('10. 🔍 Vérification finale'),
  check([
    'Envoyé un email test depuis contact@monsite.ma → boîte perso',
    'Reçu dans Inbox (pas SPAM)',
    'Champ "From" affiche bien "Nom Client <noreply@monsite.ma>"',
    'DMARC ✅ sur mxtoolbox.com',
    'Domaine enregistré dans ERP',
  ]),

  h2('11. ⏱️ Temps estimé'),
  table(
    ['Niveau', 'Durée'],
    [['Débutant', '1h'], ['Junior', '30 min'], ['Intermédiaire', '20 min'], ['Senior', '10 min'], ['Expert', '5 min']],
  ),

  h2('12. 🎯 Priorité'),
  warn('🟠 Important', 'Sans SMTP : formulaires cassés, pas de reçu, pas d\'alerte. Bloque la mise en ligne.'),

  h2('13. 🏅 Bonnes pratiques'),
  li([
    'Adresse From : noreply@monsite.ma (jamais gmail.com)',
    'Utiliser Reply-To si le client veut être contacté',
    'Toujours version HTML + texte (fallback)',
    'Ne jamais commiter la clé API dans Git',
    'Logger message ID Resend pour debug',
  ]),

  h2('14. 💎 Conseils d\'expert'),
  li([
    'DMARC en mode "p=none" au début → observer 2 semaines → passer à p=quarantine',
    'Ajouter un BIMI record si logo carré vectoriel → logo dans Gmail',
    'Utiliser un sous-domaine dédié (mail.monsite.ma) pour isoler la réputation',
    'Warm-up : monter progressivement le volume sur 30 jours pour un nouveau domaine',
  ]),

  h2('15. 🤖 Automatisations possibles'),
  table(
    ['Tâche', 'Outil', 'Gain', 'ROI'],
    [
      ['Monitoring quota',        'API Resend + cron',  '10 min/sem',  '⭐⭐⭐⭐'],
      ['Templates HTML dynamiques','React Email',        '2h/template', '⭐⭐⭐⭐⭐'],
      ['Rapport délivrabilité',   'Resend webhooks',    'Suivi live',  '⭐⭐⭐⭐'],
    ],
  ),

  h2('16. ✅ Check-list finale'),
  check([
    '3 records DNS 🟢 dans Resend',
    'API Key en Environment',
    'Test réel envoyé + reçu',
    'Pas de SPAM',
    'DMARC validé',
    'Documentation ERP à jour',
  ]),

  h2('17. 📎 Annexes'),
  h3('Records DNS type'),
  code(`# SPF
Type: TXT | Host: send | Value: v=spf1 include:_spf.resend.com ~all

# DKIM
Type: CNAME | Host: resend._domainkey | Value: resend._domainkey.domain.com

# DMARC
Type: TXT | Host: _dmarc | Value: v=DMARC1; p=quarantine; rua=mailto:reports@monsite.ma`),
  li([
    'Resend docs : https://resend.com/docs',
    'MxToolbox : https://mxtoolbox.com/',
    'DMARC generator : https://dmarcian.com/dmarc-generator/',
  ]),
]

/* ═══════════════════════════════════════════════════════════════════
   SOP #3 — Vérification de la fiche Google Business Profile
═══════════════════════════════════════════════════════════════════ */
const SOP_GBP_VERIF: SopBlock[] = [
  h2('1. 🎯 Objectif'),
  p('Faire vérifier officiellement la fiche Google Business Profile pour que le client apparaisse dans Google Maps et Search local.'),
  li([
    'Impact : visibilité locale, +200 % d\'appels moyens',
    'Résultat : badge "Établissement vérifié" ✅ dans le back-office',
    'KPI : fiche indexée dans Google Search local sous 7 jours',
  ]),

  h2('2. 📋 Prérequis'),
  table(
    ['Élément', 'Où l\'obtenir'],
    [
      ['Compte Google du client',  'Gérant/propriétaire fournit login'],
      ['Adresse physique réelle',  'Client — adresse exacte facture'],
      ['Téléphone accessible',      'Client — répond aux appels'],
      ['Fiche créée',              'https://business.google.com'],
    ],
  ),

  h2('3. 🛠️ Outils'),
  table(
    ['Outil', 'Rôle'],
    [
      ['Google Business Profile', 'Back-office fiche'],
      ['Google Maps',              'Vérification visible côté client'],
      ['Google Search',            'Test présence dans les résultats locaux'],
    ],
  ),

  h2('4. ⚙️ Processus détaillé'),

  h3('Étape 1 — Déclencher la vérification'),
  num([
    'Aller sur https://business.google.com',
    'Sélectionner la fiche du client',
    'Cliquer sur "Demander la vérification" ou "Vérifier maintenant"',
    'Google propose 1 à 4 méthodes selon le pays/catégorie',
  ]),

  h3('Étape 2 — Choisir la méthode de vérification'),
  table(
    ['Méthode', 'Délai', 'Recommandation'],
    [
      ['Carte postale',       '5 à 14 jours', '✅ Standard, la plus fiable'],
      ['Téléphone (SMS)',     '5 min',        '✅ Rapide si disponible'],
      ['Email',               'Immédiat',     'Rare (multinationales)'],
      ['Vidéo (Google Meet)', '3 à 7 jours',  'Nouvelle catégorie, demande une vidéo tour'],
    ],
  ),

  h3('Étape 3 — Cas Carte postale (le plus courant au Maroc)'),
  num([
    'Vérifier que l\'adresse affichée est EXACTEMENT celle où le client reçoit son courrier',
    'Cliquer sur "Envoyer la carte postale"',
    'Google envoie une carte avec un code à 5 chiffres',
    'Attendre 5 à 14 jours',
    'Le client reçoit la carte → t\'envoie le code',
    'Retourner sur GBP → "Saisir le code" → entrer les 5 chiffres',
  ]),

  h3('Étape 4 — Cas Vidéo (nouvelle méthode 2024+)'),
  num([
    'Google demande une vidéo qui prouve :',
    '1) l\'existence physique du lieu (façade + enseigne)',
    '2) l\'accès à l\'intérieur (bureaux, matériel)',
    '3) une preuve du gérant (carte d\'identité + carte de visite)',
    'Filmer en continu, sans coupure, 2 à 5 min',
    'Uploader la vidéo dans l\'interface GBP',
    'Attendre 3 à 7 jours pour validation manuelle',
  ]),

  h2('5. ✅ Contrôle qualité'),
  check([
    'Adresse renseignée = adresse réelle où le courrier arrive',
    'Numéro de téléphone opérationnel',
    'Site web renseigné et fonctionnel (avec SSL)',
    'Photos de qualité (extérieur + intérieur + logo)',
    'Horaires cohérents avec la réalité',
  ]),

  h2('6. 🚨 Gestion des erreurs'),
  table(
    ['Problème', 'Cause', 'Solution'],
    [
      ['Carte postale non reçue', 'Adresse erronée ou boîte courrier',    'Redemander après 21j max'],
      ['Suspension de la fiche',  'Suspicion de fake business',            'Prouver l\'existence via vidéo + docs'],
      ['Duplicata détecté',       'Ancienne fiche non-fermée',             'Réclamer l\'ancienne, la fusionner'],
      ['Refus vérif vidéo',       'Preuves insuffisantes',                 'Refilmer avec meilleure qualité'],
    ],
  ),

  h2('7. ⚡ Optimisation'),
  li([
    'À automatiser : rappel J+14 si carte pas reçue',
    'À déléguer : préparation vidéo (community manager)',
    'Claude Code : script check-list vidéo',
    'NE JAMAIS déléguer à l\'IA : la vérification elle-même (identité en jeu)',
  ]),

  h2('8. 🤖 Prompts IA'),
  h3('ChatGPT'),
  code(`Rédige un script pour une vidéo de vérification Google Business Profile
d'un bureau/local commercial. La vidéo dure 2-5 minutes, filmée en continu.
Elle doit prouver : l'enseigne extérieure, l'entrée, l'intérieur (bureau,
équipement), le gérant présentant sa carte d'identité et une carte de visite.
Donne les plans à filmer, dans l'ordre, avec les phrases à prononcer.`),

  h2('9. 📦 Livrables'),
  table(
    ['Nom', 'Format', 'Emplacement'],
    [
      ['Screenshot fiche ✅ vérifiée', 'PNG', 'Projet → Ressources / GBP'],
      ['Confirmation par email Google', 'PDF', 'Projet → Ressources / GBP'],
      ['Vidéo de vérif (si applicable)', 'MP4', 'Projet → Ressources / GBP'],
    ],
  ),

  h2('10. 🔍 Vérification finale'),
  check([
    'Badge "Établissement vérifié" ✅ visible',
    'Fiche apparaît quand on tape le nom du client dans Google Search',
    'Fiche apparaît sur Google Maps à l\'adresse exacte',
    'Client peut se connecter à son propre back-office',
    'Ticket ERP clôturé avec preuves',
  ]),

  h2('11. ⏱️ Temps estimé'),
  table(
    ['Niveau', 'Durée hors attente'],
    [['Débutant', '2h'], ['Junior', '1h'], ['Intermédiaire', '30 min'], ['Senior', '20 min'], ['Expert', '10 min']],
  ),

  h2('12. 🎯 Priorité'),
  warn('🔴 Critique', 'Fiche non vérifiée = invisible dans Google local = 0 appel entrant.'),

  h2('13. 🏅 Bonnes pratiques'),
  li([
    'Toujours renseigner site web ET WhatsApp',
    'Publier ≥ 3 photos avant la demande de vérif (crédibilité)',
    'Répondre à tous les avis existants avant la vérif',
    'Ne jamais cocher "Service uniquement" si local physique existe',
  ]),

  h2('14. 💎 Conseils d\'expert'),
  li([
    'Après vérification : publier 1 Google Post immédiatement (signal actif)',
    'Ajouter le domaine à Search Console → couplage GBP-Search fort',
    'Client avec plusieurs points de vente : chaque adresse a sa fiche',
    'Éviter les catégories trop génériques (préférer "Boulangerie artisanale" à "Restaurant")',
  ]),

  h2('15. 🤖 Automatisations possibles'),
  table(
    ['Tâche', 'Outil', 'Gain'],
    [
      ['Réponse auto aux avis 4-5★',   'GBP API',              '5 min par avis'],
      ['Publication Google Posts hebdo','n8n + Sheets',         '1h/semaine'],
      ['Alerte nouvelle question',      'GBP API + Projet → Discussion',      'Réactivité'],
    ],
  ),

  h2('16. ✅ Check-list finale'),
  check([
    '✅ Fiche vérifiée',
    'Client formé au back-office',
    'Screenshots livrés',
    'Domaine + WhatsApp dans la fiche',
    'Premier Google Post publié',
  ]),

  h2('17. 📎 Annexes'),
  li([
    'GBP Help : https://support.google.com/business',
    'Suspension recovery : https://support.google.com/business/answer/4569145',
    'Video verification guide : https://support.google.com/business/answer/13463632',
  ]),
]

/* ═══════════════════════════════════════════════════════════════════
   SOP #4 — Publier un Google Post (hebdomadaire)
═══════════════════════════════════════════════════════════════════ */
const SOP_GOOGLE_POST: SopBlock[] = [
  h2('1. 🎯 Objectif'),
  p('Publier un Google Post pertinent qui apparaît dans la fiche GBP du client et améliore son SEO local.'),
  li([
    'Impact : +3 à 8 % de clics vers site',
    'Résultat : 1 post par semaine visible pendant 7 jours',
    'KPI : ≥ 100 vues par post à J+7',
  ]),

  h2('2. 📋 Prérequis'),
  table(
    ['Élément', 'Vérification'],
    [
      ['Fiche GBP vérifiée',    'Badge ✅'],
      ['Photo/visuel du post',  '1200×900 px, moins de 10 Mo'],
      ['Texte + CTA prêts',     'Copywriting validé'],
      ['Lien de destination',   'URL testée avec SSL'],
    ],
  ),

  h2('3. 🛠️ Outils'),
  table(
    ['Outil', 'Rôle'],
    [
      ['Google Business Profile',   'Création du post'],
      ['Canva',                     'Visuels rapides'],
      ['UTM Builder',               'Traçage GA4 (utm_source=gbp)'],
    ],
  ),

  h2('4. ⚙️ Processus détaillé'),

  h3('Étape 1 — Préparer le contenu'),
  num([
    'Choisir le type de post : Actualité, Offre, Événement, Produit',
    'Rédiger le titre (max 58 caractères, mot-clé en début)',
    'Rédiger le corps (100-300 caractères, ton direct)',
    'Créer le visuel dans Canva (template GBP)',
    'Générer le lien avec UTM : ?utm_source=gbp&utm_medium=post&utm_campaign=[sujet]',
  ]),

  h3('Étape 2 — Publier le post'),
  num([
    'Aller sur https://business.google.com → sélectionner la fiche',
    'Cliquer sur "Ajouter une actualité" (menu de gauche)',
    'Choisir le type',
    'Uploader la photo',
    'Coller titre + corps + URL avec UTM',
    'Prévisualiser sur mobile',
    'Cliquer "Publier"',
  ]),

  h3('Étape 3 — Vérifier la visibilité'),
  num([
    'Attendre 5 min',
    'Chercher le nom du client sur Google Search',
    'Le post doit apparaître dans la fiche du panneau de droite',
    'Screenshoter et archiver',
  ]),

  h2('5. ✅ Contrôle qualité'),
  check([
    'Titre < 58 caractères',
    'Aucune faute (correcteur passé)',
    'Visuel net, texte lisible',
    'CTA clair (Appeler, Réserver, En savoir plus…)',
    'Lien testé et fonctionnel',
    'UTM présent',
    'Prévisualisation mobile OK',
  ]),

  h2('6. 🚨 Gestion des erreurs'),
  table(
    ['Problème', 'Cause', 'Solution'],
    [
      ['Post refusé', 'Contenu commercial trop agressif', 'Reformuler sans "Achetez", "Cliquez"'],
      ['Post invisible', 'Fiche pas vérifiée ou suspendue', 'Résoudre la vérif d\'abord'],
      ['Visuel flou', 'Compression Google', 'Envoyer en 1200×900 minimum'],
    ],
  ),

  h2('7. ⚡ Optimisation'),
  li([
    'Planifier 4 posts d\'avance (batch le lundi)',
    'Templates Canva réutilisables (5 catégories)',
    'Claude Code : script UTM auto pour chaque post',
    'NE JAMAIS confier à l\'IA : validation finale visuelle',
  ]),

  h2('8. 🤖 Prompts IA'),
  h3('ChatGPT'),
  code(`Rédige un Google Post pour un client [SECTEUR] situé à [VILLE].
Contraintes :
- Titre max 58 caractères, mot-clé en début
- Corps max 300 caractères, ton direct
- CTA clair
- Zéro emoji dans le titre, max 1 dans le corps
Sujet : [SUJET DU POST]
Livre 3 variantes A/B testables.`),

  h2('9. 📦 Livrables'),
  table(
    ['Nom', 'Format', 'Emplacement'],
    [
      ['Screenshot post publié', 'PNG', 'Projet → Ressources / GBPPosts/'],
      ['Visuel Canva source',    'PSD/PDF', 'Projet → Ressources / GBPVisuels/'],
      ['Copie texte publié',     'MD', 'ERP/tâche/description'],
    ],
  ),

  h2('10. 🔍 Vérification finale'),
  check([
    'Post visible dans la fiche',
    'Lien fonctionne',
    'Screenshot pris',
    'Note dans le rapport hebdo client',
  ]),

  h2('11. ⏱️ Temps estimé'),
  table(
    ['Niveau', 'Durée'],
    [['Débutant', '45 min'], ['Junior', '20 min'], ['Intermédiaire', '15 min'], ['Senior', '10 min']],
  ),

  h2('12. 🎯 Priorité'),
  info('🟠 Important', 'Cumul hebdo → gros signal SEO local. Manquer 1 semaine = tolérable, mais pas 2.'),

  h2('13. 🏅 Bonnes pratiques'),
  li([
    'Publier lundi 10h ou mercredi 15h (pics de recherche locale)',
    'Alterner types : 40% actualités, 30% offres, 20% événements, 10% produits',
    'Toujours un mot-clé local ("Oujda", "centre-ville"…)',
    'Jamais moins de 3 posts/mois (Google réduit la visibilité)',
  ]),

  h2('14. 💎 Conseils d\'expert'),
  li([
    'Ajouter un microdata schema:LocalBusiness sur le site → boost',
    'Post avec date d\'événement passée = supprimer manuellement (Google ne l\'expire pas)',
    'Utiliser Google Trends pour choisir les sujets (mots-clés en hausse locale)',
    'Screenshots à conserver 6 mois (preuves si suspension)',
  ]),

  h2('15. 🤖 Automatisations possibles'),
  table(
    ['Tâche', 'Outil', 'Gain'],
    [
      ['Batch posts mensuels', 'Sheets + n8n', '4h/mois'],
      ['Suivi performances',   'GBP API + Data Studio', '30 min/sem'],
      ['Rappel Projet → Discussion J-1',     'Zapier',                'Zéro oubli'],
    ],
  ),

  h2('16. ✅ Check-list finale'),
  check([
    'Contenu créé',
    'Visuel prêt',
    'Lien + UTM',
    'Publié',
    'Screenshot pris',
    'Ajouté au rapport hebdo',
  ]),

  h2('17. 📎 Annexes'),
  code(`# Template UTM
https://monsite.ma/promo-ete
  ?utm_source=gbp
  &utm_medium=post
  &utm_campaign=ete2026
  &utm_content=[type]`),
  li([
    'GBP Post specs : https://support.google.com/business/answer/7342169',
    'Canva templates : https://www.canva.com/templates/google-my-business/',
  ]),
]

/* ═══════════════════════════════════════════════════════════════════
   SOP #5 — Ajout photo de profil + couverture Facebook/Instagram
═══════════════════════════════════════════════════════════════════ */
const SOP_FB_COVER: SopBlock[] = [
  h2('1. 🎯 Objectif'),
  p('Optimiser l\'identité visuelle des pages Facebook et Instagram pour maximiser la reconnaissance de marque et la conversion des visiteurs en abonnés.'),
  li([
    'Impact : +25 % de taux d\'abonnement (études Sprout Social)',
    'Résultat : profil complet et professionnel sur les 2 plateformes',
    'KPI : score complétude Facebook Business ≥ 90 %',
  ]),

  h2('2. 📋 Prérequis'),
  table(
    ['Élément', 'Où l\'obtenir'],
    [
      ['Accès admin page FB', 'Meta Business Manager'],
      ['Accès Instagram Pro', 'Compte Instagram Business/Creator'],
      ['Logo vectoriel',      'Drive → Identité visuelle'],
      ['Visuel de couverture','Canva ou brief graphiste'],
    ],
  ),

  h2('3. 🛠️ Outils'),
  table(
    ['Outil', 'Rôle', 'Piège'],
    [
      ['Meta Business Manager', 'Admin centralisé',       'Ne pas confondre pages perso/pro'],
      ['Canva',                 'Design rapide',          'Utiliser templates aux bonnes dimensions'],
      ['Photopea',              'Retouche fine gratuite', 'Alternative à Photoshop'],
    ],
  ),

  h2('4. ⚙️ Processus détaillé'),

  h3('Étape 1 — Préparer les visuels'),
  table(
    ['Élément', 'Dimensions', 'Format', 'Poids max'],
    [
      ['Profil Facebook',     '170×170 px (min 320×320)', 'JPG/PNG', '2 Mo'],
      ['Couverture Facebook', '820×312 px desktop / 640×360 mobile', 'JPG/PNG', '4 Mo'],
      ['Profil Instagram',    '320×320 px', 'JPG/PNG', '1 Mo'],
      ['Highlights covers IG','1080×1920 px', 'PNG (transparent)', '2 Mo'],
    ],
  ),
  warn('⚠️ Zone safe couverture FB', 'Le centre 640×360 est visible sur mobile. Ne rien mettre d\'important dans les marges.'),

  h3('Étape 2 — Uploader sur Facebook'),
  num([
    'Aller sur la page → cliquer sur la photo de profil',
    '"Modifier la photo de profil" → uploader → recadrer (cercle centré)',
    'Retour à la page → clic sur la zone couverture',
    '"Modifier la photo de couverture" → uploader',
    'Ajuster la position (glisser vers le haut/bas)',
    '"Enregistrer les modifications"',
  ]),

  h3('Étape 3 — Uploader sur Instagram'),
  num([
    'Ouvrir l\'app Instagram (mobile)',
    'Profil → "Modifier le profil"',
    'Toucher la photo de profil → "Changer la photo de profil"',
    'Choisir dans la galerie ou prendre',
    'Recadrer en cercle → OK',
  ]),

  h3('Étape 4 — Compléter les infos'),
  num([
    'Facebook → Paramètres de la page → Informations',
    'Vérifier : Nom, Nom d\'utilisateur, Catégorie, Description, Site web, Téléphone, Adresse, Horaires',
    'Instagram → Profil → Modifier → Nom, Nom d\'utilisateur, Bio, Site web',
    'Ajouter des Liens (jusqu\'à 5 sur Instagram maintenant)',
  ]),

  h2('5. ✅ Contrôle qualité'),
  check([
    'Logo net et centré (pas coupé dans le cercle Facebook)',
    'Couverture Facebook lisible en desktop ET mobile',
    'Cohérence visuelle FB ↔ IG (même palette, même style)',
    'Bio Instagram avec CTA + emoji + saut de ligne',
    'Liens dans bio pointent vers pages actives (SSL ✅)',
    'Score complétude Facebook ≥ 90 %',
  ]),

  h2('6. 🚨 Gestion des erreurs'),
  table(
    ['Problème', 'Cause', 'Solution'],
    [
      ['Logo pixellisé',         'Image trop petite',    'Utiliser min 320×320 px'],
      ['Couverture floue mobile','Zone safe non respectée', 'Recadrer avec centre 640×360'],
      ['Photo de profil coupée','Objet trop près du bord','Ajouter marge 10 % autour du logo'],
      ['Instagram refuse',      'Format HEIC iPhone',    'Convertir en JPG avant upload'],
    ],
  ),

  h2('7. ⚡ Optimisation'),
  li([
    'Templates Canva figés (aux 4 dimensions requises)',
    'À déléguer : mise à jour saisonnière (community manager)',
    'Claude Code : script auto-redimensionnement (Sharp)',
    'NE JAMAIS confier à l\'IA : le brief visuel de marque',
  ]),

  h2('8. 🤖 Prompts IA'),
  h3('Gemini'),
  code(`Génère 3 idées de couvertures Facebook (820×312 px) pour un [SECTEUR]
à [VILLE]. Chaque idée précise :
- Concept visuel principal
- Palette de couleurs (hex)
- Typographie recommandée
- Texte à intégrer (max 8 mots)
- Zone safe respectée (centre 640×360)`),

  h2('9. 📦 Livrables'),
  table(
    ['Nom', 'Format', 'Emplacement'],
    [
      ['Profil FB',            'JPG',  'Projet → Ressources / SocialFB/'],
      ['Couverture FB',        'JPG',  'Projet → Ressources / SocialFB/'],
      ['Profil IG',            'JPG',  'Projet → Ressources / SocialIG/'],
      ['Sources Canva',        'PSD/URL','Projet → Ressources / SocialSources/'],
    ],
  ),

  h2('10. 🔍 Vérification finale'),
  check([
    'Rendu OK sur desktop + mobile',
    'Aucun texte coupé',
    'Client informé et validé',
    'Sources archivées',
  ]),

  h2('11. ⏱️ Temps estimé'),
  table(
    ['Niveau', 'Durée'],
    [['Débutant', '3h'], ['Junior', '1h30'], ['Intermédiaire', '45 min'], ['Senior', '20 min']],
  ),

  h2('12. 🎯 Priorité'),
  info('🟠 Important', 'Premier signal visuel pour tout visiteur. À faire dès la création des pages.'),

  h2('13. 🏅 Bonnes pratiques'),
  li([
    'Toujours tester en dark mode (couleurs qui disparaissent)',
    'Aucun texte de moins de 24 px (illisible mobile)',
    'Contraste WCAG AA minimum (ratio ≥ 4.5:1)',
    'Fichier nommé : nomclient_typephoto_YYYY-MM.jpg',
  ]),

  h2('14. 💎 Conseils d\'expert'),
  li([
    'A/B tester 2 couvertures pendant 1 mois → mesurer clic sur CTA',
    'Changer couverture à chaque campagne majeure (renouveler le signal)',
    'Utiliser un cadre subtil autour du logo pour ressortir sur les fils gris',
    'Photo de profil = UNIQUEMENT logo (pas de photo d\'équipe)',
  ]),

  h2('15. 🤖 Automatisations possibles'),
  table(
    ['Tâche', 'Outil', 'Gain'],
    [
      ['Génération batch multi-plateformes', 'Bannerbear API', '2h/campagne'],
      ['Rappel changement saisonnier',        'Calendrier n8n',  'Zéro oubli'],
    ],
  ),

  h2('16. ✅ Check-list finale'),
  check([
    'Profil FB uploadé',
    'Couverture FB uploadée + position ajustée',
    'Profil IG uploadé',
    'Bio + liens complétés',
    'Score complétude ≥ 90 %',
    'Screenshots livrés au client',
  ]),

  h2('17. 📎 Annexes'),
  li([
    'Guide dimensions Meta : https://www.facebook.com/business/help/125379114252045',
    'Canva templates FB : https://www.canva.com/facebook-covers/templates/',
    'Zone safe FB : https://www.canva.com/design/DAFxx',
  ]),
]

/* ═══════════════════════════════════════════════════════════════════
   SOP #6 — Déploiement sur VPS avec Dokploy (VERSION PREMIUM 2026-05-17)
═══════════════════════════════════════════════════════════════════ */
const SOP_DEPLOY_DOKPLOY: SopBlock[] = [
  p('**Déploiement VPS avec Dokploy — Stack Next Gital** — Déploiement app 3-tiers (Backend Node/Express + Frontend React/Vite + PostgreSQL) sur VPS via Dokploy. ⏱️ 20 min de lecture · Mis à jour le 2026-07-11'),
  li(['#Dokploy', '#VPS', '#PostgreSQL', '#Docker', '#Node', '#React', '#Production']),

  info('⏱️ Délai', 'Déploiement complet 3 services (API + DB + Frontend) : 45-60 min pour un projet neuf.'),
  info('📞 Canal', 'Bug déploiement → Projet → Discussion (Infra). Accès Dokploy / VPS → WhatsApp tech +212 620 002 066.'),
  { type: 'callout', variant: 'danger', title: '🚫 Règle absolue',
    text: 'JAMAIS push secrets (JWT_SECRET, PG_PASSWORD, API keys) dans Git. TOUJOURS via Dokploy → onglet Environment. Le fichier .env reste local (gitignored).',
  },
  { type: 'callout', variant: 'info', title: '📦 Stack de référence',
    text: 'Backend : Node.js + Express + TypeScript · Frontend : React + Vite · DB : PostgreSQL 16 en container Docker · Orchestration : Dokploy sur VPS Hostinger.',
  },

  h2('Étapes — dans l\'ordre'),

  h3('1. CONNEXION DOKPLOY'),
  p('🎯 **Objectif** : Accéder au dashboard Dokploy NG. ⏱️ **Temps** : 3 min.'),
  p('📍 **Point de départ** : Compte Dokploy créé (lead dev fournit).'),
  p('🖥️ **OÙ** : https://nextgital.tech/dashboard'),
  num([
    'Ouvre https://nextgital.tech/dashboard',
    'Login avec email + mdp (vault 1Password)',
    'Active 2FA si pas déjà fait',
    'Dashboard → tu vois la liste des projets actifs (gestiq, brinova-academy, sites clients…)',
  ]),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'Dashboard affiche les Projects avec leur nombre de services. Docker daemon = Healthy.',
  },
  warn('⚠️ Problèmes fréquents', 'Dashboard renvoie 502 → serveur Dokploy down → contacter lead dev. Login échoue → mdp expiré → reset via email.'),
  p('➡️ **Étape suivante** : créer le projet.'),
  div(),

  h3('2. CRÉER UN NOUVEAU PROJET'),
  p('🎯 **Objectif** : Initialiser le projet dans Dokploy. ⏱️ **Temps** : 3 min.'),
  p('📍 **Point de départ** : Repo Git prêt (github.com/nextgital/[client]).'),
  p('🖥️ **OÙ** : Dokploy → Projects → Create Project.'),
  num([
    'Create Project',
    'Nom = nom du client en minuscules (ex : « brinova-academy », « gestiq », « safsaf »)',
    'Description courte : « ERP [Client] — prod »',
    'Create → page projet vide prête à recevoir 3 services',
  ]),
  p('✏️ **CONVENTION DE NOMMAGE — 1 projet Dokploy = 3 services** :'),
  code(`Projet Dokploy : brinova-academy
├── brinova-api          ← Backend Node/Express (Application)
├── Brinova              ← Base de données PostgreSQL (Database)
└── brinova-academy      ← Frontend React/Vite (Application)`),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'Projet visible dans dashboard. Page projet vide prête à recevoir services.',
  },
  p('➡️ **Étape suivante** : créer la base PostgreSQL en premier.'),
  div(),

  h3('3. AJOUTER LA BASE POSTGRESQL'),
  p('🎯 **Objectif** : Provisionner la DB PostgreSQL en premier (l\'API en dépend). ⏱️ **Temps** : 5 min.'),
  p('📍 **Point de départ** : Projet créé.'),
  p('🖥️ **OÙ** : Page projet → Create Service → Database → PostgreSQL.'),
  num([
    'Create Service → Database → PostgreSQL',
    'Name : « [Client] » avec majuscule (ex « Brinova »)',
    'App Name (auto-généré, ex : « brinova-academy-brinova-xyz123 ») — copie-le, tu en auras besoin comme PG_HOST',
    'Database Name : « [client]_db » (ex « brinova_db »)',
    'Username : « [client]_user » (ex « brinova_user »)',
    'Password : généré automatiquement OU openssl rand -base64 24',
    'Docker Image : postgres:16-alpine',
    'External Port : LAISSE VIDE (accès interne uniquement pour sécurité)',
    'Create → puis clique « Deploy »',
    'Attends le statut « Running » (30-60s)',
  ]),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'Service DB en status Running. Note quelque part : PG_HOST (nom interne du service), PG_DATABASE, PG_USER, PG_PASSWORD.',
  },
  { type: 'callout', variant: 'warning', title: '⚠️ Réseau interne Dokploy',
    text: 'Dokploy expose chaque service par son nom interne dans le réseau Docker. L\'API se connecte à la DB via PG_HOST = nom du service DB (pas via localhost/127.0.0.1).',
  },
  warn('⚠️ Problèmes fréquents', 'Container restart loop → password contient un caractère spécial non-échappé → régénérer un mdp alphanumérique. « connection refused » depuis API → API et DB ne sont pas dans le même Project Dokploy.'),
  p('➡️ **Étape suivante** : appliquer les migrations.'),
  div(),

  h3('4. APPLIQUER LES MIGRATIONS SQL'),
  p('🎯 **Objectif** : Créer toutes les tables via les fichiers supabase/migrations/. ⏱️ **Temps** : 5 min.'),
  p('📍 **Point de départ** : DB Running, fichiers migrations dans le repo.'),
  p('🖥️ **OÙ** : Service DB → Advanced → Terminal (ou SSH VPS + docker exec).'),
  num([
    'Sur ton poste : liste toutes les migrations : ls supabase/migrations/*.sql',
    'Copie le contenu d\'une migration',
    'Dokploy → service DB → onglet Advanced → Terminal',
    'Lance : psql -U [client]_user -d [client]_db',
    'Colle + exécute le SQL de chaque migration DANS L\'ORDRE (001, 002, …)',
    'Alternative : via SSH VPS → docker exec -it [nom-conteneur-db] psql -U … puis \\i /path/migration.sql',
    'Vérifie : \\dt → liste des tables créées',
  ]),
  p('✏️ **SCRIPT — appliquer toutes les migrations d\'un coup depuis ton poste** :'),
  code(`# Depuis ton poste local
for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  cat "$f" | ssh vps "docker exec -i [nom-conteneur-db] psql -U [client]_user -d [client]_db"
done`),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: '\\dt renvoie toutes les tables (users, tenants, projets, etc). Aucune erreur SQL dans les logs.',
  },
  warn('⚠️ Problèmes fréquents', '« relation already exists » → migration déjà appliquée → passer à la suivante. « syntax error at or near … » → migration corrompue → vérifier fin de ligne (LF pas CRLF).'),
  p('➡️ **Étape suivante** : déployer le backend API.'),
  div(),

  h3('5. AJOUTER SERVICE BACKEND API (Node/Express)'),
  p('🎯 **Objectif** : Déployer l\'API Node/Express depuis GitHub. ⏱️ **Temps** : 12 min.'),
  p('📍 **Point de départ** : DB Running + repo GitHub accessible.'),
  p('🖥️ **OÙ** : Page projet → Create Service → Application.'),
  num([
    'Create Service → Application',
    'Name : « [client]-api » (ex « brinova-api »)',
    'Source Type : GitHub',
    'Sélectionne le repo (autorise Dokploy GitHub App si demandé)',
    'Branch : main',
    'Build Path : ./api (ou racine si monorepo à la racine)',
    'Build Type : Dockerfile',
    'Dockerfile path : ./api/Dockerfile',
    'Save',
  ]),
  p('✏️ **CONTENU EXACT — api/Dockerfile (Node/Express + TypeScript)** :'),
  code(`FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]`),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'Service « [client]-api » apparaît dans le projet. Statut « Not deployed » initial.',
  },
  warn('⚠️ Problèmes fréquents', 'Repo introuvable → autoriser Dokploy dans GitHub Settings → Applications → Dokploy. Build fail « package.json not found » → vérifier Build Path.'),
  p('➡️ **Étape suivante** : env vars du backend.'),
  div(),

  h3('6. ENV VARS DU BACKEND API'),
  p('🎯 **Objectif** : Configurer connexion PostgreSQL + JWT + CORS. ⏱️ **Temps** : 5 min.'),
  p('📍 **Point de départ** : Service API créé, credentials DB notés à l\'étape 3.'),
  p('🖥️ **OÙ** : Service [client]-api → onglet Environment.'),
  num([
    'Onglet Environment → Edit',
    'Colle toutes les variables (voir CONTENU EXACT)',
    'Attention : PG_HOST = App Name interne du service DB, PAS l\'IP ni localhost',
    'Save',
  ]),
  p('✏️ **CONTENU EXACT — env vars backend** :'),
  code(`# --- Serveur ---
NODE_ENV=production
PORT=3001

# --- PostgreSQL ---
PG_HOST=[app-name-service-db-dokploy]
PG_PORT=5432
PG_DATABASE=[client]_db
PG_USER=[client]_user
PG_PASSWORD=[mdp-défini-étape-3]

# --- Auth JWT (générer avec openssl rand -hex 64) ---
JWT_SECRET=<openssl rand -hex 64>
JWT_REFRESH_SECRET=<openssl rand -hex 64>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# --- CORS ---
CORS_ORIGINS=https://app.[client].ma,https://[client].ma

# --- Uploads / Storage ---
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE=10485760`),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'Toutes les vars listées dans Environment. JWT_SECRET fait bien 128 caractères hex (64 bytes).',
  },
  warn('⚠️ Problèmes fréquents', 'PG_HOST = localhost → API ne trouve pas la DB → utiliser le nom interne du service DB Dokploy. JWT_SECRET court (< 32 chars) → refuser au démarrage → régénérer via openssl rand -hex 64.'),
  p('➡️ **Étape suivante** : premier déploiement API.'),
  div(),

  h3('7. DÉPLOIEMENT INITIAL DU BACKEND'),
  p('🎯 **Objectif** : Build + run l\'API + valider santé. ⏱️ **Temps** : 8 min.'),
  p('📍 **Point de départ** : Env vars complètes.'),
  p('🖥️ **OÙ** : Service [client]-api → bouton « Deploy ».'),
  num([
    'Clique « Deploy » en haut à droite',
    'Onglet Logs → suis en temps réel : Pull repo → Docker build → Container start',
    'Build prend 3-6 min',
    'Statut passe à « Running » quand healthy',
    'Test : curl https://[client]-api.nextgital.tech/health → { status: "ok" }',
  ]),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'Logs montrent : « Server running on port 3001 » + « Postgres connected ». Endpoint /health répond 200.',
  },
  warn('⚠️ Problèmes fréquents', '« Postgres connect refused » → PG_HOST ou password faux → revérifier étape 6. « JWT_SECRET must be at least 32 chars » → régénérer. « out of memory » pendant build → augmenter RAM VPS ou utiliser cache builder.'),
  p('➡️ **Étape suivante** : déployer le frontend.'),
  div(),

  h3('8. AJOUTER SERVICE FRONTEND (React/Vite)'),
  p('🎯 **Objectif** : Déployer le frontend React/Vite. ⏱️ **Temps** : 10 min.'),
  p('📍 **Point de départ** : API Running.'),
  p('🖥️ **OÙ** : Page projet → Create Service → Application.'),
  num([
    'Create Service → Application',
    'Name : « [client]-academy » (ou « [client] » selon convention client)',
    'Source : GitHub → même repo → branch main',
    'Build Path : ./ (ou ./web si monorepo)',
    'Build Type : Dockerfile',
    'Save',
  ]),
  p('✏️ **CONTENU EXACT — Dockerfile Frontend React/Vite servi par Nginx** :'),
  code(`FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite lit les vars VITE_* au build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`),
  p('✏️ **nginx.conf pour SPA React** :'),
  code(`server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}`),
  p('✏️ **Env vars frontend** (onglet Environment) :'),
  code(`VITE_API_URL=https://[client]-api.nextgital.tech
VITE_APP_NAME=[Client]
NODE_ENV=production`),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'Service frontend créé + env vars OK. Prêt pour deploy.',
  },
  p('➡️ **Étape suivante** : domaines + SSL.'),
  div(),

  h3('9. DOMAINES + SSL LET\'S ENCRYPT'),
  p('🎯 **Objectif** : Attacher domaine custom + HTTPS auto pour l\'API et le frontend. ⏱️ **Temps** : 10 min.'),
  p('📍 **Point de départ** : Accès DNS du domaine client.'),
  p('🖥️ **OÙ** : Chaque service → onglet Domains.'),
  num([
    '── Sur service [client]-api :',
    '  Add Domain → Host : [client]-api.nextgital.tech (ou api.[client].ma)',
    '  Container Port : 3001 · HTTPS ON · Let\'s Encrypt · Email tech@nextgital.com',
    '── Sur service [client]-academy :',
    '  Add Domain → Host : app.[client].ma',
    '  Container Port : 80 · HTTPS ON · Let\'s Encrypt',
    '── Configurer DNS chez registrar (Hostinger/Cloudflare) :',
    '  A record : app.[client].ma → IP VPS Dokploy',
    '  A record : [client]-api.nextgital.tech → IP VPS Dokploy',
    'Attends propagation DNS (5-30 min) puis clique Save sur Dokploy',
  ]),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'https://app.[client].ma et https://[client]-api.nextgital.tech répondent avec cadenas vert.',
  },
  warn('⚠️ Problèmes fréquents', 'SSL ne s\'émet pas → DNS pas propagé → attendre 30 min + retry. « rate limit Let\'s Encrypt » → utiliser staging certificate d\'abord, prod ensuite.'),
  p('➡️ **Étape suivante** : premier deploy frontend + tests.'),
  div(),

  h3('10. DEPLOY FRONTEND + SMOKE TESTS'),
  p('🎯 **Objectif** : Deploy frontend + valider bout-en-bout. ⏱️ **Temps** : 7 min.'),
  p('📍 **Point de départ** : Domaines OK.'),
  p('🖥️ **OÙ** : Service [client]-academy → Deploy.'),
  num([
    'Deploy le frontend → attends « Running »',
    'Ouvre https://app.[client].ma dans un navigateur',
    'Vérifie que l\'appel API vers [client]-api fonctionne (Network tab F12)',
    'Test login → doit fonctionner sans CORS error',
    'Test création d\'une entrée (ex : nouveau projet) → vérifier en DB via psql',
  ]),
  { type: 'callout', variant: 'success', title: '✅ Smoke tests OK',
    text: 'Login OK, dashboard s\'affiche, création d\'entités OK, requêtes visibles dans logs API.',
  },
  warn('⚠️ Problèmes fréquents', 'CORS error → CORS_ORIGINS backend ne contient pas app.[client].ma → mettre à jour + redeploy API. 502 sur API → container down → onglet Logs.'),
  p('➡️ **Étape suivante** : auto-deploy CD.'),
  div(),

  h3('11. AUTO-DEPLOY + WEBHOOKS GITHUB'),
  p('🎯 **Objectif** : Push main → auto-deploy Dokploy. ⏱️ **Temps** : 5 min.'),
  p('📍 **Point de départ** : Services déployés manuellement.'),
  p('🖥️ **OÙ** : Chaque service (API + Frontend) → onglet Deployments.'),
  num([
    'Sur service API et service Frontend :',
    'Onglet Deployments → Auto Deploy → ON',
    'Copie l\'URL webhook fournie par Dokploy',
    'GitHub → repo → Settings → Webhooks → Add webhook',
    'Payload URL = URL Dokploy · Content type = application/json · Event = « push »',
    'Save',
    'Test : push commit factice sur main → Dokploy déclenche build auto en < 30s',
  ]),
  { type: 'callout', variant: 'success', title: '✅ Vérification',
    text: 'Onglet Deployments montre nouveau deployment déclenché par push. Status « Success ».',
  },
  p('➡️ **App en production avec CI/CD complet.**'),
  div(),

  h2('Checklist de validation'),
  check([
    'Login Dokploy OK + 2FA actif',
    'Projet Dokploy créé au nom du client',
    'Service DB PostgreSQL Running + credentials notés',
    'Toutes migrations SQL appliquées (\\dt liste toutes tables)',
    'Service Backend API lié au repo, Dockerfile OK',
    'Env vars backend : PG_*, JWT_SECRET (64 bytes hex), CORS_ORIGINS',
    'Backend deploy réussi → /health répond 200',
    'Service Frontend lié + Dockerfile Nginx OK',
    'VITE_API_URL pointe vers le domaine API',
    'Domaines custom attachés + DNS A records OK',
    'SSL Let\'s Encrypt actif (cadenas vert) sur API + Frontend',
    'Smoke tests : login OK, CRUD OK, pas de CORS error',
    'Auto-deploy webhooks GitHub actifs sur API + Frontend',
    'Test push → déploiement automatique fonctionne',
    'Logs propres (pas d\'erreurs au démarrage)',
    'Backup DB configuré (voir Dokploy → Backups)',
  ]),

  { type: 'callout', variant: 'danger', title: '🚨 Escalade',
    text: '> 30 min bloqué (build échec récurrent, SSL impossible, PG_HOST introuvable) → WhatsApp tech +212 620 002 066. JAMAIS rebooter le VPS sans autorisation lead dev (impacte tous les projets clients hébergés).',
  },

  p('_Procédure validée par l\'équipe — version du 2026-07-11 (stack PostgreSQL + Docker + VPS)_'),
]

/* Legacy - kept for reference */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SOP_DEPLOY_DOKPLOY_OLD: SopBlock[] = [
  h2('1. 🎯 Objectif'),
  p('Déployer une application (Backend Node.js + Frontend React) sur un VPS via Dokploy, avec base de données PostgreSQL et domaine sécurisé.'),
  li([
    'Impact : app accessible publiquement, prête pour clients',
    'Résultat : URL live avec HTTPS, DB persistante, auto-restart',
    'KPI : uptime > 99.5 % sur 30 jours',
  ]),

  h2('2. 📋 Prérequis'),
  table(
    ['Élément', 'Vérification'],
    [
      ['VPS provisionné',       '≥ 2 vCPU, 4 Go RAM, 40 Go SSD'],
      ['Dokploy installé',      'Dashboard accessible en https://'],
      ['Repo GitHub connecté',  'Personal Access Token dans Dokploy'],
      ['Domaine + DNS',         'Voir SOP SSL'],
      ['Fichier .env prêt',     'Toutes les variables listées'],
    ],
  ),

  h2('3. 🛠️ Outils'),
  table(
    ['Outil', 'Rôle', 'Piège'],
    [
      ['Dokploy',      'PaaS auto-hébergé (Docker + Traefik)', 'Version ≥ 0.14'],
      ['Docker',       'Containerisation',                     'Ne pas laisser d\'images stopped'],
      ['PostgreSQL',   'Base de données',                      'Backup avant chaque migration'],
      ['GitHub',       'Source code + webhooks',               'Branch protection sur main'],
    ],
  ),

  h2('4. ⚙️ Processus détaillé'),

  h3('Étape 1 — Créer le projet dans Dokploy'),
  num([
    'Aller sur https://nextgital.tech/dashboard',
    'Cliquer "New Project" → nom : nom_client-prod',
    'Choisir Environment "production"',
    'Créer',
  ]),

  h3('Étape 2 — Créer la base PostgreSQL'),
  num([
    'Dans le projet → "Create Service" → "PostgreSQL"',
    'Nom : nom_client-db',
    'Version : 15',
    'User : nom_client_api',
    'Password : générer 16 caractères aléatoires',
    'Database : nom_client_prod',
    'Deploy',
  ]),
  info('Sauvegarder les identifiants', 'Copier User/Password/DB → 1Password immédiatement.'),

  h3('Étape 3 — Créer le service Backend'),
  num([
    'Dans le projet → "Create Service" → "Application"',
    'Nom : nom_client-api',
    'Source : GitHub → sélectionner le repo → branche main',
    'Build : Dockerfile ou Nixpacks (selon repo)',
    'Port interne : 4000',
    'Ne pas encore Deploy',
  ]),

  h3('Étape 4 — Configurer les variables d\'environnement'),
  num([
    'Onglet Environment du service backend',
    'Ajouter (une par ligne) :',
    'NODE_ENV=production',
    'SERVER_PORT=4000',
    'PG_HOST=[nom_client-db-internal-hostname]',
    'PG_PORT=5432',
    'PG_USER=[user]',
    'PG_PASSWORD=[password]',
    'PG_DATABASE=[db]',
    'JWT_SECRET=[openssl rand -hex 64]',
    'JWT_REFRESH_SECRET=[openssl rand -hex 64]',
    'CORS_ORIGINS=https://[domaine-frontend]',
    'Save',
  ]),
  warn('🔑 Récupérer PG_HOST', 'Dans le service DB → Overview → "Internal Host" (ex : nom_client-db-xyz).'),

  h3('Étape 5 — Ajouter le domaine + SSL'),
  num([
    'Onglet Domains du service backend',
    '+ Add Domain → Host = api.monsite.ma → Port 4000 → HTTPS ✅ → Let\'s Encrypt',
    'Create',
    'Attendre 🟢',
  ]),

  h3('Étape 6 — Premier déploiement'),
  num([
    'Onglet Deployments → Deploy',
    'Suivre les logs en temps réel',
    'Le build prend 2-10 min selon la stack',
    'Statut final : 🟢 running',
  ]),

  h3('Étape 7 — Appliquer les migrations DB'),
  num([
    'Ouvrir le terminal du service backend (icône >_)',
    'Vérifier connexion : psql "$DATABASE_URL" -c "SELECT 1"',
    'Appliquer les migrations : for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done',
    'Vérifier les tables : psql -c "\\dt"',
  ]),

  h3('Étape 8 — Créer le service Frontend'),
  num([
    '"Create Service" → "Application"',
    'Nom : nom_client-web',
    'Source : GitHub → même repo → même branche',
    'Build command : npm run build',
    'Output dir : dist',
    'Static / Nginx',
    'Port interne : 80',
    'Deploy',
  ]),

  h3('Étape 9 — Domaine frontend'),
  num([
    'Domains → + Add → Host = monsite.ma + www.monsite.ma → HTTPS ✅',
    'Attendre 🟢🟢',
  ]),

  h3('Étape 10 — Tests fumée'),
  num([
    'Ouvrir https://monsite.ma → page charge',
    'Login test → OK',
    'Créer un enregistrement (client, projet…) → sauvegardé',
    'Vérifier logs Dokploy : aucun 500',
    'Vérifier les 3 services 🟢 (api, web, db)',
  ]),

  h2('5. ✅ Contrôle qualité'),
  check([
    '3 services 🟢 dans Dokploy',
    'Backend répond en https://',
    'Frontend charge et se connecte au backend',
    'Migrations DB appliquées',
    'Auth fonctionne (login test)',
    'CRUD test réussi',
    'Aucune erreur 500 dans les logs',
    'Renouvellement SSL activé',
    'Backups DB planifiés',
  ]),

  h2('6. 🚨 Gestion des erreurs'),
  table(
    ['Problème', 'Cause', 'Solution'],
    [
      ['Build failed npm', 'Node version mismatch',        'Ajouter .nvmrc ou engines dans package.json'],
      ['App up mais 502',  'PORT env différent du listen', 'Vérifier PORT=4000 dans .env'],
      ['DB connection refused', 'PG_HOST incorrect',       'Utiliser l\'internal host de Dokploy'],
      ['CORS blocked',     'Origin non autorisée',         'Ajouter au CORS_ORIGINS + Deploy'],
      ['SSL non émis',     'Port 80 fermé',                'ufw allow 80/tcp sur le VPS'],
    ],
  ),

  h2('7. ⚡ Optimisation'),
  li([
    'À automatiser : déploiement sur push main via webhook Dokploy',
    'À déléguer : monitoring aux dev juniors',
    'Claude Code : Dockerfile multi-stage optimisé',
    'NE JAMAIS déléguer à l\'IA : suppression de service ou de DB'],
  ),

  h2('8. 🤖 Prompts IA'),
  h3('Claude Code'),
  code(`Écris un Dockerfile multi-stage pour une app Node.js 20 + TypeScript
qui build en frontend React (Vite) et backend Express. Optimise le cache
Docker (couche package.json/lock, puis build). Image finale : node:20-alpine.
Fournis aussi un .dockerignore.`),

  h2('9. 📦 Livrables'),
  table(
    ['Nom', 'Format', 'Emplacement'],
    [
      ['Rapport de déploiement',      'PDF', 'Projet → Ressources / Deploy'],
      ['URLs services (api, web, db)','MD',  'ERP/projet/infos'],
      ['Identifiants (chiffrés)',     'PDF chiffré / 1Password', 'Coffre'],
      ['Config Dokploy exportée',     'JSON','Git → infra/'],
    ],
  ),

  h2('10. 🔍 Vérification finale'),
  check([
    'Client peut se connecter',
    'Toutes les fonctionnalités testées',
    'Backups DB actifs (quotidien minimum)',
    'Alertes configurées (uptime, erreurs)',
    'Documentation ERP à jour',
    'Ticket de mise en production clôturé',
  ]),

  h2('11. ⏱️ Temps estimé'),
  table(
    ['Niveau', 'Durée'],
    [['Débutant', '1 journée'], ['Junior', '4h'], ['Intermédiaire', '2h'], ['Senior', '1h'], ['Expert', '30 min']],
  ),

  h2('12. 🎯 Priorité'),
  warn('🔴 Critique', 'Sans mise en production stable = pas de livraison client = pas de facturation.'),

  h2('13. 🏅 Bonnes pratiques'),
  li([
    'Toujours déployer sur un environnement staging d\'abord',
    'Backup DB manuel avant la 1re mise en prod',
    'Documenter chaque variable d\'environnement (nom, rôle, source)',
    'Utiliser un domaine api.* séparé du frontend (CORS + isolation)',
    'Activer les logs applicatifs structurés (JSON, pas plain text)',
  ]),

  h2('14. 💎 Conseils d\'expert'),
  li([
    'Rate-limit dès le début (100 req/min IP) → évite les abus',
    'Health check endpoint /api/health monitoré depuis l\'extérieur',
    'Rollback plan documenté : quelle version restaurer + comment',
    'Séparer VPS prod / staging → jamais partagés avec autres clients',
    'Provisionner 2x la RAM/CPU nécessaire au début (croissance)',
  ]),

  h2('15. 🤖 Automatisations possibles'),
  table(
    ['Tâche', 'Outil', 'Gain', 'ROI'],
    [
      ['Deploy auto sur push main', 'Dokploy webhook',   '10 min/deploy',   '⭐⭐⭐⭐⭐'],
      ['Backup DB quotidien',       'pg_dump + S3',      'Sécurité',        '⭐⭐⭐⭐⭐'],
      ['Monitoring uptime',         'Uptime Kuma',       'Détection auto',  '⭐⭐⭐⭐'],
      ['Alertes erreurs',           'Sentry',            'Réactivité',      '⭐⭐⭐⭐'],
    ],
  ),

  h2('16. ✅ Check-list finale'),
  check([
    '3 services 🟢',
    'Domaines SSL 🟢',
    'Migrations DB OK',
    'Login test OK',
    'CRUD test OK',
    'Logs propres',
    'Backups actifs',
    'Alertes actives',
    'Client formé et informé',
    'Documentation ERP à jour',
  ]),

  h2('17. 📎 Annexes'),
  h3('Commandes utiles'),
  code(`# Générer secrets JWT
openssl rand -hex 64

# Backup manuel DB
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql

# Restore
psql "$DATABASE_URL" < backup_20260101.sql

# Voir logs live d'un service
docker logs -f nom_client-api

# Redémarrer un service (dans Dokploy → Reload)`),
  li([
    'Dokploy docs : https://docs.dokploy.com',
    'PostgreSQL backup : https://www.postgresql.org/docs/current/backup.html',
    'Uptime Kuma : https://github.com/louislam/uptime-kuma',
  ]),
]

/* ═══════════════════════════════════════════════════════════════════
   INDEX — mapping titre de tâche → contenu SOP
═══════════════════════════════════════════════════════════════════ */

/** Normalise un titre pour la comparaison (lowercase, sans accents/ponctuation). */
function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Map : titre normalisé → SOP.
 *  Les templates métier (WordPress, SEO, GBP, Logo, Meta Ads, Google Ads,
 *  Social, SOP Meta, Claude Code) ont chacun leur INDEX importé et mergé ici.
 *  Les SOPs historiques (SSL, SMTP, Dokploy) restent pour rétro-compat.
 *
 *  Ordre : les INDEX métiers sont mergés APRÈS les Claude Code — permet aux
 *  entrées plus détaillées des templates spécialisés d\'écraser Claude Code
 *  si un même titre existe dans les deux (rare, mais possible).
 */
const SOP_INDEX: Record<string, SopBlock[]> = {
  ...SOP_INDEX_CLAUDE_CODE,
  ...SOP_INDEX_WORDPRESS,
  ...SOP_INDEX_SEO,
  ...SOP_INDEX_GBP,
  ...SOP_INDEX_LOGO,
  ...SOP_INDEX_META_ADS,
  ...SOP_INDEX_GOOGLE_ADS,
  ...SOP_INDEX_SOCIAL,
  ...SOP_INDEX_SOP_META,
  // — SOPs historiques (rétro-compat, écrasent si un template redéfinit la même clé)
  [normalize('Installation du certificat SSL')]:                   SOP_SSL,
  [normalize('Configuration SSL (Let\'s Encrypt)')]:               SOP_SSL,
  [normalize('Configuration SMTP')]:                               SOP_SMTP,
  [normalize('Configuration SMTP (envoi des e-mails)')]:           SOP_SMTP,
  [normalize('Configuration SMTP (envoi e-mails)')]:               SOP_SMTP,
  [normalize('Ajout de la photo de profil et de couverture')]:     SOP_FB_COVER,
  [normalize('Déploiement sur le VPS')]:                           SOP_DEPLOY_DOKPLOY,
  [normalize('Déploiement de la version finale sur le VPS')]:      SOP_DEPLOY_DOKPLOY,
}

/**
 * Récupère les blocs SOP pré-rédigés pour un titre de tâche, ou null si aucun.
 * Utilisé dans applyTemplates pour enrichir automatiquement la description
 * des tâches qui ont un SOP disponible dans la bibliothèque.
 */
export function findSopForTask(taskTitle: string): SopBlock[] | null {
  return SOP_INDEX[normalize(taskTitle)] ?? null
}

/** Liste des tâches couvertes par un SOP pré-rédigé (pour badge UI). */
export function listSopCoveredTasks(): string[] {
  return Object.keys(SOP_INDEX)
}

/* ═══════════════════════════════════════════════════════════════════
   AUTO-GÉNÉRATION DE SOP GÉNÉRIQUE
   ═══════════════════════════════════════════════════════════════════
   Pour chaque tâche qui n'a pas de SOP pré-rédigé ni de blocs définis
   dans le template, on génère automatiquement une trame SOP à remplir,
   au même format que le SOP Dokploy Premium (Délai, Canal, Règle,
   étapes 1-5, Checklist, Escalade).

   Le contenu est délibérément générique — c'est un point de départ
   que l'utilisateur enrichit ensuite avec les spécificités du terrain.
*/
export function autoGenerateSopBlocks(taskTitle: string, category?: string): SopBlock[] {
  const catLabel = category ? category.replace(/^\d️⃣\s*/, '').trim() : 'Général'
  return [
    p(`**${taskTitle}** — SOP à compléter. Trame générée automatiquement, à enrichir avec les spécificités terrain.`),
    li([`#${catLabel.replace(/\s+/g, '')}`, '#SOP', '#À-compléter']),

    info('⏱️ Délai', 'Estimation à préciser après la première exécution (mesurer le temps réel).'),
    info('📞 Canal', 'Question / blocage → Projet → Discussion (Général). Escalade urgente → WhatsApp lead concerné.'),
    { type: 'callout', variant: 'danger', title: '🚫 Règle absolue',
      text: 'Compléter chaque section avec des détails concrets, testés et validés. Pas de « il suffit de… » ni de « comme d\'habitude ».',
    },

    h2('Étapes — dans l\'ordre'),

    h3('1. PRÉPARATION'),
    p('🎯 **Objectif** : Rassembler tous les prérequis avant d\'agir. ⏱️ **Temps** : à mesurer.'),
    p('📍 **Point de départ** : [Décrire l\'état de départ concret]'),
    p('🖥️ **OÙ** : [Application / URL / dossier / système]'),
    num([
      '[Action 1 — verbe à l\'impératif, chaque clic décrit]',
      '[Action 2]',
      '[Action 3]',
    ]),
    { type: 'callout', variant: 'success', title: '✅ Vérification',
      text: '[Ce que tu dois voir concrètement à l\'écran pour confirmer que l\'étape est réussie]',
    },
    warn('⚠️ Problèmes fréquents', '[Erreur type 1 → solution] · [Erreur type 2 → solution]'),
    p('➡️ **Étape suivante** : exécution.'),
    div(),

    h3('2. EXÉCUTION'),
    p('🎯 **Objectif** : Réaliser l\'action principale de la tâche. ⏱️ **Temps** : à mesurer.'),
    p('📍 **Point de départ** : Prérequis validés à l\'étape 1.'),
    p('🖥️ **OÙ** : [Écran / interface concernée]'),
    num([
      '[Action 1]',
      '[Action 2]',
      '[Action 3]',
      '[Action 4]',
    ]),
    { type: 'callout', variant: 'success', title: '✅ Vérification',
      text: '[Confirmation visuelle du succès]',
    },
    p('➡️ **Étape suivante** : contrôle qualité.'),
    div(),

    h3('3. CONTRÔLE QUALITÉ'),
    p('🎯 **Objectif** : Vérifier que le résultat correspond au standard NG. ⏱️ **Temps** : à mesurer.'),
    p('📍 **Point de départ** : Action principale terminée.'),
    p('🖥️ **OÙ** : [Là où se vérifie le résultat]'),
    num([
      '[Vérification 1 — mesurable]',
      '[Vérification 2 — mesurable]',
      '[Vérification 3 — mesurable]',
    ]),
    warn('⚠️ Problèmes fréquents', '[Non-conformité type → correction] · [Autre → correction]'),
    p('➡️ **Étape suivante** : livraison.'),
    div(),

    h3('4. LIVRAISON / TRANSMISSION'),
    p('🎯 **Objectif** : Livrer le résultat au client / à l\'équipe. ⏱️ **Temps** : à mesurer.'),
    p('📍 **Point de départ** : QC validé.'),
    p('🖥️ **OÙ** : [Canal de livraison : Projet → Discussion / Email…]'),
    num([
      '[Rédiger le compte-rendu]',
      '[Joindre les preuves / captures]',
      '[Notifier le destinataire]',
      '[Archiver dans le dossier client]',
    ]),
    { type: 'callout', variant: 'success', title: '✅ Vérification',
      text: 'Accusé de réception obtenu. Ticket ERP à jour.',
    },
    p('➡️ **Étape suivante** : post-mortem.'),
    div(),

    h3('5. POST-MORTEM & AMÉLIORATION'),
    p('🎯 **Objectif** : Capitaliser sur les découvertes de cette exécution. ⏱️ **Temps** : 5 min.'),
    p('📍 **Point de départ** : Livraison acceptée.'),
    p('🖥️ **OÙ** : Ce SOP — section à enrichir.'),
    num([
      'Noter ce qui a fonctionné',
      'Noter ce qui a bloqué (et combien de temps)',
      'Mettre à jour ce SOP avec les nouvelles connaissances',
      'Si récurrent → envisager une automatisation',
    ]),
    p('➡️ **Cycle terminé.** Le SOP est plus précis pour la prochaine exécution.'),
    div(),

    h2('Checklist de validation'),
    check([
      'Prérequis rassemblés',
      'Action principale exécutée',
      'Vérifications QC passées',
      'Résultat conforme aux critères',
      'Livrable transmis + accusé de réception',
      'Ticket ERP à jour',
      'SOP enrichi avec les découvertes du terrain',
    ]),

    { type: 'callout', variant: 'danger', title: '🚨 Escalade',
      text: '> 2× le temps estimé → Projet → Discussion (Général). Blocage bloquant client → WhatsApp lead. NE JAMAIS improviser sur du critique sans validation.',
    },

    p('_Trame SOP auto-générée — à valider par l\'équipe après premier passage._'),
  ]
}
