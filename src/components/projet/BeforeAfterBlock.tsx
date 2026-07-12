/**
 * BeforeAfterBlock — comparaison visuelle Avant / Après pour un SOP.
 *
 * Rend deux images côte à côte séparées par une flèche « → » et surmontées
 * de labels « Avant » / « Après » (personnalisables). Sur mobile les images
 * passent l'une au-dessus de l'autre avec une flèche verticale.
 *
 * Utilisé par TaskSopViewer et SopBlocksRenderer via block.type === 'before-after'.
 */
import { ArrowRight, ArrowDown } from 'lucide-react'
import type { SopBeforeAfterMeta } from '@/hooks/useSops'

interface Props {
  meta: SopBeforeAfterMeta
}

export default function BeforeAfterBlock({ meta }: Props) {
  const labelBefore = meta.labelBefore ?? 'Avant'
  const labelAfter  = meta.labelAfter  ?? 'Après'

  return (
    <div className="my-4 rounded-2xl border border-border bg-gradient-to-br from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="flex flex-col md:flex-row items-stretch gap-3">
        <Panel
          tone="before"
          label={labelBefore}
          url={meta.before?.url}
          caption={meta.before?.caption}
        />

        {/* Arrow — horizontal desktop, vertical mobile */}
        <div className="flex md:flex-col items-center justify-center gap-1 flex-shrink-0">
          <div className="hidden md:flex w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 items-center justify-center text-white shadow-md">
            <ArrowRight className="w-5 h-5" />
          </div>
          <div className="flex md:hidden w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 items-center justify-center text-white shadow-md">
            <ArrowDown className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Résultat
          </span>
        </div>

        <Panel
          tone="after"
          label={labelAfter}
          url={meta.after?.url}
          caption={meta.after?.caption}
        />
      </div>
    </div>
  )
}

function Panel({
  tone, label, url, caption,
}: {
  tone:     'before' | 'after'
  label:    string
  url?:     string
  caption?: string
}) {
  const isAfter = tone === 'after'
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
          isAfter
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
            : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30'
        }`}>
          {label}
        </span>
      </div>
      <div className={`aspect-video rounded-xl overflow-hidden border ${
        isAfter ? 'border-emerald-200 dark:border-emerald-900/50' : 'border-slate-200 dark:border-slate-800'
      } bg-white dark:bg-slate-900 flex items-center justify-center`}>
        {url ? (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-3">
            <p className="text-xs text-muted-foreground">
              Image « {label} » non fournie
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Colle une capture (CMD+V) dans l'étape puis référence-la ici.
            </p>
          </div>
        )}
      </div>
      {caption && (
        <p className="text-[11px] text-muted-foreground mt-1.5 text-center italic">
          {caption}
        </p>
      )}
    </div>
  )
}
