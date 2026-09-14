/**
 * Saisie multi-lignes → plusieurs tâches d'un coup (une ligne = une tâche).
 *
 * Le but : coller une liste écrite ailleurs (mail, WhatsApp, notes) et
 * obtenir exactement les tâches qu'on voit à l'écran, sans avoir à
 * nettoyer la liste à la main. On retire donc les puces, tirets,
 * numéros et cases à cocher de début de ligne : « - Appeler le client »,
 * « 1. Appeler le client » et « Appeler le client » donnent le même
 * titre. Les lignes vides sont ignorées (un collage contient presque
 * toujours des sauts de ligne doubles).
 *
 * Module pur, testé dans tests/bulk-tasks.test.ts.
 */

/** Puce, tiret, numérotation ou case à cocher en tête de ligne. */
const LIST_PREFIX = /^\s*(?:[-*•·◦▪▫●‣>]+|[–—]|\d+[.)]|\(\d+\)|\[[ xX]?\])[\s.]+/

/** Découpe un texte multi-lignes en titres de tâches propres. */
export function splitTaskLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map(line => line.replace(LIST_PREFIX, '').trim())
    .filter(line => line.length > 0)
}

/** Vrai si le texte contient au moins un retour à la ligne. */
export function hasLineBreak(text: string): boolean {
  return /\r?\n/.test(text)
}
