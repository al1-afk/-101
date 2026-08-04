/**
 *  Normalisation des numéros de téléphone — sert à repérer les doublons.
 *
 *  Un même client saisi deux fois l'est rarement à l'identique :
 *  « 0661091900 », « +212 661-091900 » et « 00212661091900 » désignent la
 *  même personne. On ramène tout à une forme canonique comparable, indicatif
 *  Maroc (212) retiré puisque c'est le pays par défaut de l'app.
 */

/** Nombre minimal de chiffres pour considérer une saisie comme un numéro.
 *  Évite qu'une valeur bidon (« 0 », « 12 ») fasse croire à un doublon. */
const MIN_DIGITS = 6

/**
 *  Forme canonique d'un numéro, ou '' si la saisie n'est pas exploitable.
 *
 *    0661091900        → '661091900'
 *    +212 661-091900   → '661091900'
 *    00212661091900    → '661091900'
 *    +33 6 24 84 86 59 → '33624848659'   (étranger : indicatif conservé)
 *    0033624848659     → '33624848659'
 */
export function canonicalPhone(raw: string | null | undefined): string {
  if (!raw) return ''

  /* Le zéro de courtoisie « +33 (0)6… » / « +212 (0)661… » est retiré AVANT de
     réduire aux chiffres : entre parenthèses il est explicitement facultatif,
     et c'est le seul cas où l'on peut l'identifier sur un numéro étranger. */
  let d = String(raw).replace(/\(\s*0\s*\)/g, '').replace(/\D/g, '')
  if (!d) return ''

  /* Les trois règles s'ENCHAÎNENT (pas de « sinon ») : un même numéro cumule
     souvent indicatif ET zéro national — « +212 0661091900 » est une saisie
     courante des formulaires web et des exports WhatsApp. Les traiter comme
     exclusives laissait ce cas hors de tout regroupement, donc sans alerte. */
  if (d.startsWith('00'))  d = d.slice(2)   // préfixe international : 00212… → 212…
  if (d.startsWith('212')) d = d.slice(3)   // indicatif Maroc
  /* Un numéro marocain ne commence jamais par 0 après l'indicatif : ce 0
     résiduel est donc toujours le zéro national, jamais un chiffre utile. */
  if (d.startsWith('0'))   d = d.slice(1)

  return d.length >= MIN_DIGITS ? d : ''
}

/** Deux numéros désignent-ils la même ligne ? */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalPhone(a)
  return !!ca && ca === canonicalPhone(b)
}

/**
 *  Regroupe des éléments par numéro canonique. Seuls les groupes de 2+
 *  éléments sont retournés : ce sont les doublons.
 */
export function groupByPhone<T>(
  items: readonly T[],
  getPhone: (item: T) => string | null | undefined,
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = canonicalPhone(getPhone(item))
    if (!key) continue
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }
  for (const [key, bucket] of groups) {
    if (bucket.length < 2) groups.delete(key)
  }
  return groups
}
