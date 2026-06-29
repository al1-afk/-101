/**
 * Task description envelope — stocke dans team_member_tasks.description (TEXT) :
 *   - blocks       : description riche style Notion (titres, listes, images, vidéos, code…)
 *   - details      : description plain text (legacy, gardé pour compat)
 *   - subtasks     : sous-tâches checkbox
 *   - comments     : fil de discussion (membre ↔ manager)
 *   - attachments  : liens vers fichiers (Drive, Figma…)
 * Backward-compatible : si description n'est pas JSON envelope, on la garde en details.
 */
import type { SopBlock } from '@/hooks/useSops'

export interface SubTask {
  id:    string
  title: string
  done:  boolean
}

export interface TaskComment {
  id:        string
  author:    string         // "Amine Next Gital" / "Said (admin)"
  is_admin:  boolean
  text:      string
  at:        string         // ISO date
}

export interface TaskAttachment {
  id:    string
  label: string
  url:   string
}

export interface TaskEnvelope {
  blocks:       SopBlock[]
  details:      string                    // legacy plain text
  subtasks:     SubTask[]
  comments:     TaskComment[]
  attachments:  TaskAttachment[]
}

const SENTINEL = '__task_meta__'

export function parseTaskDesc(desc: string | null | undefined): TaskEnvelope {
  const empty: TaskEnvelope = { blocks: [], details: '', subtasks: [], comments: [], attachments: [] }
  if (!desc) return empty
  const trimmed = desc.trim()
  if (trimmed.startsWith('{') && trimmed.includes(SENTINEL)) {
    try {
      const d = JSON.parse(trimmed) as Partial<TaskEnvelope> & { sentinel?: string }
      let blocks = d.blocks ?? []
      /* Auto-migration : si pas de blocks mais un details legacy, convertir en paragraphe */
      if (blocks.length === 0 && d.details && d.details.trim()) {
        blocks = [{ type: 'paragraph', text: d.details }]
      }
      return {
        blocks,
        details:     d.details ?? '',
        subtasks:    d.subtasks ?? [],
        comments:    d.comments ?? [],
        attachments: d.attachments ?? [],
      }
    } catch { /* fall through */ }
  }
  /* Plain text legacy → convert to single paragraph block */
  return { ...empty, details: desc, blocks: [{ type: 'paragraph', text: desc }] }
}

export function serializeTaskDesc(e: Partial<TaskEnvelope>): string {
  const full: TaskEnvelope = {
    blocks:      e.blocks ?? [],
    details:     e.details ?? '',
    subtasks:    e.subtasks ?? [],
    comments:    e.comments ?? [],
    attachments: e.attachments ?? [],
  }
  const isEmpty =
    full.blocks.length === 0 &&
    !full.details.trim() &&
    full.subtasks.length === 0 &&
    full.comments.length === 0 &&
    full.attachments.length === 0
  if (isEmpty) return ''
  return JSON.stringify({ sentinel: SENTINEL, ...full })
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
