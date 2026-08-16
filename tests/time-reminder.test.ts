/**
 * Tests de la règle du rappel du soir 7aty
 * (server/lib/timeReminderScheduler.ts → decideReminder).
 *
 * Ce qui est vérifié ici correspond à la promesse faite à l'utilisateur :
 * le rappel ne part QUE si la journée n'est pas déjà expliquée. Un soir
 * où tout est saisi, il ne se passe rien — c'est la condition pour qu'un
 * rappel quotidien reste lisible au bout de trois mois.
 *
 *   npm run test:time
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { decideReminder, buildReminderText, formatMinutes } from '../server/lib/timeReminderScheduler'

/* Journée de travail type : 9h → 18h, du lundi au samedi.
   540 minutes attendues, seuil de silence à 70 % = 378 minutes. */
const LUNDI = { local_dow: 1, work_start_hour: 9, work_end_hour: 18, work_days: [1, 2, 3, 4, 5, 6] }
const DIMANCHE = { ...LUNDI, local_dow: 7 }

test('rien de saisi un jour travaillé → le rappel part', () => {
  const d = decideReminder(LUNDI, 0)
  assert.equal(d.send, true)
  assert.equal(d.missingMin, 540)
})

test('journée à peine entamée → le rappel part, chiffré', () => {
  const d = decideReminder(LUNDI, 120)
  assert.equal(d.send, true)
  assert.equal(d.trackedMin, 120)
  assert.equal(d.missingMin, 420)
})

test('journée expliquée à 70 % → silence', () => {
  const d = decideReminder(LUNDI, 378)
  assert.equal(d.send, false)
  assert.equal(d.reason, 'day_covered')
})

test('juste sous le seuil → le rappel part encore', () => {
  assert.equal(decideReminder(LUNDI, 377).send, true)
})

test('journée entièrement saisie → silence', () => {
  assert.equal(decideReminder(LUNDI, 540).send, false)
})

test('jour non travaillé : une heure saisie suffit à faire taire le rappel', () => {
  assert.equal(decideReminder(DIMANCHE, 60).send, false)
  assert.equal(decideReminder(DIMANCHE, 59).send, true)
})

test('jour non travaillé et rien de saisi → rappel léger, seuil d\'une heure', () => {
  const d = decideReminder(DIMANCHE, 0)
  assert.equal(d.send, true)
  assert.equal(d.expectedMin, 60)
})

test('journée de travail vide de réglage (0 h) → aucun rappel', () => {
  const d = decideReminder({ ...LUNDI, work_start_hour: 9, work_end_hour: 9 }, 0)
  assert.equal(d.send, false)
  assert.equal(d.reason, 'nothing_expected')
})

test('le texte distingue « rien saisi » de « partiellement saisi »', () => {
  const vide = buildReminderText(decideReminder(LUNDI, 0))
  assert.match(vide.message, /Aucun bloc/)

  const partiel = buildReminderText(decideReminder(LUNDI, 150))
  assert.match(partiel.message, /2h 30min/)
  assert.match(partiel.message, /6h 30min/)     // 540 − 150 restants
})

test('le format des durées est celui de l\'écran', () => {
  assert.equal(formatMinutes(205), '3h 25min')
  assert.equal(formatMinutes(60), '1h')
  assert.equal(formatMinutes(0), '0min')
})
