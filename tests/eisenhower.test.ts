/**
 * Tests de la matrice d'Eisenhower (module pur src/lib/eisenhower.ts).
 *
 * Ce qui est vérifié ici correspond à la promesse de l'écran :
 *   · une tâche non classée apparaît quand même, dans un quadrant déduit ;
 *   · un classement DÉCIDÉ prime toujours sur la déduction ;
 *   · l'urgence vient de l'échéance, l'importance de la priorité ;
 *   · on distingue toujours « supposé » de « tranché ».
 *
 *   npm run test:time
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  suggestQuadrant, quadrantOf, isUrgent, isSuggested, QUADRANTS, QUADRANT_ORDER,
} from '../src/lib/eisenhower'

const NOW = new Date(2026, 7, 19, 10, 0)          // mercredi 19 août, 10 h
const dans = (h: number) => {
  const d = new Date(NOW.getTime() + h * 3600_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const t = (p: Partial<any>) => ({ priority: 'normal', due_date: null, due_time: null, ...p })

/* ── Les quatre décisions ─────────────────────────────────────── */

test('urgent et important → FAIRE', () => {
  assert.equal(suggestQuadrant(t({ priority: 'urgent', due_date: dans(5), due_time: '14:00' }), NOW), 'do')
})

test('important mais pas urgent → PLANIFIER', () => {
  assert.equal(suggestQuadrant(t({ priority: 'high', due_date: dans(24 * 10) }), NOW), 'plan')
})

test('urgent mais pas important → DÉLÉGUER', () => {
  assert.equal(suggestQuadrant(t({ priority: 'normal', due_date: dans(5), due_time: '14:00' }), NOW), 'delegate')
})

test('ni urgent ni important → SUPPRIMER', () => {
  assert.equal(suggestQuadrant(t({ priority: 'low' }), NOW), 'eliminate')
})

test('une tâche importante sans échéance reste à PLANIFIER', () => {
  assert.equal(suggestQuadrant(t({ priority: 'high', due_date: null }), NOW), 'plan')
})

/* ── L'urgence ────────────────────────────────────────────────── */

test('l\'échéance décide de l\'urgence, pas la priorité', () => {
  assert.equal(isUrgent(t({ due_date: dans(5), due_time: '12:00' }), NOW), true)
  assert.equal(isUrgent(t({ due_date: dans(24 * 5) }), NOW), false)
})

test('une échéance DÉPASSÉE est urgente', () => {
  assert.equal(isUrgent(t({ due_date: dans(-48) }), NOW), true)
})

test('sans échéance, rien n\'est urgent', () => {
  assert.equal(isUrgent(t({ due_date: null }), NOW), false)
})

test('une tâche datée sans heure est due en fin de journée', () => {
  /* Le 21/08 sans heure = 23:59 → à plus de 48 h du 19/08 10 h. */
  assert.equal(isUrgent(t({ due_date: '2026-08-21', due_time: null }), NOW), false)
  /* Avec une heure le matin, elle repasse dans la fenêtre. */
  assert.equal(isUrgent(t({ due_date: '2026-08-21', due_time: '08:00' }), NOW), true)
})

test('une date illisible ne rend pas la tâche urgente', () => {
  assert.equal(isUrgent(t({ due_date: 'pas-une-date' }), NOW), false)
})

/* ── Décidé bat déduit ────────────────────────────────────────── */

test('le quadrant choisi prime sur la déduction', () => {
  /* Tâche que l'automatisme mettrait dans « supprimer »… */
  const tache = t({ priority: 'low' })
  assert.equal(suggestQuadrant(tache, NOW), 'eliminate')
  /* …mais que la personne a classée dans « faire ». */
  assert.equal(quadrantOf({ ...tache, eisenhower: 'do' }, NOW), 'do')
})

test('une valeur inconnue en base retombe sur la déduction', () => {
  assert.equal(quadrantOf({ ...t({ priority: 'low' }), eisenhower: 'n_importe_quoi' }, NOW), 'eliminate')
})

test('on distingue toujours « supposé » de « tranché »', () => {
  assert.equal(isSuggested({ eisenhower: null }), true)
  assert.equal(isSuggested({}), true)
  assert.equal(isSuggested({ eisenhower: 'plan' }), false)
})

/* ── Cohérence du catalogue ───────────────────────────────────── */

test('les quatre quadrants sont décrits et ordonnés', () => {
  assert.equal(QUADRANT_ORDER.length, 4)
  for (const q of QUADRANT_ORDER) {
    assert.ok(QUADRANTS[q], `quadrant ${q} décrit`)
    assert.ok(QUADRANTS[q].action.length > 0)
  }
  /* La ligne du haut est celle qui compte : faire, puis planifier. */
  assert.deepEqual(QUADRANT_ORDER.slice(0, 2), ['do', 'plan'])
})
