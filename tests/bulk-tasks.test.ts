/**
 * Création de plusieurs tâches d'un coup (src/lib/bulkTasks.ts).
 *
 * La promesse de l'écran : je colle une liste de 10 lignes, j'obtiens
 * 10 tâches — peu importe que la liste soit à puces, numérotée ou nue,
 * et sans qu'une ligne vide crée une tâche fantôme.
 *
 *   npx tsx --test tests/bulk-tasks.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { splitTaskLines, hasLineBreak } from '../src/lib/bulkTasks'

test('un paragraphe de 10 lignes donne 10 tâches', () => {
  const texte = Array.from({ length: 10 }, (_, i) => `Tâche ${i + 1}`).join('\n')
  assert.equal(splitTaskLines(texte).length, 10)
})

test('les lignes vides ne créent pas de tâche', () => {
  assert.deepEqual(
    splitTaskLines('Appeler le client\n\n\n  \nEnvoyer le devis\n'),
    ['Appeler le client', 'Envoyer le devis'],
  )
})

test('puces, tirets, numéros et cases à cocher sont retirés', () => {
  const lignes = splitTaskLines([
    '- Appeler le client',
    '* Appeler le client',
    '• Appeler le client',
    '– Appeler le client',
    '1. Appeler le client',
    '2) Appeler le client',
    '(3) Appeler le client',
    '[ ] Appeler le client',
    '[x] Appeler le client',
    '> Appeler le client',
    'Appeler le client',
  ].join('\n'))
  assert.equal(lignes.length, 11)
  assert.ok(lignes.every(l => l === 'Appeler le client'), lignes.join(' | '))
})

test('un tiret à l\'intérieur du titre est conservé', () => {
  assert.deepEqual(
    splitTaskLines('Refonte du site — page d\'accueil'),
    ['Refonte du site — page d\'accueil'],
  )
})

test('une seule ligne reste une seule tâche', () => {
  assert.deepEqual(splitTaskLines('  Appeler le client  '), ['Appeler le client'])
  assert.deepEqual(splitTaskLines(''), [])
  assert.deepEqual(splitTaskLines('   \n  '), [])
})

test('les retours Windows (CRLF) sont gérés', () => {
  assert.equal(splitTaskLines('A\r\nB\r\nC').length, 3)
})

test('hasLineBreak repère un collage multi-lignes', () => {
  assert.equal(hasLineBreak('une seule ligne'), false)
  assert.equal(hasLineBreak('deux\nlignes'), true)
  assert.equal(hasLineBreak('deux\r\nlignes'), true)
})
