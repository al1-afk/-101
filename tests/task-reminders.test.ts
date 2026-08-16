/**
 * Tests de la règle d'envoi des rappels de tâches
 * (server/lib/taskReminderScheduler.ts + normalisation des réglages).
 *
 * Ce qui est vérifié ici correspond aux promesses faites à l'utilisateur :
 *   · un rappel part À L'HEURE, pas avant ;
 *   · il ne part plus une fois l'échéance passée — le retard est le
 *     sujet d'un autre module ;
 *   · un rappel manqué est rattrapé dans une fenêtre raisonnable, et
 *     abandonné au-delà (mieux vaut rien que « dans 30 min » 3 h après) ;
 *   · plusieurs rappels sur la même tâche partent chacun à leur tour ;
 *   · un doublon dans les réglages ne produit pas deux notifications.
 *
 *   npm run test:time
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pendingOffsets, offsetLabel, formatLocalTime,
} from '../server/lib/taskReminderScheduler'
import { normalizeOffsets, normalizeTime } from '../server/routes/taskReminders'

/* Échéance de référence : mardi 18 août 2026 à 14:00 (heure locale). */
const DUE = new Date(2026, 7, 18, 14, 0, 0)
const at = (h: number, m: number) => new Date(2026, 7, 18, h, m, 0)
const OFFSETS = [1440, 30, 5]

/* ════════════════════════════════════════════════════════════════
   Le bon moment
   ════════════════════════════════════════════════════════════════ */

test('rien ne part tant que l\'heure n\'est pas venue', () => {
  assert.deepEqual(pendingOffsets(DUE, [30], at(13, 20)), [])
})

test('le rappel part pile à l\'heure prévue', () => {
  assert.deepEqual(pendingOffsets(DUE, [30], at(13, 30)), [30])
})

test('le rappel de 5 minutes part 5 minutes avant', () => {
  assert.deepEqual(pendingOffsets(DUE, [5], at(13, 55)), [5])
})

test('passé l\'échéance, plus aucun rappel — c\'est du retard, pas un rappel', () => {
  assert.deepEqual(pendingOffsets(DUE, OFFSETS, at(14, 0)), [])
  assert.deepEqual(pendingOffsets(DUE, OFFSETS, at(15, 30)), [])
})

test('un rappel manqué est rattrapé dans la fenêtre, puis abandonné', () => {
  /* Serveur redémarré 40 min après l'heure d'envoi : on rattrape. */
  assert.deepEqual(pendingOffsets(DUE, [1440], new Date(2026, 7, 17, 14, 40)), [1440])
  /* Trois heures plus tard, l'information a perdu son sens. */
  assert.deepEqual(pendingOffsets(DUE, [1440], new Date(2026, 7, 17, 17, 30)), [])
})

test('la fenêtre de rattrapage est réglable', () => {
  const tard = new Date(2026, 7, 17, 17, 30)
  assert.deepEqual(pendingOffsets(DUE, [1440], tard, 240), [1440])
})

/* ════════════════════════════════════════════════════════════════
   Plusieurs rappels sur la même tâche
   ════════════════════════════════════════════════════════════════ */

test('chaque rappel a son tour, du plus lointain au plus proche', () => {
  /* La veille à 14h05 : seul « 1 jour avant » est dû. */
  assert.deepEqual(pendingOffsets(DUE, OFFSETS, new Date(2026, 7, 17, 14, 5)), [1440])
  /* Le jour même à 13h35 : « 30 min » est dû, « 1 jour » est périmé. */
  assert.deepEqual(pendingOffsets(DUE, OFFSETS, at(13, 35)), [30])
  /* À 13h56 : « 5 min » est dû, et « 30 min » l'est encore (rattrapage). */
  assert.deepEqual(pendingOffsets(DUE, OFFSETS, at(13, 56)), [30, 5])
})

test('un doublon dans les réglages ne produit qu\'un rappel', () => {
  assert.deepEqual(pendingOffsets(DUE, [30, 30, 30], at(13, 45)), [30])
})

test('aucun rappel réglé = aucun envoi', () => {
  assert.deepEqual(pendingOffsets(DUE, [], at(13, 59)), [])
  assert.deepEqual(pendingOffsets(DUE, null, at(13, 59)), [])
  assert.deepEqual(pendingOffsets(DUE, undefined, at(13, 59)), [])
})

test('une valeur aberrante est ignorée sans casser les autres', () => {
  assert.deepEqual(pendingOffsets(DUE, [Number.NaN, -10, 30], at(13, 45)), [30])
})

/* ════════════════════════════════════════════════════════════════
   Formulation
   ════════════════════════════════════════════════════════════════ */

test('le texte du rappel se lit en français, pas en minutes', () => {
  assert.equal(offsetLabel(5), 'dans 5 minutes')
  assert.equal(offsetLabel(30), 'dans 30 minutes')
  assert.equal(offsetLabel(60), 'dans 1 heure')
  assert.equal(offsetLabel(120), 'dans 2 heures')
  assert.equal(offsetLabel(1440), 'demain')
  assert.equal(offsetLabel(2880), 'dans 2 jours')
  assert.equal(offsetLabel(0), 'maintenant')
})

test('l\'heure affichée est celle de l\'espace, pas celle du serveur', () => {
  /* 13:00 UTC = 14:00 à Casablanca (UTC+1). */
  const instant = new Date('2026-08-18T13:00:00Z')
  assert.equal(formatLocalTime(instant, 'Africa/Casablanca'), '14:00')
  assert.equal(formatLocalTime(instant, 'UTC'), '13:00')
})

test('un fuseau invalide ne fait pas planter l\'envoi', () => {
  assert.match(formatLocalTime(new Date('2026-08-18T13:00:00Z'), 'Pas/UnFuseau'), /^\d{2}:\d{2}$/)
})

/* ════════════════════════════════════════════════════════════════
   Normalisation des réglages (API)
   ════════════════════════════════════════════════════════════════ */

test('les rappels sont dédoublonnés et triés du plus lointain au plus proche', () => {
  assert.deepEqual(normalizeOffsets([30, 5, 30, 1440]), [1440, 30, 5])
})

test('une liste vide est acceptée — c\'est « aucun rappel »', () => {
  assert.deepEqual(normalizeOffsets([]), [])
})

test('les valeurs hors limites sont refusées', () => {
  assert.equal(normalizeOffsets([-5]), null)
  assert.equal(normalizeOffsets([50000]), null)          // > 30 jours
  assert.equal(normalizeOffsets(['bientôt']), null)
  assert.equal(normalizeOffsets('30' as unknown), null)
})

test('pas plus de cinq rappels par tâche', () => {
  assert.deepEqual(normalizeOffsets([5, 15, 30, 60, 1440]).length, 5)
  assert.equal(normalizeOffsets([5, 15, 30, 60, 1440, 2880]), null)
})

test('l\'heure par défaut accepte HH:MM et HH:MM:SS, refuse le reste', () => {
  assert.equal(normalizeTime('09:00'), '09:00:00')
  assert.equal(normalizeTime('23:59:30'), '23:59:30')
  assert.equal(normalizeTime('24:00'), null)
  assert.equal(normalizeTime('9h'), null)
  assert.equal(normalizeTime(''), null)
})
