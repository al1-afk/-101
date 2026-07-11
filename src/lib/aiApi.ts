/**
 * Client API pour le module IA — appelle le backend `/api/ai/*`.
 * Le backend gère la clé OpenAI ; le front n'y a jamais accès.
 */
import { api } from './api'

let _statusCache: { configured: boolean; model: string | null } | null = null
let _statusPromise: Promise<{ configured: boolean; model: string | null }> | null = null

export function aiStatus(): Promise<{ configured: boolean; model: string | null }> {
  if (_statusCache) return Promise.resolve(_statusCache)
  if (_statusPromise) return _statusPromise
  _statusPromise = api.get<{ configured: boolean; model: string | null }>('/api/ai/status')
    .then(r => { _statusCache = r; return r })
    .catch(() => ({ configured: false, model: null }))
  return _statusPromise
}

/** Force un rafraîchissement du cache (utile après changement de config). */
export function resetAiStatus() { _statusCache = null; _statusPromise = null }

export const aiApi = {
  correct: (text: string) =>
    api.post<{ text: string }>('/api/ai/correct', { text }),

  rewrite: (text: string, style: string) =>
    api.post<{ text: string }>('/api/ai/rewrite', { text, style }),

  generate: (subject: string, kind: string) =>
    api.post<{ text: string }>('/api/ai/generate', { subject, kind }),

  complete: (partial: string, context?: string) =>
    api.post<{ suggestions: string[] }>('/api/ai/complete', { partial, context }),
}
