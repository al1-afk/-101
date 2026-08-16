/**
 * Tests du moteur d'analyse 7aty (module pur src/lib/timeAnalytics.ts +
 * les règles de classement de src/lib/timeCategories.ts).
 *
 * Ce qui est vérifié ici correspond aux règles du module :
 *   · un repos planifié n'est JAMAIS compté comme du temps perdu ;
 *   · une perte de contrôle déclasse n'importe quelle catégorie ;
 *   · un chronomètre en cours compte le temps déjà écoulé ;
 *   · un bloc à cheval sur plusieurs heures est réparti heure par heure ;
 *   · l'alerte ne se déclenche que pendant les heures de travail ;
 *   · le Distraction Score monte avec le temps non maîtrisé et les
 *     objectifs dépassés, et reste borné à 100.
 *
 *   npm run test:time
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  entryMinutes, formatMinutes, totalsByKind, totalsByCategory, totalsByLabel,
  distractionScore, goalStatus, minutesByHour, minutesByDay, worstHourWindow,
  isWorkTime, distractionAlert, detectPatterns, buildWeeklyReport,
  startOfWeek, addDays, fromInputs, toDateInput, toTimeInput,
  DEFAULT_SETTINGS, type TimeEntry, type TimeSettings,
} from '../src/lib/timeAnalytics'
import { suggestKind, getCategory } from '../src/lib/timeCategories'

/* ── Fabrique de blocs ────────────────────────────────────────────
   Les dates sont construites en heure LOCALE, comme dans l'écran. */
let seq = 0
function entry(part: Partial<TimeEntry> & {
  day: Date
  startH: number
  startM?: number
  minutes: number
}): TimeEntry {
  const start = new Date(part.day)
  start.setHours(part.startH, part.startM ?? 0, 0, 0)
  const end = new Date(start.getTime() + part.minutes * 60000)
  return {
    id: `e${++seq}`,
    label: part.label ?? 'Bloc',
    category_key: part.category_key ?? 'social',
    kind: part.kind ?? 'perdu',
    control_level: part.control_level ?? null,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_min: part.minutes,
    notes: part.notes ?? null,
  }
}

/* Lundi de référence : 3 août 2026, 00:00 locales. */
const MONDAY = (() => { const d = new Date(2026, 7, 3); d.setHours(0, 0, 0, 0); return d })()
const TUESDAY = addDays(MONDAY, 1)

const SETTINGS: TimeSettings = { ...DEFAULT_SETTINGS }

/* ════════════════════════════════════════════════════════════════
   Durées
   ════════════════════════════════════════════════════════════════ */

test('un bloc terminé vaut sa durée enregistrée', () => {
  const e = entry({ day: MONDAY, startH: 10, minutes: 90 })
  assert.equal(entryMinutes(e, new Date()), 90)
})

test('un chronomètre en cours compte le temps déjà écoulé', () => {
  const now = new Date(2026, 7, 3, 15, 30)
  const running: TimeEntry = {
    ...entry({ day: MONDAY, startH: 14, minutes: 0 }),
    ended_at: null, duration_min: null,
  }
  assert.equal(entryMinutes(running, now), 90)
})

test('formatMinutes rend un format lisible', () => {
  assert.equal(formatMinutes(205), '3h 25min')
  assert.equal(formatMinutes(45), '45min')
  assert.equal(formatMinutes(120), '2h')
  assert.equal(formatMinutes(-10), '0min')
})

/* ════════════════════════════════════════════════════════════════
   La règle centrale : repos planifié ≠ temps perdu
   ════════════════════════════════════════════════════════════════ */

test('un film choisi pendant le repos est du repos, pas une perte', () => {
  assert.equal(suggestKind('films', 'controle'), 'repos')
})

test('le même film non planifié est du temps perdu', () => {
  assert.equal(suggestKind('films', 'non_planifie'), 'perdu')
})

test('une distraction nécessaire est neutre, pas perdue', () => {
  assert.equal(suggestKind('social', 'necessaire'), 'neutre')
})

test('une perte de contrôle déclasse même une catégorie à haute valeur', () => {
  assert.equal(suggestKind('learning', 'perte_controle'), 'perdu')
  assert.equal(suggestKind('sales', 'perte_controle'), 'perdu')
})

test('sans niveau de contrôle, la catégorie décide seule', () => {
  assert.equal(suggestKind('social', null), 'perdu')
  assert.equal(suggestKind('sales', null), 'valeur')
  assert.equal(suggestKind('famille', null), 'repos')
})

test('un travail non planifié reste du travail, mais déclassé en neutre', () => {
  assert.equal(suggestKind('production', 'non_planifie'), 'neutre')
})

test('une catégorie inconnue ne casse rien', () => {
  assert.equal(getCategory('categorie_supprimee').label, 'Autre')
  assert.equal(suggestKind('categorie_supprimee', 'controle'), 'repos')
})

/* ════════════════════════════════════════════════════════════════
   Totaux
   ════════════════════════════════════════════════════════════════ */

test('les totaux séparent haute valeur, neutre, repos et perdu', () => {
  const entries = [
    entry({ day: MONDAY, startH: 9,  minutes: 120, kind: 'valeur', category_key: 'sales' }),
    entry({ day: MONDAY, startH: 12, minutes: 30,  kind: 'neutre', category_key: 'admin_task' }),
    entry({ day: MONDAY, startH: 21, minutes: 60,  kind: 'repos',  category_key: 'films' }),
    entry({ day: MONDAY, startH: 14, minutes: 45,  kind: 'perdu',  category_key: 'social' }),
  ]
  const t = totalsByKind(entries, new Date())
  assert.equal(t.valeur, 120)
  assert.equal(t.neutre, 30)
  assert.equal(t.repos, 60)
  assert.equal(t.perdu, 45)
  assert.equal(t.total, 255)
})

test('les catégories sont classées par poids décroissant, avec leur part', () => {
  const entries = [
    entry({ day: MONDAY, startH: 9,  minutes: 60, category_key: 'social' }),
    entry({ day: MONDAY, startH: 11, minutes: 30, category_key: 'social' }),
    entry({ day: MONDAY, startH: 14, minutes: 10, category_key: 'youtube' }),
  ]
  const cats = totalsByCategory(entries, new Date())
  assert.equal(cats[0].category_key, 'social')
  assert.equal(cats[0].minutes, 90)
  assert.equal(Math.round(cats[0].share * 100), 90)
  assert.equal(cats[1].category_key, 'youtube')
})

test('les noms d\'activité sont regroupés sans tenir compte de la casse', () => {
  const entries = [
    entry({ day: MONDAY, startH: 9,  minutes: 40, label: 'Instagram' }),
    entry({ day: MONDAY, startH: 14, minutes: 20, label: 'instagram' }),
    entry({ day: MONDAY, startH: 18, minutes: 10, label: 'TikTok' }),
  ]
  const byLabel = totalsByLabel(entries, ['perdu'], new Date())
  assert.equal(byLabel[0].label, 'Instagram')
  assert.equal(byLabel[0].minutes, 60)
  assert.equal(byLabel[0].count, 2)
})

test('le repos planifié n\'apparaît pas dans les pertes', () => {
  const entries = [
    entry({ day: MONDAY, startH: 21, minutes: 90, kind: 'repos', category_key: 'films', label: 'Film en famille' }),
    entry({ day: MONDAY, startH: 14, minutes: 30, kind: 'perdu', category_key: 'social', label: 'Instagram' }),
  ]
  const pertes = totalsByLabel(entries, ['perdu'], new Date())
  assert.equal(pertes.length, 1)
  assert.equal(pertes[0].label, 'Instagram')
})

/* ════════════════════════════════════════════════════════════════
   Distraction Score
   ════════════════════════════════════════════════════════════════ */

test('sans temps perdu, le score est nul', () => {
  const entries = [entry({ day: MONDAY, startH: 9, minutes: 300, kind: 'valeur', category_key: 'sales' })]
  assert.equal(distractionScore(entries, [], new Date()).score, 0)
})

test('le score est la part du temps perdu dans le temps suivi', () => {
  const entries = [
    entry({ day: MONDAY, startH: 9,  minutes: 180, kind: 'valeur', category_key: 'sales' }),
    entry({ day: MONDAY, startH: 14, minutes: 60,  kind: 'perdu',  category_key: 'social' }),
  ]
  const s = distractionScore(entries, [], new Date())
  assert.equal(s.score, 25)          // 60 / 240
  assert.equal(s.level, 'moyen')
})

test('la perte de contrôle pèse plus lourd qu\'un simple imprévu', () => {
  const base = entry({ day: MONDAY, startH: 9, minutes: 100, kind: 'valeur', category_key: 'sales' })
  const calme = distractionScore(
    [base, entry({ day: MONDAY, startH: 14, minutes: 100, kind: 'perdu', control_level: 'non_planifie' })],
    [], new Date()
  )
  const subi = distractionScore(
    [base, entry({ day: MONDAY, startH: 14, minutes: 100, kind: 'perdu', control_level: 'perte_controle' })],
    [], new Date()
  )
  assert.ok(subi.score > calme.score)
})

test('un objectif dépassé ajoute 5 points, et le score reste borné à 100', () => {
  const entries = [
    entry({ day: MONDAY, startH: 9,  minutes: 60, kind: 'valeur', category_key: 'sales' }),
    entry({ day: MONDAY, startH: 14, minutes: 60, kind: 'perdu',  category_key: 'social' }),
  ]
  const sans = distractionScore(entries, [], new Date())
  const avec = distractionScore(entries, [{ category_key: 'social', max_minutes_week: 30 }], new Date())
  assert.equal(avec.score - sans.score, 5)
  assert.deepEqual(avec.exceededGoals, ['social'])

  const tout = [entry({ day: MONDAY, startH: 9, minutes: 600, kind: 'perdu', control_level: 'perte_controle' })]
  assert.equal(distractionScore(tout, [{ category_key: 'social', max_minutes_week: 30 }], new Date()).score, 100)
})

test('un objectif respecté n\'est pas signalé comme dépassé', () => {
  const entries = [entry({ day: MONDAY, startH: 14, minutes: 60, kind: 'perdu', category_key: 'social' })]
  const st = goalStatus(entries, [{ category_key: 'social', max_minutes_week: 180 }], new Date())
  assert.equal(st[0].over, 0)
  assert.equal(st[0].spent, 60)
})

/* ════════════════════════════════════════════════════════════════
   Répartition dans le temps
   ════════════════════════════════════════════════════════════════ */

test('un bloc à cheval est réparti heure par heure', () => {
  const e = entry({ day: MONDAY, startH: 17, startM: 40, minutes: 90 })   // 17h40 → 19h10
  const hours = minutesByHour([e], new Date())
  assert.equal(hours[17].total, 20)
  assert.equal(hours[18].total, 60)
  assert.equal(hours[19].total, 10)
  assert.equal(hours[17].lost + hours[18].lost + hours[19].lost, 90)
})

test('la pire fenêtre de 3 h est celle qui concentre le temps perdu', () => {
  const entries = [
    entry({ day: MONDAY, startH: 19, minutes: 60, kind: 'perdu' }),
    entry({ day: MONDAY, startH: 20, minutes: 60, kind: 'perdu' }),
    entry({ day: MONDAY, startH: 10, minutes: 15, kind: 'perdu' }),
  ]
  const w = worstHourWindow(minutesByHour(entries, new Date()), 3)
  assert.ok(w)
  assert.ok(w!.start >= 18 && w!.end <= 22)
  assert.equal(w!.lost, 120)
})

test('les blocs sont rattachés au bon jour de la semaine', () => {
  const days = minutesByDay(
    [entry({ day: TUESDAY, startH: 14, minutes: 30, kind: 'perdu' })],
    new Date()
  )
  assert.equal(days[1].label, 'Mardi')
  assert.equal(days[1].lost, 30)
  assert.equal(days[0].total, 0)
})

/* ════════════════════════════════════════════════════════════════
   Heures de travail & alerte
   ════════════════════════════════════════════════════════════════ */

test('les heures de travail bornent le jour ET l\'heure', () => {
  assert.equal(isWorkTime(new Date(2026, 7, 3, 14, 0), SETTINGS), true)   // lundi 14h
  assert.equal(isWorkTime(new Date(2026, 7, 3, 21, 0), SETTINGS), false)  // lundi 21h
  assert.equal(isWorkTime(new Date(2026, 7, 9, 14, 0), SETTINGS), false)  // dimanche
})

test('l\'alerte se déclenche au seuil, pendant le travail', () => {
  const now = new Date(2026, 7, 3, 15, 0)                                 // lundi 15h
  const running: TimeEntry = {
    ...entry({ day: MONDAY, startH: 14, minutes: 0, category_key: 'social', label: 'Instagram' }),
    ended_at: null, duration_min: null,
  }
  const a = distractionAlert(running, SETTINGS, now)
  assert.ok(a)
  assert.equal(a!.label, 'Instagram')
  assert.equal(Math.round(a!.minutes), 60)
})

test('la même session le soir n\'est pas une alerte — c\'est du repos', () => {
  const now = new Date(2026, 7, 3, 22, 0)
  const running: TimeEntry = {
    ...entry({ day: MONDAY, startH: 21, minutes: 0, category_key: 'films' }),
    ended_at: null, duration_min: null,
  }
  assert.equal(distractionAlert(running, SETTINGS, now), null)
})

test('sous le seuil, ou sur une tâche de travail, aucune alerte', () => {
  const now = new Date(2026, 7, 3, 14, 20)
  const court: TimeEntry = {
    ...entry({ day: MONDAY, startH: 14, minutes: 0, category_key: 'social' }),
    ended_at: null, duration_min: null,
  }
  assert.equal(distractionAlert(court, SETTINGS, now), null)

  const travail: TimeEntry = {
    ...entry({ day: MONDAY, startH: 10, minutes: 0, category_key: 'production' }),
    ended_at: null, duration_min: null,
  }
  assert.equal(distractionAlert(travail, SETTINGS, new Date(2026, 7, 3, 16, 0)), null)
})

test('alertes désactivées : plus aucune alerte', () => {
  const now = new Date(2026, 7, 3, 16, 0)
  const running: TimeEntry = {
    ...entry({ day: MONDAY, startH: 14, minutes: 0, category_key: 'social' }),
    ended_at: null, duration_min: null,
  }
  assert.equal(distractionAlert(running, { ...SETTINGS, alerts_enabled: false }, now), null)
})

/* ════════════════════════════════════════════════════════════════
   Schémas
   ════════════════════════════════════════════════════════════════ */

test('la dispersion qui suit une longue session de travail est détectée', () => {
  const entries = [
    entry({ day: MONDAY, startH: 9,  minutes: 120, kind: 'valeur', category_key: 'production' }),
    entry({ day: MONDAY, startH: 11, minutes: 45,  kind: 'perdu',  category_key: 'youtube' }),
    entry({ day: TUESDAY, startH: 9, minutes: 150, kind: 'valeur', category_key: 'production' }),
    entry({ day: TUESDAY, startH: 11, startM: 30, minutes: 40, kind: 'perdu', category_key: 'youtube' }),
  ]
  const keys = detectPatterns(entries, SETTINGS, new Date()).map(p => p.key)
  assert.ok(keys.includes('after_long_session'))
})

test('la dispersion qui suit les réunions est détectée', () => {
  const entries = [
    entry({ day: MONDAY, startH: 9,  minutes: 60, kind: 'neutre', category_key: 'reunion' }),
    entry({ day: MONDAY, startH: 10, minutes: 50, kind: 'perdu',  category_key: 'social' }),
    entry({ day: TUESDAY, startH: 9, minutes: 60, kind: 'neutre', category_key: 'reunion' }),
    entry({ day: TUESDAY, startH: 10, minutes: 40, kind: 'perdu', category_key: 'social' }),
  ]
  const keys = detectPatterns(entries, SETTINGS, new Date()).map(p => p.key)
  assert.ok(keys.includes('after_meeting'))
})

test('sans matière suffisante, aucun schéma n\'est inventé', () => {
  const entries = [entry({ day: MONDAY, startH: 14, minutes: 10, kind: 'perdu' })]
  assert.equal(detectPatterns(entries, SETTINGS, new Date()).length, 0)
})

/* ════════════════════════════════════════════════════════════════
   Rapport hebdomadaire
   ════════════════════════════════════════════════════════════════ */

test('le rapport compare à la semaine précédente et projette sur l\'année', () => {
  const lastWeek = addDays(MONDAY, -7)
  const entries = [
    /* Semaine précédente : 3 h perdues */
    entry({ day: lastWeek, startH: 14, minutes: 180, kind: 'perdu', category_key: 'social', label: 'Instagram' }),
    /* Semaine en cours : 2 h perdues + 8 h de vente */
    entry({ day: MONDAY, startH: 9,  minutes: 480, kind: 'valeur', category_key: 'sales', label: 'Appels' }),
    entry({ day: MONDAY, startH: 20, minutes: 120, kind: 'perdu',  category_key: 'social', label: 'Instagram' }),
  ]
  const r = buildWeeklyReport(entries, [], SETTINGS, MONDAY, new Date())

  assert.equal(r.totals.perdu, 120)
  assert.equal(r.previous.perdu, 180)
  assert.equal(r.recoveredMin, 60)                       // une heure récupérée
  assert.equal(Math.round(r.yearlyLostHours), 104)       // 120 min × 52 / 60
  assert.equal(r.topLost[0].label, 'Instagram')
  assert.equal(r.topValue[0].category_key, 'sales')
  assert.ok(r.decision?.includes('Instagram'))
})

test('les blocs hors semaine ne polluent pas le rapport', () => {
  const entries = [
    entry({ day: MONDAY, startH: 9, minutes: 60, kind: 'valeur', category_key: 'sales' }),
    entry({ day: addDays(MONDAY, 8), startH: 9, minutes: 300, kind: 'perdu', category_key: 'social' }),
  ]
  const r = buildWeeklyReport(entries, [], SETTINGS, MONDAY, new Date())
  assert.equal(r.totals.total, 60)
  assert.equal(r.totals.perdu, 0)
})

test('le temps perdu et le temps utile sont ventilés séparément', () => {
  const entries = [
    entry({ day: MONDAY, startH: 21, minutes: 90, kind: 'repos',  category_key: 'films' }),
    entry({ day: MONDAY, startH: 14, minutes: 60, kind: 'perdu',  category_key: 'films' }),
    entry({ day: MONDAY, startH: 9,  minutes: 60, kind: 'valeur', category_key: 'sales' }),
  ]
  const r = buildWeeklyReport(entries, [], SETTINGS, MONDAY, new Date())
  /* La catégorie « films » totalise 150 min, mais seules 60 sont perdues. */
  assert.equal(r.byCategory.find(c => c.category_key === 'films')!.minutes, 150)
  assert.equal(r.lostByCategory.find(c => c.category_key === 'films')!.minutes, 60)
  assert.equal(r.usefulByCategory.find(c => c.category_key === 'sales')!.minutes, 60)
})

/* ════════════════════════════════════════════════════════════════
   Dates de formulaire
   ════════════════════════════════════════════════════════════════ */

test('la semaine commence le lundi', () => {
  const dimanche = new Date(2026, 7, 9, 23, 0)          // dimanche
  assert.equal(startOfWeek(dimanche).getTime(), MONDAY.getTime())
  const lundi = new Date(2026, 7, 3, 8, 0)
  assert.equal(startOfWeek(lundi).getTime(), MONDAY.getTime())
})

test('une fin avant le début signifie qu\'on a passé minuit', () => {
  const start = fromInputs('2026-08-03', '23:00')!
  const end   = fromInputs('2026-08-03', '01:00', start)!
  assert.equal((end.getTime() - start.getTime()) / 60000, 120)
  assert.equal(end.getDate(), 4)
})

test('date et heure locales font l\'aller-retour sans dériver', () => {
  const d = new Date(2026, 7, 3, 1, 5)                  // 01:05 locales
  assert.equal(toDateInput(d), '2026-08-03')
  assert.equal(toTimeInput(d), '01:05')
  assert.equal(fromInputs('2026-08-03', '01:05')!.getTime(), d.getTime())
})
