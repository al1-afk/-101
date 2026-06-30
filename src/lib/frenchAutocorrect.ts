/**
 * Dictionnaire FR d'auto-correction (accents, cédilles, apostrophes).
 * Appliqué quand l'utilisateur tape un espace après un mot mal orthographié.
 *
 * Pour ajouter un mot : push une paire dans DICTIONARY ci-dessous.
 * Toutes les clés sont en minuscules. La casse du mot tapé est préservée
 * (`Recu` → `Reçu`, `RECU` → `REÇU`).
 */

export const DICTIONARY: Record<string, string> = {
  /* ── Cédilles ──────────────────────────────── */
  'recu':       'reçu',
  'recus':      'reçus',
  'recue':      'reçue',
  'recues':     'reçues',
  'ca':         'ça',
  'francais':   'français',
  'francaise':  'française',
  'francaises': 'françaises',
  'garcon':     'garçon',
  'garcons':    'garçons',
  'lecon':      'leçon',
  'lecons':     'leçons',
  'apercu':     'aperçu',
  'rancon':     'rançon',
  'soupcon':    'soupçon',
  'facon':      'façon',
  'facons':     'façons',
  'commencons': 'commençons',
  'avancons':   'avançons',

  /* ── Accents aigus (é) ─────────────────────── */
  'annee':      'année',
  'annees':     'années',
  'numero':     'numéro',
  'numeros':    'numéros',
  'reference':  'référence',
  'references': 'références',
  'general':    'général',
  'cle':        'clé',
  'cles':       'clés',
  'cliente':    'cliente',
  'societe':    'société',
  'societes':   'sociétés',
  'realise':    'réalisé',
  'realisee':   'réalisée',
  'realises':   'réalisés',
  'realisees':  'réalisées',
  'idee':       'idée',
  'idees':      'idées',
  'qualite':    'qualité',
  'qualites':   'qualités',
  'quantite':   'quantité',
  'quantites':  'quantités',
  'priorite':   'priorité',
  'priorites':  'priorités',
  'securite':   'sécurité',
  'activite':   'activité',
  'activites':  'activités',
  'realite':    'réalité',
  'comptabilite':'comptabilité',
  'echeance':   'échéance',
  'echeances':  'échéances',
  'detail':     'détail',
  'details':    'détails',
  'etape':      'étape',
  'etapes':     'étapes',
  'etat':       'état',
  'etats':      'états',
  'tache':      'tâche',
  'taches':     'tâches',

  /* ── Accents graves (è) ────────────────────── */
  'tres':       'très',
  'apres':      'après',
  'pres':       'près',
  'progres':    'progrès',
  'succes':     'succès',
  'acces':      'accès',
  'proces':     'procès',
  'deja':       'déjà',
  'voila':      'voilà',
  'derniere':   'dernière',
  'dernieres':  'dernières',
  'premiere':   'première',
  'premieres':  'premières',

  /* ── Accents circonflexes (ê, â, ô, û, î) ── */
  'meme':       'même',
  'memes':      'mêmes',
  'etre':       'être',
  'fete':       'fête',
  'fetes':      'fêtes',
  'cout':       'coût',
  'couts':      'coûts',
  'sur':        'sûr',  /* attention : "sur" comme préposition existe aussi */
  'bientot':    'bientôt',
  'plutot':     'plutôt',
  'depot':      'dépôt',
  'depots':     'dépôts',
  'hopital':    'hôpital',
  'hotel':      'hôtel',
  'controle':   'contrôle',
  'controles':  'contrôles',

  /* ── Trémas (ë, ï, ü) ─────────────────────── */
  'noel':       'noël',
  'naive':      'naïve',
  'mais':       'mais',  /* ne pas corriger en "maïs" par défaut */

  /* ── Apostrophes courantes ────────────────── */
  'cest':       "c'est",
  'sest':       "s'est",
  'nest':       "n'est",
  'jai':        "j'ai",
  'tai':        "t'ai",
  'cetait':     "c'était",
  'jetais':     "j'étais",
  'aujourdhui': "aujourd'hui",
  'quil':       "qu'il",
  'quelle':     "qu'elle",  /* attention : "quelle" pronom existe */
  'quon':       "qu'on",
  'dun':        "d'un",
  'dune':       "d'une",
  'lun':        "l'un",
  'lune':       "l'une",
  'sil':        "s'il",
  'svp':        "s'il vous plaît",
  'stp':        "s'il te plaît",

  /* ── Mots techniques agence/web ───────────── */
  'devis':      'devis',
  'facture':    'facture',
  'factures':   'facture',
  'reglement':  'règlement',
  'reglements': 'règlements',
  'echeancier': 'échéancier',
  'depense':    'dépense',
  'depenses':   'dépenses',
  'fournisseur':'fournisseur',
  'fournisseurs':'fournisseurs',
  'reception':  'réception',
  'creation':   'création',
  'modification':'modification',
  'verification':'vérification',
  'validation': 'validation',
  'integration':'intégration',
  'developpement':'développement',
  'developpe':  'développé',
  'developpee': 'développée',
  'creer':      'créer',
  'cree':       'créé',
  'creee':      'créée',
  'creees':     'créées',
  'crees':      'créés',
  'modele':     'modèle',
  'modeles':    'modèles',
  'systeme':    'système',
  'systemes':   'systèmes',
  'probleme':   'problème',
  'problemes':  'problèmes',
  'theme':      'thème',
  'themes':     'thèmes',
  'serveur':    'serveur',
  'reseau':     'réseau',
  'reseaux':    'réseaux',
  'video':      'vidéo',
  'videos':     'vidéos',
  'media':      'média',
  'medias':     'médias',

  /* ── Calendrier (jours / mois) ────────────── */
  'fevrier':    'février',
  'aout':       'août',
  'decembre':   'décembre',

  /* ── Politesse / formules commerciales ────── */
  'merci':      'merci',
  'salutations':'salutations',
  'cordialement':'cordialement',
  'amicalement':'amicalement',
}

/** Préserve la casse de l'original lorsqu'on remplace par la version corrigée. */
function matchCase(original: string, corrected: string): string {
  if (original === original.toUpperCase()) return corrected.toUpperCase()
  if (original[0] === original[0].toUpperCase()) {
    return corrected[0].toUpperCase() + corrected.slice(1)
  }
  return corrected
}

/**
 * Détecte un mot fraîchement terminé (par espace, ponctuation ou retour ligne)
 * et le remplace si présent dans le dictionnaire.
 * Retourne { value, caret } — null si rien à corriger.
 */
export function autocorrectAfterChar(
  value: string,
  caretPosition: number,
): { value: string; caret: number } | null {
  if (caretPosition === 0) return null
  const charBeforeCaret = value[caretPosition - 1]
  /* On déclenche uniquement après un caractère "fin de mot". */
  if (!/[\s.,;:!?\n]/.test(charBeforeCaret)) return null

  /* Remonte pour trouver le début du mot précédent. */
  let start = caretPosition - 2
  while (start >= 0 && !/[\s.,;:!?'"()\[\]\n\-]/.test(value[start])) start--
  start++

  const word = value.slice(start, caretPosition - 1)
  if (!word) return null

  const corrected = DICTIONARY[word.toLowerCase()]
  if (!corrected || corrected === word.toLowerCase()) return null

  const finalWord = matchCase(word, corrected)
  if (finalWord === word) return null

  const newValue = value.slice(0, start) + finalWord + value.slice(caretPosition - 1)
  const newCaret = start + finalWord.length + 1   // +1 pour le séparateur
  return { value: newValue, caret: newCaret }
}
