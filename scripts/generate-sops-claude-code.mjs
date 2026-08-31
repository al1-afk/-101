#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════
   Génère la migration 046_seed_sops_claude_code_devops.sql à partir
   de la bibliothèque de SOP « Claude Code / DevOps / IA » de Next Gital
   (export Notion — septembre 2026).

   Usage:
     node scripts/generate-sops-claude-code.mjs

   ⚠️ Aucun secret réel (clé API, mot de passe, clé SSH privée) ne doit
   figurer dans ce fichier : uniquement des placeholders.
   ════════════════════════════════════════════════════════════════════ */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'supabase', 'migrations', '046_seed_sops_claude_code_devops.sql')

/* ── Helpers blocks ─────────────────────────────────────────────── */
const H    = (text) => ({ type: 'heading',   text })
const H2   = (text) => ({ type: 'heading2',  text })
const H3   = (text) => ({ type: 'heading3',  text })
const P    = (text) => ({ type: 'paragraph', text })
const L    = (...items) => ({ type: 'list',      items })
const NUM  = (...items) => ({ type: 'numbered',  items })
const CHK  = (...items) => ({ type: 'checklist', items })
const CODE = (text) => ({ type: 'code',     text })
const TPL  = (text) => ({ type: 'template', text })
const DIV  = () => ({ type: 'divider' })
const CO   = (variant, title, text) => ({ type: 'callout', variant, title, text })
const TBL  = (headers, rows) => ({ type: 'table', table: { headers, rows } })

const SOPS = []
const sop = (o) => { SOPS.push(o) }

/* ════════════════════════════════════════════════════════════════
   CATÉGORIE : dev — Git & GitHub
   ════════════════════════════════════════════════════════════════ */

sop({
  slug: 'ng-dev-git-commandes', category: 'dev', popular: true, read_min: 4,
  title: 'Commandes Git essentielles — le quotidien du développeur',
  description: "Les commandes Git à connaître par cœur, l'ordre à respecter à chaque session, comment revenir en arrière et les 4 actions interdites sans validation.",
  tags: ['Git', 'GitHub', 'Développeur', 'Quotidien'],
  blocks: [
    CO('info', 'Pour qui', "Tout développeur ou stagiaire Next Gital qui touche à un dépôt Git."),
    CO('tip', 'Objectif', "Ne jamais perdre de travail, ne jamais écraser celui d'un collègue, ne jamais casser la production."),
    CO('danger', "Règle absolue", "Ne jamais exécuter automatiquement : git push · git commit · un déploiement · une modification de base de données. Toujours demander une validation avant ces 4 actions."),

    H('1. Les commandes de base — à utiliser chaque jour'),
    TBL(['Commande', 'Ce qu\'elle fait'], [
      ['git status', "Affiche l'état actuel du projet local"],
      ['git pull', 'Récupère les dernières modifications depuis GitHub'],
      ['git add .', 'Prépare toutes les modifications'],
      ['git commit -m "message"', 'Enregistre les modifications localement'],
      ['git push', 'Envoie les modifications vers GitHub'],
    ]),

    H('2. L\'ordre à respecter à chaque fois'),
    CODE("git pull              # Récupérer les dernières modifications\ngit status            # Voir ce qui a changé\ngit add .             # Préparer les fichiers\ngit commit -m \"...\"   # Enregistrer localement\ngit push              # Envoyer vers GitHub"),
    CO('warning', 'Toujours commencer par git pull', "Si on oublie le pull, on travaille sur une version obsolète et on crée des conflits inutiles."),

    H('3. Revenir en arrière'),
    TBL(['Commande', 'Ce qu\'elle fait'], [
      ['git log', "Voir l'historique des commits"],
      ['git diff', 'Voir les modifications avant le commit'],
      ['git stash', 'Sauvegarder temporairement les modifications'],
      ['git stash pop', 'Restaurer les modifications sauvegardées'],
      ['git reset --hard HEAD', '⚠️ Revenir au dernier commit (destructif)'],
    ]),
    CO('danger', 'git reset --hard', "Cette commande supprime définitivement toutes les modifications non enregistrées. Faire un `git stash` avant, systématiquement."),

    H('Checklist de fin de session'),
    CHK(
      'git status → working tree clean',
      'Aucun fichier sensible (.env, clés, dumps) dans le commit',
      'Message de commit explicite (pas « update » ni « fix »)',
      'Validation obtenue avant le push',
    ),
  ],
})

sop({
  slug: 'ng-dev-git-branch', category: 'dev', popular: false, read_min: 5,
  title: 'Développer une fonctionnalité sur une branche Git',
  description: "Créer une branche dédiée, développer, tester, fusionner dans main puis publier — sans jamais impacter la version officielle du projet.",
  tags: ['Git', 'Branche', 'Feature', 'Workflow'],
  blocks: [
    CO('tip', 'Objectif', "Développer une nouvelle fonctionnalité sans impacter la version officielle du projet."),
    CO('danger', 'Interdit sans validation', "git push · déploiement en production · modification de base de données."),

    H('Étapes — dans l\'ordre'),

    H2('1. Mettre à jour le projet'),
    CODE("git checkout main\ngit pull"),

    H2('2. Créer la branche de travail'),
    CODE("git checkout -b feature/nom-fonctionnalite\n\n# Exemple\ngit checkout -b feature/module-expedition"),
    CO('info', 'Nommage', "Toujours `feature/` + un nom court en minuscules avec des tirets. Ex : feature/module-expedition, feature/export-pdf."),

    H2('3. Développer puis vérifier'),
    CODE("git status"),

    H2('4. Sauvegarder les modifications'),
    CODE("git add .\ngit commit -m \"Ajout du module d'expédition\""),

    H2('5. Tester avant toute intégration'),
    L(
      "Vérifier que l'application démarre correctement",
      'Contrôler l\'absence d\'erreurs console et API',
      'Valider les tests fonctionnels de la fonctionnalité',
    ),

    H2('6. Intégrer dans la branche principale'),
    CODE("git checkout main\ngit pull\ngit merge feature/module-expedition"),

    H2('7. Validation finale'),
    CHK(
      'Le projet fonctionne après le merge',
      'Aucun conflit restant',
      'Conformité aux exigences du client',
    ),

    H2('8. Publication sur GitHub — après validation uniquement'),
    CODE("git push"),

    DIV(),
    H('Workflow résumé'),
    CODE("git checkout main\ngit pull\n\ngit checkout -b feature/nom-fonctionnalite\n# … développement …\ngit add .\ngit commit -m \"Description\"\n\ngit checkout main\ngit pull\ngit merge feature/nom-fonctionnalite\n\n# Après validation uniquement\ngit push"),
  ],
})

sop({
  slug: 'ng-dev-git-synchronisation', category: 'dev', popular: false, read_min: 3,
  title: 'Vérifier la synchronisation Git — « je ne vois pas les dernières modifications »',
  description: "Interpréter la sortie de git status, savoir si le local est à jour avec GitHub, et débloquer un collègue qui ne voit pas les changements.",
  tags: ['Git', 'Diagnostic', 'Synchronisation'],
  blocks: [
    CO('info', 'Quand utiliser cette SOP', "Un membre de l'équipe dit « je ne vois pas les dernières modifications » ou « le site n'a pas changé »."),

    H('1. Vérifier l\'état du dépôt'),
    CODE("git status"),
    P('Résultat attendu :'),
    CODE("Your branch is up to date with 'origin/main'\nnothing to commit, working tree clean"),
    P('Cela signifie que :'),
    L(
      'Le projet local est synchronisé avec GitHub',
      "Aucun fichier n'est en attente d'envoi",
      'La version locale est identique à la branche main',
    ),

    H('2. Si les modifications ne s\'affichent toujours pas'),
    NUM(
      'Vérifier que le développeur a bien poussé son travail sur main (git log origin/main --oneline -5)',
      'Relancer les dépendances et le serveur : npm install puis npm run dev',
      'Vider le cache du navigateur : Cmd + Shift + R (Mac) ou Ctrl + Shift + R (Windows)',
    ),

    H('3. Cas particulier — un stash existe'),
    CO('warning', 'Ne pas supprimer un stash', "Un `stash@{0}` est conservé comme sauvegarde de sécurité. Ne jamais le supprimer avant vérification complète du travail en cours."),
    CODE("git stash list      # lister les sauvegardes\ngit stash show -p    # voir le contenu du dernier stash"),

    H('Checklist'),
    CHK(
      'git status → working tree clean',
      'git log origin/main confirme la présence du commit attendu',
      'npm install + npm run dev relancés',
      'Cache navigateur vidé',
    ),
  ],
})

sop({
  slug: 'ng-dev-github-nouveau-projet', category: 'dev', popular: false, read_min: 3,
  title: 'Publier un nouveau projet sur GitHub',
  description: "Créer le dépôt, initialiser Git en local et pousser le projet en 6 commandes. Inclut le cas d'un dépôt déjà créé avec un README et l'authentification par token.",
  tags: ['GitHub', 'Git', 'Nouveau projet', 'Initialisation'],
  blocks: [
    H('Étape 1 — Créer le dépôt sur GitHub'),
    NUM(
      'Aller sur github.com/new',
      'Donner un nom au dépôt',
      "Ne rien cocher (pas de README, pas de .gitignore)",
      'Cliquer sur Create repository',
    ),

    H('Étape 2 — Dans le terminal'),
    CODE("cd /chemin/vers/ton-projet\n\ngit init\ngit add .\ngit commit -m \"Initial commit\"\ngit branch -M main\ngit remote add origin https://github.com/USERNAME/NOM-REPO.git\ngit push -u origin main"),
    CO('success', 'Résultat', "6 commandes, projet en ligne."),

    H('Cas particulier — dépôt déjà créé avec un README'),
    CODE("git pull origin main --allow-unrelated-histories\ngit push -u origin main"),

    H('Problème de mot de passe'),
    P("GitHub n'accepte plus les mots de passe : il faut un Personal Access Token."),
    NUM(
      'GitHub → Settings → Developer settings',
      'Personal access tokens → Tokens (classic) → Generate',
      'Cocher le scope « repo »',
      'Utiliser ce token comme mot de passe',
    ),
    CO('danger', 'Sécurité', "Ne jamais committer un token, une clé API ou un fichier .env. Vérifier le .gitignore AVANT le premier commit."),
  ],
})

sop({
  slug: 'ng-dev-lancer-projet-github-vscode', category: 'dev', popular: true, read_min: 5,
  title: 'Lancer un projet depuis GitHub avec VS Code',
  description: "Prérequis à installer, clonage du dépôt, npm install, npm run dev, accès au localhost et résolution des 3 problèmes les plus fréquents.",
  tags: ['VS Code', 'GitHub', 'Onboarding', 'Node.js', 'npm'],
  blocks: [
    CO('tip', 'Objectif', "Permettre à n'importe quel membre de l'équipe de télécharger et lancer un projet en local, sans erreurs."),

    H('Prérequis — à installer avant de commencer'),
    TBL(['Outil', 'Lien', 'Vérification'], [
      ['VS Code', 'https://code.visualstudio.com', 'L\'application s\'ouvre'],
      ['Node.js (LTS)', 'https://nodejs.org', '`node -v` et `npm -v` répondent'],
      ['Git', 'https://git-scm.com/downloads', '`git --version` répond'],
      ['Compte GitHub', 'https://github.com/signup', 'Connexion OK'],
      ['Accès au dépôt', 'Demander au responsable', 'Le dépôt est visible'],
    ]),

    H('Étapes — dans l\'ordre'),

    H2('1. Cloner le projet'),
    NUM(
      'Ouvrir VS Code',
      'Cliquer sur « Clone Repository »',
      "Coller le lien du dépôt GitHub",
      'Choisir un dossier (ex : Desktop)',
      'Cliquer sur Open après le téléchargement',
    ),

    H2('2. Ouvrir le terminal'),
    P("Menu : Terminal → New Terminal, ou raccourci Ctrl + `"),

    H2('3. Installer les dépendances'),
    CODE("npm install"),
    CO('warning', 'Ne pas couper le processus', "Attendre la fin complète de l'installation, même si cela prend plusieurs minutes."),

    H2('4. Lancer le projet'),
    CODE("npm run dev"),

    H2('5. Accéder au projet'),
    P("Un lien apparaît dans le terminal, par exemple http://localhost:8080 — cliquer dessus ou l'ouvrir dans le navigateur."),

    H2('6. Avant chaque session de travail'),
    CODE("git pull"),

    DIV(),
    H('Problèmes fréquents'),
    TBL(['Symptôme', 'Cause', 'Solution'], [
      ['Port 8080 is in use', 'Un autre projet tourne déjà', 'Utiliser le nouveau lien proposé automatiquement'],
      ['Erreur npm install', 'Node.js absent ou pas de connexion', 'Vérifier `node -v` et la connexion Internet'],
      ["Le projet ne s'ouvre pas", 'Serveur non lancé', 'Vérifier que `npm run dev` tourne toujours'],
    ]),

    CO('danger', 'Règle d\'équipe', "Si quelqu'un ne fait pas `git pull`, il travaille sur une version obsolète. Si une question est déjà répondue dans cette SOP, c'est qu'elle n'a pas été lue."),
  ],
})

sop({
  slug: 'ng-dev-dokploy-deploiement', category: 'dev', popular: true, read_min: 7,
  title: 'Déployer un projet GitHub sur Dokploy',
  description: "Créer le projet et le service, connecter GitHub, configurer le build (Nixpacks / Static / Dockerfile), le domaine, le SSL Let's Encrypt et l'auto-deploy à chaque push.",
  tags: ['Dokploy', 'Déploiement', 'VPS', 'CI/CD', 'DNS'],
  blocks: [
    CO('info', 'Contexte', "Dokploy tourne sur le VPS Hostinger Next Gital. Interface : http://<IP_VPS>:3000."),

    H('Étapes — dans l\'ordre'),

    H2('1. Créer un nouveau projet'),
    NUM('Cliquer sur + Create Project', 'Donner un nom (ex : fdx-renovation)', 'Cliquer sur Create'),

    H2('2. Ajouter un service'),
    NUM('Ouvrir le projet créé', 'Cliquer sur + Add Service', 'Choisir Application'),

    H2('3. Connecter GitHub'),
    NUM(
      'Dans Source, choisir GitHub',
      'Cliquer sur Connect GitHub (première fois → autoriser Dokploy sur le compte)',
      'Sélectionner le dépôt',
      'Branch : main',
    ),
    CO('info', 'Installation de l\'app GitHub', "GitHub demande « Install & Authorize » : choisir All repositories ou Only select repositories, puis valider. La redirection se fait vers http://<IP_VPS>:3000/api/providers/github/setup."),

    H2('4. Configurer le build'),
    TBL(['Champ', 'Valeur'], [
      ['Build Type', 'Nixpacks (auto-détecte Vite/Node) · Static pour un site HTML pur · Dockerfile si présent'],
      ['Publish Directory', '/ ou dist selon le projet'],
      ['Port', '80 pour un site statique, 3000/4000 pour une app Node'],
      ['Build command', 'npm run build'],
      ['Start command', 'npx serve dist -p 3000 (site statique buildé)'],
    ]),
    CO('tip', 'Site HTML/CSS/JS pur', "Créer un Dockerfile nginx:alpine à la racine : image de base nginx:alpine, copie des fichiers vers /usr/share/nginx/html, EXPOSE 80. Ajouter un .dockerignore excluant node_modules, .git, .claude, *.md."),

    H2('5. Pointer le domaine vers le VPS'),
    P('Chez le registrar du domaine, dans la zone DNS :'),
    TBL(['Type', 'Nom', 'Valeur', 'TTL'], [
      ['A', '@', '<IP_DU_VPS>', '300'],
      ['A', 'www', '<IP_DU_VPS>', '300'],
    ]),
    P('Vérifier la propagation sur dnschecker.org (5 min à 24 h selon le registrar).'),

    H2('6. Configurer le domaine dans Dokploy'),
    NUM(
      "Onglet Domains → Add Domain",
      'Host = le domaine · Port = celui du service',
      'Activer HTTPS + Let\'s Encrypt',
      'Cliquer sur Update / Create',
    ),

    H2('7. Déployer'),
    NUM('Cliquer sur Deploy', 'Surveiller les logs en temps réel', 'Vert = déployé'),

    H2('8. Activer l\'auto-deploy (CI/CD)'),
    NUM('Onglet General du service', 'Activer Autodeploy', 'Trigger Type = On Push · Branch = main'),
    CO('success', 'Résultat', "Dokploy redéploie automatiquement à chaque `git push` sur main."),

    DIV(),
    H('Checklist de déploiement'),
    CHK(
      'Build vert dans les logs Dokploy',
      'Domaine racine + www répondent en HTTPS',
      'Certificat Let\'s Encrypt actif (cadenas 🔒)',
      'Variables d\'environnement renseignées dans l\'onglet Environment',
      'Autodeploy activé sur main',
    ),
  ],
})

sop({
  slug: 'ng-dev-dokploy-mdp-postgres', category: 'dev', popular: false, read_min: 5,
  title: 'Changer le mot de passe PostgreSQL en production (Dokploy)',
  description: "Sécuriser une base exposée : modifier le mot de passe via le terminal du conteneur, répercuter la valeur dans les variables d'environnement de l'API, redéployer et vérifier les logs.",
  tags: ['PostgreSQL', 'Dokploy', 'Sécurité', 'Production', 'Base de données'],
  blocks: [
    CO('warning', 'Contexte', "Quand l'External Port de la base ne peut pas être modifié dans Dokploy, un mot de passe fort réduit fortement le risque d'accès non autorisé. C'est l'action prioritaire."),
    CO('danger', 'Avant de commencer', "Prévenir l'équipe : l'API sera indisponible quelques minutes le temps du redéploiement. Faire un backup (pg_dump) avant toute intervention."),

    H('Étape 1 — Modifier le mot de passe PostgreSQL'),
    NUM(
      "Dans Dokploy, ouvrir le service de base de données → bouton Open Terminal",
      'Se connecter à PostgreSQL',
    ),
    CODE("psql -U postgres -d <nom_base>"),
    P('Le prompt affiche `<nom_base>=#`. Définir alors un mot de passe fort :'),
    CODE("ALTER USER postgres WITH PASSWORD '<NOUVEAU_MOT_DE_PASSE_FORT>';"),
    CO('success', 'Résultat attendu', "PostgreSQL affiche : ALTER ROLE"),
    P('Quitter avec `\\q`.'),

    H('Étape 2 — Mettre à jour l\'application API'),
    NUM(
      'Ouvrir le service applicatif (pas le service base de données)',
      'Onglet Environment',
      'Rechercher la variable DB_PASSWORD',
      'Remplacer par le nouveau mot de passe — exactement le même que celui défini dans PostgreSQL',
      'Cliquer sur Save',
      'Cliquer sur Redeploy (ou Reload)',
    ),
    CO('warning', 'Caractères spéciaux', "Si le mot de passe contient #, $, !, ou des espaces, l'entourer de guillemets : DB_PASSWORD=\"Xk9mP2#vL8nQ4wR\"."),

    H('Étape 3 — Vérification'),
    P('Ouvrir l\'onglet Logs du service applicatif. On doit voir :'),
    CODE("[API] listening on http://0.0.0.0:4000"),
    P('Et ne plus voir :'),
    CODE("[PG POOL ERROR] password authentication failed"),

    H('Checklist'),
    CHK(
      'Backup pg_dump réalisé avant intervention',
      'ALTER ROLE confirmé dans psql',
      'DB_PASSWORD mis à jour dans Environment',
      'Service redéployé',
      'Logs propres — API en écoute, aucune erreur d\'authentification',
      'Nouveau mot de passe stocké dans le gestionnaire de secrets (jamais dans Git)',
    ),
  ],
})

sop({
  slug: 'ng-dev-feature-a-z', category: 'dev', popular: true, read_min: 8,
  title: "Développer une nouvelle fonctionnalité de A à Z (GestiQ)",
  description: "Les 14 étapes obligatoires, de la migration SQL au déploiement production, avec la règle d'or de l'ordre d'exécution et le tableau des erreurs fréquentes.",
  tags: ['GestiQ', 'Migration', 'Backend', 'Frontend', 'Déploiement'],
  blocks: [
    CO('danger', "Règle d'or", "Migration → Backend → API Client → UI → Tests → Commit → Push → Migration Production → Déploiement. Chaque nouvelle fonctionnalité suit exactement cet ordre. Si une étape est oubliée, consulter la section « Erreurs fréquentes »."),

    H('Les 14 étapes'),
    NUM(
      'Planification et analyse des besoins',
      'Rédaction de la migration SQL (supabase/migrations/NNN_nom.sql)',
      'Exécution de la migration en local',
      'Création de la route Backend (server/routes/)',
      'Redémarrage du serveur',
      'Création ou mise à jour de l\'API Client (src/lib/api.ts)',
      'Création ou modification des pages React',
      'Enregistrement des routes dans App.tsx et AppLayout.tsx',
      'Vérification TypeScript (npx tsc --noEmit)',
      'Tests locaux complets',
      'Commit Git (éviter git add . sans vérification)',
      'Push GitHub — uniquement après validation explicite',
      'Exécution de la migration sur la production Dokploy',
      'Déploiement de l\'application en production',
    ),

    H('Cheat sheet — commandes essentielles'),
    CODE("# Local\nnpm run dev\nnpx tsc --noEmit\nnpm run build\n\n# Migration locale\npsql -h localhost -p <port> -U <user> -d <base> -f supabase/migrations/NNN_nom.sql\n\n# Migration production (via SSH + Docker)\ncat supabase/migrations/NNN_nom.sql | ssh <cible> \\\n  \"docker exec -i <conteneur_pg> psql -U <user> -d <base> -v ON_ERROR_STOP=1\""),

    H('Erreurs fréquentes'),
    TBL(['Erreur', 'Cause probable', 'Solution'], [
      ['erreur 42703 — column does not exist', 'Migration non appliquée en production', 'Rejouer la migration sur la base prod'],
      ['postgres is not permitted to log in', 'Rôle sans LOGIN', 'Utiliser le rôle applicatif de l\'app'],
      ['Port 8080 is already in use', 'Serveur déjà lancé', 'Utiliser le port proposé ou tuer le process'],
      ['Erreur TypeScript au build', 'Types non mis à jour après la migration', 'Mettre à jour les interfaces + npx tsc --noEmit'],
      ['Bouton sans effet', 'Route API non enregistrée', 'Vérifier server/routes + src/lib/api.ts'],
    ]),

    H('Checklist avant push'),
    CHK(
      'Migration testée en local, idempotente (IF NOT EXISTS / WHERE NOT EXISTS)',
      'RLS et tenant_id conformes à ARCHITECTURE_TENANT.md',
      'npx tsc --noEmit sans erreur',
      'npm run build sans erreur',
      'Fonctionnalité testée dans le navigateur',
      'Aucune erreur console ni API',
      'Validation obtenue avant git push',
    ),
  ],
})

sop({
  slug: 'ng-dev-ssh-vps-hostinger', category: 'dev', popular: true, read_min: 6,
  title: 'Connecter Claude Code à un VPS Hostinger via SSH',
  description: "Générer une paire de clés ed25519, l'installer sur le VPS Hostinger, créer un alias ~/.ssh/config, tester la connexion et l'utiliser depuis Claude Code. Règles de sécurité incluses.",
  tags: ['SSH', 'VPS', 'Hostinger', 'Claude Code', 'Sécurité'],
  blocks: [
    CO('info', 'Durée', "15 minutes · Difficulté : facile."),
    CO('tip', 'Objectif', "Permettre à Claude Code d'exécuter des commandes en sécurité sur un VPS distant : diagnostiquer PostgreSQL, consulter les logs Docker, automatiser la maintenance, récupérer des dumps."),
    CO('danger', 'Jamais dans un document partagé', "Une clé privée SSH ne doit JAMAIS être collée dans une note, un ticket, un SOP ou un message. Elle reste uniquement dans ~/.ssh sur la machine."),

    H('Étape 1 — Générer une paire de clés SSH sur le Mac'),
    CODE("ssh-keygen -t ed25519 -C \"<prenom>-vps-hostinger\" -f ~/.ssh/id_ed25519"),
    P('Appuyer sur Entrée pour accepter le nom par défaut, puis saisir une passphrase (recommandé).'),
    CODE("ls -la ~/.ssh/id_ed25519*"),
    P('Résultat attendu : la clé privée (id_ed25519, à ne JAMAIS partager) et la clé publique (id_ed25519.pub, à partager).'),

    H('Étape 2 — Vérifier les permissions'),
    CO('warning', 'Obligatoire', "Sans ces permissions strictes, SSH refuse la connexion."),
    CODE("chmod 700 ~/.ssh\nchmod 600 ~/.ssh/id_ed25519\nchmod 644 ~/.ssh/id_ed25519.pub"),

    H('Étape 3 — Copier la clé publique'),
    CODE("pbcopy < ~/.ssh/id_ed25519.pub"),

    H('Étape 4 — Ajouter la clé publique au VPS'),
    NUM(
      'Aller sur https://hpanel.hostinger.com/vps',
      'Cliquer sur le VPS → menu latéral Security → SSH Keys',
      'Cliquer sur Add SSH Key',
      'Name : nom descriptif de la machine',
      'Public Key : Cmd+V',
      'Save, puis redémarrer le VPS ou attendre 30 secondes',
    ),

    H('Étape 5 — Créer un alias dans ~/.ssh/config'),
    CODE("cat >> ~/.ssh/config << 'EOF'\n\nHost <ALIAS>\n    HostName <VPS_HOSTNAME>\n    User root\n    Port 22\n    IdentityFile ~/.ssh/id_ed25519\n    ServerAliveInterval 30\n    ServerAliveCountMax 3\nEOF\n\nchmod 600 ~/.ssh/config"),

    H('Étape 6 — Tester la connexion'),
    CODE("ssh -o BatchMode=yes -o ConnectTimeout=8 <ALIAS> \"hostname && whoami && uptime\""),
    CO('success', 'Résultat attendu', "Le hostname du VPS, root, et l'uptime s'affichent → connexion SSH opérationnelle."),

    H('Étape 7 — Utiliser depuis Claude Code'),
    CODE("ssh <ALIAS> \"docker ps\"\n\nssh <ALIAS> \"docker exec <CONTENEUR_PG> psql -U <DB_USER> -d <DB_NAME> -c 'SELECT COUNT(*) FROM <TABLE>;'\""),

    DIV(),
    H('Règles de sécurité'),
    TBL(['Règle', 'Pourquoi'], [
      ['Ne jamais partager ~/.ssh/id_ed25519', 'Contrôle total du VPS pour qui la détient'],
      ['Toujours une passphrase sur la clé privée', 'Protection en cas de vol de la machine'],
      ['Ne jamais committer ~/.ssh/*', 'Fuite définitive'],
      ['Utiliser ed25519 (jamais RSA 1024)', 'Standard sécurisé moderne'],
      ['Restrictions IP dans Hostinger si possible', "Réduit la surface d'attaque"],
      ['Rotation de la clé tous les 12 mois', 'Réduit le risque en cas de fuite non détectée'],
    ]),

    H('Dépannage'),
    TBL(['Symptôme', 'Cause', 'Solution'], [
      ['Permission denied (publickey)', 'Clé absente du VPS ou permissions incorrectes', 'Refaire les étapes 2 et 4'],
      ['Connection timed out', 'Firewall ou mauvaise IP', "Vérifier l'IP dans Hostinger Overview"],
      ['Host key verification failed', "L'IP du VPS a changé", 'ssh-keygen -R <VPS_HOSTNAME> puis reconnecter'],
      ['Passphrase demandée à chaque commande', 'Pas de ssh-agent', 'ssh-add ~/.ssh/id_ed25519 (1 fois par session)'],
    ]),
  ],
})

sop({
  slug: 'ng-dev-intervention-serveur-env', category: 'dev', popular: false, read_min: 5,
  title: 'Intervenir sur un serveur en production à partir du .env du projet',
  description: "Cadre d'intervention pour Claude Code : lire les accès dans .env sans les exposer, diagnostiquer Docker / Nginx / Dokploy / base / SSL, corriger, tester et produire un rapport.",
  tags: ['SSH', 'Docker', 'Dokploy', 'Production', 'Diagnostic'],
  blocks: [
    CO('info', 'Contexte', "Les accès serveur (SSH, clé privée, base) sont déjà présents dans le fichier .env du projet ou dans la plateforme d'hébergement."),
    CO('danger', 'Interdits absolus', "Ne jamais afficher, copier ou logger le contenu du .env. Ne jamais publier de secret dans Git. Ne pas modifier les clés SSH, mots de passe ou tokens existants sauf nécessité absolue."),

    H('Ce qu\'il faut vérifier — dans l\'ordre'),
    NUM(
      "Analyser le projet et identifier la cause exacte du problème",
      'État des conteneurs Docker (docker ps, docker logs)',
      "Logs de l'application",
      'Logs Nginx / reverse proxy (Traefik)',
      'Configuration Dokploy du service',
      "Variables d'environnement du service",
      'Connexion à la base de données',
      'Ports utilisés',
      'Domaine et certificat SSL',
      'Permissions des fichiers',
      'État du déploiement et des services',
    ),

    H('Procédure de correction'),
    NUM(
      'Identifier la cause racine (pas le symptôme)',
      'Créer une sauvegarde des fichiers ou configurations concernés avant toute modification risquée',
      'Appliquer la correction sans supprimer de données existantes',
      'Redémarrer uniquement les services nécessaires',
      'Tester en conditions réelles',
    ),

    H('Tests de validation obligatoires'),
    CHK(
      'Le site est accessible',
      "L'API répond",
      'La base de données répond correctement',
      'Aucune erreur critique dans les logs',
      'Le domaine et le HTTPS fonctionnent',
    ),

    H('Rapport final attendu'),
    L(
      'La cause exacte du problème',
      'Les fichiers et configurations modifiés',
      'Les commandes exécutées',
      'Les services redémarrés',
      'Les tests effectués et leur résultat',
      'Les recommandations de sécurité ou de maintenance',
    ),
  ],
})

sop({
  slug: 'ng-dev-wordpress-ssh-claude', category: 'dev', popular: true, read_min: 7,
  title: 'Intervenir sur un site WordPress en production via SSH',
  description: "Cadre strict d'intervention sur un site WordPress hébergé : identifier le bon dossier, analyser avant de modifier, sauvegarder, corriger, tester chaque page et livrer un rapport.",
  tags: ['WordPress', 'SSH', 'Hostinger', 'Production', 'Maintenance'],
  blocks: [
    CO('danger', 'Règle numéro 1 — un seul site', "Un compte d'hébergement contient souvent plusieurs sites. N'intervenir QUE sur le domaine désigné. Si le dossier ne correspond pas au domaine annoncé, ARRÊTER et demander confirmation."),

    H('Étape 1 — Connexion SSH'),
    CODE("ssh -p <PORT> <UTILISATEUR>@<IP_HEBERGEMENT>"),
    CO('warning', 'Identifiants', "Les identifiants viennent du .env du projet ou du gestionnaire de secrets — jamais d'un autre projet, jamais collés dans un document partagé."),

    H('Étape 2 — Vérifier qu\'on est sur le bon site'),
    NUM(
      'Localiser le dossier racine du domaine',
      "Vérifier que wp-config.php appartient bien à ce domaine",
      "Vérifier l'URL du site (wp option get siteurl)",
      'Confirmer explicitement avant toute modification',
    ),
    CODE("wp option get siteurl\nwp option get home\nwp core version"),

    H('Étape 3 — Analyser avant de modifier'),
    L(
      'Identifier les erreurs (PHP, JavaScript, CSS, thème, extensions)',
      "Vérifier les plugins et le thème actif",
      'Contrôler les permaliens, le .htaccess, le SSL',
      'Relever les liens cassés, images manquantes, erreurs 404 / 500',
      'Mesurer les performances et le responsive',
    ),
    CO('info', 'Livrable intermédiaire', "Présenter un rapport d'analyse complet AVANT toute correction, et attendre l'autorisation."),

    H('Étape 4 — Corriger'),
    L(
      'Corriger uniquement les problèmes détectés',
      "Ne désactiver un plugin que si c'est indispensable — et expliquer pourquoi",
      'Ne supprimer aucune donnée importante',
      'Sauvegarder avant chaque modification risquée',
      'Si une correction crée une nouvelle erreur, la corriger immédiatement avant de continuer',
    ),

    H('Étape 5 — Tester chaque page'),
    CHK(
      "La page d'accueil",
      'Toutes les pages publiées et les articles',
      'Les formulaires, menus, boutons, images',
      'Header et footer',
      'Liens internes et externes',
      'Pages de contact et pages légales',
    ),

    H('Étape 6 — SEO, performance et sécurité'),
    L(
      'SEO : robots.txt, sitemap.xml, meta title/description, canonical, Open Graph, Schema.org, breadcrumbs, redirections',
      'Performance : cache, CSS, JavaScript, images, lazy loading, compression, Core Web Vitals',
      'Sécurité : permissions, HTTPS, headers de sécurité, fichiers sensibles, comptes administrateurs, plugins vulnérables',
    ),

    H('Validation finale'),
    CHK(
      "La page d'accueil fonctionne",
      'Toutes les pages répondent correctement',
      "Aucun lien important n'est cassé",
      "Aucun formulaire en erreur",
      'Aucune erreur PHP ni JavaScript critique',
      'Aucune erreur 404 ou 500 importante',
      'Le SEO technique est valide',
      'Le site est rapide et sécurisé',
    ),

    H('Rapport final'),
    L(
      'Tous les problèmes corrigés',
      'Les fichiers modifiés',
      'Les plugins modifiés',
      'Les optimisations réalisées',
      'Les tests effectués',
      'Les problèmes restants éventuels',
    ),
  ],
})

sop({
  slug: 'ng-dev-wordpress-local-claude', category: 'dev', popular: true, read_min: 9,
  title: 'Développer un site WordPress avec Claude Code (Local by Flywheel)',
  description: "Du brief design au thème sur-mesure : bonnes pratiques Claude Code, structure d'un bon prompt, création du site local, développement du thème, mise en ligne et checklist de livraison.",
  tags: ['WordPress', 'Claude Code', 'Local', 'Thème', 'Design'],
  blocks: [
    CO('info', 'Public', "Développeur junior Next Gital. Prérequis : Mac ou PC, Claude Code, Local (by Flywheel), VS Code."),

    H('1. Travailler avec Claude Code'),
    P("Claude Code n'est pas un chatbot : il lit et modifie directement les fichiers du projet, exécute des commandes et teste le site. Le rôle du développeur est de diriger, vérifier et valider."),
    L(
      'Un objectif clair par demande — une tâche = une demande précise',
      'Donner le contexte : quel site, quel dossier, quel résultat attendu',
      'Laisser Claude explorer les fichiers existants avant de coder',
      'Vérifier toujours le résultat dans le navigateur, pas seulement le code',
      'Travailler par petites étapes : construire → tester → valider',
      'Ne jamais valider à l\'aveugle une mise en ligne ou une suppression',
    ),

    H2("Structure d'un bon prompt"),
    NUM(
      'Le contexte — « Sur le site WordPress local <nom-du-site>… »',
      "L'objectif — « je veux ajouter / corriger / modifier… »",
      'Le détail — valeurs exactes, textes, couleurs, comportement attendu',
      'La vérification — « vérifie que la page s\'affiche sans erreur »',
    ),
    TBL(['Prompt faible', 'Prompt fort'], [
      ['refais la page d\'accueil', "Sur le site local tuning-car, modifie le titre du hero de front-page.php en « Location de voitures à Oujda », garde le design, puis vérifie que la page répond en HTTP 200"],
    ]),

    H('2. Conception avant développement'),
    CO('danger', "Règle d'or", "On conçoit avant de coder. Jamais de développement sans brief design validé."),
    NUM(
      'Cadrer : type de site, cible, style, couleurs, polices, pages, fonctions',
      'Générer 2-3 concepts visuels et comparer',
      'Créer les maquettes HTML statiques (accueil, page intérieure, fiche produit)',
      'Faire valider la maquette par le responsable ou le client',
      'Seulement ensuite : transformer la maquette validée en thème WordPress',
    ),

    H('3. Créer le site local (Local by Flywheel)'),
    NUM(
      'Ouvrir Local → « + » (Create a new site)',
      'Nommer le site (ex : nom-client)',
      'Choisir « Preferred » (PHP + serveur + MySQL automatiques)',
      "Définir l'identifiant et le mot de passe administrateur WordPress (les noter)",
      'Add Site → le site se crée et démarre',
    ),
    TBL(['Action', 'Bouton dans Local'], [
      ['Voir le site', 'Open site (ex : https://nom-client.local)'],
      ['Administration', 'WP Admin'],
      ['Fichiers', 'Go to site folder → app/public'],
      ['Code', 'VS Code'],
      ['Terminal WP-CLI', 'Site shell'],
    ]),
    CO('info', 'Dossier à indiquer à Claude Code', ".../Local Sites/<nom-client>/app/public/wp-content/themes/"),

    H('4. Construire un thème sur-mesure'),
    NUM(
      'Créer le dossier du thème dans wp-content/themes/nom-theme/',
      'style.css — en-tête du thème + design system (couleurs, polices)',
      'functions.php — réglages, menus, scripts, Custom Post Types, champs personnalisés, Customizer',
      'header.php / footer.php',
      'front-page.php — page d\'accueil',
      'page.php, single.php, archive-*.php, single-*.php',
      'template-*.php — contact, réservation, pages SEO',
      'inc/ — modules séparés (ex : inc/seo.php pour Schema.org)',
    ),

    H('5. Créer le contenu'),
    NUM(
      'Activer le thème (Apparence → Thèmes)',
      'Créer les pages et définir la page d\'accueil (Réglages → Lecture)',
      'Créer le menu (Apparence → Menus)',
      'Ajouter le contenu (produits, articles, photos)',
      'Renseigner les coordonnées via le Customizer',
    ),

    H('6. Travailler directement dans les fichiers'),
    CO('danger', 'Règle Next Gital', "Claude Code modifie directement les fichiers du thème — il ne génère pas du code « à part » à recopier à la main."),
    L(
      '❌ Coller du code donné en bloc sans savoir où il va',
      '❌ Modifier un site en ligne directement sans sauvegarde',
      '❌ Modifier le cœur de WordPress (wp-includes, wp-admin)',
    ),

    H('7. Mettre en ligne le thème'),
    NUM(
      'Compresser le dossier du thème en .zip',
      'Sur le site en ligne : Apparence → Thèmes → Ajouter → Téléverser un thème',
      'Choisir le .zip → Remplacer l\'actuel par celui téléversé',
      'Réglages → Permaliens → Enregistrer (régénère les liens)',
    ),
    CO('warning', 'Contenu vs code', "Le contenu (textes, produits, photos) se gère sur le site en ligne. Le thème (code) se prépare en local puis se téléverse."),

    H('Checklist de livraison'),
    CHK(
      'Toutes les pages s\'affichent sans erreur (mobile + ordinateur)',
      'Logo, couleurs et coordonnées corrects',
      'Menu et liens fonctionnels',
      'Formulaires testés (email bien reçu)',
      'SEO de base : titres, meta descriptions, Schema, sitemap',
      'Permaliens enregistrés',
      'Site indexable (Réglages → Lecture : « décourager les moteurs » décoché)',
      'Sauvegarde réalisée',
      'Guide d\'utilisation remis au client',
    ),
  ],
})

sop({
  slug: 'ng-dev-wordpress-reset-password', category: 'dev', popular: false, read_min: 4,
  title: 'Réinitialiser un mot de passe WordPress (Local / WP-CLI)',
  description: "Reprendre l'accès à un site WordPress local quand le mot de passe administrateur est oublié — méthode WP-CLI recommandée, AdminNeo en secours, et les erreurs à ne pas commettre.",
  tags: ['WordPress', 'WP-CLI', 'Local', 'Mot de passe', 'Dépannage'],
  blocks: [
    CO('tip', 'Objectif', "Récupérer l'accès à un site WordPress local lorsque le mot de passe administrateur est oublié."),
    CO('info', 'Environnement', "Local (by Flywheel) · WordPress · WP-CLI · AdminNeo en secours."),

    H('Méthode recommandée — WP-CLI'),

    H2('1. Ouvrir le site dans Local'),
    NUM('Ouvrir Local', 'Sélectionner le site concerné', 'Vérifier que le site est démarré', 'Cliquer sur Site shell'),

    H2('2. Vérifier WP-CLI'),
    CODE("wp --info"),
    P('Vérifier que WP-CLI répond (version, PHP, MySQL).'),

    H2("3. Identifier l'utilisateur"),
    CODE("wp user list"),
    P('Noter : ID, user_login, email.'),

    H2('4. Réinitialiser le mot de passe'),
    CODE("wp user update <user_login> --user_pass='<NOUVEAU_MOT_DE_PASSE>'"),
    CO('success', 'Résultat attendu', "Success: Updated user 1."),
    CO('warning', "Message « sh: : command not found »", "Ce message peut apparaître dans l'environnement Local. Si « Success: Updated user X. » s'affiche, la modification a bien été effectuée."),

    H2('5. Tester la connexion'),
    P("Ouvrir <site>.local/wp-admin/ et se connecter avec le user_login (ou l'email) et le nouveau mot de passe."),

    DIV(),
    H('Méthode de secours — AdminNeo'),
    P("À utiliser uniquement si WP-CLI n'est pas disponible."),
    NUM(
      'Dans Local : Database → Open AdminNeo',
      'Sélectionner la base « local » → table wp_users',
      'Afficher les données, repérer le compte administrateur',
    ),
    CO('danger', 'Ne jamais mettre le mot de passe en clair', "WordPress stocke un hash, pas le mot de passe. Modifier user_pass directement avec un mot de passe en clair casse la connexion. Toujours préférer WP-CLI, qui gère le hachage."),

    H('Erreurs à éviter'),
    L(
      '❌ « Modifier la table » — modifie la structure de la base, inutile ici',
      '❌ Modifier directement user_pass avec un mot de passe en clair',
      "❌ Modifier l'ID du compte",
      '❌ Modifier user_login pour une simple récupération',
      "❌ Supprimer l'utilisateur administrateur",
    ),

    H('Version courte'),
    CODE("Local → Sélectionner le site → Site Shell\nwp user list\nwp user update <USERNAME> --user_pass='<NOUVEAU_MDP>'\n→ Success: Updated user X.\nOuvrir /wp-admin/ → tester la connexion"),
  ],
})

sop({
  slug: 'ng-dev-smtp-titan-hostinger', category: 'dev', popular: true, read_min: 6,
  title: 'Configurer l\'envoi d\'emails SMTP (Titan / Hostinger)',
  description: "Créer l'adresse professionnelle, poser les DNS (SPF, DKIM, MX), configurer le .env, concevoir le template email et valider la délivrabilité. Aucun service tiers, SMTP uniquement.",
  tags: ['SMTP', 'Titan', 'Hostinger', 'Email', 'DNS', 'Formulaire'],
  blocks: [
    CO('tip', 'Principe', "Envoi et notifications par email basés uniquement sur SMTP. Aucun service tiers (Supabase, EmailJS, Firebase, SendGrid, Brevo, Mailgun)."),
    CO('danger', 'Sécurité', "Ne jamais partager le mot de passe SMTP dans une conversation, un ticket ou GitHub. Il vit uniquement dans un fichier .env non versionné."),

    H("Étape 1 — Vérifier ou créer l'adresse email professionnelle"),
    NUM(
      "Ouvrir Hostinger hPanel → Emails → Titan",
      "Vérifier si l'adresse (ex : info@<domaine>) existe déjà",
      "Si elle n'existe pas, la créer depuis hPanel",
    ),

    H('Étape 2 — Vérifier les DNS Titan'),
    TBL(['Type', 'Nom', 'Priorité', 'Contenu', 'TTL'], [
      ['TXT', 'titan1._domainkey', '0', 'v=DKIM1; k=rsa; … (valeur fournie par Titan)', '14400'],
      ['TXT', '@', '0', 'v=spf1 include:spf.titan.email ~all', '3600'],
      ['MX', '@', '10', 'mx1.titan.email', '3600'],
      ['MX', '@', '20', 'mx2.titan.email', '3600'],
    ]),
    CO('info', 'Pourquoi ces enregistrements', "Ils sont obligatoires pour la délivrabilité, éviter le spam, activer SPF / DKIM et sécuriser le SMTP. Vérifier que le DKIM Status affiche VERIFIED côté Titan."),
    CO('warning', 'Hostinger classique', "Si le domaine utilise la messagerie Hostinger et non Titan : SPF = v=spf1 include:_spf.mail.hostinger.com ~all et SMTP_HOST = smtp.hostinger.com."),

    H('Étape 3 — Configurer le .env'),
    CODE("# Production — NE PAS COMMITTER\n\nSMTP_HOST=smtp.titan.email      # ou smtp.hostinger.com\nSMTP_PORT=465                   # 465 en SSL, 587 en TLS\nSMTP_USER=info@<domaine>\nSMTP_PASSWORD=\n\nMAIL_TO=info@<domaine>\nMAIL_FROM_NAME=Site <Nom Entreprise>\nSITE_URL=https://<domaine>\nMAIL_SUBJECT=Nouvelle demande reçue depuis le site web"),
    CODE("chmod 600 .env.local"),

    H('Étape 4 — Design de l\'email'),
    L(
      'Reprendre les couleurs du site et le logo',
      'Mise en page moderne, structure claire, responsive mobile',
      'Afficher : nom, téléphone, email, message, date, source du formulaire',
      'Reply-To = email de l\'expéditeur pour répondre directement',
      'Version texte brut en fallback',
      'Compatible Gmail, Outlook, Apple Mail',
    ),

    H('Étape 5 — Sécurité du formulaire'),
    CHK(
      'Validation côté client ET côté serveur',
      'Protection contre les injections et sanitization des entrées',
      'Champ honeypot anti-bot',
      'Rate limiting (ex : 3 requêtes / minute / IP)',
      'Limite de taille du message (5 000 caractères)',
      'Aucune fuite d\'informations SMTP dans les réponses d\'erreur',
      'Aucun secret dans le code source, Git ou les logs',
    ),

    H('Étape 6 — Vérifications avant livraison'),
    CHK(
      'Envoi réel d\'un email de test',
      'Réception vérifiée sur Gmail et sur mobile',
      'Rendu responsive vérifié',
      'Aucune erreur SMTP dans les logs',
      'Messages de succès et d\'échec testés',
      'Score mail-tester.com ≥ 8/10',
      'Mot de passe SMTP rotationné s\'il a été partagé en clair',
    ),
  ],
})

sop({
  slug: 'ng-dev-formulaire-rdv-deploiement', category: 'dev', popular: false, read_min: 7,
  title: 'Formulaire de rendez-vous — développement et mise en production',
  description: "Composant React + route API + variables d'environnement + template email, puis déploiement VPS (Docker / PM2 / systemd), test curl, test bout-en-bout et anti-spam DNS.",
  tags: ['Formulaire', 'Next.js', 'SMTP', 'Déploiement', 'VPS'],
  blocks: [
    CO('info', 'Périmètre', "Site Next.js 14 (App Router) + TypeScript + Tailwind, envoi d'emails via SMTP (nodemailer)."),

    H('1. Composant frontend'),
    P('Fichier : src/components/ContactForm.tsx'),
    L(
      'Champs : nom complet, email, téléphone, sujet, message',
      'Validation côté client avec react-hook-form + zod',
      'Messages d\'erreur en français sous chaque champ',
      'États gérés : idle / loading / success / error',
      'Bouton désactivé pendant l\'envoi avec spinner',
      'Réinitialisation automatique après succès',
      'Design responsive mobile-first, support RTL si FR/AR',
      'Accessibilité : labels, aria-attributes, focus visible',
    ),

    H('2. Route API'),
    P('Fichier : src/app/api/contact/route.ts'),
    L(
      'Endpoint POST qui reçoit les données',
      'Validation serveur avec zod — ne jamais faire confiance au client',
      'Rate limiting : 3 requêtes par minute par IP',
      'Champ honeypot caché pour bloquer les bots',
      'Envoi de l\'email via nodemailer',
      'Codes HTTP corrects : 200, 400, 429, 500',
      'Logs serveur en cas d\'erreur, sans exposer d\'infos sensibles',
    ),

    H('3. Variables d\'environnement (.env.local, dans .gitignore)'),
    CODE("SMTP_HOST=\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=\nSMTP_PASSWORD=\nSMTP_FROM=\"Nom du site <noreply@example.com>\"\nSMTP_TO=contact@example.com"),

    H('4. Déploiement sur le VPS'),
    NUM(
      'git pull origin main sur le serveur',
      'Créer le .env.local à la racine (jamais dans le dépôt)',
      'chmod 600 .env.local',
      'Rebuild et relance selon la plateforme',
    ),
    CODE("# Docker\ndocker compose down\ndocker compose up -d --build\n# (docker-compose.yml doit contenir env_file: .env.local)\n\n# PM2\nnpm ci && npm run build && pm2 restart all --update-env\n\n# systemd\nnpm ci && npm run build && sudo systemctl restart <service>"),

    H('5. Vérifier le déploiement'),
    CODE("curl -i -X POST https://<domaine>/api/appointment \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"name\":\"Test\",\"email\":\"votre@email.com\",\"phone\":\"+212600000000\",\"reason\":\"Consultation\",\"appointment_date\":\"2026-06-01\",\"appointment_time\":\"10:00\",\"locale\":\"fr\"}'"),
    TBL(['Code', 'Diagnostic', 'Action'], [
      ['200 {"success":true}', 'Tout fonctionne', 'Vérifier la boîte de réception'],
      ['503 smtp_not_configured', 'Variables non lues', 'Rebuild, vérifier le chargement de .env.local'],
      ['502 send_failed', 'SMTP refuse la connexion', 'Mot de passe incorrect ou IP du VPS bloquée'],
      ['Timeout / 502 nginx', "L'app ne tourne pas", 'Vérifier docker ps ou pm2 status'],
    ]),

    H('6. Test bout-en-bout'),
    NUM(
      'Ouvrir la page du formulaire en navigation privée',
      'Remplir toutes les étapes avec sa propre adresse email',
      'Soumettre → le bandeau de confirmation doit s\'afficher',
      'Vérifier les 2 boîtes : destinataire interne + email de confirmation client',
    ),

    H('7. Anti-spam DNS — à faire une fois'),
    TBL(['Type', 'Nom', 'Valeur'], [
      ['TXT', '@', 'v=spf1 include:_spf.mail.hostinger.com ~all'],
      ['TXT', '_dmarc', 'v=DMARC1; p=none; rua=mailto:contact@<domaine>'],
      ['DKIM', '(auto)', 'Activer DKIM dans Emails → adresse → Manage'],
    ]),
    P("Propagation : 15 min à 1 h. Tester ensuite sur mail-tester.com (score visé ≥ 8/10)."),

    H('Dépannage'),
    TBL(['Symptôme', 'Cause probable', 'Solution'], [
      ['Échec sur VPS uniquement', '.env.local absent ou non chargé', 'Recréer le fichier + rebuild'],
      ['Erreur EAUTH', 'Mauvais mot de passe', 'Régénérer depuis le panneau email'],
      ['ETIMEDOUT / ECONNREFUSED', 'Firewall VPS bloque le port sortant 465', 'Autoriser le port 465 en sortie'],
      ['Emails reçus mais en spam', 'DNS manquants', 'Poser SPF + DKIM + DMARC'],
    ]),
  ],
})

sop({
  slug: 'ng-dev-wp-mail-smtp', category: 'dev', popular: false, read_min: 4,
  title: 'Configurer WP Mail SMTP sur WordPress',
  description: "Paramétrer l'envoi authentifié des emails WordPress avec WP Mail SMTP : expéditeur, service SMTP Titan/Hostinger, chemin de retour, test d'envoi et délivrabilité.",
  tags: ['WordPress', 'SMTP', 'Titan', 'Email', 'Plugin'],
  blocks: [
    CO('warning', 'Pourquoi', "Par défaut WordPress envoie mal les emails : ils partent en spam ou n'arrivent pas. On utilise toujours un envoi SMTP authentifié."),

    H('1. Installer le plugin'),
    P("Extensions → Ajouter → chercher « WP Mail SMTP » → Installer → Activer. La version gratuite (Lite) suffit : aucune licence à activer."),

    H("2. Paramètres de l'expéditeur"),
    TBL(['Paramètre', 'Valeur'], [
      ['E-mail de l\'expéditeur', 'contact@<domaine>'],
      ['Forcer l\'e-mail de l\'expéditeur', '✅ Coché'],
      ['Nom de l\'expéditeur', 'NOM DE L\'ENTREPRISE'],
      ['Forcer le nom d\'expéditeur', '✅ Coché'],
      ['Chemin de retour', '✅ Coché (pour recevoir les erreurs d\'envoi)'],
    ]),

    H("3. Service d'envoi — Autre SMTP"),
    TBL(['Champ', 'Valeur'], [
      ['Hébergeur SMTP', 'smtp.titan.email (ou smtp.hostinger.com)'],
      ['Cryptage', 'SSL en port 465, TLS en port 587'],
      ['Port SMTP', '465 (SSL) ou 587 (TLS)'],
      ['TLS Auto', 'Désactiver en cas d\'erreurs'],
      ['Authentification', '✅ Activée'],
      ['Identifiant SMTP', 'l\'adresse email complète'],
      ['Mot de passe SMTP', 'le mot de passe de la boîte — jamais partagé'],
    ]),
    CO('tip', 'Gmail / Google Workspace', "smtp.gmail.com, port 465 SSL, et un mot de passe d'application (pas le mot de passe du compte)."),
    CO('danger', 'Stockage du mot de passe', "Recommandé : définir le mot de passe dans wp-config.php plutôt que dans la base de données."),

    H('4. Tester et valider'),
    NUM(
      'Enregistrer les réglages',
      'Onglet Outils → Test d\'envoi',
      'Envoyer un email test à son adresse',
      'Vérifier la réception (et le dossier spam)',
      'Tester les formulaires du site : le message doit arriver à la bonne adresse',
    ),

    H('5. Délivrabilité'),
    P("Configurer SPF et DKIM dans la zone DNS du domaine chez l'hébergeur pour éviter le spam."),

    H('Référence — ports serveurs email Hostinger'),
    TBL(['Protocole', 'Hôte', 'Port'], [
      ['IMAP (entrant)', 'imap.hostinger.com', '993'],
      ['POP (entrant)', 'pop.hostinger.com', '995'],
      ['SMTP (sortant)', 'smtp.hostinger.com', '465'],
    ]),
  ],
})

sop({
  slug: 'ng-dev-supabase-react-vite', category: 'dev', popular: true, read_min: 10,
  title: 'Connecter une application React/Vite à Supabase',
  description: "De zéro à opérationnel : variables d'environnement, schéma SQL, RLS, triggers, configuration du dashboard, création du compte admin, seed et vérification complète.",
  tags: ['Supabase', 'React', 'Vite', 'PostgreSQL', 'RLS', 'Auth'],
  blocks: [
    CO('tip', 'Objectif', "Connecter n'importe quelle application React + Vite + TypeScript à un projet Supabase : variables, schéma, sécurité RLS, utilisateurs par rôle, validation."),

    H('Partie 1 — Variables d\'environnement'),
    NUM(
      'Dashboard Supabase → Settings → API',
      'Copier : Project URL, clé anon/public, clé service_role, Project ID',
      'Créer le fichier .env à la racine (même niveau que package.json)',
    ),
    CODE("VITE_SUPABASE_URL=https://[PROJECT_ID].supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=[ANON_KEY]\nVITE_SUPABASE_SERVICE_ROLE_KEY=[SERVICE_ROLE_KEY]\nVITE_SUPABASE_PROJECT_ID=[PROJECT_ID]"),
    L(
      'Aucun espace autour du =',
      'Aucun guillemet autour des valeurs',
      '.env ajouté dans .gitignore — ne jamais committer les clés',
    ),
    P('Le client doit lire exclusivement les variables VITE_, jamais de clé en dur :'),
    CODE("import { createClient } from '@supabase/supabase-js'\n\nconst SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string\nconst SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string\n\nexport const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {\n  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },\n})"),

    H('Partie 2 — Schéma de base de données'),
    P('SQL Editor → créer les ENUM métier, puis la table profiles (obligatoire pour les rôles) :'),
    CODE("CREATE TABLE public.profiles (\n  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,\n  full_name  TEXT,\n  email      TEXT,\n  role       TEXT,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY \"View own profile\"   ON public.profiles FOR SELECT USING (auth.uid() = user_id);\nCREATE POLICY \"Insert own profile\" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);\nCREATE POLICY \"Update own profile\" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);"),
    CO('danger', 'RLS obligatoire', "Chaque table métier doit avoir ENABLE ROW LEVEL SECURITY + des politiques SELECT / INSERT / UPDATE. Une table sans RLS est publiquement lisible."),

    H('Partie 3 — Triggers automatiques'),
    CODE("-- Créer le profil automatiquement à l'inscription\nCREATE OR REPLACE FUNCTION public.handle_new_user()\nRETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$\nBEGIN\n  INSERT INTO public.profiles (user_id, full_name)\n  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');\n  RETURN NEW;\nEND;\n$fn$;\n\nCREATE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users\n  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();"),

    H('Partie 4 — Configuration du dashboard'),
    NUM(
      'Auth → Providers → Email : désactiver « Confirm email » en développement',
      'Auth → URL Configuration : Site URL = http://localhost:8080 (dev) ou https://<domaine> (prod)',
      'Redirect URLs : http://localhost:8080/** (dev) ou https://<domaine>/** (prod)',
    ),

    H('Partie 5 — Démarrage et compte admin'),
    CODE("npm install\nnpm list @supabase/supabase-js\nnpm run dev"),
    P("Créer le compte admin depuis l'application, puis le promouvoir :"),
    CODE("UPDATE public.profiles SET role = 'admin'\nWHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@<projet>');"),
    P('Se déconnecter puis se reconnecter — la navigation admin complète doit apparaître.'),

    H('Erreurs fréquentes'),
    TBL(['Erreur', 'Cause', 'Solution'], [
      ['Invalid API key', 'Mauvaise clé dans .env', 'Recopier depuis Settings → API'],
      ['Failed to fetch', 'URL incorrecte ou projet suspendu', 'Vérifier VITE_SUPABASE_URL'],
      ['relation "…" does not exist', 'Table non créée', 'Exécuter la migration correspondante'],
      ['permission denied for table', 'RLS sans politique', 'Ajouter les policies manquantes'],
      ['new row violates row-level security', 'INSERT sans user_id valide', "S'assurer que user_id = auth.uid()"],
      ['net.http_post does not exist', 'Extension pg_net non activée', 'Database → Extensions → pg_net'],
      ['Connexion impossible après inscription', 'Confirmation email active', 'Désactiver Confirm email en dev'],
    ]),

    H('Checklist finale'),
    CHK(
      '.env présent avec les 4 variables VITE_ et ajouté au .gitignore',
      'Aucune clé en dur dans le code',
      'Toutes les tables créées avec RLS activé et policies',
      'Trigger on_auth_user_created actif',
      'Site URL configurée dans Auth',
      'npm run dev démarre sans erreur',
      'Compte admin créé et promu',
      'Console navigateur propre (0 erreur Supabase)',
      'INSERT de test visible dans le Table Editor',
    ),
  ],
})

sop({
  slug: 'ng-dev-pgnet-google-sheets', category: 'dev', popular: false, read_min: 4,
  title: 'Activer pg_net et synchroniser Supabase avec Google Sheets',
  description: "Activer l'extension pg_net, réactiver les triggers de notification, tester l'envoi vers Google Sheets et diagnostiquer via net._http_response.",
  tags: ['Supabase', 'pg_net', 'Google Sheets', 'Trigger', 'Automatisation'],
  blocks: [
    CO('tip', 'Objectif', "Chaque insertion en base déclenche automatiquement l'envoi des données vers Google Sheets via le trigger de notification."),
    CO('info', 'Prérequis', "Accès Owner ou Admin du projet Supabase · Fichier Google Sheets ouvert et accessible."),

    H('Étapes'),

    H2("1. Activer l'extension"),
    NUM(
      'Dashboard Supabase → Database → Extensions',
      'Rechercher pg_net',
      'Cliquer sur pg_net → Enable extension',
    ),
    CO('success', 'Résultat attendu', "Bouton vert, mention « Enabled »."),

    H2('2. Vérifier dans le SQL Editor'),
    CODE("SELECT * FROM pg_extension WHERE extname = 'pg_net';"),
    P('Résultat attendu : 1 ligne retournée.'),

    H2('3. Réactiver les triggers sur les tables concernées'),
    CODE("ALTER TABLE <table_1> ENABLE TRIGGER ALL;\nALTER TABLE <table_2> ENABLE TRIGGER ALL;\n-- … répéter pour chaque table synchronisée"),
    P('Résultat attendu : Success. No rows returned.'),

    H2("4. Tester l'envoi"),
    P("Insérer une ligne de test dans une table synchronisée, avec une valeur reconnaissable (ex : « Test Google Sheets »)."),
    P('Résultat attendu : Success. 1 row affected.'),

    H2('5. Vérifier dans Google Sheets'),
    P('Ouvrir le fichier, attendre 30 secondes, vérifier la nouvelle ligne.'),

    H2('6. En cas d\'échec — diagnostiquer'),
    CODE("SELECT id, status_code, error_msg\nFROM net._http_response\nORDER BY created DESC\nLIMIT 5;"),
    P('Transmettre le résultat au responsable technique.'),

    H('Checklist finale'),
    CHK(
      'pg_net visible comme « Enabled » dans le dashboard',
      'SELECT pg_extension retourne 1 ligne',
      'ENABLE TRIGGER ALL → Success sur toutes les tables',
      'INSERT test → Success (1 row affected)',
      'Nouvelle ligne visible dans Google Sheets sous 30 secondes',
    ),
  ],
})

sop({
  slug: 'ng-dev-localhost-ports', category: 'dev', popular: false, read_min: 3,
  title: 'Registre des ports localhost — un projet, une URL',
  description: "Règle anti-confusion multi-projets : chaque projet a une URL localhost unique et permanente, jamais réutilisée, jamais empruntée à un autre projet.",
  tags: ['Localhost', 'Ports', 'Organisation', 'Multi-projets'],
  blocks: [
    CO('danger', 'Règle fondamentale', "Chaque projet a UNE seule URL localhost. Ne jamais mélanger les URL entre projets. Ne jamais réutiliser un port déjà attribué. Ne jamais deviner au hasard."),

    H('Registre — source de vérité'),
    TBL(['Projet', 'URL'], [
      ['Projet A', 'http://localhost:3000'],
      ['Projet B', 'http://localhost:3001'],
      ['Projet C', 'http://localhost:3002'],
    ]),
    P("Maintenir ce tableau à jour dans le SOP à chaque nouveau projet."),

    H('Règles'),
    NUM(
      "Si le projet existe dans le registre → utiliser son URL exacte, ne jamais changer le port",
      'Si le projet n\'existe pas → créer une nouvelle URL unique avec le port suivant disponible (3003, 3004…) et l\'ajouter au registre',
      'Ne jamais réutiliser un port existant',
      'Ne jamais attribuer la même URL à deux projets',
      "Ne jamais reprendre l'URL d'un autre projet",
    ),

    H('Vérification avant de donner une URL'),
    NUM(
      'Le projet existe-t-il déjà dans le registre ? → utiliser son URL',
      'Sinon → générer un nouveau port unique',
      "S'assurer qu'il n'y a aucune duplication",
    ),
    CODE("lsof -i :3000        # qui occupe le port ?\nkill -9 <PID>        # libérer si nécessaire"),

    H('Format de réponse'),
    CODE("Projet : [Nom]\nURL    : http://localhost:XXXX"),
    CO('warning', 'En cas de conflit', "Si un doublon ou une mauvaise URL est détecté : s'arrêter et signaler « Erreur : conflit de port ou mélange de projets détecté »."),
  ],
})

sop({
  slug: 'ng-dev-perimetre-postgresql', category: 'dev', popular: false, read_min: 3,
  title: "Périmètre d'intervention sur une base PostgreSQL",
  description: "Cadre d'autorisation donné à Claude Code pour configurer une base PostgreSQL de projet : ce qui est permis, ce qui est interdit, et les vérifications obligatoires.",
  tags: ['PostgreSQL', 'Base de données', 'Migration', 'Sécurité'],
  blocks: [
    CO('info', 'Périmètre autorisé', "Tables, relations, migrations, variables d'environnement, connexions API, sécurité, permissions, backend, formulaires, stockage des données, automatisations."),

    H('Ce qui est attendu'),
    NUM(
      "Analyser l'ensemble du projet avant toute modification",
      'Détecter les problèmes de schéma, de relations, de permissions',
      'Corriger automatiquement ce qui peut l\'être',
      'Mettre en place la configuration optimale',
      'Vérifier chaque modification avant validation',
    ),

    H('Ce qui est interdit'),
    L(
      '❌ Supprimer quoi que ce soit d\'essentiel',
      '❌ Casser une fonctionnalité existante',
      '❌ Modifier la structure générale du projet sans nécessité',
      '❌ Appliquer une migration en production sans validation explicite',
      '❌ Écrire un secret en clair dans le code ou dans Git',
    ),

    H('Vérifications obligatoires après changement'),
    CHK(
      'Migration idempotente (IF NOT EXISTS / WHERE NOT EXISTS)',
      'RLS activé et policies présentes sur chaque nouvelle table',
      'Colonne tenant_id NOT NULL + FK CASCADE si architecture multi-tenant',
      'Index sur les colonnes de filtrage fréquent',
      'Trigger updated_at en place',
      "L'application démarre et les écrans concernés fonctionnent",
      'Backup réalisé avant intervention en production',
    ),

    CO('tip', 'Livrable', "À la fin : un résumé du résultat final et de la liste des modifications effectuées."),
  ],
})

sop({
  slug: 'ng-dev-whatsapp-twilio', category: 'dev', popular: false, read_min: 9,
  title: 'Notifications WhatsApp automatiques (Twilio)',
  description: "Envoyer une notification WhatsApp au client à chaque étape du cycle de vie : choix du fournisseur, sandbox, variables, architecture, base de données, règles métier, déploiement et incidents.",
  tags: ['WhatsApp', 'Twilio', 'Notifications', 'API', 'Automatisation'],
  blocks: [
    CO('tip', 'Objectif', "Envoyer automatiquement une notification WhatsApp au client à la création, au départ en livraison et à la livraison effectuée, avec un lien de suivi."),

    H('1. Choix du fournisseur'),
    P("Twilio WhatsApp API retenu : intégration facile, sandbox gratuit, facturation à l'usage, documentation complète."),
    TBL(['Fournisseur', 'Coût estimé / 4 500 messages'], [
      ['Twilio', '~850 MAD'],
      ['MessageBird', '~790 MAD'],
      ['Infobip', '~870 MAD'],
      ['360dialog', '~1 150 MAD'],
    ]),

    H('2. Configuration du compte Twilio'),
    NUM(
      'Créer un compte sur twilio.com (offre Trial)',
      'Messaging → Try it Out → Send a WhatsApp Message pour activer le Sandbox',
      'Depuis le téléphone : envoyer le code « join <mot-cle> » au numéro sandbox',
      'Vérifier la réception du message « You are all set! »',
      'Récupérer l\'Account SID et l\'Auth Token depuis le tableau de bord',
    ),
    CO('warning', 'Limites du sandbox', "Valable 72 heures · seuls les numéros inscrits reçoivent les messages · non adapté à la production finale."),

    H("3. Variables d'environnement"),
    CODE("# Développement (.env)\nTWILIO_ACCOUNT_SID=\nTWILIO_AUTH_TOKEN=\nTWILIO_WHATSAPP_FROM=whatsapp:+<numero_sandbox>\nTEST_WHATSAPP_TO=whatsapp:+<numero_test>\nPUBLIC_BASE_URL=http://localhost:8081\n\n# Production (Dokploy → Environment)\nPUBLIC_BASE_URL=https://<domaine>"),
    CO('danger', 'Jamais dans Git', "Ne jamais versionner le fichier .env ni les tokens Twilio."),

    H('4. Architecture technique'),
    TBL(['Fichier', 'Responsabilité'], [
      ['server/services/whatsapp.js', 'Communication avec Twilio, gestion des erreurs, protection contre les crashs'],
      ['server/services/<entite>Messenger.js', 'Génération des messages, résolution du destinataire, journalisation'],
      ['server/routes/whatsapp.js', 'Endpoint de test POST /api/whatsapp/test'],
      ['database/…​.sql', 'Migration : colonne téléphone + table de journal'],
    ]),

    H('5. Base de données'),
    CODE("ALTER TABLE <entite> ADD COLUMN customer_phone TEXT;\n\nCREATE TABLE <entite>_messages (\n    id          BIGSERIAL PRIMARY KEY,\n    <entite>_id UUID REFERENCES <entite>(id),\n    event       TEXT,\n    to_number   TEXT,\n    twilio_sid  TEXT,\n    status      TEXT,\n    error       TEXT,\n    sent_at     TIMESTAMPTZ\n);"),

    H('6. Règles métier'),
    L(
      'Priorité du destinataire : champ téléphone de l\'entité → téléphone du partenaire lié → sinon journaliser un « skip »',
      'Fire & forget : l\'échec d\'un message WhatsApp ne doit JAMAIS bloquer la création, la mise à jour ou la livraison',
      'Toutes les tentatives sont enregistrées dans la table de journal',
      'Formats de numéro acceptés : +212XXXXXXXXX, 212XXXXXXXXX, 06XXXXXXXX, whatsapp:+212XXXXXXXXX — validation +\\d{8,15}',
    ),
    CODE("notify(...).catch(console.error)"),

    H('7. Déploiement en production'),
    NUM('git push', 'Exécuter la migration SQL', 'Ajouter les variables Twilio dans Environment', 'Redeploy', 'Vérifier les logs', 'Tester avec un numéro inscrit au sandbox'),

    H('8. Incidents possibles'),
    TBL(['Erreur', 'Cause', 'Solution'], [
      ['[whatsapp] disabled', 'Variables absentes', 'Vérifier Environment'],
      ['Authenticate (20003)', 'Auth Token incorrect', 'Recopier depuis Twilio'],
      ['Channel not found', 'Sandbox expiré', 'Refaire le join'],
      ['Aucun message reçu', 'Numéro non inscrit', 'Envoyer le code join'],
      ['Lien localhost dans le message', 'PUBLIC_BASE_URL incorrect', 'Mettre l\'URL de production'],
    ]),

    H('9. Passage en production officielle'),
    NUM(
      'Créer un WhatsApp Sender officiel',
      'Acheter un numéro WhatsApp Business',
      'Effectuer la vérification Meta Business',
      'Créer les modèles de message et attendre la validation Meta',
      'Adapter le service messenger et mettre à jour TWILIO_WHATSAPP_FROM',
    ),

    H('Validation'),
    CHK(
      'Logs locaux : [whatsapp] enabled',
      'POST /api/whatsapp/test → message reçu en moins de 5 secondes',
      'Message de création reçu',
      'Message « en cours de livraison » reçu',
      'Message « livrée » reçu',
      'status = sent pour chaque événement dans la table de journal',
    ),
  ],
})

/* ════════════════════════════════════════════════════════════════
   CATÉGORIE : dev — Audits & qualité
   ════════════════════════════════════════════════════════════════ */

sop({
  slug: 'ng-dev-audit-securite-app', category: 'dev', popular: true, read_min: 10,
  title: 'Audit de sécurité applicatif — méthode et rapport',
  description: "Modèle de menace, 12 domaines à auditer (secrets, auth, RBAC, API, OWASP, frontend, base, infra, cloud, CI/CD, dépendances, monitoring), notation CVSS et scorecard final.",
  tags: ['Sécurité', 'Audit', 'OWASP', 'Pentest', 'Infrastructure'],
  blocks: [
    CO('danger', 'Principe', "Ne jamais supposer qu'un système est sécurisé sans preuve. Si la preuve manque, marquer le contrôle NON VÉRIFIÉ et expliquer comment le vérifier."),
    CO('info', 'Objectif business', "Protéger les données clients, les opérations, le chiffre d'affaires, la réputation, l'infrastructure et la propriété intellectuelle."),

    H('1. Modèle de menace — toujours en premier'),
    H2('Surface d\'attaque'),
    L('Endpoints publics', 'Interfaces admin', "Systèmes d'authentification", 'APIs', 'Webhooks', 'Bases de données', 'Buckets de stockage', 'CI/CD', 'Dépôts Git', 'Intégrations tierces'),
    H2('Acteurs de la menace'),
    L('Internautes anonymes', 'Utilisateurs authentifiés', 'Employés malveillants', 'Concurrents', 'Bots automatisés', 'Credential stuffing', 'Opérateurs de ransomware'),
    H2('Classification des données'),
    L('Publique', 'Interne', 'Confidentielle', 'Sensible', 'Données personnelles (PII)', 'Données financières', 'Données médicales'),
    H2('Frontières de confiance'),
    L('Navigateur → Backend', 'Backend → Base de données', 'Backend → APIs tierces', 'Interne → Services publics'),

    H('2. Les 12 domaines à auditer'),
    TBL(['#', 'Domaine', 'Points de contrôle'], [
      ['1', 'Secrets & credentials', 'Exposition .env, fuites Git, secrets en dur, clés API, secrets CI'],
      ['2', 'Authentification', 'Expiration et validation JWT, refresh tokens, sessions, politique de mot de passe, MFA, récupération de compte'],
      ['3', 'Autorisation', 'RBAC, accès admin, protection des routes, escalade de privilèges, isolation multi-tenant, RLS'],
      ['4', 'Sécurité API', 'Rate limiting, validation des entrées, filtrage des sorties, IDOR, mass assignment, exposition de clés'],
      ['5', 'OWASP Top 10', 'Broken access control, échecs cryptographiques, injection, design non sécurisé, mauvaise configuration, composants vulnérables, SSRF'],
      ['6', 'Frontend', 'XSS, DOM XSS, localStorage, source maps, CSP, clickjacking, fuites de données'],
      ['7', 'Base de données', 'Permissions PostgreSQL, RLS, exposition de données, injection SQL, chiffrement des backups, rétention'],
      ['8', 'Infrastructure', 'Ports ouverts, firewall, durcissement SSH, fail2ban, exposition Docker, reverse proxy, TLS, headers de sécurité'],
      ['9', 'Cloud / BaaS', 'Permissions des buckets, buckets publics, mauvais usage du service role, Edge Functions, exposition de la base'],
      ['10', 'CI/CD', 'GitHub Actions, secrets de déploiement, artefacts de build, fuites de variables'],
      ['11', 'Dépendances', 'npm audit, CVE connues, paquets obsolètes, risques supply chain'],
      ['12', 'Monitoring & IR', "Logs d'audit, alerting, stratégie de backup, plan de récupération, préparation à l'incident"],
    ]),

    H('3. Notation de la sévérité'),
    TBL(['Niveau', 'CVSS', 'Signification'], [
      ['🔴 CRITICAL', '9.0 – 10', 'Compromission immédiate possible'],
      ['🟠 HIGH', '7.0 – 8.9', 'Risque de sécurité sérieux'],
      ['🟡 MEDIUM', '4.0 – 6.9', 'Nécessite une remédiation'],
      ['🟢 LOW', '0.1 – 3.9', 'Problème mineur'],
      ['ℹ️ INFO', '—', 'Observation seulement'],
    ]),

    H('4. Format de chaque constat'),
    TPL("SÉVÉRITÉ : 🔴 / 🟠 / 🟡 / 🟢\n\nVULNÉRABILITÉ :\n[Nom]\n\nCVSS :\n[Score estimé]\n\nLOCALISATION :\n[Fichier / Endpoint / Service]\n\nSCÉNARIO D'ATTAQUE :\n[Comment un attaquant exploiterait précisément la faille]\n\nIMPACT BUSINESS :\n- Risque financier\n- Risque de réputation\n- Impact client\n- Impact conformité\n\nCORRECTION :\n[Code, configuration, changement d'architecture ou commande exacte]\n\nVÉRIFICATION :\n[Commandes curl, procédure de test, checklist]"),

    H('5. Livrables du rapport'),
    NUM(
      'Résumé exécutif : total des constats, répartition Critical/High/Medium/Low, Top 5 des risques à corriger immédiatement',
      'Le détail de chaque constat au format ci-dessus',
      'La scorecard finale',
    ),
    P('Scorecard : Authentification /10 · Autorisation /10 · API /10 · Frontend /10 · Base de données /10 · Infrastructure /10 · CI/CD /10 · Monitoring /10 → Score global /100.'),

    H('Règles'),
    L(
      'Jamais de conseil générique',
      "Toujours expliquer l'impact pour l'attaquant",
      'Prioriser par le risque business',
      "Ne jamais supposer qu'un contrôle existe",
      'Marquer les contrôles incertains NON VÉRIFIÉ',
      'Fournir les commandes et correctifs exacts',
      'Aucune exploitation destructive, aucun brute-force pendant l\'audit',
    ),
  ],
})

sop({
  slug: 'ng-dev-audit-securite-wordpress', category: 'dev', popular: false, read_min: 9,
  title: 'Audit de sécurité WordPress / WooCommerce',
  description: "Passer en revue le cœur, les extensions, le thème, WooCommerce, les fichiers sensibles, wp-config, les comptes admin, XML-RPC, la REST API, HTTPS, les headers et la base — puis prioriser les corrections.",
  tags: ['WordPress', 'WooCommerce', 'Sécurité', 'Audit', 'Hardening'],
  blocks: [
    CO('info', 'Nature de l\'audit', "Audit technique non destructif. Aucune exploitation, aucun brute-force, aucune modification de la base pendant l'audit."),
    CO('warning', 'Rappel', "Un site n'est jamais « 100 % sécurisé ». La sécurité consiste à réduire les risques et à limiter l'impact d'une compromission."),

    H('Périmètre à auditer'),
    TBL(['Élément', 'Points de contrôle'], [
      ['WordPress Core', 'Version installée vs disponible, intégrité des fichiers, mises à jour automatiques, fichiers inconnus'],
      ['Extensions', 'Version, dernière mise à jour, vulnérabilités connues, extension abandonnée, extensions inactives à supprimer'],
      ['Thème', 'Version obsolète, fichiers modifiés, fichiers PHP inconnus, code obfusqué, absence de child theme'],
      ['WooCommerce', 'Version, extensions de paiement, REST API, webhooks, checkout, sessions, cookies sécurisés, HTTPS'],
      ['Fichiers sensibles', 'wp-config.php, .htaccess, debug.log, readme.html, sauvegardes, .zip, .sql, .bak, .git, PHP dans uploads'],
      ['wp-config.php', 'Permissions, clés et salts, WP_DEBUG, WP_DEBUG_DISPLAY, DISALLOW_FILE_EDIT'],
      ['Comptes', 'Administrateurs inconnus, comptes inutilisés, privilèges excessifs, identifiants devinables, absence de 2FA'],
      ['Authentification', 'HTTPS, protection de la page de connexion, limitation des tentatives, 2FA, cookies sécurisés, XML-RPC'],
      ['REST API', '/wp-json/ — exposition d\'informations ou de données utilisateurs'],
      ['HTTPS / SSL', 'Certificat valide, expiration, redirection HTTP→HTTPS, TLS, mixed content, HSTS'],
      ['Headers', 'CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy'],
      ['Permissions fichiers', 'Droits d\'écriture limités aux dossiers qui en ont réellement besoin'],
      ['Uploads', 'Fichiers PHP inattendus, exécutables, fichiers récemment modifiés, scripts suspects'],
      ['Base de données', 'Utilisateurs suspects, options inhabituelles, scripts injectés, cron jobs suspects, autoload volumineux'],
      ['Serveur', 'Version PHP (viser 8.3+), MySQL/MariaDB, exposition d\'informations serveur, logs, TLS'],
    ]),

    CO('warning', 'Faux positifs', "La présence de eval() ou base64_decode() n'est pas une preuve de malware : analyser le contexte. Un fichier PHP dans uploads déclenche une analyse approfondie mais n'est pas automatiquement classé malveillant."),
    CO('danger', 'Secrets', "Les identifiants, clés et salts ne doivent JAMAIS apparaître dans le rapport. Les masquer sous la forme ********."),

    H('Mode debug en production'),
    P("Un site de production ne doit pas afficher publiquement les erreurs PHP : cela révèle chemins internes, noms de fichiers, informations serveur et structure du site."),
    CODE("define('WP_DEBUG', false);\ndefine('WP_DEBUG_DISPLAY', false);\ndefine('WP_DEBUG_LOG', true);   // logs protégés uniquement\ndefine('DISALLOW_FILE_EDIT', true);"),

    H('Score de sécurité'),
    TBL(['Score', 'Classification'], [
      ['90–100', 'Excellent'], ['80–89', 'Bon'], ['70–79', 'Correct'], ['50–69', 'À améliorer'], ['0–49', 'Risque élevé'],
    ]),

    H('Plan de correction priorisé'),
    NUM(
      'Priorité 1 — Critique : vulnérabilités confirmées, fichiers sensibles exposés, comptes admin suspects, malware, secrets exposés',
      'Priorité 2 — Haute : WordPress obsolète, extensions vulnérables, thème obsolète, configuration serveur faible, permissions dangereuses',
      'Priorité 3 — Moyenne : security headers, configuration WordPress, XML-RPC, REST API, logs, hardening',
      'Priorité 4 — Faible : nettoyage des extensions inutilisées, réduction de la surface d\'attaque, maintenance',
    ),

    CO('info', "Limitation de l'audit", "Un audit automatisé ne garantit jamais l'absence totale de vulnérabilités. Certaines nécessitent une revue manuelle du code, de la configuration serveur, des extensions et du thème."),
  ],
})

sop({
  slug: 'ng-dev-audit-qa-production', category: 'dev', popular: true, read_min: 8,
  title: 'Audit QA complet avant mise en production',
  description: "7 phases obligatoires — structure, qualité du code, fonctionnalités, UI/UX, performance, sécurité, build — avec protocole de correction et rapport de production readiness.",
  tags: ['QA', 'Audit', 'Production', 'Build', 'Checklist'],
  blocks: [
    CO('danger', 'Blocage de livraison', "Interdit de livrer si : le build échoue · le login échoue · des erreurs runtime, console ou API existent · une route est cassée · un bug critique subsiste. Corriger d'abord, livrer ensuite."),

    H('Phase 1 — Structure et fichiers'),
    CHK(
      'Tous les fichiers référencés dans les imports existent',
      "Aucun fichier vide ou contenant un placeholder (« TODO », « add logic here », « coming soon »)",
      'Tous les composants correctement exportés et importés',
      '.env.example contient TOUTES les variables requises',
      'README.md présent avec de vraies instructions de setup',
    ),

    H('Phase 2 — Qualité du code'),
    CHK(
      'Zéro erreur TypeScript (pas de `any` sans raison)',
      'Zéro warning ni erreur ESLint',
      'Imports, variables et code mort supprimés',
      'Chaque fonction async a une gestion d\'erreur try/catch',
      'Chaque appel API gère loading, succès ET erreur',
      'Aucun secret, clé API ou identifiant en dur',
      'Tous les formulaires ont une validation',
      'Destructurations avec valeurs par défaut pour éviter les crashs',
    ),

    H('Phase 3 — Fonctionnalités'),
    CHK(
      'Authentification : inscription → connexion → déconnexion → routes protégées',
      'CRUD principal : créer → lire → modifier → supprimer',
      'Navigation : chaque lien mène à la bonne page',
      'Formulaires : soumission → état de chargement → retour succès/erreur',
      'Recherche et filtres : les résultats se mettent à jour correctement',
      'Modales et tiroirs : ouverture → interaction → fermeture',
      'Connexion backend correctement configurée',
      'Variables d\'environnement consommées correctement',
      'Politiques RLS correctes le cas échéant',
    ),

    H('Phase 4 — UI / UX'),
    CHK(
      'Chaque page a un état de chargement (skeleton, pas une page blanche)',
      'Chaque état vide a un message ou un CTA',
      'Chaque état d\'erreur affiche un message lisible',
      'Le mode sombre fonctionne sur TOUTES les pages',
      'Responsive testé : mobile 375px / tablette 768px / desktop',
      'Toasts déclenchés correctement',
      'Les animations ne cassent pas la mise en page',
      'Modales fermables (bouton X + clic extérieur)',
      'Sidebar repliable sur mobile',
      'Élément de navigation actif toujours mis en évidence',
    ),

    H('Phase 5 — Performance'),
    CHK(
      'Routes en React.lazy() + Suspense (code splitting)',
      'Images avec width/height explicites (évite le layout shift)',
      'staleTime et cacheTime configurés sur TanStack Query',
      'React.memo là où c\'est utile — pas de re-render inutile',
      'Debounce sur les champs de recherche',
      'Aucun problème de requêtes N+1',
    ),

    H('Phase 6 — Sécurité'),
    CHK(
      'Aucune donnée sensible non chiffrée dans localStorage',
      'Toutes les routes API sensibles exigent une authentification',
      'Sanitization des entrées avant les opérations en base',
      'CORS correctement configuré',
      'Rate limiting actif sur les endpoints d\'authentification',
      'Aucune injection SQL possible dans les requêtes brutes',
    ),

    H('Phase 7 — Build et déploiement'),
    CODE("npm run build      # corriger TOUTES les erreurs jusqu'au succès\nnpm run lint       # corriger toutes les erreurs de lint\nnpx tsc --noEmit   # corriger toutes les erreurs TypeScript"),
    CHK(
      'La sortie /dist fonctionne correctement',
      'Dockerfile ou config de déploiement valide (si présent)',
      'Toutes les variables documentées dans .env.example',
    ),

    H('Protocole de correction'),
    NUM(
      'Annoncer clairement : « PROBLÈME TROUVÉ : [description] »',
      'Corriger immédiatement, sans demander',
      'Confirmer : « CORRIGÉ : [ce qui a été fait] »',
      'Passer au contrôle suivant',
    ),

    H('Rapport final'),
    TPL("========================================\n✅ RAPPORT DE PRODUCTION READINESS\n========================================\nPHASE 1 — Structure       : [PASS / X corrections]\nPHASE 2 — Qualité du code : [PASS / X corrections]\nPHASE 3 — Fonctionnalités : [PASS / X corrections]\nPHASE 4 — UI/UX           : [PASS / X corrections]\nPHASE 5 — Performance     : [PASS / X corrections]\nPHASE 6 — Sécurité        : [PASS / X corrections]\nPHASE 7 — Build           : [PASS / X corrections]\n----------------------------------------\nTOTAL DE CORRECTIONS : X\nSTATUT BUILD : ✅ PRÊT POUR LE DÉPLOIEMENT\n========================================"),
  ],
})

sop({
  slug: 'ng-dev-audit-responsive', category: 'dev', popular: true, read_min: 7,
  title: 'Audit responsive obligatoire avant livraison',
  description: "Tester les 10 breakpoints sur chaque page et chaque composant, corriger immédiatement, retester, puis produire le rapport PASS/FAIL page par page.",
  tags: ['Responsive', 'QA', 'Mobile', 'Tailwind', 'Livraison'],
  blocks: [
    CO('danger', 'Ne jamais supposer', "Le site n'est pas responsive tant qu'il n'a pas été vérifié. Il faut vérifier, détecter, corriger, retester et rapporter."),

    H('1. Breakpoints obligatoires'),
    L('1920px — Desktop large', '1440px — Desktop', '1366px — Laptop', '1280px — Laptop small', '1024px — Tablette paysage', '768px — Tablette portrait', '430px — Mobile large', '390px — iPhone', '375px — Mobile standard', '360px — Petit mobile'),

    H('2. Périmètre'),
    P('Toutes les pages, toutes les sections et tous les composants réutilisables : header, navigation, menu mobile, hero, sections de contenu, cartes, grilles, images, formulaires, boutons, tableaux, modales, popups, footer, mode sombre.'),

    H('3. Contrôles par zone'),
    TBL(['Zone', 'À vérifier'], [
      ['Header & navigation', 'Logo visible et bien dimensionné, menu mobile qui s\'ouvre et se ferme, aucun débordement, aucun scroll horizontal'],
      ['Hero', 'Texte lisible, titres qui s\'adaptent, images responsives, boutons visibles et cliquables, aucun chevauchement'],
      ['Sections de contenu', 'Aucun scroll horizontal, aucune mise en page cassée, typographie et espacements adaptatifs'],
      ['Cartes & grilles', 'Alignement desktop, empilement correct sur tablette et mobile, espacement égal, aucun débordement'],
      ['Images & médias', 'Redimensionnement correct, pas d\'étirement, object-fit adapté, pas de recadrage destructeur'],
      ['Formulaires', 'Champs entièrement visibles, labels lisibles, boutons accessibles, messages de validation visibles'],
      ['Tableaux', 'Lisibles, scroll horizontal interne uniquement si nécessaire, la page ne casse pas'],
      ['Footer', 'Colonnes empilées correctement, liens accessibles, aucun débordement'],
    ]),

    H('4. Correctifs autorisés'),
    L(
      'Refactoriser le CSS et améliorer les classes Tailwind (sm: md: lg: xl: 2xl:)',
      'Ajuster les layouts Grid et Flexbox',
      'Remplacer les largeurs fixes par des largeurs responsives',
      'Remplacer les hauteurs fixes qui cassent la mise en page',
      'Améliorer typographie et espacements responsives',
      'Ajouter des containers max-width et une protection contre le débordement',
      'Améliorer la navigation mobile et les layouts tablette',
    ),
    CO('warning', 'À éviter', "Largeurs fixes · hauteurs fixes qui cassent le layout · positionnement absolu qui casse sur mobile · overflow hidden utilisé pour masquer un vrai problème · scroll horizontal de page."),

    H('5. Blocage de livraison'),
    P("Livraison interdite s'il subsiste : scroll horizontal · layout cassé · éléments qui se chevauchent · texte illisible · boutons non cliquables · menu mobile cassé · formulaires inutilisables · images qui débordent · footer mal aligné · problèmes en mode sombre."),

    H('6. Rapport final — par page'),
    TPL("Page : [Nom de la page]\nTailles testées : 1920 / 1440 / 1366 / 1280 / 1024 / 768 / 430 / 390 / 375 / 360\nProblèmes trouvés :\n- …\nCorrections appliquées :\n- …\nRésultat final : PASS"),
  ],
})

sop({
  slug: 'ng-dev-optimisation-images', category: 'dev', popular: false, read_min: 4,
  title: 'Optimiser les images d\'un site pour la performance',
  description: "Compresser, convertir en WebP, générer les variantes desktop/tablette/mobile, appliquer lazy loading et fetchpriority, nettoyer les images inutilisées — sans toucher au design.",
  tags: ['Performance', 'Images', 'WebP', 'Core Web Vitals', 'Optimisation'],
  blocks: [
    CO('tip', 'Objectif', "Site plus léger et plus rapide, sans changer le design, les textes ou la logique."),

    H('Tâches — dans l\'ordre'),
    NUM(
      'Scanner /public et tous les sous-dossiers images',
      'Identifier les JPG, JPEG, PNG trop lourds',
      'Convertir chaque image en WebP',
      'Créer une version optimisée par format : desktop max 1920px · tablette max 1200px · mobile max 768px',
      'Remplacer dans le code toutes les anciennes images par les .webp',
      'Ajouter loading="lazy" sur toutes les images hors hero',
      'Image hero : PAS de lazy loading, ajouter fetchpriority="high" et decoding="async"',
      'Supprimer les images inutilisées uniquement si elles ne sont appelées nulle part',
      'Vérifier le rendu sur mobile et desktop',
      'Lancer npm run build et corriger les erreurs',
    ),

    H('Exemple de balisage'),
    CODE("<!-- Hero : chargement prioritaire -->\n<img src=\"/img/hero.webp\" width=\"1920\" height=\"1080\"\n     fetchpriority=\"high\" decoding=\"async\" alt=\"…\" />\n\n<!-- Reste du site -->\n<img src=\"/img/service-1.webp\" width=\"800\" height=\"600\"\n     loading=\"lazy\" decoding=\"async\" alt=\"…\" />"),

    CO('danger', 'Interdits', "Ne pas changer le design · ne pas changer les textes · ne pas toucher à la logique du site. Le périmètre est strictement : optimisation des images et performance web."),

    H('Résultat attendu'),
    CHK(
      'Toutes les images en WebP',
      'Poids total du projet réduit',
      'Build sans erreur',
      'Aucune image cassée sur mobile ni desktop',
      'LCP amélioré (image hero prioritaire)',
    ),
  ],
})

sop({
  slug: 'ng-dev-remplacement-images-site', category: 'dev', popular: false, read_min: 3,
  title: 'Remplacer toutes les images d\'un site par un visuel unique',
  description: "Uniformiser l'identité visuelle : remplacer les visuels existants, supprimer les anciens fichiers, garantir la qualité sur tous les écrans et contrôler chaque page après remplacement.",
  tags: ['Images', 'Identité visuelle', 'Design', 'Nettoyage'],
  blocks: [
    CO('tip', 'Objectif', "Uniformiser l'identité visuelle du site en utilisant uniquement le nouveau visuel fourni."),

    H('Consignes'),
    NUM(
      'Remplacer toutes les images actuelles du site par la nouvelle image',
      'Supprimer définitivement les anciennes images, bannières, illustrations et visuels devenus inutilisés',
      'Vérifier un affichage de qualité sur ordinateur, tablette et mobile',
      'Conserver un rendu professionnel et cohérent avec le design existant',
      'Ajuster le cadrage pour éviter toute déformation ou perte d\'information importante',
      'Vérifier que la vitesse de chargement reste optimale après remplacement',
      'Contrôler toutes les pages pour s\'assurer qu\'aucune ancienne image n\'est encore visible',
    ),

    CO('warning', 'Avant suppression', "Ne supprimer un fichier image que s'il n'est appelé nulle part dans le code (grep sur le nom du fichier)."),
    CODE("grep -rn \"nom-image\" src public --include=* | head"),

    H('Contrôle final'),
    CHK(
      'Aucune ancienne image visible sur aucune page',
      'Nouvelle image nette sur desktop, tablette et mobile',
      'Aucune déformation (object-fit correct)',
      'Poids de la page inchangé ou amélioré',
      'Build sans erreur',
    ),
  ],
})

sop({
  slug: 'ng-dev-page-coming-soon', category: 'dev', popular: false, read_min: 2,
  title: 'Mettre en place une page « Coming Soon »',
  description: "Afficher automatiquement une page d'attente moderne comme page principale tant que le projet n'est pas lancé, sans que le client puisse la modifier depuis l'accueil.",
  tags: ['Coming Soon', 'Lancement', 'Site vitrine'],
  blocks: [
    CO('tip', 'Objectif', "Afficher automatiquement une page « Coming Soon » professionnelle comme page principale du site tant que le projet n'est pas encore lancé."),

    H('Règles'),
    L(
      "La page doit s'afficher automatiquement à la racine du site",
      'Le client ne doit pas pouvoir modifier cette section depuis la page d\'accueil',
      'Design moderne et cohérent avec l\'identité de la marque',
      'Le site réel reste développé en parallèle, non exposé publiquement',
    ),

    H('Contenu recommandé'),
    L(
      'Logo de la marque',
      'Message court : « Site en cours de préparation »',
      'Date de lancement estimée (optionnelle)',
      'Moyens de contact : téléphone, WhatsApp, email',
      'Liens réseaux sociaux',
      'Éventuellement un champ email pour être prévenu du lancement',
    ),

    H('Contrôle avant mise en ligne'),
    CHK(
      'La page s\'affiche bien à la racine du domaine',
      'Responsive mobile, tablette et desktop',
      'Aucune page en développement accessible publiquement',
      'Balise meta robots noindex tant que le site n\'est pas lancé',
      'Les liens de contact fonctionnent',
    ),
  ],
})

sop({
  slug: 'ng-dev-seo-wordpress', category: 'dev', popular: false, read_min: 8,
  title: 'Implémentation SEO technique et On-Page dans le code',
  description: "Stratégie de mots-clés, Search Console, sitemap, meta title et description, hiérarchie H1-H4, SEO technique, SEO local, validation et rapport de progression chiffré.",
  tags: ['SEO', 'On-Page', 'Sitemap', 'Schema.org', 'SEO local'],
  blocks: [
    CO('info', 'Périmètre', "Implémenter concrètement les optimisations SEO directement dans le code du projet — pas seulement les recommander."),

    H('1. Recherche et stratégie de mots-clés'),
    L(
      'Analyser la structure actuelle du site et ses pages',
      'Identifier les mots-clés principaux et secondaires de chaque page',
      "Vérifier l'intention de recherche",
      'Éviter le keyword stuffing',
      'Placer les mots-clés naturellement dans titres, contenus, headings et métadonnées',
    ),

    H('2. Google Search Console'),
    L(
      "Vérifier l'indexabilité des pages",
      'Vérifier les canonical URLs',
      "Repérer les erreurs d'indexation",
      'Préparer correctement le sitemap',
    ),
    CO('warning', 'Honnêteté', "Sans accès à Search Console, ne pas prétendre avoir effectué des vérifications impossibles : lister ce qui doit être vérifié manuellement."),

    H('3. Sitemap XML'),
    L(
      'Créer ou corriger le sitemap',
      'Inclure uniquement les URL importantes et indexables',
      'Exclure les pages inutiles, doublons, paramètres et pages non indexables',
      'Rendre le sitemap accessible sur /sitemap.xml',
      'Ajouter la référence au sitemap dans robots.txt',
    ),

    H('4. Meta title et meta description'),
    L(
      'Un <title> unique par page, avec le mot-clé principal, optimisé SEO ET CTR',
      'Une meta description unique par page, expliquant le bénéfice de la page',
      'Aucun titre ni description dupliqué entre les pages',
    ),

    H('5. Structure H1 / H2 / H3 / H4'),
    L(
      'Une hiérarchie logique et sémantique',
      'Un H1 principal par page',
      "Ne pas utiliser les headings uniquement pour le design",
      'Les titres doivent décrire réellement le contenu',
    ),

    H('6. SEO technique complémentaire'),
    L(
      'robots.txt, canonical, URLs, indexabilité',
      'Liens internes et ancres de liens',
      'Images : attributs alt, poids, formats',
      'Performance et Core Web Vitals',
      'Responsive / mobile',
      'Données structurées Schema.org, Open Graph, Twitter Cards',
      'Balises HTML sémantiques, redirections, pages 404, contenu dupliqué, liens cassés, pagination',
    ),

    H('7. SEO local'),
    L(
      'Nom de l\'entreprise, ville et zone géographique, services',
      'Pages locales dédiées si pertinent',
      'Données structurées LocalBusiness',
      'NAP (nom, adresse, téléphone) cohérent',
      'Lien vers la fiche Google Maps',
    ),
    CO('danger', 'Jamais de fausse information', "Ne jamais inventer une adresse, un horaire, un avis ou une certification."),

    H('8. Validation finale'),
    CODE("npm run build\nnpm run lint\nnpx tsc --noEmit"),
    CHK('Routes fonctionnelles', 'Métadonnées présentes sur chaque page', 'Sitemap accessible', 'robots.txt correct', 'Canonical correct', 'Headings hiérarchisés', 'Images avec alt', 'Données structurées valides'),

    H('Rapport final obligatoire'),
    TPL("✅ TÂCHES TERMINÉES\n- …\n\n⚠️ TÂCHES PARTIELLEMENT RÉALISÉES\n- …\n\n❌ TÂCHES IMPOSSIBLES SANS ACCÈS EXTERNE\n- Google Search Console / Analytics / Business Profile\n\n📊 PROGRESSION SEO : XX %\n(expliquer précisément le calcul)\n\n🔴 RESTE À FAIRE\nPriorité 1 — Critique : …\nPriorité 2 — Importante : …\nPriorité 3 — Optimisation : …\n\n📁 FICHIERS MODIFIÉS\n- …\n\n🧪 TESTS EFFECTUÉS\n- commande → résultat"),
    CO('danger', 'Exigence', "Ne pas se contenter de dire « le SEO est optimisé ». Fournir un audit réel, des modifications réelles dans le code et un rapport précis."),
  ],
})

sop({
  slug: 'ng-dev-maj-contenu-source-officielle', category: 'dev', popular: false, read_min: 3,
  title: "Mettre à jour une section de contenu depuis une source officielle",
  description: "Remplacer intégralement le contenu d'une section à partir d'un document officiel (présentation, PDF), en respectant l'ordre, la structure pédagogique et la mise en forme de la plateforme.",
  tags: ['Contenu', 'Migration', 'Plateforme', 'Pédagogie'],
  blocks: [
    CO('info', 'Quand utiliser cette SOP', "Le client fournit une source officielle (Google Slides, PDF, document) et demande de remplacer le contenu d'une section existante de la plateforme."),

    H('Instructions obligatoires'),
    NUM(
      'Analyser entièrement la source officielle avant toute modification',
      "Utiliser exclusivement le contenu présent dans le document officiel",
      "Remplacer tout l'ancien contenu de la section concernée",
      "Respecter exactement l'ordre des leçons, questions, exercices et activités",
      'Conserver la structure pédagogique prévue pour le public cible',
      'Reproduire fidèlement titres, sous-titres, consignes et contenus',
      'Ne pas modifier le sens du contenu ni réorganiser les questions',
      "Ne supprimer aucun élément présent dans la source",
      "Adapter uniquement la mise en forme visuelle pour rester cohérent avec le design de la plateforme",
    ),

    CO('warning', 'Autonomie', "Si une information est manquante, prendre la décision la plus logique et la plus professionnelle en se basant sur l'existant de la plateforme, sans interrompre le travail."),

    H('Rapport de fin'),
    L(
      'Les éléments intégrés',
      'Les améliorations effectuées',
      'Les corrections apportées',
      'Les problèmes détectés et résolus',
      'Les vérifications responsive réalisées',
    ),
  ],
})

/* ════════════════════════════════════════════════════════════════
   CATÉGORIE : ai — Claude Code & prompts
   ════════════════════════════════════════════════════════════════ */

sop({
  slug: 'ng-ai-claude-code-execute-mode', category: 'ai', popular: true, read_min: 6,
  title: 'Claude Code — mode EXECUTE et règles de travail Next Gital',
  description: "Le cadre de travail imposé à Claude Code : analyser avant de modifier, les 3 types de demandes (ajouter / corriger / supprimer), le workflow obligatoire et les interdictions git.",
  tags: ['Claude Code', 'Méthode', 'Workflow', 'Git', 'IA'],
  blocks: [
    CO('danger', 'Mode EXECUTE', "Analyser d'abord le projet existant avant toute modification. Ne faire aucune supposition. Lire le code actuel, identifier l'architecture, les dépendances et les impacts avant d'agir."),

    H('Les 3 types de demandes'),

    H2('1. Ajouter une fonctionnalité'),
    P('« Ajoute cette fonctionnalité : … »'),
    L(
      'Implémenter la fonctionnalité complètement',
      'Mettre à jour le frontend',
      'Mettre à jour le backend',
      'Mettre à jour la base de données si nécessaire',
      'Mettre à jour les types et validations',
      'Vérifier que tout fonctionne',
    ),

    H2('2. Corriger un problème'),
    P('« Cette fonctionnalité ne fonctionne pas : … »'),
    L(
      'Reproduire le problème',
      'Identifier la cause exacte',
      'Corriger définitivement le bug',
      'Vérifier les fonctionnalités liées',
      'Tester après correction',
    ),
    CO('warning', 'Jamais d\'hypothèse', "Ne jamais livrer une hypothèse. Trouver la vraie cause racine."),

    H2('3. Supprimer une fonctionnalité'),
    P('« Supprime cette partie : … »'),
    L(
      "Supprimer l'interface",
      'Supprimer la logique',
      'Supprimer les routes / API inutilisées',
      'Supprimer le code mort',
      'Nettoyer les imports',
      'Vérifier que le projet fonctionne toujours',
    ),

    H('Workflow obligatoire'),
    CODE("# Avant toute modification\ngit pull\n\n# Après chaque modification\nnpm run build"),
    P('Corriger toutes les erreurs, lancer ensuite l\'application localement et tester la fonctionnalité modifiée.'),
    CHK(
      'Aucun problème responsive',
      'Aucune erreur console',
      'Aucune erreur API',
      'Aucune erreur TypeScript',
      'Aucune route cassée',
    ),

    H('Interdictions'),
    CO('danger', 'Jamais automatiquement', "git commit · git push — sauf demande explicite écrite."),

    H('Quand la demande est « git push »'),
    NUM(
      'Vérifier le build',
      'Vérifier les fonctionnalités',
      'Corriger les erreurs éventuelles',
      'Faire le commit',
      'Pousser sur GitHub',
      'Fournir un résumé des modifications',
    ),

    CO('tip', 'Principe final', "Ne jamais considérer qu'une fonctionnalité fonctionne. La tester, la vérifier, la corriger — puis seulement livrer le résultat."),
  ],
})

sop({
  slug: 'ng-ai-connexion-projet-local', category: 'ai', popular: true, read_min: 4,
  title: 'Connecter Claude Code au projet local et configurer les clés API',
  description: "Vérifier que la connexion au projet localhost est établie, ouvrir et compléter le .env.local avec les variables d'API nécessaires, confirmer avant de commencer le développement.",
  tags: ['Claude Code', 'Localhost', '.env', 'API', 'Configuration'],
  blocks: [
    CO('tip', 'Objectif', "Ne jamais commencer un développement sans avoir confirmé que la connexion au projet local est opérationnelle et que les variables d'environnement sont en place."),

    H('Étape 1 — Connexion au projet local'),
    NUM(
      'Analyser entièrement le projet existant : structure des composants, pages, styles et dépendances',
      'Lancer le projet en local (npm install puis npm run dev)',
      'Vérifier que le localhost répond',
      'Confirmer explicitement que la connexion est établie',
    ),

    H('Étape 2 — Ouvrir le fichier .env.local'),
    NUM(
      'Ouvrir .env.local situé à la racine du projet, dans l\'éditeur central',
      'Vérifier le contenu existant sans supprimer ni modifier les variables déjà présentes',
      'Ajouter à la fin les variables nécessaires',
      'Utiliser un nom de variable cohérent avec la convention déjà utilisée dans le projet',
      'Enregistrer le fichier',
      'Ne modifier aucun autre fichier',
    ),

    H('Variables typiques'),
    CODE("# Génération d'images IA\nREPLICATE_API_TOKEN=\nOPENAI_API_KEY=\n\n# Higgsfield (images et vidéos)\nHIGGSFIELD_API_KEY=\nHIGGSFIELD_API_SECRET=\n\n# Cloudinary (hébergement + optimisation)\nCLOUDINARY_CLOUD_NAME=\nCLOUDINARY_API_KEY=\nCLOUDINARY_API_SECRET=\n# ou\nCLOUDINARY_URL="),
    CO('danger', 'Jamais de clé réelle dans un document', "Aucune vraie clé API ne doit figurer dans un prompt, un SOP, un ticket ou GitHub. Utiliser un placeholder (ex : YOUR_IMAGE_API_KEY_HERE) et renseigner la vraie valeur uniquement dans .env.local, qui doit être dans .gitignore."),

    H('Notes API Higgsfield'),
    L(
      'Endpoint : https://platform.higgsfield.ai/v1/text2image/soul',
      'En-têtes attendus : hf-api-key et hf-secret',
      'hf-api-key doit être l\'« API Key ID » au format UUID — toute autre forme renvoie 422 « Input should be a valid UUID »',
      'Corps minimal : {"params":{"prompt":"…","width_and_height":"1536x1024"}}',
    ),

    H('Confirmation avant de commencer'),
    CHK(
      'Le projet localhost est accessible',
      'Le fichier .env.local est correctement configuré',
      '.env.local est bien dans .gitignore',
      "L'environnement est prêt pour le développement",
    ),
  ],
})

sop({
  slug: 'ng-ai-prompt-optimizer', category: 'ai', popular: true, read_min: 5,
  title: 'Optimiseur de prompts — économiser les limites d\'usage',
  description: "Transformer une demande vague en prompt précis et économe en tokens, dans une fenêtre séparée. Modèle FR/EN, règles de budget et installation en commande /prompt.",
  tags: ['Prompt', 'Claude Code', 'Tokens', 'Productivité', 'IA'],
  blocks: [
    CO('tip', 'Principe', "Prend la demande d'un membre de l'équipe, aussi vague soit-elle, et produit un prompt précis prêt à coller dans Claude Code, avec la plus faible consommation de tokens possible."),
    CO('warning', 'Où l\'utiliser', "Dans une conversation NEUVE et peu coûteuse (Claude.ai, ou une commande sur un petit modèle) — jamais dans la session Claude Code où l'on travaille. On ne reporte ensuite que le résultat."),

    H('Règles strictes de l\'optimiseur'),
    NUM(
      "N'exécute jamais la tâche — produit uniquement le prompt",
      "S'il manque une information critique (chemin de fichier, critère d'acceptation) : poser UNE seule question puis s'arrêter",
      'Si la demande contient plusieurs tâches : ne produire que le prompt de la première, mentionner le reste sur une ligne « Plus tard : »',
      "Ne jamais inventer un chemin de fichier — écrire une instruction de recherche bornée à la place",
      'Maximum 150 mots pour le prompt produit',
      'Préférer les patterns existants et les modifications minimales',
      'Ne jamais ajouter de dépendance sauf demande explicite',
    ),

    H('Modèle de sortie'),
    TPL("OBJECTIF : <une phrase : verbe + résultat mesurable>\n\nFICHIERS : <chemins exacts précédés de @. Si inconnus : « Commence par un Grep sur '<mot-clé>' ; ne lis pas plus de 3 fichiers »>\n\nMOTIF DE RÉFÉRENCE : <fichier ou fonction existante à imiter — ou « aucun »>\n\nCONTRAINTES :\n- <ce qui ne doit PAS changer : forme de l'API, schéma, dépendances, fichiers>\n\nCRITÈRE D'ACCEPTATION : <une commande qui doit passer, ou la sortie exacte attendue>\n\nSORTIE ATTENDUE : <diff uniquement | un seul fichier | N points>\n\nBUDGET : lire ≤ <N> fichiers · <aucun sous-agent | un sous-agent léger pour : …>"),

    H('Règles de budget'),
    TBL(['Type de tâche', 'Budget'], [
      ['Modification simple', '≤ 3 fichiers, aucun sous-agent'],
      ['Exploration', '≤ 6 fichiers, un sous-agent léger'],
      ['Architecture', 'Recommander le Plan mode d\'abord, pas l\'exécution directe'],
    ]),

    H('Exemple complet'),
    P('Entrée : « Le panier se vide quand l\'utilisateur recharge la page, corrige ça »'),
    TPL("OBJECTIF : Conserver le contenu du panier après un rechargement de page.\n\nFICHIERS : Commence par un Grep sur « cart » dans src/ ; ne lis pas plus de 3 fichiers.\n\nMOTIF DE RÉFÉRENCE : reprendre l'approche de persistance déjà utilisée par le store de session d'authentification.\n\nCONTRAINTES :\n- Ne pas changer le schéma des articles du panier\n- Aucune nouvelle dépendance\n- Côté client uniquement, aucune modification d'API\n\nCRITÈRE D'ACCEPTATION : Ajouter un article → recharger → l'article est toujours présent. `npm test -- cart` passe.\n\nSORTIE ATTENDUE : diff uniquement, sans explication.\n\nBUDGET : lire ≤ 3 fichiers · aucun sous-agent"),
    CO('success', 'Gain mesuré', "≈ 80 000 tokens → ≈ 6 000 tokens sur cet exemple."),

    H('En faire une commande Claude Code'),
    P("Créer .claude/commands/prompt.md dans le projet (ou ~/.claude/commands/prompt.md pour tous les projets) :"),
    CODE("---\ndescription: Transforme une demande vague en prompt précis et économe en tokens\nmodel: haiku\n---\n\nRole: prompt optimizer. Turn the request below into a specific, token-cheap prompt.\nNever execute it. Output only the template. Max 150 words.\nIf a critical detail is missing, ask ONE question and stop.\n\nTemplate:\nGOAL / FILES / REFERENCE PATTERN / CONSTRAINTS / ACCEPTANCE / OUTPUT / BUDGET\n\nRequest: $ARGUMENTS"),
    P('Utilisation : /prompt il faut corriger le panier qui se vide tout seul'),

    CO('danger', "Règle d'équipe", "Aucune demande n'est envoyée à Claude Code sans être passée par l'optimiseur. Une minute de reformulation économise une heure de limite hebdomadaire."),
  ],
})

sop({
  slug: 'ng-ai-reformulation-prompt-pro', category: 'ai', popular: false, read_min: 4,
  title: 'Reformuler une idée en prompt professionnel structuré',
  description: "Transformer une idée brute en prompt complet (rôle, objectif, contexte, mission, exigences, contraintes, méthode, format, critères qualité) prêt à copier-coller.",
  tags: ['Prompt', 'IA', 'Méthode', 'Rédaction'],
  blocks: [
    CO('info', 'Différence avec l\'optimiseur de tokens', "Ici l'objectif n'est pas l'économie de tokens mais la qualité maximale du résultat : on enrichit la demande au lieu de la compresser."),

    H('Méthode de travail'),
    NUM(
      "Identifier précisément l'objectif réel et le résultat final recherché",
      "Déterminer le rôle le plus pertinent que l'IA doit adopter (expert, consultant, analyste, développeur, stratège…)",
      'Ajouter le contexte nécessaire à la bonne compréhension de la situation',
      'Transformer les demandes vagues en instructions professionnelles et exploitables',
      'Structurer le prompt autour des blocs standards',
      "Ajouter une méthodologie d'analyse, de vérification et de validation quand cela améliore le résultat",
      'Éviter les réponses génériques, superficielles ou trop théoriques',
      "Prévoir que l'IA demande les informations manquantes ou indique clairement ses hypothèses",
      'Supprimer répétitions, contradictions et instructions inutiles',
      'Adapter le niveau de détail à la complexité de la mission',
    ),

    H('Blocs standards d\'un prompt professionnel'),
    L('Rôle', 'Objectif', 'Contexte', 'Mission', 'Exigences', 'Contraintes', 'Méthodologie', 'Format de sortie', 'Critères de qualité'),

    H('Contrôle qualité avant livraison du prompt'),
    CHK(
      'Objectif parfaitement clair',
      'Contexte suffisant',
      'Instructions précises',
      'Aucune contradiction',
      'Résultat attendu clairement défini',
      'Format de réponse adapté',
      'Prompt directement exploitable',
      "Niveau d'expertise approprié",
    ),

    H('Format de réponse attendu'),
    NUM(
      'PROMPT FINAL — version complète, professionnelle, prête à copier-coller',
      'VERSION COURTE — version concise conservant les instructions essentielles',
      "AMÉLIORATIONS OPTIONNELLES — uniquement celles qui augmentent réellement la qualité",
    ),

    CO('warning', 'Règle importante', "Ne pas réaliser la mission contenue dans la demande : la fonction est de concevoir le meilleur prompt possible."),
  ],
})

sop({
  slug: 'ng-ai-diagnostic-probleme', category: 'ai', popular: true, read_min: 4,
  title: 'Diagnostiquer et corriger un problème — méthode cause racine',
  description: "À partir d'une phrase ou d'une capture d'écran : analyser, chercher la cause racine dans tout le projet, corriger le minimum nécessaire, tester et confirmer. Format de réponse imposé.",
  tags: ['Debug', 'Diagnostic', 'Cause racine', 'Support', 'IA'],
  blocks: [
    CO('danger', 'Interdit', "Ne pas se contenter de dire ce qui pourrait être le problème. La séquence attendue est : ANALYSER → TROUVER LA CAUSE → CORRIGER → TESTER → CONFIRMER."),

    H('Règles de diagnostic'),
    NUM(
      "Analyser d'abord le projet et le code existant",
      'Chercher toutes les causes possibles liées au problème',
      'Identifier la cause racine réelle, pas seulement le symptôme',
      'Localiser exactement : fichier, fonction, composant, configuration, API, base de données, dépendance, serveur, environnement',
      "Vérifier l'hypothèse dans le code avant de conclure",
      'Corriger directement une fois la cause confirmée',
      'Ne modifier que ce qui est nécessaire',
      'Ne casser aucune fonctionnalité existante',
      'Effectuer les tests ou vérifications nécessaires après correction',
      'Si une première solution ne fonctionne pas, poursuivre le diagnostic',
    ),
    CO('warning', 'Autonomie', "Ne pas demander où chercher : chercher soi-même dans tout le projet."),

    H("À partir d'une capture d'écran"),
    NUM(
      'Diagnostic — erreurs, anomalies ou incohérences détectées',
      'Causes probables — côté code, configuration, réseau…',
      'Solutions concrètes — les étapes exactes, dans l\'ordre',
      "Ce qu'il faut vérifier — les informations manquantes à fournir",
    ),

    H('Format de réponse imposé'),
    TPL("Problème identifié :\n…\n\nCause racine :\n…\n\nFichier(s) modifié(s) :\n…\n\nCorrection effectuée :\n…\n\nTests effectués :\n…\n\nRésultat :\n…"),

    CO('tip', 'Version autonome', "« Corrige complètement sans me poser de questions. Corrige la cause racine proprement, sans introduire de nouvelles erreurs ailleurs. Après le correctif, vérifie que tout fonctionne de bout en bout (app, tests, vérifications), puis fais un compte rendu de ce qui n'allait pas et de la correction. »"),
  ],
})

sop({
  slug: 'ng-ai-cahier-des-charges', category: 'ai', popular: true, read_min: 4,
  title: 'Rédiger un cahier des charges exploitable',
  description: "Produire un document structuré et orienté exécution : objectifs business, utilisateurs, fonctionnalités MVP, parcours, écrans, stack, contraintes, roadmap, livrables et critères de validation.",
  tags: ['Cahier des charges', 'Product', 'MVP', 'Roadmap', 'Avant-vente'],
  blocks: [
    CO('info', 'Posture', "Product Manager senior spécialisé dans les applications web et mobile orientées business. Document destiné à être exécuté par un développeur, pas à être lu comme un rapport."),

    H('Contexte à renseigner avant de commencer'),
    L(
      'Type de projet (application, plateforme e-commerce, SaaS…)',
      'Objectif principal (leads, réservations, ventes)',
      'Cible (qui utilise, dans quel contexte)',
    ),

    H('Les 10 sections du document'),
    NUM(
      'Objectifs business — clairs et mesurables',
      'Utilisateurs cibles et leurs problèmes',
      'Fonctionnalités prioritaires (MVP d\'abord) puis secondaires',
      'Parcours utilisateurs simples et efficaces',
      'Structure des pages / écrans — avec la logique réelle, pas seulement la description',
      'Stack technique recommandée — simple, rapide, scalable',
      'Contraintes réelles — budget, temps, complexité',
      'Roadmap de développement — étapes concrètes',
      'Livrables attendus à chaque étape',
      "Critères de validation — quand considère-t-on que c'est terminé",
    ),

    CO('danger', 'À éviter', "Le blabla théorique. Donner des décisions concrètes, prioriser la rapidité et le ROI, penser comme une agence qui doit livrer vite et bien."),

    H('Utilisation du cahier des charges pendant le développement'),
    L(
      'Vérifier chaque fonctionnalité de l\'application contre le document',
      'Contrôler la logique, les formulaires, les pages, les rôles utilisateurs, les permissions, les workflows et les intégrations',
      'Identifier les éléments manquants, incohérents ou mal configurés',
      'Corriger les erreurs UI/UX et les problèmes techniques',
      'Vérifier que tout fonctionne après les modifications',
      'Fournir un rapport clair des modifications effectuées',
    ),
  ],
})

sop({
  slug: 'ng-ai-build-application-web', category: 'ai', popular: true, read_min: 8,
  title: "Construire une application web complète en mode autonome",
  description: "Cadre d'exécution autonome : découverte produit, stack imposée, standards UI/UX, exigences fonctionnelles, qualité de code, phase de tests obligatoire, vérification bout-en-bout et format de livraison.",
  tags: ['Application', 'Full-stack', 'React', 'Node', 'PostgreSQL', 'Livraison'],
  blocks: [
    CO('info', 'Posture', "Architecte logiciel + ingénieur full-stack + designer UI/UX + DevOps + QA + sécurité, en mode exécution autonome. La responsabilité n'est pas de produire des extraits de code mais de concevoir, construire, tester, corriger et livrer un logiciel prêt pour la production."),

    H('Règles d\'exécution autonome'),
    L(
      "Ne jamais s'arrêter avant la fin",
      'Ne jamais laisser de TODO ni de placeholder',
      'Ne jamais livrer un module incomplet',
      'Ne jamais sauter la validation ou les tests',
      "Ne jamais affirmer qu'une fonctionnalité marche sans l'avoir vérifiée",
      'Si une information manque, choisir la solution la plus scalable et professionnelle',
    ),

    H('Phase de découverte produit — avant de coder'),
    NUM(
      'Analyser tout le cahier des charges',
      'Identifier les objectifs business',
      'Identifier les rôles utilisateurs et les permissions',
      'Identifier les workflows',
      'Identifier les entités et leurs relations',
      'Concevoir une architecture scalable',
      'Concevoir les parcours UX',
      'Concevoir la structure de base de données',
    ),

    H('Stack technique'),
    TBL(['Couche', 'Technologies'], [
      ['Frontend', 'React 18 · TypeScript · Vite · TailwindCSS · shadcn/ui · Radix · React Router · Framer Motion · React Hook Form · Zod · TanStack Query · Zustand · Recharts · Sonner · Lucide'],
      ['Backend', 'Node.js · Express · TypeScript'],
      ['Base de données', 'PostgreSQL (+ ORM)'],
      ['Authentification', 'JWT · rotation des refresh tokens · RBAC'],
      ['Sécurité', 'Rate limiting · Helmet · validation des entrées · XSS · CSRF · cookies sécurisés · hachage des mots de passe · variables d\'environnement'],
      ['Déploiement', 'Docker · Docker Compose · compatible Dokploy et VPS'],
    ]),

    H('Standards UI/UX'),
    P("Qualité équivalente aux SaaS modernes (Linear, Stripe Dashboard, Notion, Vercel) :"),
    L('Responsive mobile-first', 'Mode sombre et clair', 'Design system, échelle typographique, espacements cohérents', 'Animations fluides et micro-interactions', 'Composants accessibles', 'États vides, de chargement et d\'erreur', 'Dialogs de confirmation, toasts, skeleton loaders'),

    H('Exigences fonctionnelles récurrentes'),
    L(
      'Authentification : login, logout, mot de passe oublié, réinitialisation, gestion de session',
      'Administration : tableau de bord, gestion des utilisateurs, rôles et permissions',
      'Données : CRUD, recherche, filtres, tri, pagination',
      'UX : mises à jour optimistes, navigation clavier, accessibilité',
      'Sécurité : routes protégées, contrôles de permission, validation des entrées, appels API sécurisés',
    ),

    H('Phase de tests obligatoire'),
    CODE("npm install\nnpx tsc --noEmit\nnpm run lint\nnpm run build\nnpm run dev"),
    P("Attendre que l'application soit complètement accessible, puis se connecter et vérifier page par page : login, logout, dashboard, navigation, appels API, CRUD, recherche, filtres, tableaux, graphiques, formulaires, paramètres, gestion des utilisateurs, responsive, mode sombre, gestion des erreurs."),
    CO('danger', 'Blocage de livraison', "Interdit de livrer si : le build échoue · le login échoue · des erreurs runtime, console ou API existent · une route est cassée · un bug critique subsiste."),

    H('Format de livraison'),
    NUM(
      'Résumé exécutif',
      "Architecture de l'application",
      'Structure des dossiers',
      'Schéma de base de données',
      'Fonctionnalités implémentées',
      'Mesures de sécurité',
      "Instructions d'installation",
      "Variables d'environnement",
      'Instructions de déploiement',
      'Rapport de tests',
      'Rapport de vérification — page par page : nom, test réalisé, résultat PASS/FAIL',
    ),
    CO('warning', 'Honnêteté', "Si une vérification est impossible dans l'environnement, expliquer explicitement ce qui n'a pas pu être vérifié et pourquoi."),
  ],
})

sop({
  slug: 'ng-ai-generation-images', category: 'ai', popular: true, read_min: 7,
  title: 'Génération d\'images IA et hébergement Cloudinary',
  description: "Comparer les générateurs, choisir selon budget et délai, automatiser la génération + upload Cloudinary, et intégrer le workflow dans l'application (prompt → image → URL en base).",
  tags: ['IA', 'Images', 'Replicate', 'Cloudinary', 'Automatisation'],
  blocks: [
    CO('tip', 'Objectif', "Produire en masse des images photoréalistes cohérentes avec l'activité du client, les héberger et les optimiser automatiquement."),

    H('1. Comparatif des générateurs (base : 4 000 images)'),
    TBL(['Générateur', 'Coût estimé', 'Qualité', 'Vitesse'], [
      ['Flux Schnell (Replicate)', '~12 $', '★★★★', 'Rapide (~2 s/image)'],
      ['Flux Dev (Replicate)', '~120 $', '★★★★★', 'Moyen'],
      ['Imagen 3 (Google)', '~80 $', '★★★★★', 'Rapide'],
      ['DALL·E 3 (OpenAI)', '~160 $', '★★★★', 'Moyen'],
      ['Pollinations.ai', 'Gratuit', '★★★★', 'Lent (5-8 s/image)'],
    ]),
    CO('info', 'Recommandation', "Flux Schnell + Cloudinary. Avec 10 requêtes en parallèle : ~35 min pour 4 000 images, ~12 $. Alternative 0 € : Pollinations parallélisé, ~1 h 30."),

    H('2. Préparer les comptes'),
    NUM(
      'Replicate.com — créer le compte, ajouter du crédit, activer l\'auto-reload si besoin',
      'Créer un token API (Account → API tokens → Create token) et le copier immédiatement : il ne s\'affiche qu\'une fois',
      'Cloudinary.com — compte gratuit (25 Go)',
    ),
    CO('danger', 'Secret', "Le token commence par r8_… Il ne doit jamais être partagé publiquement ni committé. Le placer uniquement dans .env / .env.local."),

    H('3. Workflow automatisé'),
    CODE("prompts.json (N prompts)\n   ↓\nScript Node.js\n   ↓\n1. API du générateur → génère l'image\n   ↓\n2. Upload direct → Cloudinary\n   ↓\n3. Sauvegarde de l'URL → images.json ou base de données\n   ↓\n4. L'application lit les URLs"),
    L(
      'Reprise automatique en cas d\'interruption',
      'Délai entre requêtes pour respecter les limites',
      'Parallélisation (ex : 10 requêtes simultanées)',
    ),

    H('4. Intégration dans une application'),
    NUM(
      "L'utilisateur crée ou modifie un service dans l'administration",
      'Le système génère un prompt détaillé à partir du titre et de la description',
      'Envoi du prompt au générateur',
      "Génération d'une image photoréaliste haute qualité",
      'Téléchargement automatique de l\'image',
      'Upload automatique vers Cloudinary',
      'Récupération de l\'URL optimisée',
      "Sauvegarde de l'URL en base de données",
      "Affichage automatique dans le site",
      'Régénération possible en un clic',
    ),

    H('5. Exigences qualité des images'),
    L(
      'Style photographique professionnel, éclairage naturel, détails réalistes',
      'Qualité publicitaire premium',
      'Format horizontal 16:9, résolution minimum 1920×1080',
      'Aucun texte, aucun logo, aucun watermark',
      'Optimisation automatique WebP via Cloudinary',
      'Lazy loading côté frontend',
    ),

    H('6. Code à produire'),
    L("Variables d'environnement", 'Services API', 'Fonctions de génération', 'Upload Cloudinary', 'Gestion des erreurs', 'Types TypeScript', 'API Routes', 'Intégration frontend', 'Documentation'),

    H('Checklist'),
    CHK(
      'Variables présentes dans .env.local et absentes de Git',
      'Script de génération avec reprise et parallélisation',
      'Upload Cloudinary fonctionnel',
      'URLs sauvegardées et affichées correctement',
      'Responsive vérifié sur mobile, tablette et desktop',
      'Aucune erreur console ni build',
    ),
  ],
})

/* ════════════════════════════════════════════════════════════════
   CATÉGORIE : designer
   ════════════════════════════════════════════════════════════════ */

sop({
  slug: 'ng-design-extraction-identite-visuelle', category: 'designer', popular: true, read_min: 5,
  title: "Extraire l'identité visuelle et la palette depuis une image ou un logo",
  description: "Analyser une image de référence pour en tirer une palette professionnelle complète (rôles, HEX, variables CSS), la typographie et la règle 60/30/10.",
  tags: ['Palette', 'Couleurs', 'Branding', 'Design System', 'CSS'],
  blocks: [
    CO('tip', 'Objectif', "Obtenir un véritable Design Color System professionnel, inspiré de l'image fournie et directement utilisable pour un site web ou une application."),

    H("1. Analyse de l'image"),
    L(
      'Couleurs dominantes, secondaires, d\'accentuation, de fond, de texte',
      'Nuances claires et foncées, contrastes',
      'Température des couleurs : chaude, froide ou neutre',
      'Style visuel général, ambiance et émotions transmises',
      'Cohérence entre les différentes couleurs',
    ),

    H('2. Extraction'),
    P('Pour chaque couleur importante : nom descriptif · code HEX · RGB si pertinent · fonction probable dans le design · importance (principale, secondaire, accent).'),

    H('3. Palette professionnelle à produire'),
    TBL(['Rôle', 'Utilisation recommandée'], [
      ['Primary', 'Couleur principale de la marque / interface'],
      ['Primary Dark', 'Hover, éléments importants, contrastes'],
      ['Primary Light', 'Backgrounds, cards, éléments secondaires'],
      ['Secondary', 'Couleur complémentaire'],
      ['Accent', 'CTA, éléments interactifs, informations importantes'],
      ['Background', 'Arrière-plans principaux'],
      ['Surface', 'Cards, formulaires, sections, composants'],
      ['Text Primary', 'Texte principal'],
      ['Text Secondary', 'Texte secondaire'],
      ['Border / Divider', 'Bordures et séparateurs'],
      ['Success / Warning / Error', 'Couleurs fonctionnelles cohérentes avec la palette'],
    ]),

    H('4. Expertise UI/UX — ne pas copier aveuglément'),
    P("Si certaines couleurs de l'image fonctionnent mal ensemble, manquent de contraste ou ne conviennent pas à une interface moderne, les améliorer en conservant l'identité visuelle d'origine."),
    CHK('Lisibilité', 'Contraste (WCAG)', 'Accessibilité', 'Harmonie', 'Hiérarchie visuelle', 'Cohérence de marque', 'Utilisation desktop et mobile'),

    H('5. Règle 60 / 30 / 10'),
    L('60 % — couleur dominante / backgrounds', '30 % — couleurs secondaires / surfaces', '10 % — accent / CTA / éléments importants'),

    H('6. Livrable — variables CSS'),
    CODE("--color-primary:\n--color-primary-dark:\n--color-primary-light:\n--color-secondary:\n--color-accent:\n--color-background:\n--color-surface:\n--color-text-primary:\n--color-text-secondary:\n--color-border:\n--color-success:\n--color-warning:\n--color-error:"),

    H('7. Typographie'),
    P("Déterminer le style typographique (titres, sous-titres, texte principal) et recommander des polices web similaires si les originales ne sont pas identifiables. Exemple de structure de recommandation :"),
    TBL(['Usage', 'Police suggérée', 'Alternative', 'Poids'], [
      ['Titres (H1, H2)', 'Montserrat', 'Poppins, Raleway', '700–800'],
      ['Sous-titres (H3, H4)', 'Montserrat', 'Inter', '600'],
      ['Texte courant', 'Open Sans / Inter', 'Lato, Source Sans Pro', '400'],
      ['Texte arabe', 'Tajawal / Cairo', 'Almarai', '400–700'],
    ]),
  ],
})

sop({
  slug: 'ng-design-homepage-premium', category: 'designer', popular: true, read_min: 8,
  title: 'Concevoir une homepage premium à partir de références visuelles',
  description: "Utiliser des références sans les copier : direction artistique issue du logo, structure complète de la page d'accueil, UI/UX, images, responsive et parcours de conversion.",
  tags: ['Homepage', 'Design', 'Conversion', 'Direction artistique', 'UI/UX'],
  blocks: [
    CO('danger', 'Usage des références', "Les images de référence servent UNIQUEMENT à comprendre le niveau de qualité, la structure, les proportions, les espacements et le niveau de finition. Ne jamais copier le design, le logo, les textes, les images ou la structure exacte."),

    H('Objectif'),
    P("Créer une homepage qui donne immédiatement une impression de professionnalisme, de confiance, de qualité, de modernité et d'expertise — pensée avant tout pour convertir."),

    H('Direction artistique'),
    L(
      'Extraire la palette depuis le logo fourni si aucune palette n\'est donnée',
      'Ne pas changer arbitrairement les couleurs principales de la marque',
      'Typographie moderne, professionnelle, parfaitement lisible',
      'Éviter : designs génériques, templates reconnaissables, interfaces surchargées, gradients excessifs, animations agressives',
    ),

    H('Structure de la homepage'),
    NUM(
      'HEADER — logo, navigation, CTA principal, éventuellement téléphone/WhatsApp, sticky moderne',
      'HERO — badge, H1 fort, proposition de valeur, texte court, CTA principal + secondaire, visuel qualitatif',
      'RÉASSURANCE — années d\'expérience, clients, projets, certifications, garanties',
      'À PROPOS — titre fort, texte court, visuel premium, avantages, CTA',
      'SERVICES / PRODUITS — cartes modernes : image ou icône, titre, description courte, lien',
      'POURQUOI NOUS — les vraies raisons de choisir l\'entreprise',
      'EXPERTISE / PROCESSUS — technologies, méthode de travail, équipements, savoir-faire',
      'RÉALISATIONS / OFFRES — produits, projets, catégories, résultats',
      'TÉMOIGNAGES — prénom, photo si disponible, note, entreprise ou localisation',
      'CHIFFRES CLÉS — statistiques importantes présentées visuellement',
      'LOCALISATION / CONTACT — adresse, carte, horaires, téléphone, WhatsApp, CTA itinéraire',
      'CTA FINAL — titre orienté conversion, phrase courte, CTA principal',
      'FOOTER — logo, présentation courte, navigation, services, contact, réseaux, mentions légales',
    ),
    CO('warning', 'Le hero doit répondre en 5 secondes', "QUI est l'entreprise · CE QU'ELLE propose · POUR QUI · POURQUOI la choisir · COMMENT passer à l'action."),

    H('UI / UX'),
    L('Excellente lisibilité', 'Spacing généreux', 'Grille cohérente et alignements précis', 'Contraste accessible', 'Hiérarchie typographique claire', 'CTA visibles sans être agressifs', 'Composants réutilisables'),

    H('Images'),
    L(
      'Professionnelles, réalistes, haut de gamme, cohérentes avec la marque',
      'Privilégier les visuels fournis par le client',
      'Éviter les images de banque génériques quand des visuels spécifiques sont possibles',
    ),

    H('Responsive'),
    P("Le responsive n'est pas une simple réduction du desktop : simplifier la navigation, conserver la lisibilité, optimiser les CTA, adapter les cartes, réorganiser les sections, préserver les informations importantes."),

    H('Parcours de conversion'),
    CODE("Attention → Compréhension → Confiance → Découverte → Preuve → Désir → Action"),
    P('Adapter le CTA au projet : demander un devis · prendre rendez-vous · acheter · découvrir les services · nous contacter · WhatsApp · voir nos réalisations.'),

    H('Informations à collecter avant de concevoir'),
    L('Nom de l\'entreprise, secteur, ville', 'Cible et objectif du site', 'Services / produits', 'Points forts', 'CTA principal et secondaire', 'Téléphone, WhatsApp, adresse, email, horaires', 'Réseaux sociaux', 'Logo et couleurs de marque', 'Style souhaité'),
  ],
})

sop({
  slug: 'ng-design-ux-site-medical', category: 'designer', popular: false, read_min: 8,
  title: 'Concevoir un site vitrine médical — méthode UX/UI complète',
  description: "De l'analyse des besoins patients à la maquette détaillée : arborescence, page d'accueil section par section, UX mobile, design system, direction photo, accessibilité et conversion.",
  tags: ['Médical', 'UX', 'Site vitrine', 'Design System', 'Conversion'],
  blocks: [
    CO('tip', 'Objectif du site', "Présenter le professionnel ou l'établissement, ses spécialités et prestations, renforcer la confiance, faciliter la prise de rendez-vous et donner rapidement les informations recherchées par les patients."),
    CO('danger', 'Ne jamais inventer', "Aucun diplôme, chiffre, témoignage, certification, tarif ou information médicale ne doit être inventé. Si une information essentielle manque, la demander AVANT de concevoir."),

    H('Direction artistique'),
    P('Inspirer : confiance + expertise + modernité + propreté + sérénité + proximité humaine.'),
    TBL(['À éviter', 'À privilégier'], [
      ['Aspect froid et hospitalier', 'Espaces blancs généreux'],
      ['Interfaces surchargées', 'Excellente hiérarchie typographique'],
      ['Couleurs agressives', 'Grandes photographies professionnelles'],
      ['Animations inutiles', 'Sections aérées, cartes élégantes'],
      ['Clichés médicaux et banques d\'images artificielles', 'Micro-interactions discrètes, CTA parfaitement visibles'],
    ]),

    H('Arborescence — sélectionner ce qui a une vraie utilité'),
    L('Accueil', 'À propos / Le médecin', 'Spécialités', 'Services / Prestations', 'Pages individuelles pour les principales prestations', 'Informations patients', 'FAQ', 'Contact', 'Prendre rendez-vous'),
    CO('warning', 'Pas de page inutile', "Ne pas créer automatiquement toutes ces pages : ne garder que celles qui ont une utilité UX, commerciale ou SEO."),

    H("Page d'accueil — section par section"),
    NUM(
      'Header — logo, navigation claire, téléphone, CTA de rendez-vous',
      'Hero — spécialité, nom, localisation, proposition de valeur, CTA principal et secondaire, photo professionnelle',
      'Réassurance — diplômes, expérience, expertise, certifications',
      'Présentation — courte présentation + lien vers la page complète',
      'Services / spécialités — cartes scannables : icône, nom, courte description, « En savoir plus »',
      'Pourquoi choisir ce professionnel — uniquement de vrais éléments différenciants',
      'Parcours patient — prise de rendez-vous, consultation, suivi',
      'Témoignages — structure prévue si de vrais avis existent',
      'FAQ — questions réellement utiles aux patients',
      'Contact / rendez-vous — adresse, téléphone, WhatsApp, horaires, carte, CTA',
      'Footer — coordonnées, navigation secondaire, réseaux, informations légales',
    ),
    P("Pour chaque section, préciser : objectif UX · structure visuelle · contenu à afficher · CTA · éléments graphiques recommandés."),

    H('UX mobile — approche mobile first'),
    L(
      'Navigation mobile simple',
      'CTA facilement accessible, boutons suffisamment grands',
      'Numéros de téléphone cliquables, WhatsApp si disponible',
      'Formulaires courts, sections faciles à parcourir',
      'Typographie lisible, images optimisées',
      'Barre CTA mobile fixe (Appeler | WhatsApp | Rendez-vous) uniquement si elle améliore réellement l\'expérience',
    ),

    H('Design system'),
    L('Palette complète avec rôle de chaque couleur', 'Typographie : polices titres et corps, tailles H1/H2/H3, interlignage', 'Boutons : primary, secondary, hover, disabled', 'Composants : cartes, formulaires, champs, badges, témoignages, accordéons FAQ, icônes, navigation, footer', 'Espacement : marges, paddings, espaces entre sections, largeur max, border radius, ombres'),

    H('Accessibilité'),
    CHK('Contraste texte/fond', 'Taille des textes', 'Navigation claire', 'États hover / focus', 'Boutons identifiables', 'Formulaires compréhensibles', 'Hiérarchie H1/H2/H3', 'Usage raisonnable des animations'),

    H('Conversion'),
    P("CTA principal unique (ex : prendre rendez-vous), CTA secondaires appropriés (appeler, WhatsApp, voir les prestations, obtenir l'itinéraire). Parcours : découverte → confiance → compréhension des services → réassurance → prise de contact."),
  ],
})

sop({
  slug: 'ng-design-direction-artistique-2040', category: 'designer', popular: true, read_min: 10,
  title: 'Direction artistique Next Gital — refonte premium « Future 2040 »',
  description: "Le standard de refonte Next Gital en 14 étapes : analyser avant de modifier, respecter le contenu et la marque, design system, motion, 3D, rythme visuel, mobile first, performance et tests finaux.",
  tags: ['Direction artistique', 'Refonte', 'Motion', '3D', 'Next Gital', 'Standard'],
  blocks: [
    CO('info', 'Posture', "Senior UI/UX Designer, Creative Director et Creative Developer Next Gital — niveau d'exigence d'une agence digitale internationale."),
    CO('warning', 'Le futurisme reste subtil', "Le résultat ne doit jamais être compliqué, froid, illisible, lent, artificiel, excessivement animé ni ressembler à un jeu vidéo. Priorité : UX → confiance → conversion → identité de marque → design → motion → 3D."),

    H('Règle n°1 — analyser avant de modifier'),
    P("Ne pas commencer à coder. Analyser d'abord : structure, pages, navigation, contenu, identité visuelle, logo, couleurs, typographie, images, services, CTA, formulaires, responsive, SEO, performance, parcours utilisateur, points faibles et forts, éléments à conserver."),
    P('Comprendre : QUI est le client ? QUE vend-il ? À QUI s\'adresse-t-il ? QUEL est l\'objectif du site ? QUELLE action doit effectuer le visiteur ?'),

    H('Ne pas détruire le contenu existant'),
    CO('danger', 'Interdits', "Ne pas supprimer arbitrairement services, informations, coordonnées, témoignages, textes importants, pages, informations légales ou données SEO. Ne jamais inventer de fausses informations ni remplacer du contenu réel par du lorem ipsum."),
    P('Le contenu existant doit être conservé + organisé + amélioré si nécessaire + mieux présenté. Le design sert le contenu.'),

    H('Identité de marque'),
    P("Analyser le logo et l'identité existante. Le nouveau design respecte le logo, les couleurs principales, les valeurs, le secteur, la clientèle et le positionnement. Ne pas imposer la même palette à tous les clients : chaque site conserve sa personnalité."),

    H('Design system à produire'),
    L('Couleurs (primaire, secondaire, accent, backgrounds, textes, bordures, hover, success/error)', 'Typographie et hiérarchie H1 → caption', 'Spacing, border radius, shadows', 'Boutons, cards, forms, icons, badges', 'Navigation, CTA, animations, breakpoints'),

    H('Hero'),
    P('Le hero répond à 4 questions : QUI ? QUOI ? POUR QUI ? QUE FAIRE ? Il contient : badge ou catégorie, H1, proposition de valeur, description courte, CTA principal, CTA secondaire si nécessaire, élément visuel fort.'),
    CO('warning', 'Le visuel doit raconter quelque chose', "Ne pas ajouter un élément uniquement parce qu'il est « cool »."),

    H('Motion, 3D et effets'),
    L(
      'Motion : fade, reveal, slide, scale, parallax, blur reveal, floating, text reveal, hover, magnetic, scroll animation',
      "Règle : « L'utilisateur doit ressentir l'animation avant de la remarquer »",
      '3D : uniquement si elle améliore réellement l\'expérience — chaque élément 3D doit avoir une fonction visuelle ou narrative',
      'Particles : très subtiles, adaptées au secteur (tech, science, médical, finance, architecture)',
      'Luxury UI : 10-20 % maximum — glassmorphism subtil, surfaces translucides, bordures fines, profondeur, gradients subtils',
    ),
    CO('danger', 'Ne pas surdesigner', "Ne jamais utiliser simultanément partout : particles + 3D + glassmorphism + gradients + animations + shadows + vidéos. LESS BUT BETTER."),

    H('Rythme visuel'),
    CODE("Section immersive\n→ Section minimaliste\n→ Section éditoriale\n→ Section interactive\n→ Section humaine\n→ Section premium\n→ CTA"),
    P('Toutes les sections ne doivent pas avoir le même style : le contraste crée le sentiment de qualité.'),

    H('Règle 70 / 20 / 10'),
    L('70 % — clarté + contenu + espaces', '20 % — design premium + interactions', '10 % — wow / 3D / motion / expérience'),

    H('Mobile first et performance'),
    P('Tester 375 / 390 / 430 / 768 / 1024 / 1280 / 1440 / 1920 px. Optimiser : images (WebP, AVIF), lazy loading, vidéo, 3D, JavaScript, CSS, fonts, code splitting. Sur appareils faibles : réduire automatiquement les effets lourds. Respecter prefers-reduced-motion.'),

    H('SEO — ne pas le sacrifier au design'),
    L('H1, H2, H3', 'title, meta description', 'URLs et maillage interne', 'Schema et données locales', 'Alt des images', 'Performance et Core Web Vitals'),

    H('Ordre d\'exécution — 14 étapes'),
    NUM(
      'Auditer le site existant',
      'Comprendre la marque et le secteur',
      "Identifier l'objectif commercial principal",
      'Identifier les problèmes UX/UI',
      'Définir le nouveau design system',
      'Définir la direction artistique',
      'Définir les éléments 3D / vidéo / IA nécessaires',
      'Refondre le hero',
      'Refondre les sections principales',
      'Améliorer les CTA et la conversion',
      'Optimiser mobile',
      'Optimiser la performance',
      'Vérifier le SEO',
      "Tester l'ensemble du site",
    ),

    H('Tests finaux'),
    H2('Test des 5 secondes'),
    P("Après chargement du hero, l'utilisateur doit comprendre : qui est la marque, ce qu'elle propose, pourquoi elle est différente, et ce qu'il doit faire. Sinon → modifier le hero."),
    H2('Test de conversion'),
    CHK('Le CTA principal est évident', "L'utilisateur sait comment contacter l'entreprise", 'Il existe une preuve de confiance', 'Le parcours est simple', 'Le site répond aux objections principales'),
    H2('Test mobile (375 / 390 / 430 px)'),
    CHK('Aucun overflow horizontal', 'Aucun texte coupé', 'Aucun bouton trop petit', 'Aucune animation gênante', 'Aucun élément inaccessible', 'Aucun formulaire difficile'),

    CO('success', 'Standard final', "Le résultat doit donner deux impressions à la fois : « ce site est clairement plus avancé que les sites classiques du marché » ET « je comprends immédiatement l'entreprise et je sais quoi faire »."),
  ],
})

sop({
  slug: 'ng-design-site-one-file-premium', category: 'designer', popular: false, read_min: 6,
  title: 'Produire un site premium en un seul fichier (HTML/CSS/JS)',
  description: "Livrable one-file niveau Awwwards : structure des sections, animations GSAP/Lenis, effets obligatoires, responsive fluide, contraintes d'assets et lancement du serveur local.",
  tags: ['HTML', 'GSAP', 'Animation', 'Awwwards', 'Landing page'],
  blocks: [
    CO('info', 'Livrable', "UN SEUL fichier HTML complet : CSS dans <style> avec variables dans :root, JS dans <script> en bas, code commenté, HTML sémantique et accessible."),

    H('Règles absolues sur les assets'),
    L(
      'Utiliser exactement les couleurs et le fond fournis, sans les modifier',
      "Utiliser uniquement l'image hero fournie — aucune image externe",
      'Pour les autres sections : CSS, SVG, gradients (pas d\'images stock)',
    ),

    H('Structure du site'),
    NUM(
      'Navbar sticky avec blur au scroll',
      'Hero full-width 100vh — texte à gauche (titre XXL + description + 2 CTA), image avec effet Ken Burns + parallax, overlay dégradé',
      'Section à propos (bento layout)',
      'Section services (cards glassmorphism)',
      'Section galerie',
      'Section témoignages (marquee infini)',
      'Section contact (localisation + contact cliquable)',
      'Footer minimaliste',
    ),
    P('CTA hero : bouton 1 → WhatsApp ou tel: · bouton 2 → scroll smooth vers la section suivante.'),

    H('Librairies (CDN)'),
    L('GSAP + ScrollTrigger', 'Lenis (smooth scroll)'),

    H('Effets obligatoires'),
    CHK(
      'Smooth scroll global',
      'Curseur personnalisé qui grossit au hover',
      'Split text animé sur le titre hero',
      'Reveal au scroll (fade + slide + stagger)',
      'Parallax multi-couches',
      'Ken Burns infini sur l\'image hero',
      'Magnetic buttons',
      'Marquee infini pour les témoignages',
      'Compteurs animés',
      'Noise texture overlay (grain)',
      'Loader élégant au chargement',
      'Hover tilt 3D sur les cards',
      'Underline animé sur les liens',
    ),

    H('Responsive et performance'),
    L('Mobile-first', 'Breakpoints : 480 / 768 / 1024 / 1440 px', 'Typographie fluide avec clamp()', 'prefers-reduced-motion respecté', 'Objectif Lighthouse 90+', 'Animations à 60 fps'),

    H('Livraison'),
    CODE("📁 Structure du projet :\n   /nom-du-site\n     ├── index.html\n     ├── style.css   (si séparé)\n     └── script.js   (si séparé)\n\n💻 Commande de lancement :\n   npx serve .        # ou python3 -m http.server 3000\n\n🔗 Lien de prévisualisation :\n   http://localhost:XXXX"),
  ],
})

sop({
  slug: 'ng-design-prompts-visuels-ia', category: 'designer', popular: false, read_min: 4,
  title: 'Rédiger les prompts de génération d\'images et d\'icônes',
  description: "Produire une collection visuelle cohérente pour un site : un prompt par service, règles de style, interdits (texte, logo, watermark) et format de sortie standardisé.",
  tags: ['Prompt', 'Images IA', 'Icônes', 'Midjourney', 'Design'],
  blocks: [
    CO('tip', 'Objectif', "Créer une collection visuelle complète et cohérente : une image par service, dans un univers visuel unique adapté au secteur du projet."),

    H('Consignes pour les images'),
    L(
      'Une image = un service',
      'Visuel fort, symbolique et professionnel',
      'Style cohérent entre toutes les images',
      'Univers visuel adapté au projet (médical, tech, luxe…)',
      'Scènes réalistes ou abstraites premium',
    ),
    CO('danger', 'Interdits', "Aucun texte · aucun logo · aucun watermark · aucun aspect publicitaire."),

    H('Style des images'),
    L('cinematic lighting', 'ultra realistic', '4K', 'minimal design', 'depth of field', 'composition centrée'),

    H('Style des icônes'),
    L('Flat ou semi-3D', 'Cohérence avec les images', 'Couleurs du projet', 'Fond transparent', 'Lisible en petite taille'),

    H('Format de sortie'),
    TPL("Service : [Nom du service]\n\nPrompt IMAGE :\n[prompt complet en anglais, style + sujet + composition + lumière + rendu]\n\nPrompt ICÔNE :\n[prompt complet, style flat/semi-3D, fond transparent]"),

    CO('info', 'Outils compatibles', "Midjourney · DALL·E 3 · Leonardo AI · Stable Diffusion · Flux · Higgsfield."),
  ],
})

sop({
  slug: 'ng-design-charte-ints-oujda', category: 'designer', popular: false, read_min: 2,
  title: 'Référence — charte graphique INTS Oujda',
  description: "Palette de couleurs, rôles et typographie recommandée pour les supports de l'INTS (institut) — duo bleu institutionnel + vert, avec support arabe.",
  tags: ['Charte', 'INTS', 'Palette', 'Typographie', 'Référence client'],
  blocks: [
    CO('info', 'Logique de la palette', "Duo bleu + vert du registre académique et institutionnel : le bleu transmet la rigueur et la confiance, le vert apporte la croissance, la fraîcheur et l'aspect scientifique."),

    H('Palette de couleurs'),
    TBL(['Rôle', 'Couleur', 'HEX', 'Usage recommandé'], [
      ['Primaire', 'Bleu profond', '#1B3F8B', 'Titres principaux, éléments forts, navigation, en-tête'],
      ['Secondaire', 'Vert pomme / lime', '#7AB929', 'Accents, boutons d\'action (CTA), soulignements, icônes'],
      ['Tertiaire', 'Bleu acier', '#2E6FB5', 'Sous-titres, liens, éléments secondaires'],
      ['Texte principal', 'Bleu marine sombre', '#15264F', 'Corps de texte sur fond clair'],
      ['Arrière-plan principal', 'Blanc pur', '#FFFFFF', 'Fond global du site'],
      ['Arrière-plan alternatif', 'Gris très clair', '#F5F7FA', 'Sections alternées, cartes'],
      ['Bordures / séparateurs', 'Gris doux', '#E2E8F0', 'Lignes, contours subtils'],
    ]),

    H('Typographie'),
    P("Le logo utilise une police sans-serif géométrique, condensée et grasse pour le sigle, et une variante plus fine et espacée pour le sous-titre français."),
    TBL(['Usage', 'Police suggérée', 'Alternative', 'Poids'], [
      ['Titres principaux (H1, H2)', 'Montserrat', 'Poppins, Raleway', '700–800'],
      ['Sous-titres (H3, H4)', 'Montserrat', 'Inter', '600'],
      ['Texte courant', 'Open Sans / Inter', 'Lato, Source Sans Pro', '400'],
      ['Texte arabe', 'Tajawal / Cairo', 'Almarai', '400–700'],
      ['Citations / accents', 'Montserrat Italic', '—', '500'],
    ]),
  ],
})

/* ════════════════════════════════════════════════════════════════
   CATÉGORIE : media_buyer & marketing
   ════════════════════════════════════════════════════════════════ */

sop({
  slug: 'ng-mb-fiche-google-maps-creation', category: 'media_buyer', popular: false, read_min: 3,
  title: 'Créer une fiche Google Maps (Google Business Profile)',
  description: "Créer et faire valider une fiche professionnelle : informations à renseigner, types de vérification, et les conditions qui augmentent les chances d'obtenir la validation sans suspension.",
  tags: ['Google Maps', 'GMB', 'SEO local', 'Vérification'],
  blocks: [
    CO('info', 'Prérequis fortement recommandé', "Créer le site web AVANT la fiche Google Maps, avec un email lié au domaine (ex : contact@<domaine>) : cela augmente fortement les chances de validation."),

    H('Étapes de création'),
    NUM(
      'Aller sur business.google.com',
      'Cliquer sur « Gérer maintenant »',
      'Se connecter avec le compte Google professionnel',
      'Renseigner : nom de l\'entreprise, catégorie, adresse ou zone de service, téléphone, site web, horaires, photos et logo',
      "Valider l'entreprise (SMS, vidéo, appel vidéo ou courrier)",
    ),

    H('Types de vérification'),
    P("Google demande très souvent une vérification par email professionnel, vidéo, SMS ou appel vidéo. Le type est choisi automatiquement selon le niveau de confiance du profil."),

    H('Éviter les suspensions'),
    CHK(
      'Utiliser un vrai domaine professionnel',
      'Ajouter le site web',
      'Utiliser un numéro de téléphone réel',
      'Ajouter logo et photos réelles',
      'Compléter totalement le profil AVANT publication',
      'Éviter les mots interdits ou à connotation spam dans le nom',
    ),

    CO('success', 'Après validation', "L'entreprise apparaît sur Google Maps et dans la recherche Google. La création est gratuite."),
  ],
})

sop({
  slug: 'ng-mkt-audit-seo-geo', category: 'marketing', popular: true, read_min: 9,
  title: 'Audit SEO + GEO — être cité par Google ET par les IA',
  description: "Audit chiffré en 9 sections : verdict /100, SEO technique, contenu, GEO (citabilité par les LLM), autorité EEAT, conversion, concurrence, plan 90 jours et 5 pages à créer.",
  tags: ['SEO', 'GEO', 'IA', 'Audit', 'Core Web Vitals', 'EEAT'],
  blocks: [
    CO('info', 'Posture', "Auditeur SEO + GEO senior. Ni coach motivationnel, ni consultant qui vend du rêve : technique, chiffré, et refusant de dire « c'est bien » quand c'est moyen."),

    H('Règles strictes'),
    NUM(
      'Aucune généralité — donner l\'action exacte, jamais « améliorer le contenu »',
      'Tout chiffrer — chaque catégorie notée sur /100 avec justification factuelle',
      'Toujours benchmarker — donner le seuil cible (ex : LCP à 4,2 s, cible < 2,5 s)',
      'Toujours l\'impact business — chaque problème → estimation de perte de trafic ou de CA',
      'Pas de blabla introductif — commencer directement par le scoring global',
      'Si une donnée n\'est pas vérifiable → écrire [NON VÉRIFIABLE SANS ACCÈS OUTIL] plutôt que d\'inventer',
      'Format : tableaux et listes structurées, pas de pavés',
    ),

    H('Section 0 — Verdict en 30 secondes'),
    TBL(['Indicateur', 'Note /100'], [
      ['SEO technique', '__'],
      ['SEO contenu', '__'],
      ['GEO (IA)', '__'],
      ['Autorité / EEAT', '__'],
      ['Conversion', '__'],
      ['Score global pondéré', '__'],
    ]),
    P("Puis : diagnostic en 1 phrase brutale (cause racine, pas symptôme) et potentiel réaliste à 12 mois si les actions sont exécutées."),

    H('Section 1 — SEO technique'),
    TBL(['Métrique', 'Cible 2026'], [
      ['LCP', '< 2,5 s'], ['INP', '< 200 ms'], ['CLS', '< 0,1'], ['TTFB', '< 800 ms'],
    ]),
    L('Profondeur de clic max', 'Sitemap XML : présent / absent / erreurs', 'robots.txt conforme ou bloquant', 'Pages orphelines', 'Erreurs 4xx/5xx', 'Canonicals et duplications', 'Hiérarchie H1→H3', 'Titles et meta descriptions', 'Données structurées', 'Hreflang si multilingue', 'Mobile-first, tap targets, viewport, contraste'),

    H('Section 2 — SEO contenu'),
    L('Profondeur moyenne par page', 'Ratio pages utiles / pages vides', 'Couverture des intentions de recherche', 'Pages cannibalisées', 'Pages zombies (0 trafic, 0 lien, 0 conversion)', 'Gap analyse vs concurrents (mot-clé, volume, qui ranke, opportunité)'),

    H('Section 3 — GEO (Generative Engine Optimization)'),
    P("Question centrale : si un utilisateur pose une question dans ChatGPT / Gemini / Perplexity sur ce secteur, ce site sera-t-il cité comme source ?"),
    CHK(
      'Réponses directes en haut de page (définition + chiffre clé)',
      'Chunks sémantiques de 40-80 mots autonomes',
      'Données chiffrées concrètes (prix, %, dates, stats)',
      'FAQ structurée avec schema FAQPage',
      'Tableaux comparatifs scrapables',
      'Auteur identifié + bio expert (E-E-A-T)',
      'Citations de sources externes',
      'Mentions de marque dans la presse, Wikipédia, Reddit',
    ),
    P("Simuler 3 requêtes que poserait un client cible dans une IA et évaluer si le site serait cité (oui / non / probable), en expliquant pourquoi."),

    H('Section 4 — Autorité & EEAT'),
    L('Profil de backlinks (qualité, pas quantité)', 'Mentions de marque non liées', 'Signaux de confiance visibles', 'Page « À propos » — niveau de preuve', 'Auteurs identifiés et crédibles', 'Différenciation réelle vs concurrents'),

    H('Section 5 — Conversion'),
    L('Promesse claire en homepage en < 5 secondes', 'Proof points', 'CTA principal visible / faible / absent', 'Frictions (formulaires longs, pas de pricing, pas de WhatsApp)', 'Trust signals (HTTPS, mentions légales, RGPD, garanties)', 'Taux estimé actuel vs potentiel + impact CA mensuel du gap'),

    H('Section 7 — Plan d\'action 90 jours (matrice impact × effort)'),
    L(
      '🔴 Semaine 1-2 — quick wins : impact élevé, effort faible',
      '🟠 Mois 1 — impact élevé, effort moyen',
      '🟡 Mois 2-3 — impact élevé, effort élevé',
      '❌ À NE PAS FAIRE — pièges classiques du secteur',
    ),

    H('Section 8 — 5 pages SEO+GEO à créer'),
    TPL("Page #N\n- URL slug :\n- Title (60 car max) :\n- Meta description (155 car max) :\n- Intention de recherche ciblée :\n- Mot-clé principal + 3 secondaires :\n- Volume mensuel estimé :\n- Structure : H1, H2 (×5 à 8), H3\n- Bloc GEO (réponse directe pour IA, 40-60 mots) :\n- Schema.org recommandé :\n- CTA en bas de page :\n- Maillage interne : lier vers pages X, Y, Z"),

    H('Section 9 — Autocritique de l\'audit'),
    NUM(
      'Les 3 limites de cette analyse (pas d\'accès Search Console, pas de données backlinks réelles…)',
      'Les outils à lancer pour valider les hypothèses (PageSpeed Insights, Ahrefs, Screaming Frog, GSC)',
      'Où investir en priorité le budget du mois',
    ),
    CO('warning', 'Contrainte finale', "Ne pas terminer par une formule polie. Terminer par une seule phrase qui résume la décision business à prendre cette semaine."),
  ],
})

sop({
  slug: 'ng-mkt-mots-cles-services-digitaux', category: 'marketing', popular: false, read_min: 2,
  title: 'Mots-clés de référence — services digitaux (FR)',
  description: "Le vocabulaire à utiliser dans les pages, annonces et fiches Google pour couvrir les intentions de recherche des clients : web, développement, maintenance, digitalisation, systèmes et reporting.",
  tags: ['Mots-clés', 'SEO', 'Vocabulaire', 'Référence'],
  blocks: [
    CO('tip', 'Usage', "Piocher dans ces familles pour rédiger les titles, H1, descriptions de services, annonces Google Ads et la catégorie de la fiche Google Business."),

    H('🌐 Sites web'),
    L('site web', 'développement web', 'création site', 'portail web'),

    H('💻 Programmation et développement'),
    L('application informatique', 'développement logiciel', 'système informatique', 'plateforme numérique'),

    H('🔧 Maintenance et support'),
    L('maintenance informatique', 'maintenance site web', 'assistance technique informatique'),

    H('📱 Transformation digitale'),
    L('transformation numérique', 'numérisation', 'digitalisation'),

    H('🗄️ Bases de données et systèmes'),
    L('base de données', 'ERP', 'système de gestion', 'CRM'),

    H('📊 Tableaux de bord et reporting'),
    L('tableau de bord', 'reporting', 'business intelligence'),
  ],
})

/* ════════════════════════════════════════════════════════════════
   CATÉGORIE : delivery
   ════════════════════════════════════════════════════════════════ */

sop({
  slug: 'ng-del-verification-locale-avant-livraison', category: 'delivery', popular: true, read_min: 3,
  title: 'Vérification complète en local avant de livrer',
  description: "Le contrôle obligatoire avant toute remise de travail : lancer l'application, se connecter, tester chaque fonctionnalité de bout en bout et confirmer explicitement page par page.",
  tags: ['Livraison', 'QA', 'Tests', 'Localhost'],
  blocks: [
    CO('danger', 'Règle', "Le client ne doit jamais découvrir les bugs. Tout ce qui ne marche pas se règle AVANT la remise."),

    H('Procédure'),
    NUM(
      "Lancer l'application sur localhost",
      'Se connecter avec un compte de test de chaque rôle',
      'Tester chaque fonctionnalité de bout en bout',
      'Confirmer explicitement que tout fonctionne — page par page, fonctionnalité par fonctionnalité',
    ),

    H('Ce qui doit être testé'),
    CHK(
      'Connexion et déconnexion',
      'Tableau de bord',
      'Navigation complète',
      'Appels API',
      'Opérations CRUD',
      'Recherche et filtres',
      'Tableaux et graphiques',
      'Formulaires et validations',
      'Paramètres et gestion des utilisateurs',
      'Responsive mobile / tablette / desktop',
      'Mode sombre',
      'Gestion des erreurs',
    ),

    H('Format de confirmation attendu'),
    TPL("Page : [Nom]\nTest réalisé : [ce qui a été testé]\nRésultat : PASS / FAIL"),
  ],
})

sop({
  slug: 'ng-del-generation-site-premium', category: 'delivery', popular: false, read_min: 5,
  title: 'Générer un site web premium de bout en bout',
  description: "Cadre de production autonome d'un site vitrine complet : informations projet à collecter, contenu à générer, consignes UX/UI, SEO à produire et livrables obligatoires.",
  tags: ['Site web', 'Production', 'SEO', 'UI Kit', 'Livraison'],
  blocks: [
    CO('info', 'Posture', "Agence digitale : UX Designer senior + UI Designer premium + développeur front + expert SEO + directeur artistique + copywriter + expert conversion."),

    H('Informations du projet à collecter'),
    L('Nom du projet et activité', 'Objectif principal (leads / réservations / ventes / branding)', 'Public cible', 'Style souhaité (premium, luxe, moderne, minimaliste, corporate, SaaS)', 'Langues (FR / AR / EN)', 'Couleurs souhaitées', 'Fonctionnalités (WhatsApp, formulaire, blog, dashboard, réservation, API, paiement, SEO, animations)', 'Pages du site'),

    H('Contenu à générer'),
    L('Hero section premium', 'Sections marketing modernes', 'CTA puissants', 'Présentation entreprise', 'Services détaillés', 'Témoignages clients', 'Statistiques animées', 'FAQ optimisée SEO', 'Section contact', 'Footer premium', 'Navigation moderne', 'Version mobile optimisée'),

    H('Consignes UX/UI'),
    L('Hiérarchie visuelle haut de gamme', 'Expérience fluide et moderne, style SaaS/startup', 'Animations élégantes et légères', 'Espaces blancs premium', 'CTA modernes et optimisés conversion', 'Responsive parfait mobile / tablette / desktop', 'Micro-interactions et effets hover premium', 'Core Web Vitals optimisés'),

    H('SEO à générer'),
    L('Meta title et meta description', 'Open Graph', 'Schema.org', 'Sitemap', 'URLs SEO', 'H1 / H2 / H3', 'Mots-clés stratégiques', 'SEO local', 'Optimisation Lighthouse'),

    H('Livrables obligatoires'),
    NUM(
      'Structure complète des pages',
      'UI Kit complet et design system',
      'Responsive design',
      'Code complet',
      'Architecture SEO',
      'Optimisation performance',
      'Instructions de déploiement',
      'Version mobile optimisée',
      'Preview finale et lien de prévisualisation',
      'Structure du dossier projet',
      'Animations utilisées, stack technique, fonts et couleurs',
    ),
  ],
})

/* ════════════════════════════════════════════════════════════════
   Construction du SQL
   ════════════════════════════════════════════════════════════════ */

const sqlEsc = (s) => String(s).replace(/'/g, "''")

/* Garde-fous : slug unique, pas de $sop$ dans le contenu, pas de secret évident. */
const seen = new Set()
const SECRET_PATTERNS = [
  /\br8_[A-Za-z0-9]{20,}/,                    // token Replicate
  /\bsk-[A-Za-z0-9_-]{20,}/,                  // clé OpenAI
  /BEGIN (OPENSSH|RSA) PRIVATE KEY/,          // clé privée SSH
  /cloudinary:\/\/[0-9]+:[A-Za-z0-9]/,        // URL Cloudinary avec secret
]
for (const s of SOPS) {
  if (seen.has(s.slug)) throw new Error(`Slug dupliqué : ${s.slug}`)
  seen.add(s.slug)
  const json = JSON.stringify(s.blocks)
  if (json.includes('$sop$')) throw new Error(`Le marqueur $sop$ apparaît dans ${s.slug}`)
  for (const re of SECRET_PATTERNS) {
    if (re.test(json)) throw new Error(`Secret potentiel détecté dans ${s.slug} (${re})`)
  }
}

const lines = []
lines.push('-- ════════════════════════════════════════════════════════════════════')
lines.push(`--  GestiQ — Migration 046 : Seed des ${SOPS.length} SOPs « Claude Code / DevOps / IA »`)
lines.push('--  Date : 2026-08-31')
lines.push('--')
lines.push('--  Source : bibliothèque de procédures internes Next Gital (export Notion).')
lines.push('--  Généré par : scripts/generate-sops-claude-code.mjs — NE PAS ÉDITER À LA MAIN.')
lines.push('--  Insère uniquement pour les tenants disposant déjà du catalogue SOP')
lines.push('--  Next Gital (au moins un slug ng-%). Idempotent (WHERE NOT EXISTS).')
lines.push('--')
lines.push('--  Conformité ARCHITECTURE_TENANT.md :')
lines.push('--    - tenant_id NOT NULL, contrôle d\'existence par (tenant_id, slug)')
lines.push('--    - RLS déjà actif sur public.sops (migration 025)')
lines.push('--    - Aucune modification de structure')
lines.push('--    - Aucun secret réel (clés API, mots de passe, clés SSH) : placeholders uniquement')
lines.push('-- ════════════════════════════════════════════════════════════════════')
lines.push('')
lines.push('BEGIN;')
lines.push('')

for (const s of SOPS) {
  lines.push(`-- ── ${s.slug} (${s.category}) ────`)
  lines.push('INSERT INTO public.sops (tenant_id, slug, title, description, category, tags, author, read_min, popular, blocks)')
  lines.push('SELECT t.id,')
  lines.push(`  '${sqlEsc(s.slug)}',`)
  lines.push(`  '${sqlEsc(s.title)}',`)
  lines.push(`  '${sqlEsc(s.description)}',`)
  lines.push(`  '${sqlEsc(s.category)}',`)
  lines.push(`  '${sqlEsc(JSON.stringify(s.tags))}'::jsonb,`)
  lines.push("  'Next Gital',")
  lines.push(`  ${s.read_min},`)
  lines.push(`  ${s.popular},`)
  lines.push(`  $sop$${JSON.stringify(s.blocks)}$sop$::jsonb`)
  lines.push('FROM public.tenants t')
  lines.push("WHERE EXISTS (SELECT 1 FROM public.sops b WHERE b.tenant_id = t.id AND b.slug LIKE 'ng-%')")
  lines.push(`  AND NOT EXISTS (SELECT 1 FROM public.sops WHERE tenant_id = t.id AND slug = '${sqlEsc(s.slug)}');`)
  lines.push('')
}

lines.push('COMMIT;')
lines.push('')
lines.push('-- Vérification :')
lines.push("--   SELECT category, COUNT(DISTINCT slug) FROM sops GROUP BY category ORDER BY category;")
lines.push(`--   Attendu : +${SOPS.length} slugs distincts × nb_tenants`)
lines.push('')

writeFileSync(OUT, lines.join('\n'), 'utf8')

const byCat = {}
for (const s of SOPS) byCat[s.category] = (byCat[s.category] ?? 0) + 1
console.log(`✓ ${SOPS.length} SOPs générés → ${OUT}`)
for (const [cat, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${cat.padEnd(20)} ${n}`)
}
