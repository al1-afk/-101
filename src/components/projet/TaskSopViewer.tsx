/**
 * TaskSopViewer — Renderer Premium type Notion / ClickUp pour les SOPs des tâches.
 *
 * Reçoit les mêmes `blocks` que SopBlocksRenderer mais les transforme en une
 * expérience beaucoup plus riche :
 *   • Header avec métadonnées auto-calculées (étapes, prompts, temps)
 *   • Barre de progression sticky basée sur les checklists cochées
 *   • Table des matières flottante (h3 = étape)
 *   • Étapes en accordion — cocher = ouvrir la suivante
 *   • Cartes prompts IA avec bouton Copier + compteur
 *   • Callouts Premium colorés
 *   • Checklists persistées par (taskId, index) en localStorage
 *
 * Rétro-compatible : accepte le même format SopBlock[] déjà utilisé partout.
 * Zéro migration DB. Utilise le design system existant.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Copy, Info, Lightbulb, AlertTriangle, XCircle, CheckCircle2,
  ChevronDown, ChevronRight, Sparkles, Clock, ListChecks, Target, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseRichText } from '@/components/sop/parseRichText'
import { toast } from 'sonner'
import type { SopBlock } from '@/hooks/useSops'
import type { Projet } from '@/hooks/useProjets'
import type { Client } from '@/hooks/useClients'
import StepAttachments from './StepAttachments'
import BeforeAfterBlock from './BeforeAfterBlock'
import ProjectDataRef from './ProjectDataRef'

/* ═══════════════════════════════════════════════════════════════════
   1) MODEL — regroupe les blocks en sections & étapes
═══════════════════════════════════════════════════════════════════ */

interface Etape {
  title:         string              // h3
  blocks:        SopBlock[]          // tout ce qui suit jusqu'au prochain h3 / h2
  totalChecks:   number
  checkOffset:   number              // index global du premier check dans le SOP
}

interface Section {
  title:  string                     // h2
  etapes: Etape[]                    // suite de h3 (ou 1 seule pseudo-étape sans titre)
  blocksBefore: SopBlock[]           // blocs entre le h2 et le premier h3
}

interface ParsedSop {
  intro:      SopBlock[]             // blocs avant le premier h2 (header / callouts globaux)
  sections:   Section[]
  totalChecks: number                // total de cases à cocher (pour le %)
}

/** Divise les blocks en sections (h2) et étapes (h3). */
function parseBlocks(blocks: SopBlock[]): ParsedSop {
  const intro: SopBlock[] = []
  const sections: Section[] = []
  let curSection: Section | undefined
  let curEtape:   Etape   | undefined
  let checkCount = 0

  const flushEtape = () => {
    if (curEtape && curSection) curSection.etapes.push(curEtape)
    curEtape = undefined
  }
  const flushSection = () => {
    flushEtape()
    if (curSection) sections.push(curSection)
    curSection = undefined
  }
  const startSection = (title: string) => {
    flushSection()
    curSection = { title, etapes: [], blocksBefore: [] }
  }
  const startEtape = (title: string) => {
    if (!curSection) startSection('Contenu')
    flushEtape()
    curEtape = { title, blocks: [], totalChecks: 0, checkOffset: checkCount }
  }

  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'heading2') {
      startSection(b.text ?? 'Section')
      continue
    }
    if (b.type === 'heading3') {
      startEtape(b.text ?? 'Étape')
      continue
    }
    if (curEtape) curEtape.blocks.push(b)
    else if (curSection) curSection.blocksBefore.push(b)
    else intro.push(b)
    if (b.type === 'checklist') {
      const n = (b.items ?? []).length
      checkCount += n
      if (curEtape) curEtape.totalChecks += n
    }
  }
  flushSection()

  return { intro, sections, totalChecks: checkCount }
}

/* ═══════════════════════════════════════════════════════════════════
   2) META — extrait temps, nb prompts, difficulté
═══════════════════════════════════════════════════════════════════ */

interface SopMeta {
  totalEtapes:  number
  totalPrompts: number
  totalChecks:  number
  totalTime:    string | null
}

function extractMeta(parsed: ParsedSop, allBlocks: SopBlock[]): SopMeta {
  const totalEtapes  = parsed.sections.reduce((s, sec) => s + sec.etapes.length, 0)
  const totalPrompts = allBlocks.filter(b => b.type === 'code').length
  const totalChecks  = parsed.totalChecks

  // Cherche des mentions "Temps : X min" dans les paragraphes
  let totalMinutes = 0
  for (const b of allBlocks) {
    if (b.type !== 'paragraph') continue
    const m = (b.text ?? '').match(/temps\s*:\s*(\d+)\s*(min|minutes|h|heure)/i)
    if (m) {
      const n = Number(m[1])
      totalMinutes += m[2].toLowerCase().startsWith('h') ? n * 60 : n
    }
  }
  const totalTime = totalMinutes > 0
    ? totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)}h${totalMinutes % 60 ? ` ${totalMinutes % 60}min` : ''}`
      : `${totalMinutes} min`
    : null

  return { totalEtapes, totalPrompts, totalChecks, totalTime }
}

/* ═══════════════════════════════════════════════════════════════════
   3) CHECKLIST PERSISTENCE — localStorage
═══════════════════════════════════════════════════════════════════ */

function useCheckedState(taskId: string, totalChecks: number) {
  const key = `sop-progress:${taskId}`
  const [checked, setChecked] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return new Set()
      const arr = JSON.parse(raw) as number[]
      return new Set(arr.filter(n => n < totalChecks))
    } catch { return new Set() }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(Array.from(checked))) } catch {}
  }, [key, checked])
  const toggle = (idx: number) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    return next
  })
  const reset = () => setChecked(new Set())
  return { checked, toggle, reset }
}

/* ═══════════════════════════════════════════════════════════════════
   4) COMPOSANTS DE RENDU
═══════════════════════════════════════════════════════════════════ */

const CALLOUT_STYLES: Record<string, { bg: string; border: string; icon: React.ElementType; iconColor: string; ring: string }> = {
  info:    { bg: 'bg-blue-50/70 dark:bg-blue-950/30',      border: 'border-blue-200 dark:border-blue-900/50',    icon: Info,          iconColor: 'text-blue-600 dark:text-blue-400',    ring: 'ring-blue-500/10' },
  tip:     { bg: 'bg-violet-50/70 dark:bg-violet-950/30',  border: 'border-violet-200 dark:border-violet-900/50',icon: Lightbulb,     iconColor: 'text-violet-600 dark:text-violet-400',ring: 'ring-violet-500/10' },
  warning: { bg: 'bg-amber-50/70 dark:bg-amber-950/30',    border: 'border-amber-200 dark:border-amber-900/50',  icon: AlertTriangle, iconColor: 'text-amber-600 dark:text-amber-400',  ring: 'ring-amber-500/10' },
  danger:  { bg: 'bg-rose-50/70 dark:bg-rose-950/30',      border: 'border-rose-200 dark:border-rose-900/50',    icon: XCircle,       iconColor: 'text-rose-600 dark:text-rose-400',    ring: 'ring-rose-500/10' },
  success: { bg: 'bg-emerald-50/70 dark:bg-emerald-950/30',border: 'border-emerald-200 dark:border-emerald-900/50',icon: CheckCircle2,iconColor: 'text-emerald-600 dark:text-emerald-400',ring: 'ring-emerald-500/10' },
}

function CalloutBlock({ block }: { block: SopBlock }) {
  const variant = block.variant ?? 'info'
  const style = CALLOUT_STYLES[variant] ?? CALLOUT_STYLES.info
  const Icon = style.icon
  return (
    <div className={cn(
      'rounded-xl border p-4 my-3 ring-1',
      style.bg, style.border, style.ring,
    )}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex-shrink-0', style.iconColor)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          {block.title && (
            <p className={cn('font-bold text-sm mb-1', style.iconColor)}>
              {parseRichText(block.title)}
            </p>
          )}
          {block.text && (
            <div className="text-sm text-foreground/90 leading-relaxed">
              {parseRichText(block.text)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PromptCard({ block, agent }: { block: SopBlock; agent: string }) {
  const [copied, setCopied] = useState(false)
  const [count,  setCount]  = useState(() => {
    try { return Number(localStorage.getItem(`prompt-copies:${block.text?.slice(0, 40)}`) ?? 0) }
    catch { return 0 }
  })
  const label = agent.toLowerCase()
  const styles =
    label.includes('claude')    ? { bg: 'from-orange-500/10 to-amber-500/10',   text: 'text-orange-700 dark:text-orange-400',    border: 'border-orange-200 dark:border-orange-900/50',    emoji: '🤖' } :
    label.includes('chatgpt')   ? { bg: 'from-emerald-500/10 to-teal-500/10',   text: 'text-emerald-700 dark:text-emerald-400',  border: 'border-emerald-200 dark:border-emerald-900/50',  emoji: '💬' } :
    label.includes('gemini')    ? { bg: 'from-blue-500/10 to-cyan-500/10',      text: 'text-blue-700 dark:text-blue-400',        border: 'border-blue-200 dark:border-blue-900/50',        emoji: '✨' } :
    label.includes('cursor')    ? { bg: 'from-violet-500/10 to-purple-500/10',  text: 'text-violet-700 dark:text-violet-400',    border: 'border-violet-200 dark:border-violet-900/50',    emoji: '⌨️' } :
                                  { bg: 'from-slate-500/10 to-slate-400/10',    text: 'text-slate-700 dark:text-slate-400',      border: 'border-slate-200 dark:border-slate-800',         emoji: '📝' }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block.text ?? '')
      setCopied(true)
      const n = count + 1
      setCount(n)
      try { localStorage.setItem(`prompt-copies:${block.text?.slice(0, 40)}`, String(n)) } catch {}
      toast.success('Prompt copié ✨')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copie impossible')
    }
  }

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden bg-gradient-to-br',
      styles.bg, styles.border,
    )}>
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', styles.border)}>
        <div className={cn('flex items-center gap-2 font-bold text-sm', styles.text)}>
          <span>{styles.emoji}</span> {agent}
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono">
              copié {count}×
            </span>
          )}
          <button
            type="button"
            onClick={copy}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
              copied
                ? 'bg-emerald-500 text-white scale-105'
                : 'bg-background hover:bg-muted border border-border',
            )}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
      </div>
      <pre className="p-4 text-[12.5px] font-mono whitespace-pre-wrap break-words text-foreground/90 max-h-96 overflow-y-auto">
        {block.text}
      </pre>
    </div>
  )
}

function CodeBlock({ block }: { block: SopBlock }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-lg border border-border bg-slate-950 dark:bg-slate-900 overflow-hidden my-3 group relative">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(block.text ?? '').then(() => {
            setCopied(true); toast.success('Copié'); setTimeout(() => setCopied(false), 1200)
          })
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded bg-slate-800 text-slate-100 text-[10px] font-mono hover:bg-slate-700"
      >
        {copied ? '✓ copié' : 'copier'}
      </button>
      <pre className="p-4 text-[12.5px] font-mono text-slate-100 whitespace-pre-wrap break-words overflow-x-auto">
        {block.text}
      </pre>
    </div>
  )
}

function TableBlock({ block }: { block: SopBlock }) {
  if (!block.table) return null
  return (
    <div className="my-3 rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              {block.table.headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold text-foreground text-xs uppercase tracking-wider">
                  {parseRichText(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.table.rows.map((row, r) => (
              <tr key={r} className={cn('border-t border-border', r % 2 === 0 ? '' : 'bg-muted/20')}>
                {row.map((cell, c) => (
                  <td key={c} className="px-3 py-2 text-foreground/90">{parseRichText(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChecklistBlock({
  block, offset, checked, onToggle,
}: {
  block:    SopBlock
  offset:   number
  checked:  Set<number>
  onToggle: (i: number) => void
}) {
  const items = block.items ?? []
  return (
    <div className="space-y-1.5 my-3">
      {items.map((item, i) => {
        const globalIdx = offset + i
        const done = checked.has(globalIdx)
        return (
          <label
            key={i}
            className={cn(
              'flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors',
              done ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : 'hover:bg-muted/40',
            )}
          >
            <button
              type="button"
              onClick={() => onToggle(globalIdx)}
              className={cn(
                'mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                done
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400',
              )}
            >
              {done && <Check className="w-3 h-3 text-white" />}
            </button>
            <span className={cn(
              'text-sm flex-1',
              done && 'line-through text-muted-foreground',
            )}>
              {parseRichText(item)}
            </span>
          </label>
        )
      })}
    </div>
  )
}

/* Rend une liste de blocs (utilisé récursivement dans les étapes). */
function BlocksList({
  blocks, checkOffset, checked, onToggle, projet, client,
}: {
  blocks:      SopBlock[]
  checkOffset: number
  checked:     Set<number>
  onToggle:    (i: number) => void
  projet?:     Projet
  client?:     Client
}) {
  let runningOffset = checkOffset
  const rendered: React.ReactNode[] = []
  // Détecte les code blocks précédés d'un h3 ou paragraphe contenant un agent connu
  let promptAgent: string | null = null

  blocks.forEach((b, i) => {
    // Est-ce un heading qui identifie un agent ?
    const raw = (b.text ?? '').toLowerCase()
    if (b.type === 'heading3' || (b.type === 'paragraph' && raw.length < 60)) {
      const agent =
        raw.includes('claude code') || raw.startsWith('claude') ? 'Claude Code' :
        raw.includes('chatgpt')                                 ? 'ChatGPT'    :
        raw.includes('gemini')                                  ? 'Gemini'     :
        raw.includes('cursor')                                  ? 'Cursor'     : null
      if (agent) {
        promptAgent = agent
        return  // on n'affiche pas le heading, il sera repris dans la carte
      }
    }

    switch (b.type) {
      case 'heading':
      case 'heading2':
        rendered.push(<h3 key={i} className="text-lg font-bold mt-6 mb-2 text-foreground">{parseRichText(b.text ?? '')}</h3>)
        promptAgent = null
        break
      case 'heading3':
        rendered.push(<h4 key={i} className="text-base font-semibold mt-4 mb-1.5 text-foreground/90">{parseRichText(b.text ?? '')}</h4>)
        promptAgent = null
        break
      case 'paragraph':
        rendered.push(
          <p key={i} className="text-sm leading-relaxed text-foreground/90 my-2">
            {parseRichText(b.text ?? '')}
          </p>,
        )
        break
      case 'list':
        rendered.push(
          <ul key={i} className="list-disc list-inside space-y-1 my-2 text-sm text-foreground/90 marker:text-blue-500">
            {(b.items ?? []).map((it, k) => <li key={k}>{parseRichText(it)}</li>)}
          </ul>,
        )
        break
      case 'numbered':
        rendered.push(
          <ol key={i} className="list-decimal list-inside space-y-1.5 my-2 text-sm text-foreground/90 marker:font-bold marker:text-blue-500">
            {(b.items ?? []).map((it, k) => <li key={k} className="pl-1">{parseRichText(it)}</li>)}
          </ol>,
        )
        break
      case 'checklist': {
        rendered.push(
          <ChecklistBlock
            key={i}
            block={b}
            offset={runningOffset}
            checked={checked}
            onToggle={onToggle}
          />,
        )
        runningOffset += (b.items ?? []).length
        break
      }
      case 'callout':
        rendered.push(<CalloutBlock key={i} block={b} />)
        break
      case 'code':
        if (promptAgent) {
          rendered.push(<PromptCard key={i} block={b} agent={promptAgent} />)
          promptAgent = null
        } else {
          rendered.push(<CodeBlock key={i} block={b} />)
        }
        break
      case 'table':
        rendered.push(<TableBlock key={i} block={b} />)
        break
      case 'divider':
        rendered.push(<div key={i} className="my-4 border-t border-border/60" />)
        break
      case 'quote':
        rendered.push(
          <blockquote key={i} className="border-l-4 border-blue-400 pl-4 italic my-3 text-foreground/80">
            {parseRichText(b.text ?? '')}
          </blockquote>,
        )
        break
      case 'before-after':
        if (b.beforeAfter) rendered.push(<BeforeAfterBlock key={i} meta={b.beforeAfter} />)
        break
      case 'project-ref':
        if (b.projectRef) rendered.push(
          <ProjectDataRef key={i} meta={b.projectRef} projet={projet} client={client} />,
        )
        break
      case 'image':
        if (b.image?.url) {
          rendered.push(
            <figure key={i} className="my-3">
              <img src={b.image.url} alt={b.image.caption ?? ''} className="rounded-lg max-w-full border border-border" />
              {b.image.caption && (
                <figcaption className="text-xs text-muted-foreground mt-1 text-center italic">
                  {b.image.caption}
                </figcaption>
              )}
            </figure>,
          )
        }
        break
      case 'video':
        if (b.video?.url) {
          rendered.push(
            <figure key={i} className="my-3">
              <video src={b.video.url} controls className="w-full rounded-lg border border-border bg-black" />
              {b.video.caption && (
                <figcaption className="text-xs text-muted-foreground mt-1 text-center italic">
                  {b.video.caption}
                </figcaption>
              )}
            </figure>,
          )
        }
        break
    }
  })
  return <>{rendered}</>
}

/* ═══════════════════════════════════════════════════════════════════
   5) COMPOSANT PRINCIPAL
═══════════════════════════════════════════════════════════════════ */

interface Props {
  blocks: SopBlock[]
  taskId: string
  title?: string
  projet?: Projet
  client?: Client
}

export default function TaskSopViewer({ blocks, taskId, title, projet, client }: Props) {
  const parsed = useMemo(() => parseBlocks(blocks), [blocks])
  const meta   = useMemo(() => extractMeta(parsed, blocks), [parsed, blocks])

  const { checked, toggle, reset } = useCheckedState(taskId, parsed.totalChecks)

  const progress = parsed.totalChecks > 0
    ? Math.round((checked.size / parsed.totalChecks) * 100)
    : 0

  // Étapes ouvertes — par défaut la première seulement, ou toutes si aucune n'a de check
  const flatEtapes = useMemo(
    () => parsed.sections.flatMap(s => s.etapes.map(e => ({ section: s.title, etape: e }))),
    [parsed],
  )
  const [openEtape, setOpenEtape] = useState<number>(0)

  // Auto-avance : quand toutes les cases d'une étape sont cochées, ouvre la suivante
  useEffect(() => {
    for (let i = 0; i < flatEtapes.length; i++) {
      const e = flatEtapes[i].etape
      if (e.totalChecks === 0) continue
      const allDone = Array.from({ length: e.totalChecks }, (_, k) => k + e.checkOffset)
        .every(idx => checked.has(idx))
      if (allDone && i === openEtape && i + 1 < flatEtapes.length) {
        setOpenEtape(i + 1)
        break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  if (blocks.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Aucun contenu SOP pour cette tâche.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* HEADER premium avec métadonnées */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-500/5 via-violet-500/5 to-cyan-500/5 border border-blue-200/50 dark:border-blue-900/40 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">SOP</span>
            </div>
            <h2 className="text-xl font-bold text-foreground">{title ?? 'Procédure'}</h2>
          </div>
          <div className="flex items-center gap-2">
            {meta.totalTime && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold">{meta.totalTime}</span>
              </div>
            )}
            {meta.totalEtapes > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border">
                <Target className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-semibold">{meta.totalEtapes} étape{meta.totalEtapes > 1 ? 's' : ''}</span>
              </div>
            )}
            {meta.totalPrompts > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-semibold">{meta.totalPrompts} prompt{meta.totalPrompts > 1 ? 's' : ''}</span>
              </div>
            )}
            {meta.totalChecks > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border">
                <ListChecks className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold">{meta.totalChecks} tâche{meta.totalChecks > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Barre de progression */}
        {parsed.totalChecks > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Progression</span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-sm font-bold tabular-nums',
                  progress === 100 ? 'text-emerald-600' : 'text-blue-600',
                )}>
                  {progress}%
                </span>
                {checked.size > 0 && (
                  <button
                    onClick={reset}
                    className="text-[10px] text-muted-foreground hover:text-rose-500"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
            <div className="h-2 rounded-full bg-background/60 overflow-hidden">
              <motion.div
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className={cn(
                  'h-full rounded-full',
                  progress === 100
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-r from-blue-500 to-violet-500',
                )}
              />
            </div>
          </div>
        )}
      </div>

      {/* INTRO (blocs avant tout heading) */}
      {parsed.intro.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-4">
          <BlocksList blocks={parsed.intro} checkOffset={0} checked={checked} onToggle={toggle} projet={projet} client={client} />
        </div>
      )}

      {/* SECTIONS + ÉTAPES */}
      {parsed.sections.map((section, sIdx) => {
        const isSingleEtape = section.etapes.length === 1 && !section.etapes[0].title
        return (
          <div key={sIdx} className="space-y-3">
            {/* Titre section */}
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-600 flex items-center justify-center text-xs font-bold">
                {sIdx + 1}
              </div>
              <h3 className="text-base font-bold text-foreground">{section.title}</h3>
            </div>

            {/* Contenu avant les étapes (souvent des callouts d'intro) */}
            {section.blocksBefore.length > 0 && (
              <BlocksList blocks={section.blocksBefore} checkOffset={0} checked={checked} onToggle={toggle} projet={projet} client={client} />
            )}

            {/* Étapes accordéon */}
            {section.etapes.length > 0 && !isSingleEtape && (
              <div className="space-y-2">
                {section.etapes.map((etape, eIdx) => {
                  const globalIdx = parsed.sections
                    .slice(0, sIdx)
                    .reduce((s, sec) => s + sec.etapes.length, 0) + eIdx
                  const isOpen = openEtape === globalIdx

                  const etapeDone = etape.totalChecks > 0 &&
                    Array.from({ length: etape.totalChecks }, (_, k) => k + etape.checkOffset)
                      .every(idx => checked.has(idx))

                  return (
                    <div
                      key={eIdx}
                      className={cn(
                        'rounded-xl border overflow-hidden transition-all',
                        isOpen
                          ? 'border-blue-300 dark:border-blue-800 shadow-sm'
                          : 'border-border',
                        etapeDone && 'bg-emerald-50/30 dark:bg-emerald-950/10',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenEtape(isOpen ? -1 : globalIdx)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      >
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          etapeDone
                            ? 'bg-emerald-500 text-white'
                            : isOpen
                              ? 'bg-blue-500 text-white'
                              : 'bg-muted text-muted-foreground',
                        )}>
                          {etapeDone ? <Check className="w-4 h-4" /> : globalIdx + 1}
                        </div>
                        <span className={cn(
                          'flex-1 font-semibold text-sm',
                          etapeDone && 'line-through text-muted-foreground',
                        )}>
                          {etape.title}
                        </span>
                        {etape.totalChecks > 0 && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {Array.from({ length: etape.totalChecks }, (_, k) => k + etape.checkOffset).filter(i => checked.has(i)).length} / {etape.totalChecks}
                          </span>
                        )}
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-2 border-t border-border/60">
                              <BlocksList
                                blocks={etape.blocks}
                                checkOffset={etape.checkOffset}
                                checked={checked}
                                onToggle={toggle}
                                projet={projet}
                                client={client}
                              />
                              <StepAttachments
                                taskId={taskId}
                                etapeIdx={globalIdx}
                                etapeTitle={etape.title}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Cas 1 seule étape sans titre — on rend direct */}
            {isSingleEtape && (
              <>
                <BlocksList
                  blocks={section.etapes[0].blocks}
                  checkOffset={section.etapes[0].checkOffset}
                  checked={checked}
                  onToggle={toggle}
                  projet={projet}
                  client={client}
                />
                <StepAttachments
                  taskId={taskId}
                  etapeIdx={parsed.sections.slice(0, sIdx).reduce((s, sec) => s + sec.etapes.length, 0)}
                  etapeTitle={section.title}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
