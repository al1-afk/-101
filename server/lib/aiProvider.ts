/**
 * Abstraction fournisseur IA — réutilise les deux intégrations déjà
 * présentes dans le projet :
 *   - OpenAI  via fetch HTTP direct   (cf. server/routes/ai.ts)
 *   - Anthropic via @anthropic-ai/sdk (cf. server/routes/financeAi.ts)
 *
 * Le reste du code (génération de devis) ne dépend que de `callAIText`,
 * indépendamment du fournisseur réellement configuré. La clé API n'est
 * lue que côté serveur, jamais exposée au frontend.
 *
 * Variables d'environnement :
 *   AI_QUOTE_PROVIDER   openai | anthropic | auto   (défaut: auto)
 *   AI_QUOTE_MODEL      override du modèle (sinon défaut par fournisseur)
 *   AI_QUOTE_TIMEOUT_MS timeout d'un appel IA        (défaut: 45000)
 *   OPENAI_API_KEY / OPENAI_MODEL
 *   ANTHROPIC_API_KEY / ANTHROPIC_MODEL
 */
import Anthropic from '@anthropic-ai/sdk'

export type AiProvider = 'openai' | 'anthropic'

const DEFAULT_OPENAI_MODEL    = 'gpt-4o-mini'
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

export function aiTimeoutMs(): number {
  const n = Number(process.env.AI_QUOTE_TIMEOUT_MS)
  // 60 s par défaut : une génération JSON structurée (analyse/devis) peut
  // dépasser 30 s quand l'API est chargée. Configurable via l'env.
  return Number.isFinite(n) && n > 0 ? n : 60_000
}

/** Fournisseur effectif compte tenu de la config + des clés disponibles. */
export function resolveProvider(): { provider: AiProvider; model: string } | null {
  const pref = (process.env.AI_QUOTE_PROVIDER || 'auto').toLowerCase()
  const hasOpenai    = !!process.env.OPENAI_API_KEY
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const override     = process.env.AI_QUOTE_MODEL?.trim()

  const pick = (p: AiProvider): { provider: AiProvider; model: string } => ({
    provider: p,
    model: override
      || (p === 'openai'
        ? (process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL)
        : (process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL)),
  })

  if (pref === 'openai')    return hasOpenai    ? pick('openai')    : null
  if (pref === 'anthropic') return hasAnthropic ? pick('anthropic') : null
  // auto : OpenAI en premier (module IA texte principal), sinon Anthropic.
  if (hasOpenai)    return pick('openai')
  if (hasAnthropic) return pick('anthropic')
  return null
}

export function isAiConfigured(): boolean {
  return resolveProvider() !== null
}

/* Instanciation paresseuse du client Anthropic (même pattern que financeAi). */
let _anthropic: Anthropic | null = null
function anthropicClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _anthropic
}

export class AiUnavailableError extends Error {
  status: number
  constructor(message: string, status = 503) { super(message); this.status = status }
}

interface CallOpts { maxTokens?: number; temperature?: number }

async function callOpenAI(model: string, system: string, user: string, opts: CallOpts): Promise<string> {
  const { maxTokens = 2048, temperature = 0.2 } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), aiTimeoutMs())
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      const status = res.status === 429 ? 429 : 502
      throw new AiUnavailableError(`OpenAI ${res.status}: ${txt.slice(0, 200)}`, status)
    }
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    return String(json?.choices?.[0]?.message?.content ?? '').trim()
  } catch (err: unknown) {
    if (err instanceof AiUnavailableError) throw err
    if (err instanceof Error && err.name === 'AbortError') throw new AiUnavailableError('Délai IA dépassé (timeout)', 504)
    throw new AiUnavailableError(`Erreur réseau IA: ${err instanceof Error ? err.message : String(err)}`, 502)
  } finally {
    clearTimeout(timer)
  }
}

async function callAnthropic(model: string, system: string, user: string, opts: CallOpts): Promise<string> {
  const { maxTokens = 2048, temperature = 0.2 } = opts
  try {
    const response = await anthropicClient().messages.create(
      {
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: user }],
      },
      { timeout: aiTimeoutMs() },
    )
    const textBlock = response.content.find(b => b.type === 'text')
    return textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string }
    const status = e?.status === 429 ? 429 : (e?.name === 'APIConnectionTimeoutError' ? 504 : 502)
    throw new AiUnavailableError(`Anthropic: ${e?.message ?? String(err)}`, status)
  }
}

/**
 * Appel IA générique. Retourne le texte brut (le JSON est parsé/validé
 * en aval par aiQuoteCore pour rester testable). Lève AiUnavailableError.
 */
export async function callAIText(system: string, user: string, opts: CallOpts = {}): Promise<{
  text: string
  provider: AiProvider
  model: string
}> {
  const sel = resolveProvider()
  if (!sel) throw new AiUnavailableError('Service IA non configuré (aucune clé OPENAI_API_KEY / ANTHROPIC_API_KEY)')
  const text = sel.provider === 'openai'
    ? await callOpenAI(sel.model, system, user, opts)
    : await callAnthropic(sel.model, system, user, opts)
  return { text, provider: sel.provider, model: sel.model }
}
