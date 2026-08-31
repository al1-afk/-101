/**
 * Application d'un template de projet (src/lib/templateTasks.ts).
 *
 * La règle tenue ici est celle demandée : chaque titre principal compte
 * pour UNE tâche, les étapes ne sont que des points de checklist et ne
 * pèsent plus ni dans le nombre de tâches ni dans l'avancement.
 *
 * Le test qui compte vraiment est « aucune étape perdue » : compresser
 * 44 lignes en 9 n'a de valeur que si les 44 sont toujours là.
 *
 *   npx tsx --test tests/template-tasks.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTasksFromTemplates, countTemplate } from '../src/lib/templateTasks'
import { PROJET_TEMPLATES, type ProjetTemplate } from '../src/lib/projetTemplates'
import { parseTaskDesc, serializeTaskDesc, resetChecklist } from '../src/lib/taskNotes'

const wordpress = PROJET_TEMPLATES.find(t => t.key === 'wordpress')!
const checklist = (d: string | null) => parseTaskDesc(d).subtasks

/* ════════════════════════════════════════════════════════════════
   Une catégorie = une tâche
   ════════════════════════════════════════════════════════════════ */

test('un template de 44 étapes produit 9 tâches, pas 44', () => {
  const etapes = wordpress.groups.reduce((n, g) => n + g.tasks.length, 0)
  const taches = buildTasksFromTemplates([wordpress])
  assert.equal(etapes, 44)
  assert.equal(taches.length, wordpress.groups.length)
  assert.equal(taches.length, 9)
})

test('le titre de la tâche est celui de la catégorie', () => {
  const taches = buildTasksFromTemplates([wordpress])
  assert.deepEqual(taches.map(t => t.title), wordpress.groups.map(g => g.category))
})

test('aucune étape perdue : chacune devient un point de checklist', () => {
  const taches = buildTasksFromTemplates([wordpress])
  for (const [i, group] of wordpress.groups.entries()) {
    const titres = checklist(taches[i].description).map(s => s.title)
    for (const etape of group.tasks) {
      assert.ok(titres.includes(etape.title),
        `étape perdue : « ${etape.title} » absente de « ${group.category} »`)
    }
  }
})

test('tout point de checklist part non coché', () => {
  for (const t of buildTasksFromTemplates([wordpress])) {
    assert.ok(checklist(t.description).every(s => s.done === false))
  }
})

test('les identifiants de checklist sont uniques — sinon cocher l\'un coche l\'autre', () => {
  const ids = buildTasksFromTemplates([wordpress]).flatMap(t => checklist(t.description).map(s => s.id))
  assert.equal(new Set(ids).size, ids.length)
})

test('plusieurs templates s\'additionnent sans se mélanger', () => {
  const deux = PROJET_TEMPLATES.slice(0, 2)
  const attendu = deux.reduce((n, t) => n + countTemplate(t).taches, 0)
  assert.equal(buildTasksFromTemplates(deux).length, attendu)
})

/* ════════════════════════════════════════════════════════════════
   Priorité et contenu
   ════════════════════════════════════════════════════════════════ */

const faux = (tasks: any[]): ProjetTemplate => ({
  key: 'test', label: 'Test', emoji: '🧪', description: '',
  groups: [{ category: 'Catégorie', tasks }],
})

test('la catégorie hérite de l\'étape la plus urgente', () => {
  const t = buildTasksFromTemplates([faux([
    { title: 'a', priority: 'low' },
    { title: 'b', priority: 'urgent' },
    { title: 'c', priority: 'normal' },
  ])])
  assert.equal(t[0].priority, 'urgent')
})

test('sans priorité déclarée, la tâche est normale', () => {
  assert.equal(buildTasksFromTemplates([faux([{ title: 'a' }])])[0].priority, 'normal')
})

test('les sous-étapes du template restent dans la checklist', () => {
  const t = buildTasksFromTemplates([faux([
    { title: 'Étape', subtasks: ['Détail 1', 'Détail 2'] },
  ])])
  const titres = checklist(t[0].description).map(s => s.title)
  assert.deepEqual(titres, ['Étape', '— Détail 1', '— Détail 2'])
})

test('une sous-étape vide n\'ajoute pas de ligne fantôme', () => {
  const t = buildTasksFromTemplates([faux([{ title: 'Étape', subtasks: ['', '   '] }])])
  assert.equal(checklist(t[0].description).length, 1)
})

test('le contenu propre d\'une étape est repris sous son sous-titre', () => {
  const t = buildTasksFromTemplates([faux([
    { title: 'Rédiger le brief', blocks: [{ type: 'paragraph', text: 'Contenu propre' }] },
  ])])
  const blocks = parseTaskDesc(t[0].description).blocks as any[]
  const i = blocks.findIndex(b => b.type === 'heading3' && b.text === 'Rédiger le brief')
  assert.ok(i >= 0, 'sous-titre de l\'étape absent')
  assert.ok(blocks.slice(i).some(b => b.text === 'Contenu propre'))
})

test('le prompt d\'une étape est conservé', () => {
  const t = buildTasksFromTemplates([faux([{ title: 'Étape', prompt: 'PROMPT-XYZ' }])])
  const blocks = parseTaskDesc(t[0].description).blocks as any[]
  assert.ok(blocks.some(b => b.type === 'code' && b.text === 'PROMPT-XYZ'))
})

/* ════════════════════════════════════════════════════════════════
   Cas limites
   ════════════════════════════════════════════════════════════════ */

test('une catégorie sans étape ne crée pas de tâche vide', () => {
  const vide: ProjetTemplate = {
    key: 'v', label: 'V', emoji: '·', description: '',
    groups: [{ category: 'Vide', tasks: [] }, { category: 'Pleine', tasks: [{ title: 'a' }] }],
  }
  const t = buildTasksFromTemplates([vide])
  assert.equal(t.length, 1)
  assert.equal(t[0].title, 'Pleine')
  assert.equal(countTemplate(vide).taches, 1)
})

test('aucun template sélectionné ne crée rien', () => {
  assert.deepEqual(buildTasksFromTemplates([]), [])
})

test('le décompte annoncé est celui réellement créé', () => {
  for (const tpl of PROJET_TEMPLATES) {
    assert.equal(countTemplate(tpl).taches, buildTasksFromTemplates([tpl]).length,
      `décompte faux pour ${tpl.key}`)
  }
})

test('tous les templates livrés produisent des tâches valides', () => {
  for (const tpl of PROJET_TEMPLATES) {
    for (const t of buildTasksFromTemplates([tpl])) {
      assert.ok(t.title.trim().length > 0, `titre vide dans ${tpl.key}`)
      assert.equal(t.category, t.title)
      assert.ok(['low', 'normal', 'high', 'urgent'].includes(t.priority))
    }
  }
})

/* ════════════════════════════════════════════════════════════════
   Récurrence — GMB et Réseaux sociaux en dépendent entièrement
   ════════════════════════════════════════════════════════════════ */

test('une catégorie « (hebdo) » reste hebdomadaire', () => {
  const gmb = PROJET_TEMPLATES.find(t => t.key === 'gmb')!
  const pub = buildTasksFromTemplates([gmb]).find(t => t.title.includes('Publications'))!
  assert.equal(pub.recurrence?.type, 'weekly')
})

test('une catégorie hebdomadaire revient UNE fois par semaine, pas trois', () => {
  const gmb = PROJET_TEMPLATES.find(t => t.key === 'gmb')!
  for (const t of buildTasksFromTemplates([gmb])) {
    if (t.recurrence?.type === 'weekly') {
      assert.equal(t.recurrence.weekdays?.length, 1,
        `${t.title} reviendrait ${t.recurrence.weekdays?.length} fois par semaine`)
    }
  }
})

test('le jour retenu est le premier de la semaine de travail', () => {
  /* Étapes le mercredi, le lundi et le dimanche → lundi. */
  const t = buildTasksFromTemplates([faux([
    { title: 'a', recurrence: { type: 'weekly', weekdays: [3] } },
    { title: 'b', recurrence: { type: 'weekly', weekdays: [1] } },
    { title: 'c', recurrence: { type: 'weekly', weekdays: [0] } },
  ])])
  assert.deepEqual(t[0].recurrence?.weekdays, [1])
})

test('dimanche seul reste dimanche', () => {
  const t = buildTasksFromTemplates([faux([{ title: 'a', recurrence: { type: 'weekly', weekdays: [0] } }])])
  assert.deepEqual(t[0].recurrence?.weekdays, [0])
})

test('une catégorie sans récurrence n\'en invente pas', () => {
  assert.equal(buildTasksFromTemplates([faux([{ title: 'a' }])])[0].recurrence, null)
})

test('une catégorie à moitié récurrente n\'invente pas de rythme', () => {
  const t = buildTasksFromTemplates([faux([
    { title: 'a', recurrence: { type: 'weekly', weekdays: [1] } },
    { title: 'b' },
  ])])
  assert.equal(t[0].recurrence, null)
})

test('des rythmes différents ne se fusionnent pas', () => {
  const t = buildTasksFromTemplates([faux([
    { title: 'a', recurrence: { type: 'weekly', weekdays: [1] } },
    { title: 'b', recurrence: { type: 'monthly' } },
  ])])
  assert.equal(t[0].recurrence, null)
})

test('en « tous les N jours », le rythme le plus serré l\'emporte', () => {
  const t = buildTasksFromTemplates([faux([
    { title: 'a', recurrence: { type: 'every_n_days', interval: 7 } },
    { title: 'b', recurrence: { type: 'every_n_days', interval: 3 } },
  ])])
  assert.equal(t[0].recurrence?.interval, 3)
})

test('une date de fin n\'est retenue que si toutes les étapes s\'accordent', () => {
  const commun = buildTasksFromTemplates([faux([
    { title: 'a', recurrence: { type: 'weekly', weekdays: [1], endDate: '2026-12-31' } },
    { title: 'b', recurrence: { type: 'weekly', weekdays: [3], endDate: '2026-12-31' } },
  ])])
  assert.equal(commun[0].recurrence?.endDate, '2026-12-31')

  const divergent = buildTasksFromTemplates([faux([
    { title: 'a', recurrence: { type: 'weekly', weekdays: [1], endDate: '2026-12-31' } },
    { title: 'b', recurrence: { type: 'weekly', weekdays: [3] } },
  ])])
  assert.equal(divergent[0].recurrence?.endDate, undefined)
})

/* ════════════════════════════════════════════════════════════════
   La semaine suivante repart d'une checklist vierge
   ════════════════════════════════════════════════════════════════ */

test('la prochaine occurrence décoche la checklist', () => {
  const desc = serializeTaskDesc({
    subtasks: [{ id: '1', title: 'a', done: true }, { id: '2', title: 'b', done: true }],
  })
  assert.ok(parseTaskDesc(resetChecklist(desc)).subtasks.every(s => !s.done))
})

test('la remise à zéro garde le contenu, les commentaires et les pièces jointes', () => {
  const desc = serializeTaskDesc({
    blocks:      [{ type: 'paragraph', text: 'Mode opératoire' }],
    subtasks:    [{ id: '1', title: 'a', done: true }],
    comments:    [{ id: 'c', author: 'Said', text: 'note', at: '2026-01-01' }] as any,
    attachments: [{ id: 'p', label: 'Brief', url: 'https://x' }] as any,
  })
  const e = parseTaskDesc(resetChecklist(desc))
  assert.equal((e.blocks[0] as any).text, 'Mode opératoire')
  assert.equal(e.comments.length, 1)
  assert.equal(e.attachments.length, 1)
  assert.equal(e.subtasks[0].done, false)
})

test('une description en texte brut n\'est pas convertie au passage', () => {
  assert.equal(resetChecklist('Simple note'), 'Simple note')
  assert.equal(resetChecklist(null), null)
  assert.equal(resetChecklist(''), '')   // rendue inchangée
})

test('une checklist déjà vierge est rendue à l\'identique', () => {
  const desc = serializeTaskDesc({ subtasks: [{ id: '1', title: 'a', done: false }] })
  assert.equal(resetChecklist(desc), desc)
})
