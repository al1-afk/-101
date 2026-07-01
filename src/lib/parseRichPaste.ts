/**
 * parseRichPaste — convertit du texte collé (Cmd+V) en blocs SopBlock,
 * façon Notion. Reconnaît :
 *   • Titres         : `# H1`, `## H2`, `### H3`, ligne tout en MAJ = H2
 *   • Checklists     : lignes qui commencent par □ ☐ ☑ ✅ [ ] [x]
 *   • Listes         : lignes qui commencent par - • *
 *   • Listes num.    : lignes qui commencent par 1. 2) …
 *   • Tableaux       : blocs de lignes contenant | (markdown) ou tabs
 *   • Séparateurs    : --- ou ═══
 *   • Sinon          : paragraphe (lignes vides regroupent)
 *
 * Retourne un tableau de SopBlock prêt à être injecté dans BlockEditor.
 */
import type { SopBlock } from '@/hooks/useSops'

const CHECK_UNCHECKED = /^\s*(?:□|☐|\[\s?\])\s+/
/* ✅/✓ intentionnellement exclus — souvent utilisés comme emoji décoratif de
   titre (ex: "✅ LISTE DE TÂCHES"). Seuls ☑ et [x] sont des cases cochées. */
const CHECK_CHECKED   = /^\s*(?:☑|\[x\]|\[X\])\s+/
const BULLET          = /^\s*(?:[-•*])\s+/
const NUMBERED        = /^\s*\d+[.)]\s+/
const HEADING_MD      = /^(#{1,3})\s+(.*)$/
const CONTINUATION    = /^\s{2,}|^\s+→\s+|^\s+-\s+/
const DIVIDER         = /^[-–—═_]{3,}\s*$/

/** Détecte si une ligne "ressemble" à un titre.
    Règles :
      • Courte (≤ 90 chars)
      • Ignore le contenu entre parenthèses (souvent en minuscules : "(Jours 1 à 7)")
      • Le texte restant est intégralement en MAJUSCULES (ou emojis/chiffres/ponctuation) */
function looksLikeHeading(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 90) return false
  const withoutParen = t.replace(/\([^)]*\)/g, '')
  const letters = withoutParen.replace(/[^\p{L}]/gu, '')
  if (letters.length < 3) return false
  return letters === letters.toUpperCase() && /[A-ZÀ-ÖØ-Þ]/.test(withoutParen)
}

/** Retire les préfixes emoji + espaces au début pour extraire le texte utile. */
function stripMarker(line: string, re: RegExp): string {
  return line.replace(re, '').trim()
}

/** Détecte si un bloc de lignes forme un tableau markdown (--- entre header et body ok mais optionnel). */
function detectTableLines(lines: string[], start: number): { end: number; headers: string[]; rows: string[][] } | null {
  if (!lines[start] || !lines[start].includes('|')) return null
  const rows: string[][] = []
  let i = start
  while (i < lines.length && lines[i].includes('|')) {
    const cells = lines[i].split('|').map(c => c.trim())
    // Retirer les vides aux extrémités (markdown : `| a | b |`)
    if (cells[0] === '') cells.shift()
    if (cells[cells.length - 1] === '') cells.pop()
    // Ignorer les séparateurs markdown --- | ---
    if (cells.every(c => /^-+:?$|^:?-+:?$/.test(c))) { i++; continue }
    if (cells.length >= 2) rows.push(cells)
    i++
  }
  if (rows.length < 2) return null
  const [headers, ...body] = rows
  return { end: i, headers, rows: body }
}

/** Normalise les puces markdown gras : `**text**` reste, `→ …` prépendé. */
function cleanText(s: string): string {
  return s.replace(/[ \t]+/g, ' ').trim()
}

export function parseRichPaste(raw: string): SopBlock[] {
  const text = raw.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const blocks: SopBlock[] = []

  let i = 0
  let paragraphBuf: string[] = []

  const flushParagraph = () => {
    if (paragraphBuf.length === 0) return
    const combined = paragraphBuf.join(' ').trim()
    if (combined) blocks.push({ type: 'paragraph', text: combined })
    paragraphBuf = []
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    /* Ligne vide → sépare les paragraphes */
    if (!trimmed) {
      flushParagraph()
      i++
      continue
    }

    /* Séparateur */
    if (DIVIDER.test(trimmed)) {
      flushParagraph()
      blocks.push({ type: 'divider' })
      i++
      continue
    }

    /* Titre markdown # ## ### */
    const md = trimmed.match(HEADING_MD)
    if (md) {
      flushParagraph()
      const level = md[1].length
      const type: SopBlock['type'] = level === 1 ? 'heading' : level === 2 ? 'heading2' : 'heading3'
      blocks.push({ type, text: cleanText(md[2]) })
      i++
      continue
    }

    /* Tableau */
    const table = detectTableLines(lines, i)
    if (table) {
      flushParagraph()
      blocks.push({ type: 'table', table: { headers: table.headers, rows: table.rows } })
      i = table.end
      continue
    }

    /* Checklist — accumule les lignes consécutives, avec continuation indentée */
    if (CHECK_UNCHECKED.test(line) || CHECK_CHECKED.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]
        if (CHECK_UNCHECKED.test(l)) {
          items.push(cleanText(stripMarker(l, CHECK_UNCHECKED)))
          i++
        } else if (CHECK_CHECKED.test(l)) {
          items.push('✓ ' + cleanText(stripMarker(l, CHECK_CHECKED)))
          i++
        } else if (l.trim() && CONTINUATION.test(l) && items.length > 0) {
          items[items.length - 1] += ' ' + cleanText(l)
          i++
        } else {
          break
        }
      }
      blocks.push({ type: 'checklist', items })
      continue
    }

    /* Liste à puces */
    if (BULLET.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]
        if (BULLET.test(l)) {
          items.push(cleanText(stripMarker(l, BULLET)))
          i++
        } else if (l.trim() && CONTINUATION.test(l) && items.length > 0) {
          items[items.length - 1] += ' ' + cleanText(l)
          i++
        } else {
          break
        }
      }
      blocks.push({ type: 'list', items })
      continue
    }

    /* Liste numérotée */
    if (NUMBERED.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]
        if (NUMBERED.test(l)) {
          items.push(cleanText(stripMarker(l, NUMBERED)))
          i++
        } else if (l.trim() && CONTINUATION.test(l) && items.length > 0) {
          items[items.length - 1] += ' ' + cleanText(l)
          i++
        } else {
          break
        }
      }
      blocks.push({ type: 'numbered', items })
      continue
    }

    /* Titre détecté par heuristique (tout MAJ) */
    if (looksLikeHeading(trimmed)) {
      flushParagraph()
      blocks.push({ type: 'heading2', text: cleanText(trimmed) })
      i++
      continue
    }

    /* Sinon → paragraphe (accumule les lignes non vides) */
    paragraphBuf.push(cleanText(trimmed))
    i++
  }
  flushParagraph()

  return blocks
}

/** Décide s'il vaut la peine d'utiliser le parser pour un contenu collé. */
export function shouldParseAsRichPaste(text: string): boolean {
  if (!text) return false
  const t = text.trim()
  if (!t.includes('\n')) return false
  // Multi-lignes → on tente. Le parser produira au minimum un paragraphe multi-lignes.
  return true
}
