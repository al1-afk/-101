/**
 * AIButton — bouton flottant "✨" à poser à côté de n'importe quel champ texte
 * pour proposer :
 *   - Correction typographique
 *   - Reformulation (professionnel, poli, court, etc.)
 *   - Génération (à partir d'un sujet court)
 *
 * Le moteur est 100% local (voir `src/lib/textEnhancer.ts`) — aucune API
 * externe n'est appelée, aucun coût, aucune fuite de données.
 *
 *   <AIButton value={text} onChange={setText} kinds={['correct','rewrite']} />
 */
import { useEffect, useState } from 'react'
import { Sparkles, Check, Wand2, PenLine, Languages, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  correctText, rewriteText, generateText, diffCount,
  type RewriteStyle, type GenerationKind,
} from '@/lib/textEnhancer'
import { aiApi, aiStatus } from '@/lib/aiApi'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Kind = 'correct' | 'rewrite' | 'generate' | 'translate'

interface Props {
  /** Valeur actuelle du champ. */
  value:      string
  /** Callback pour mettre à jour le champ. */
  onChange:   (next: string) => void
  /** Actions proposées. Par défaut : correct + rewrite. */
  kinds?:     Kind[]
  /** Type de contenu à générer (si `generate` est activé). */
  generationKind?: GenerationKind
  /** Placer le bouton "flat" (dans une toolbar) ou "floating" (overlay). */
  variant?:   'floating' | 'flat'
  /** Classe additionnelle pour positionner le bouton. */
  className?: string
  /** Taille — par défaut compact. */
  size?:      'sm' | 'md'
  /** Désactiver totalement. */
  disabled?:  boolean
}

const REWRITE_STYLES: Array<{ id: RewriteStyle; label: string; hint: string }> = [
  { id: 'professionnel', label: 'Professionnel', hint: 'Registre soutenu, vocabulaire précis' },
  { id: 'commercial',    label: 'Commercial',    hint: 'Accroche + appel à l’action' },
  { id: 'poli',          label: 'Poli',          hint: 'Formules de politesse, vouvoiement' },
  { id: 'technique',     label: 'Technique',     hint: 'Structuré, avec points clés' },
  { id: 'court',         label: 'Court',         hint: 'Concis, sans mots inutiles' },
  { id: 'detaille',      label: 'Détaillé',      hint: 'Étoffé avec transitions' },
]

export default function AIButton({
  value, onChange,
  kinds = ['correct', 'rewrite'],
  generationKind = 'tache',
  variant = 'floating',
  className,
  size = 'sm',
  disabled = false,
}: Props) {
  const [open,       setOpen]       = useState(false)
  const [busy,       setBusy]       = useState<null | Kind | RewriteStyle>(null)
  const [openAiReady, setOpenAiReady] = useState(false)

  /* Détecte au montage si OpenAI est configuré côté serveur. Si oui, on
     préfère l'API distante (bien plus intelligente que les règles locales).
     Sinon, on retombe silencieusement sur le moteur local. */
  useEffect(() => {
    aiStatus().then(s => setOpenAiReady(!!s.configured)).catch(() => setOpenAiReady(false))
  }, [])

  const empty = !value?.trim()

  const applyCorrect = async () => {
    if (empty) { toast.error('Le champ est vide'); return }
    setBusy('correct')
    let out = value
    let usedAi = false
    try {
      if (openAiReady) {
        const r = await aiApi.correct(value)
        out = r.text
        usedAi = true
      } else {
        await new Promise(r => setTimeout(r, 180))
        out = correctText(value)
      }
    } catch (e: any) {
      // Fallback local silencieux si le backend échoue
      out = correctText(value)
      usedAi = false
    }
    const changed = diffCount(value, out)
    onChange(out)
    setBusy(null)
    setOpen(false)
    toast.success(
      changed === 0
        ? 'Aucune correction nécessaire'
        : `Texte corrigé${usedAi ? ' (IA)' : ' (local)'} — ${changed} car.`,
    )
  }

  const applyRewrite = async (style: RewriteStyle) => {
    if (empty) { toast.error('Le champ est vide'); return }
    setBusy(style)
    let out = value
    let usedAi = false
    try {
      if (openAiReady) {
        const r = await aiApi.rewrite(value, style)
        out = r.text
        usedAi = true
      } else {
        await new Promise(r => setTimeout(r, 220))
        out = rewriteText(value, style)
      }
    } catch {
      out = rewriteText(value, style)
    }
    onChange(out)
    setBusy(null)
    setOpen(false)
    toast.success(`Reformulé — ${style}${usedAi ? ' (IA)' : ''}`)
  }

  const applyTranslate = async () => {
    if (empty) { toast.error('Le champ est vide'); return }
    if (!openAiReady) {
      toast.error('Traduction indisponible en local — configure OPENAI_API_KEY côté serveur')
      return
    }
    setBusy('translate')
    try {
      const r = await aiApi.translate(value)
      onChange(r.text)
      toast.success('Traduit en français (IA)')
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur de traduction')
    } finally {
      setBusy(null)
      setOpen(false)
    }
  }

  const applyGenerate = async () => {
    if (empty) { toast.error('Écris d’abord un sujet court'); return }
    setBusy('generate')
    let out = value
    let usedAi = false
    try {
      if (openAiReady) {
        const r = await aiApi.generate(value, generationKind)
        out = r.text
        usedAi = true
      } else {
        await new Promise(r => setTimeout(r, 220))
        out = generateText(value, generationKind)
      }
    } catch {
      out = generateText(value, generationKind)
    }
    onChange(out)
    setBusy(null)
    setOpen(false)
    toast.success(`Contenu généré${usedAi ? ' (IA)' : ''}`)
  }

  const btnSize = size === 'md' ? 'h-8 px-2.5 text-xs' : 'h-6 px-2 text-[11px]'
  const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'

  return (
    <div className={cn(
      'relative',
      variant === 'floating' && 'inline-block',
      className,
    )}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled || !!busy}
        className={cn(
          'inline-flex items-center gap-1 rounded-md font-medium transition-colors',
          'bg-gradient-to-r from-blue-500/10 to-violet-500/10 text-blue-600 dark:text-blue-400',
          'hover:from-blue-500/20 hover:to-violet-500/20 border border-blue-200/50 dark:border-blue-800/30',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          btnSize,
        )}
        title="Assistant IA local"
      >
        {busy ? <Loader2 className={cn(iconSize, 'animate-spin')} /> : <Sparkles className={iconSize} />}
        <span>IA</span>
      </button>

      <AnimatePresence>
        {open && !busy && (
          <>
            {/* backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0,  scale: 1 }}
              exit={{    opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute z-50 right-0 mt-1 w-64 rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-blue-500/5 to-violet-500/5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  ✨ Assistant IA {openAiReady ? '(OpenAI)' : '(local)'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {openAiReady
                    ? 'GPT-4o mini · comprend le contexte et complète les mots'
                    : '100% hors-ligne · règles typographiques'}
                </p>
              </div>

              {kinds.includes('correct') && (
                <button
                  type="button"
                  onClick={applyCorrect}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 text-left transition-colors"
                >
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Corriger</p>
                    <p className="text-[10px] text-muted-foreground">Fautes, ponctuation, typographie</p>
                  </div>
                </button>
              )}

              {kinds.includes('translate') && (
                <button
                  type="button"
                  onClick={applyTranslate}
                  disabled={!openAiReady}
                  title={openAiReady ? '' : 'Traduction indisponible en mode local'}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 text-left transition-colors border-t border-border disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Languages className="w-4 h-4 text-fuchsia-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Traduire en français</p>
                    <p className="text-[10px] text-muted-foreground">
                      {openAiReady ? 'Arabe, darija, anglais → français correct' : 'Nécessite l\'IA distante'}
                    </p>
                  </div>
                </button>
              )}

              {kinds.includes('generate') && (
                <button
                  type="button"
                  onClick={applyGenerate}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 text-left transition-colors border-t border-border"
                >
                  <PenLine className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Générer</p>
                    <p className="text-[10px] text-muted-foreground">À partir du sujet actuel</p>
                  </div>
                </button>
              )}

              {kinds.includes('rewrite') && (
                <div className="border-t border-border">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Wand2 className="w-3 h-3" /> Reformuler
                  </p>
                  {REWRITE_STYLES.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => applyRewrite(s.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted/50 text-left transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{s.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{s.hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
