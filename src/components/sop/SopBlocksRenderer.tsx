/**
 * Read-only block renderer used by /my-space/sops detail view.
 * Mirrors a subset of the BlockRenderer in src/pages/SOP.tsx but is
 * self-contained and doesn't require check-state callbacks.
 */
import { useState } from 'react'
import { Check, Copy, Info, Lightbulb, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseRichText } from './parseRichText'
import { detectVideo } from './videoEmbed'
import BeforeAfterBlock from '@/components/projet/BeforeAfterBlock'
import type { SopBeforeAfterMeta, SopProjectRefMeta } from '@/hooks/useSops'

interface SopBlock {
  type:    string
  text?:   string
  title?:  string
  variant?: 'info' | 'tip' | 'warning' | 'danger' | 'success'
  items?:  string[]
  steps?:  Array<{ text: string; icon?: string; time?: string; status?: string }>
  image?:  { url: string; caption?: string; size?: string; align?: string }
  table?:  { headers: string[]; rows: string[][] }
  video?:  { url: string; caption?: string; size?: string; align?: string }
  beforeAfter?: SopBeforeAfterMeta
  projectRef?:  SopProjectRefMeta
}

const CALLOUT_STYLES: Record<string, { bg: string; border: string; icon: React.ElementType; iconColor: string }> = {
  info:    { bg: 'bg-blue-50 dark:bg-blue-950/40',       border: 'border-blue-200 dark:border-blue-900',       icon: Info,         iconColor: 'text-blue-600 dark:text-blue-400' },
  tip:     { bg: 'bg-violet-50 dark:bg-violet-950/40',   border: 'border-violet-200 dark:border-violet-900',   icon: Lightbulb,    iconColor: 'text-violet-600 dark:text-violet-400' },
  warning: { bg: 'bg-amber-50 dark:bg-amber-950/40',     border: 'border-amber-200 dark:border-amber-900',     icon: AlertTriangle,iconColor: 'text-amber-600 dark:text-amber-400' },
  danger:  { bg: 'bg-red-50 dark:bg-red-950/40',         border: 'border-red-200 dark:border-red-900',         icon: XCircle,      iconColor: 'text-red-600 dark:text-red-400' },
  success: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-900', icon: CheckCircle2, iconColor: 'text-emerald-600 dark:text-emerald-400' },
}

export function SopBlocksRenderer({ blocks }: { blocks: SopBlock[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  return (
    <div className="space-y-4 max-w-none">
      {blocks.map((block, i) => (
        <BlockOne key={i} block={block} idx={i} checked={checked} onCheck={(k) => setChecked(c => ({ ...c, [k]: !c[k] }))} />
      ))}
    </div>
  )
}

function CopyableText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 inline-flex items-center gap-1 ml-2"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copié' : 'Copier'}
    </button>
  )
}

function BlockOne({ block, idx, checked, onCheck }: {
  block: SopBlock
  idx:   number
  checked: Record<string, boolean>
  onCheck: (key: string) => void
}) {
  switch (block.type) {
    case 'heading':
      return <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-4">{block.text}</h2>
    case 'heading2':
      return <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-3 pb-1 border-b border-slate-200 dark:border-slate-800">{block.text}</h3>
    case 'heading3':
      return <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-2">{block.text}</h4>
    case 'paragraph':
      return <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{parseRichText(block.text ?? '')}</p>
    case 'quote':
      return (
        <blockquote className="border-l-4 border-slate-300 dark:border-slate-700 pl-4 py-1 italic text-sm text-slate-600 dark:text-slate-400">
          {parseRichText(block.text ?? '')}
        </blockquote>
      )
    case 'divider':
      return <hr className="my-4 border-slate-200 dark:border-slate-800" />
    case 'list':
      return (
        <ul className="space-y-1.5 ml-1">
          {(block.items ?? []).map((it, i) => (
            <li key={i} className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2">
              <span className="text-slate-400 dark:text-slate-600 mt-1">•</span>
              <span>{parseRichText(it)}</span>
            </li>
          ))}
        </ul>
      )
    case 'numbered':
      return (
        <ol className="space-y-1.5 ml-1 list-decimal list-inside marker:text-slate-400 marker:font-bold">
          {(block.items ?? []).map((it, i) => (
            <li key={i} className="text-sm text-slate-700 dark:text-slate-300">{parseRichText(it)}</li>
          ))}
        </ol>
      )
    case 'checklist':
      return (
        <div className="space-y-1.5">
          {(block.items ?? []).map((it, i) => {
            const key = `b${idx}-${i}`
            const isChecked = checked[key]
            return (
              <label key={i} className="flex items-start gap-2.5 group cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!isChecked}
                  onChange={() => onCheck(key)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span className={cn(
                  'text-sm transition-all',
                  isChecked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300',
                )}>
                  {parseRichText(it)}
                </span>
              </label>
            )
          })}
        </div>
      )
    case 'steps':
      return (
        <ol className="space-y-2">
          {(block.steps ?? []).map((s, i) => (
            <li key={i} className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="text-sm text-slate-800 dark:text-slate-200">{parseRichText(s.text)}</div>
                {s.time && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">⏱ {s.time}</div>}
              </div>
            </li>
          ))}
        </ol>
      )
    case 'callout': {
      const v = block.variant ?? 'info'
      const style = CALLOUT_STYLES[v] ?? CALLOUT_STYLES.info
      const Icon = style.icon
      return (
        <div className={cn('rounded-lg border p-3 flex gap-3', style.bg, style.border)}>
          <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', style.iconColor)} />
          <div className="flex-1">
            {block.title && <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{block.title}</div>}
            {block.text && <div className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{parseRichText(block.text)}</div>}
          </div>
        </div>
      )
    }
    case 'template':
      return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">📋 Template</span>
            <CopyableText text={block.text ?? ''} />
          </div>
          <pre className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">{block.text}</pre>
        </div>
      )
    case 'code':
      return (
        <pre className="rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-200 p-3 text-xs overflow-x-auto font-mono">
          {block.text}
        </pre>
      )
    case 'table': {
      const t = block.table
      if (!t) return null
      return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr>
                {t.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((row, r) => (
                <tr key={r} className="border-b border-slate-100 dark:border-slate-800/50">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 text-slate-700 dark:text-slate-300">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'image':
      return block.image ? (
        <figure className="my-3">
          <img src={block.image.url} alt={block.image.caption ?? ''} className="rounded-lg max-w-full" />
          {block.image.caption && <figcaption className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center">{block.image.caption}</figcaption>}
        </figure>
      ) : null
    case 'video': {
      const v = block.video
      if (!v?.url) return null
      const info = detectVideo(v.url)
      const sizeClass = v.size === 'small' ? 'max-w-xs' : v.size === 'medium' ? 'max-w-sm' : v.size === 'large' ? 'max-w-md' : 'w-full'
      const alignClass = v.align === 'left' ? 'mr-auto' : v.align === 'right' ? 'ml-auto' : 'mx-auto'
      return (
        <figure className={cn('my-3', sizeClass, alignClass)}>
          <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-black">
            {info.embedUrl ? (
              info.kind === 'file' ? (
                <video src={info.embedUrl} controls className="w-full h-full" />
              ) : (
                <iframe
                  src={info.embedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={v.caption || 'Vidéo'}
                />
              )
            ) : (
              <a href={v.url} target="_blank" rel="noreferrer"
                className="flex items-center justify-center w-full h-full text-sm text-white/90 hover:underline">
                Ouvrir la vidéo : {v.url}
              </a>
            )}
          </div>
          {v.caption && <figcaption className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center">{v.caption}</figcaption>}
        </figure>
      )
    }
    case 'before-after':
      return block.beforeAfter ? <BeforeAfterBlock meta={block.beforeAfter} /> : null
    case 'project-ref':
      // Hors contexte projet on affiche juste le libellé attendu
      return block.projectRef ? (
        <div className="my-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-mono">{'{{' + block.projectRef.field + '}}'}</span>
          <span className="text-[10px] uppercase tracking-widest">auto-fill projet</span>
        </div>
      ) : null
    default:
      return block.text ? <p className="text-sm text-slate-600 dark:text-slate-400">{block.text}</p> : null
  }
}
