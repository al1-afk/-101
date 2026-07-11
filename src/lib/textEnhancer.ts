/**
 * textEnhancer — moteur local de correction, reformulation et génération
 * de texte, sans dépendance API externe.
 *
 * Cible : contenu francophone (avec support arabe de base pour la ponctuation).
 * Approche : règles typographiques + dictionnaire de fautes fréquentes +
 * transformations stylistiques déterministes.
 *
 * Utilisation :
 *   correctText(input)                  → texte corrigé
 *   rewriteText(input, style)           → texte reformulé
 *   generateText(subject, kind)         → texte généré à partir d'un sujet
 */

/* ═══════════════════════════════════════════════════════════════════
   1. CORRECTION — typographie + dictionnaire de fautes courantes
═══════════════════════════════════════════════════════════════════ */

/** Fautes fréquentes → forme correcte (FR). */
const COMMON_TYPOS: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  // Orthographe classique
  [/\bpar contre\b/gi,        'en revanche'],   // registre soutenu (optionnel)
  [/\bcelà\b/g,               'cela'],
  [/\bparceque\b/gi,          'parce que'],
  [/\bau jour d['']hui\b/gi,  'aujourd’hui'],
  [/\baujourdhui\b/gi,        'aujourd’hui'],
  [/\bmalgres\b/gi,           'malgré'],
  [/\bmalgrés\b/gi,           'malgré'],
  [/\bquant meme\b/gi,        'quand même'],
  [/\bquand meme\b/gi,        'quand même'],
  [/\bquoiqu'?il en soit\b/gi,'quoi qu’il en soit'],
  [/\ben faite\b/gi,          'en fait'],
  [/\bsavoir faire\b/gi,      'savoir-faire'],
  [/\bmise a jour\b/gi,       'mise à jour'],
  [/\ba la fois\b/gi,         'à la fois'],
  [/\bvis a vis\b/gi,         'vis-à-vis'],
  [/\bpeut etre\b/gi,         'peut-être'],
  [/\bd'?ailleur\b/gi,        'd’ailleurs'],
  [/\bhonnetement\b/gi,       'honnêtement'],
  [/\bevidement\b/gi,         'évidemment'],
  [/\bfrancais\b/gi,          'français'],
  [/\bça va\b/gi,             'ça va'],
  [/\bca va\b/g,              'ça va'],

  // Ligatures œ / æ
  [/\bcoeur\b/gi,             'cœur'],
  [/\bsoeur\b/gi,             'sœur'],
  [/\boeuvre\b/gi,            'œuvre'],
  [/\boeuf\b/gi,              'œuf'],
  [/\bnoeud\b/gi,             'nœud'],
  [/\bvoeu\b/gi,              'vœu'],

  // Accents oubliés courants
  [/\ba propos\b/gi,          'à propos'],
  [/\bdeja\b/gi,              'déjà'],
  [/\bvoila\b/gi,             'voilà'],
  [/\ble mien(s?)\b/g,        (_, s) => 'le mien' + (s || '')],
  [/\bou(?= ou )/gi,          'où'],
]

/**
 * Corrige la typographie française : ponctuation, espaces, guillemets,
 * apostrophes typographiques, capitalisation.
 */
function fixTypography(input: string): string {
  let s = input

  // Normaliser les fins de ligne
  s = s.replace(/\r\n/g, '\n')

  // Retirer les espaces en fin de ligne
  s = s.replace(/[ \t]+\n/g, '\n')

  // Compression : plus de 2 sauts de ligne → 2
  s = s.replace(/\n{3,}/g, '\n\n')

  // Espaces multiples → un seul
  s = s.replace(/[ \t]{2,}/g, ' ')

  // Espaces fantômes autour des sauts de ligne
  s = s.replace(/ +\n/g, '\n').replace(/\n +/g, '\n')

  // Apostrophes typographiques (' → ’) hors code
  s = s.replace(/(\w)'(\w)/g, '$1’$2')

  // Guillemets doubles → chevrons français avec espaces insécables
  //  "..." → « ... »
  s = s.replace(/"([^"\n]{1,300})"/g, '« $1 »')

  // Ponctuation double (: ; ! ? %) : espace insécable avant, espace après
  s = s.replace(/\s*([:;!?%])/g, ' $1')
  //   nettoyer si plusieurs   accolés
  s = s.replace(/ +/g, ' ')
  //   assurer un espace après si suivi d'une lettre
  s = s.replace(/([:;!?%])(?=\S)/g, '$1 ')

  // Virgule / point : pas d'espace avant, un espace après
  s = s.replace(/\s+([,.])/g, '$1')
  s = s.replace(/([,.])(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1 ')

  // Points de suspension ...  → …
  s = s.replace(/\.{3,}/g, '…')

  // Tiret cadratin autour : « - » → « — »
  s = s.replace(/(\s)-(\s)/g, '$1—$2')

  // Espace fine avant tiret cadratin
  s = s.replace(/—/g, '—')

  return s
}

/** Capitalise la première lettre après un point / ! / ?  */
function capitalizeSentences(input: string): string {
  // Capital sur le tout premier caractère non-espace
  let s = input.replace(/^(\s*)([a-zà-ÿ])/, (_, ws, ch) => ws + ch.toUpperCase())
  // Après un . / ! / ? / … suivi d'espace(s)
  s = s.replace(/([.!?…])(\s+)([a-zà-ÿ])/g, (_, p, sp, ch) => p + sp + ch.toUpperCase())
  return s
}

/** Applique le dictionnaire des fautes fréquentes. */
function applyTypoDictionary(input: string): string {
  let s = input
  for (const [rx, rep] of COMMON_TYPOS) {
    s = s.replace(rx, rep as any)
  }
  return s
}

/**
 * Corrige le texte : typographie + fautes courantes + capitalisation.
 * Idempotent : appliquer plusieurs fois donne le même résultat.
 */
export function correctText(input: string): string {
  if (!input) return input
  let s = applyTypoDictionary(input)
  s = fixTypography(s)
  s = capitalizeSentences(s)
  // Trim final mais préserve un \n final si présent
  const trailingNewline = /\n$/.test(input)
  s = s.trim()
  if (trailingNewline) s += '\n'
  return s
}

/* ═══════════════════════════════════════════════════════════════════
   2. REFORMULATION — transformations stylistiques
═══════════════════════════════════════════════════════════════════ */

export type RewriteStyle =
  | 'professionnel'
  | 'commercial'
  | 'poli'
  | 'technique'
  | 'court'
  | 'detaille'

/** Mots de remplissage à supprimer pour un style court. */
const FILLER_WORDS = [
  /\b(du coup|en fait|en vrai|un peu|assez|vraiment|carrément|clairement)\b\s*,?\s*/gi,
  /\b(donc\b\s*,?\s*){2,}/gi,   // "donc donc"
  /\b(bah|ben|hein)\b\s*,?\s*/gi,
]

/** Reformulation informelle → polie (tu → vous, etc.) */
const POLITE_MAP: Array<[RegExp, string]> = [
  [/\bsalut\b/gi,               'Bonjour'],
  [/\bcoucou\b/gi,               'Bonjour'],
  [/\bmerci d'?avance\b/gi,     'Je vous remercie par avance'],
  [/\bà\+/gi,                    'À bientôt'],
  [/\bà plus\b/gi,               'À bientôt'],
  [/\bcordi\b/gi,                'Cordialement'],
  [/\btu peux\b/gi,              'pouvez-vous'],
  [/\btu as\b/gi,                'vous avez'],
  [/\btu vas\b/gi,               'vous allez'],
  [/\bta\b(?= [a-z])/gi,         'votre'],
  [/\bton\b(?= [a-z])/gi,        'votre'],
  [/\btu\b/gi,                   'vous'],
]

/** Préfixes / suffixes pour un style commercial. */
const COMMERCIAL_HOOKS = {
  intro: ['Découvrez', 'Profitez de', 'Bénéficiez de'],
  outro: [
    'N’hésitez pas à nous contacter pour toute information complémentaire.',
    'Notre équipe reste à votre entière disposition.',
    'Contactez-nous dès aujourd’hui pour en savoir plus.',
  ],
}

/** Reformule le texte selon un style choisi. */
export function rewriteText(input: string, style: RewriteStyle): string {
  if (!input) return input
  let s = correctText(input)

  switch (style) {
    case 'court': {
      // Supprimer mots de remplissage
      for (const rx of FILLER_WORDS) s = s.replace(rx, '')
      // Supprimer redondances "et et", "de de"
      s = s.replace(/\b(\w+)\s+\1\b/gi, '$1')
      // Enlever adverbes en -ment doublés
      s = s.replace(/\s{2,}/g, ' ')
      return correctText(s)
    }

    case 'poli': {
      for (const [rx, rep] of POLITE_MAP) s = s.replace(rx, rep)
      // Ajouter formule de politesse si absente
      if (!/cordialement|bien à vous|salutations/i.test(s)) {
        s = s.replace(/\s*$/, '\n\nCordialement,')
      }
      return correctText(s)
    }

    case 'professionnel': {
      // Registre soutenu
      const map: Array<[RegExp, string]> = [
        [/\bboulot\b/gi,           'travail'],
        [/\btruc\b/gi,             'élément'],
        [/\bchose\b/gi,            'élément'],
        [/\bfaire\b/gi,            'réaliser'],
        [/\bavoir\b/gi,            'disposer de'],
        [/\bgrave\b/gi,            'sérieux'],
        [/\bcool\b/gi,             'appréciable'],
        [/\bsuper\b/gi,            'excellent'],
        [/\bnickel\b/gi,           'parfait'],
      ]
      for (const [rx, rep] of map) s = s.replace(rx, rep)
      return correctText(s)
    }

    case 'commercial': {
      // Ajouter accroche + call-to-action
      const intro = COMMERCIAL_HOOKS.intro[Math.floor(Math.random() * COMMERCIAL_HOOKS.intro.length)]
      const outro = COMMERCIAL_HOOKS.outro[Math.floor(Math.random() * COMMERCIAL_HOOKS.outro.length)]
      // Ne pas dupliquer si déjà présent
      if (!s.toLowerCase().startsWith(intro.toLowerCase().slice(0, 8))) {
        s = intro + ' ' + s.charAt(0).toLowerCase() + s.slice(1)
      }
      if (!/contact|n'?hésitez|disposition/i.test(s)) {
        s = s.replace(/\s*$/, '\n\n' + outro)
      }
      return correctText(s)
    }

    case 'technique': {
      // Enrichir avec structure : listes à puces
      const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean)
      if (sentences.length >= 3) {
        const [head, ...rest] = sentences
        s = head + '\n\nPoints clés :\n' + rest.map(x => '• ' + x.trim()).join('\n')
      }
      return correctText(s)
    }

    case 'detaille': {
      // Étoffer avec transitions et contextes
      const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean)
      if (sentences.length >= 2) {
        const transitions = ['En effet, ', 'Par ailleurs, ', 'De plus, ', 'Il convient de noter que ']
        const enriched = sentences.map((sent, i) => {
          if (i === 0) return sent
          const t = transitions[(i - 1) % transitions.length]
          const lc = sent.charAt(0).toLowerCase() + sent.slice(1)
          return t + lc
        })
        s = enriched.join(' ')
      }
      return correctText(s)
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   3. GÉNÉRATION — templates paramétrés par domaine
═══════════════════════════════════════════════════════════════════ */

export type GenerationKind =
  | 'tache'          // Description de tâche à partir d'un titre
  | 'produit'        // Description produit à partir d'un nom
  | 'devis'          // Ligne de devis à partir d'un service
  | 'facture'        // Ligne de facture
  | 'projet'         // Description projet à partir d'un nom
  | 'rapport'        // Structure de rapport à partir d'un sujet
  | 'email'          // Email pro à partir d'un objet

const TEMPLATES: Record<GenerationKind, (subject: string) => string> = {
  tache: (t) => [
    `Objectif : ${t}.`,
    ``,
    `Étapes clés :`,
    `• Analyser le besoin et rassembler les éléments nécessaires`,
    `• Réaliser la tâche selon les standards de qualité`,
    `• Contrôler et documenter le résultat`,
    ``,
    `Livrable attendu : résultat conforme et validé.`,
  ].join('\n'),

  produit: (n) => [
    `${n} — un choix professionnel de qualité supérieure.`,
    ``,
    `Caractéristiques principales :`,
    `• Conception soignée pour un usage durable`,
    `• Performances fiables et constantes`,
    `• Compatible avec les besoins des équipes professionnelles`,
    ``,
    `Idéal pour les entreprises exigeantes qui recherchent robustesse et efficacité.`,
  ].join('\n'),

  devis: (s) => `Prestation : ${s}. Réalisation professionnelle incluant analyse, mise en œuvre et suivi. Livraison dans les délais convenus, avec support technique inclus.`,

  facture: (s) => `Prestation réalisée : ${s}. Service effectué conformément au devis validé, dans le respect des délais et des standards de qualité.`,

  projet: (n) => [
    `Projet : ${n}.`,
    ``,
    `Ce projet vise à répondre aux besoins spécifiques du client par une approche structurée et méthodique.`,
    ``,
    `Livrables :`,
    `• Cahier des charges détaillé`,
    `• Réalisation conforme aux spécifications`,
    `• Documentation complète`,
    `• Support post-livraison`,
  ].join('\n'),

  rapport: (s) => [
    `Rapport sur : ${s}`,
    ``,
    `1. Contexte`,
    `Présentation du contexte et des objectifs.`,
    ``,
    `2. Analyse`,
    `Étude détaillée des éléments observés.`,
    ``,
    `3. Résultats`,
    `Synthèse des principaux résultats obtenus.`,
    ``,
    `4. Recommandations`,
    `Actions à mettre en place et perspectives.`,
    ``,
    `5. Conclusion`,
    `Synthèse générale et prochaines étapes.`,
  ].join('\n'),

  email: (o) => [
    `Bonjour,`,
    ``,
    `Suite à ${o}, je me permets de vous adresser ce message.`,
    ``,
    `[Développer ici le contexte et la demande]`,
    ``,
    `Je reste à votre disposition pour tout complément d'information.`,
    ``,
    `Cordialement,`,
  ].join('\n'),
}

/** Génère un texte à partir d'un sujet court et d'un type de contenu. */
export function generateText(subject: string, kind: GenerationKind): string {
  const t = (subject || '').trim()
  if (!t) return ''
  return correctText(TEMPLATES[kind](t))
}

/* ═══════════════════════════════════════════════════════════════════
   4. MÉTA — statistiques utiles (nb de corrections, diff)
═══════════════════════════════════════════════════════════════════ */

/** Retourne le nombre de caractères modifiés entre deux versions. */
export function diffCount(a: string, b: string): number {
  if (a === b) return 0
  const min = Math.min(a.length, b.length)
  let same = 0
  for (let i = 0; i < min; i++) {
    if (a[i] === b[i]) same++
    else break
  }
  return Math.max(a.length, b.length) - same
}
