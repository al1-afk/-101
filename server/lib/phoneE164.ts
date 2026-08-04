/**
 *  Formatage E.164 des numéros pour Google Contacts (Caller ID).
 *
 *  Le dialer du téléphone ne relie un appel entrant à un contact que si le
 *  numéro stocké est en forme internationale « +212… ». On convertit donc
 *  toutes les saisies (0661…, 00212…, +212 6-61…, 661…) vers « +2126… ».
 *
 *  Pays par défaut : Maroc (212). Les numéros clairement étrangers (indicatif
 *  explicite via + ou 00) gardent leur pays.
 */
const DEFAULT_CC = '212'

/**
 *  Retourne le numéro en E.164 (« +212661091900 ») ou null si la saisie n'est
 *  pas un numéro exploitable.
 *
 *    0661091900        → +212661091900
 *    +212 6 61-09-19-00→ +212661091900
 *    00212661091900    → +212661091900
 *    212661091900      → +212661091900
 *    661091900         → +212661091900   (mobile national sans le 0)
 *    +33 6 24 84 86 59 → +33624848659    (étranger : indicatif conservé)
 *    0033624848659     → +33624848659
 */
export function toE164(raw: string | null | undefined, defaultCc: string = DEFAULT_CC): string | null {
  if (!raw) return null
  // Le « (0) » de courtoisie (+33 (0)6…) est explicitement facultatif.
  const s = String(raw).replace(/\(\s*0\s*\)/g, '')
  const hadPlus = s.trim().startsWith('+')
  const d = s.replace(/\D/g, '')
  if (!d) return null

  let e164: string
  if (d.startsWith('00')) {
    e164 = '+' + d.slice(2)                 // préfixe international 00 → +
  } else if (hadPlus) {
    e164 = '+' + d                          // indicatif déjà fourni
  } else if (d.startsWith(defaultCc)) {
    e164 = '+' + d                          // 212… (indicatif sans +)
  } else if (d.startsWith('0')) {
    e164 = '+' + defaultCc + d.slice(1)     // national 0661… → +2126…
  } else if (d.length === 9) {
    e164 = '+' + defaultCc + d              // mobile national nu « 661091900 »
  } else {
    e164 = '+' + d                          // repli : on suppose un indicatif présent
  }

  // Longueur E.164 plausible : entre 8 et 15 chiffres après le +.
  const digits = e164.slice(1)
  if (digits.length < 8 || digits.length > 15) return null
  return e164
}

/** true si la saisie donne un E.164 valide. */
export function isValidPhone(raw: string | null | undefined): boolean {
  return toE164(raw) !== null
}
