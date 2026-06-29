/**
 * Client notes envelope: keeps free-form text + structured meta
 * (domain, hosting…) + Notion-style blocks, all inside the single
 * `clients.notes` text column. Backward-compatible: legacy plain-text
 * notes are kept intact.
 */
import type { SopBlock } from '@/hooks/useSops'

export interface ClientMeta {
  domainName?:    string  // e.g. example.com
  domainExpiry?:  string  // ISO YYYY-MM-DD
  hostingName?:  string  // e.g. OVH · Dokploy
  hostingExpiry?:string  // ISO YYYY-MM-DD
}

interface NotesEnvelope {
  sentinel?: string
  _meta:     ClientMeta
  text:      string
  blocks?:   SopBlock[]
}

const SENTINEL = '__client_meta__'

export function parseClientNotes(
  notes: string | null | undefined,
): { meta: ClientMeta; text: string; blocks: SopBlock[] } {
  if (!notes) return { meta: {}, text: '', blocks: [] }
  const trimmed = notes.trim()
  if (trimmed.startsWith('{') && trimmed.includes(SENTINEL)) {
    try {
      const d = JSON.parse(trimmed) as NotesEnvelope
      return { meta: d._meta ?? {}, text: d.text ?? '', blocks: d.blocks ?? [] }
    } catch {
      /* fall through to legacy */
    }
  }
  return { meta: {}, text: notes, blocks: [] }
}

export function serializeClientNotes(meta: ClientMeta, text: string, blocks: SopBlock[] = []): string {
  const hasMeta   = Object.values(meta).some(v => v && String(v).trim() !== '')
  const hasBlocks = blocks.length > 0
  /* All empty → empty string */
  if (!hasMeta && !hasBlocks && !text.trim()) return ''
  /* Plain text only → keep legacy format */
  if (!hasMeta && !hasBlocks) return text
  return JSON.stringify({ sentinel: SENTINEL, _meta: meta, text, blocks })
}

/**
 * Days remaining until ISO date string (positive = future, negative = past).
 * Returns null when no date provided.
 */
export function daysUntil(iso: string | undefined | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}
