/**
 * Application d'un template de projet → tâches.
 *
 * UNE CATÉGORIE = UNE TÂCHE.
 *
 * Un template décrit un métier en étapes fines : le template WordPress
 * en compte 44. Les créer une par une noyait le projet sous une liste
 * plate où « 3/44 » ne disait rien de l'avancement réel, et où « Choisir
 * la police » pesait autant que « Mise en ligne ».
 *
 * Chaque CATÉGORIE devient donc une tâche, et ses étapes deviennent sa
 * checklist : 44 lignes deviennent 9 tâches et 44 points à cocher.
 * L'avancement du projet — qui compte les lignes de `team_member_tasks` —
 * reflète alors des jalons, pas des gestes.
 *
 * Rien n'est perdu : chaque titre d'étape devient un point de checklist,
 * et ses contenus (blocs du template, SOP pré-rédigé, prompt) sont repris
 * dans la description sous son propre sous-titre.
 *
 * Ce module est la SOURCE UNIQUE des deux chemins d'application — à la
 * création du projet (Projets.tsx) et depuis la fiche projet
 * (ProjetDetail.tsx). Les dupliquer les aurait laissés diverger.
 */
/* Imports relatifs — et non l'alias « @/ » : cette logique est couverte
   par des tests Node, qui n'ont pas la résolution d'alias de Vite. */
import type { ProjetTemplate, TaskTemplate } from './projetTemplates'
import type { TaskRecurrence } from './taskRecurrence'
import type { TaskPriority } from '../hooks/useTeamMemberTasks'
import { serializeTaskDesc, newId } from './taskNotes'
import { findSopForTask, autoGenerateSopBlocks } from './sopContent'
import { generateSopPromptForTask } from './promptLibrary'

export interface TacheDeTemplate {
  title:       string
  category:    string
  priority:    TaskPriority
  description: string | null
  recurrence:  TaskRecurrence | null
}

const RANG_PRIORITE: Record<TaskPriority, number> = { low: 0, normal: 1, high: 2, urgent: 3 }

/** La catégorie hérite de l'étape la plus urgente : une mise en ligne
 *  urgente ne doit pas devenir « normale » parce que les cinq étapes
 *  qui l'accompagnent le sont. */
function prioriteDeGroupe(etapes: TaskTemplate[]): TaskPriority {
  return etapes.reduce<TaskPriority>((max, t) => {
    const p = t.priority ?? 'normal'
    return (RANG_PRIORITE[p] ?? 1) > (RANG_PRIORITE[max] ?? 1) ? p : max
  }, 'normal')
}

/* Lundi d'abord, dimanche en dernier — l'ordre de la semaine de travail,
   pas l'ordre numérique où dimanche (0) passerait en tête. */
const rangJour = (d: number) => (d === 0 ? 7 : d)

/**
 * Récurrence de la tâche-catégorie.
 *
 * Les templates GMB et Réseaux sociaux ne décrivent pas des projets mais
 * de l'entretien : « 📝 Publications (hebdo) », « ⭐ Avis clients
 * (hebdo) ». Y perdre la récurrence en fusionnant aurait vidé ces deux
 * templates de leur raison d'être.
 *
 * La catégorie n'est donc récurrente que si TOUTES ses étapes le sont,
 * sur le même rythme — sinon le rythme du groupe serait une invention.
 *
 * Pour l'hebdomadaire, on retient le PREMIER jour de la semaine
 * concerné, et non l'union des jours : une catégorie « (hebdo) » revient
 * une fois par semaine avec la semaine entière à cocher. L'union l'aurait
 * fait revenir trois fois avec, chaque fois, la même liste complète.
 */
function recurrenceDeGroupe(etapes: TaskTemplate[]): TaskRecurrence | null {
  const recs = etapes.map(e => e.recurrence).filter(Boolean) as TaskRecurrence[]
  if (recs.length === 0 || recs.length !== etapes.length) return null

  const types = new Set(recs.map(r => r.type))
  if (types.size !== 1) return null
  const type = recs[0].type

  /* endDate : conservée seulement si toutes les étapes s'accordent ;
     en retenir une au hasard arrêterait la série trop tôt ou trop tard. */
  const fins = new Set(recs.map(r => r.endDate ?? ''))
  const endDate = fins.size === 1 && recs[0].endDate ? recs[0].endDate : undefined

  if (type === 'weekly') {
    const jours = recs.flatMap(r => r.weekdays ?? []).sort((a, b) => rangJour(a) - rangJour(b))
    return { type, ...(jours.length ? { weekdays: [jours[0]] } : {}), ...(endDate ? { endDate } : {}) }
  }
  if (type === 'every_n_days') {
    /* Au plus fréquent : mieux vaut revenir trop tôt sur une checklist
       déjà faite que laisser passer l'échéance la plus serrée. */
    const intervalles = recs.map(r => r.interval ?? 1).filter(n => n > 0)
    const interval = intervalles.length ? Math.min(...intervalles) : 1
    return { type, interval, ...(endDate ? { endDate } : {}) }
  }
  return { type, ...(endDate ? { endDate } : {}) }
}

function calloutPrompt(titre: string) {
  return {
    type:    'callout' as const,
    variant: 'tip',
    title:   titre,
    text:    'Guide clé-en-main. Adapte les [placeholders] au contexte du projet.',
  }
}

/** Description d'une tâche-catégorie : le détail de chaque étape, puis
 *  la checklist qui les reprend une à une. */
function descriptionDeGroupe(
  etapes:   TaskTemplate[],
  category: string,
  tplLabel: string,
): string | null {
  const blocks: any[] = []
  let contenuRiche = false

  for (const etape of etapes) {
    const propres: any[] = []
    if (Array.isArray(etape.blocks) && etape.blocks.length > 0) {
      propres.push(...etape.blocks)
    } else {
      const preRedige = findSopForTask(etape.title)
      if (preRedige) propres.push(...preRedige)
    }
    const prompt = (etape.prompt ?? '').trim()

    /* Étape sans contenu propre : son titre vit déjà dans la checklist,
       une section vide n'ajouterait que du bruit. */
    if (propres.length === 0 && !prompt) continue

    contenuRiche = true
    blocks.push({ type: 'heading3', text: etape.title })
    blocks.push(...propres)
    if (prompt) {
      blocks.push(calloutPrompt(`Prompt IA — ${etape.title}`))
      blocks.push({ type: 'code', text: prompt })
    }
  }

  /* Aucune étape n'apporte de contenu : UNE trame pour la catégorie,
     plutôt que la même trame générique répétée à chaque étape. */
  if (!contenuRiche) {
    blocks.push(...autoGenerateSopBlocks(category, tplLabel))
    const promptCat = generateSopPromptForTask(category, tplLabel)
    if (promptCat) {
      blocks.push(calloutPrompt('Prompt IA — copier/coller'))
      blocks.push({ type: 'code', text: promptCat })
    }
  }

  /* La checklist : une ligne par étape. Les sous-étapes que le template
     définissait déjà suivent la leur, préfixées — le modèle de données ne
     connaît qu'un seul niveau, autant le montrer que feindre une
     hiérarchie qu'il ne sait pas porter. */
  const subtasks = etapes.flatMap(etape => [
    { id: newId(), title: etape.title, done: false },
    ...(etape.subtasks ?? [])
      .map(t => String(t ?? '').trim())
      .filter(Boolean)
      .map(title => ({ id: newId(), title: `— ${title}`, done: false })),
  ])

  const attachments = etapes.flatMap(etape =>
    (etape.attachments ?? [])
      .filter(a => a && a.label && a.url)
      .map(a => ({ id: newId(), label: a.label, url: a.url })))

  if (blocks.length === 0 && subtasks.length === 0 && attachments.length === 0) return null
  return serializeTaskDesc({ blocks, subtasks, attachments })
}

/** Les tâches à créer pour les templates choisis — une par catégorie. */
export function buildTasksFromTemplates(templates: ProjetTemplate[]): TacheDeTemplate[] {
  const out: TacheDeTemplate[] = []
  for (const tpl of templates) {
    for (const group of tpl.groups ?? []) {
      const etapes = group.tasks ?? []
      if (etapes.length === 0) continue
      out.push({
        title:       group.category,
        category:    group.category,
        priority:    prioriteDeGroupe(etapes),
        description: descriptionDeGroupe(etapes, group.category, tpl.label),
        recurrence:  recurrenceDeGroupe(etapes),
      })
    }
  }
  return out
}

/** Ce que l'application produira : des tâches, et les étapes qu'elles
 *  contiendront. Sert à l'annoncer honnêtement avant de cliquer. */
export function countTemplate(tpl: ProjetTemplate): { taches: number; etapes: number } {
  const groupes = (tpl.groups ?? []).filter(g => (g.tasks?.length ?? 0) > 0)
  return {
    taches: groupes.length,
    etapes: groupes.reduce((n, g) => n + g.tasks.length, 0),
  }
}
