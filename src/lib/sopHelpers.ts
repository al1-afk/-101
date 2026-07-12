/**
 * sopHelpers — helpers réutilisables pour construire des SopBlock[] par métier.
 *
 * Chaque template métier (WordPress, SEO, GBP, Logo, Meta Ads, Google Ads,
 * Réseaux sociaux, Création SOP…) importe ces primitives pour composer ses
 * SOPs. Les helpers exposent la même API que sopContent.ts (h2, p, li…) plus
 * des primitives structurantes (introExpert, etape, checklist, qa, promptCard,
 * conseilsSenior, escalade) pour homogénéiser la qualité entre templates.
 */
import type { SopBlock, SopProjectField } from '@/hooks/useSops'

/* Bricks bas niveau ────────────────────────────────────────────────── */
export const h2  = (t: string): SopBlock => ({ type: 'heading2', text: t })
export const h3  = (t: string): SopBlock => ({ type: 'heading3', text: t })
export const p   = (t: string): SopBlock => ({ type: 'paragraph', text: t })
export const li  = (items: string[]): SopBlock => ({ type: 'list', items })
export const num = (items: string[]): SopBlock => ({ type: 'numbered', items })
export const check = (items: string[]): SopBlock => ({ type: 'checklist', items })
export const code = (t: string): SopBlock => ({ type: 'code', text: t })
export const table = (headers: string[], rows: string[][]): SopBlock =>
  ({ type: 'table', table: { headers, rows } })
export const div = (): SopBlock => ({ type: 'divider' })
export const quote = (t: string): SopBlock => ({ type: 'quote', text: t })

export const info    = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'info',    title, text })
export const tip     = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'tip',     title, text })
export const warn    = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'warning', title, text })
export const success = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'success', title, text })
export const danger  = (title: string, text: string): SopBlock => ({ type: 'callout', variant: 'danger',  title, text })

export const projectRef = (field: SopProjectField, label?: string): SopBlock =>
  ({ type: 'project-ref', projectRef: { field, label } })

export const beforeAfter = (before: string, after: string, opts?: { labelBefore?: string; labelAfter?: string }): SopBlock =>
  ({ type: 'before-after', beforeAfter: {
    before: { caption: before, url: '' },
    after:  { caption: after,  url: '' },
    labelBefore: opts?.labelBefore, labelAfter: opts?.labelAfter,
  }})

/* Introductions ────────────────────────────────────────────────────── */
export interface IntroExpertOpts {
  role:      string    // ex : « Expert WordPress Senior — 30+ ans de terrain »
  objectif:  string    // ce que la tâche vise à accomplir
  resultat:  string    // à quoi ressemble le résultat validé
  delai:     string    // ex : « 45 min pour un pro, 2 h pour un débutant »
  canal:     string    // où lever un blocage sans quitter l'ERP
  regle:     string    // règle absolue à ne jamais transgresser
  prerequis?:string[]  // accès, comptes, données requises
}

export function introExpert(opts: IntroExpertOpts): SopBlock[] {
  const blocks: SopBlock[] = [
    p(`🎓 **Rôle à incarner** — ${opts.role}. Ton SOP doit être exécutable dès le premier jour, sans formation orale.`),
    info('🎯 Objectif',        opts.objectif),
    info('✅ Résultat attendu', opts.resultat),
    info('⏱️ Délai',            opts.delai),
    info('📞 Canal',            opts.canal),
    danger('🚫 Règle absolue', opts.regle),
  ]
  if (opts.prerequis && opts.prerequis.length > 0) {
    blocks.push(h3('Prérequis'))
    blocks.push(li(opts.prerequis))
  }
  return blocks
}

/* Étape structurée — pattern homogène pour tous les métiers ────────── */
export interface EtapeOpts {
  objectif:     string
  temps:        string          // « 8 min », « 30 min », « 2 h »
  ou:           string          // écran ou emplacement dans l'ERP (jamais Notion/Drive)
  actions:      string[]        // liste ordonnée, chaque action décrite (quoi + où + comment)
  resultat:     string          // ce qu'on doit voir après l'étape
  verification: string[]        // checkpoints observables
  erreurs?:     Array<[string, string]>   // [problème, solution]
  conseil?:     string          // 1 phrase — pépite d'expert (facultatif)
  code?:        string          // extrait code / commande / template
  codeLabel?:   string          // libellé au-dessus du code
}

export function etape(title: string, o: EtapeOpts): SopBlock[] {
  const blocks: SopBlock[] = [
    h3(title),
    p(`🎯 **Objectif** — ${o.objectif}. ⏱️ **Temps** — ${o.temps}.`),
    p(`🖥️ **Où** — ${o.ou}`),
    p('**Actions détaillées** :'),
    num(o.actions),
  ]
  if (o.codeLabel && o.code) {
    blocks.push(p(`✏️ ${o.codeLabel}`))
    blocks.push(code(o.code))
  }
  blocks.push(success('✅ Résultat attendu', o.resultat))
  if (o.verification.length > 0) {
    blocks.push(p('**Vérifications** — coche au fur et à mesure :'))
    blocks.push(check(o.verification))
  }
  if (o.erreurs && o.erreurs.length > 0) {
    blocks.push(warn('⚠️ Erreurs fréquentes', o.erreurs.map(([e, s]) => `• ${e} → ${s}`).join('\n')))
  }
  if (o.conseil) {
    blocks.push(tip('💡 Conseil Senior', o.conseil))
  }
  blocks.push(div())
  return blocks
}

/* Checklists de fin ─────────────────────────────────────────────────── */
export function finalCheck(items: string[]): SopBlock[] {
  return [
    h2('✅ Checklist de validation'),
    check(items),
  ]
}

export function qaCheck(items: string[]): SopBlock[] {
  return [
    h2('🔍 Contrôle qualité'),
    p('_Passe ces vérifications AVANT de marquer la tâche terminée._'),
    check(items),
  ]
}

/* Prompts IA — 4 cartes agent (Claude / ChatGPT / Gemini / Cursor) ── */
export interface AgentPrompt {
  agent:  'Claude Code' | 'ChatGPT' | 'Gemini' | 'Cursor'
  title:  string
  prompt: string
}

export function promptCards(prompts: AgentPrompt[]): SopBlock[] {
  const blocks: SopBlock[] = [h2('🧠 Prompts IA prêts à l\'emploi')]
  for (const pr of prompts) {
    blocks.push(h3(pr.agent))
    blocks.push(p(`_${pr.title}_`))
    blocks.push(code(pr.prompt))
  }
  return blocks
}

/* Ressources internes ERP + externes (URLs officielles seulement) ──── */
export function ressources(items: string[]): SopBlock[] {
  return [h2('📚 Ressources'), li(items)]
}

/* Conseils Senior consolidés ───────────────────────────────────────── */
export function conseilsSenior(items: string[]): SopBlock[] {
  return [
    h2('🎓 Conseils d\'expert (30+ ans de terrain)'),
    li(items),
  ]
}

/* Erreurs fréquentes consolidées (au-delà de l'étape) ──────────────── */
export function erreursTerrain(rows: Array<[string, string, string]>): SopBlock[] {
  return [
    h2('🚨 Erreurs fréquentes du terrain'),
    p('_Problème observé · Cause probable · Solution éprouvée._'),
    table(['Problème', 'Cause probable', 'Solution'], rows.map(r => [r[0], r[1], r[2]])),
  ]
}

/* Validation finale : quand peut-on marquer terminé ? ──────────────── */
export function validationFinale(critere: string, livrable: string): SopBlock[] {
  return [
    h2('🏁 Validation — quand la tâche est-elle terminée ?'),
    success('Critère de réussite', critere),
    info('Livrable attendu', livrable),
  ]
}

/* Escalade — quand appeler à l'aide ────────────────────────────────── */
export function escalade(condition: string, contact: string): SopBlock[] {
  return [
    danger('🚨 Escalade', `${condition} → ${contact}. Ne jamais improviser sur du critique sans validation.`),
  ]
}

/* Auto-fill projet — bloc d'infos client automatiques ─────────────── */
export function projectContext(fields: SopProjectField[]): SopBlock[] {
  const blocks: SopBlock[] = [
    h3('📋 Contexte client (auto-rempli)'),
    p('_Les données ci-dessous sont lues automatiquement depuis la fiche projet. Si une info manque, un bouton « Compléter » ouvre la section concernée._'),
  ]
  for (const f of fields) blocks.push(projectRef(f))
  return blocks
}
