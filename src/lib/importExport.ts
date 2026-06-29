/**
 * Generic Import / Export utilities
 * Supports CSV and JSON formats for any CRUD entity.
 */

export type FieldKind = 'string' | 'number' | 'date' | 'boolean'

export interface FieldDef<T = any> {
  key:       keyof T & string
  label:     string
  kind?:     FieldKind
  required?: boolean
  /** Transform value when reading from import file (string → typed value) */
  parse?:    (raw: string) => any
  /** Transform value when writing to export file */
  format?:   (value: any) => string
  /** Constrain to enum values */
  enum?:     readonly string[]
  /** Alternative header names (case-insensitive). Useful when importing
      CSVs exported from other tools (Notion, Airtable, Excel) where
      headers are in another language or different wording. */
  aliases?:  string[]
}

export interface EntitySchema<T = any> {
  /** Singular label, e.g. "client" */
  entity: string
  /** Plural label used as filename, e.g. "clients" */
  filename: string
  /** Field definitions in the order they should appear in CSV columns */
  fields: FieldDef<T>[]
  /** Optional post-processing run on each parsed row after field mapping.
      Used to merge multiple CSV columns into a single complex field
      (e.g. domain/hosting dates → notes JSON envelope). */
  postParse?: (data: Record<string, any>, raw: Record<string, string>) => Record<string, any>
}

/* ─── CSV parser (handles quotes, escaped quotes, commas in fields) ── */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
      if (c === '"') { inQuotes = false; i++; continue }
      field += c; i++; continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += c; i++
  }
  // Last field
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(v => v.length > 0))
}

function csvEscape(v: string): string {
  if (v == null) return ''
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/* ─── Build CSV from rows + schema ───────────────────────────────── */
export function toCSV<T>(items: T[], schema: EntitySchema<T>): string {
  const headers = schema.fields.map(f => csvEscape(f.label)).join(',')
  const lines = items.map(item =>
    schema.fields.map(f => {
      const v = (item as any)[f.key]
      if (v == null || v === '') return ''
      if (f.format) return csvEscape(f.format(v))
      if (f.kind === 'date' && typeof v === 'string') return csvEscape(v.slice(0, 10))
      return csvEscape(String(v))
    }).join(',')
  )
  return [headers, ...lines].join('\n')
}

/* ─── JSON export ────────────────────────────────────────────────── */
export function toJSON<T>(items: T[], schema: EntitySchema<T>): string {
  const projected = items.map(item => {
    const obj: Record<string, any> = {}
    schema.fields.forEach(f => {
      const v = (item as any)[f.key]
      obj[f.key] = v == null ? null : v
    })
    return obj
  })
  return JSON.stringify(projected, null, 2)
}

/* ─── File download ──────────────────────────────────────────────── */
export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob(['\uFEFF' + content], { type: `${mime};charset=utf-8;` })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ─── Field value parsing ────────────────────────────────────────── */
function parseValue(raw: string, field: FieldDef): any {
  const trimmed = raw?.trim() ?? ''
  if (trimmed === '') return field.kind === 'number' ? null : null
  if (field.parse) return field.parse(trimmed)
  switch (field.kind) {
    case 'number': {
      /* Strip all whitespace (including   /   non-breaking spaces),
         currency symbols (€ $ £ MAD etc.) and convert French comma decimal. */
      const cleaned = trimmed
        .replace(/[\s  ]/g, '')
        .replace(/[€$£¥]|MAD|EUR|USD|DH/gi, '')
        .replace(',', '.')
      const n = parseFloat(cleaned)
      return Number.isFinite(n) ? n : null
    }
    case 'boolean':
      return /^(true|1|oui|yes)$/i.test(trimmed)
    case 'date': {
      /* Accept date ranges like "05/07/2025 – 20/07/2025" : prendre la première.
         Couvre tiret (-), en dash (–), em dash (—), minus (−), "to" / "à". */
      const first = trimmed.split(/\s*[-–—−]\s*|\s+(?:to|à|au)\s+/i)[0].trim()
      // YYYY-MM-DD or ISO
      if (/^\d{4}-\d{2}-\d{2}/.test(first)) return first.slice(0, 10)
      // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
      const m = first.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
      if (m) {
        const [, d, mo, y] = m
        const yyyy = y.length === 2 ? `20${y}` : y
        return `${yyyy}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
      }
      return first
    }
    default:
      return trimmed
  }
}

export interface ParsedRow<T> {
  index:  number
  data:   Partial<T>
  errors: string[]
}

export interface ImportResult<T> {
  rows:    ParsedRow<T>[]
  valid:   ParsedRow<T>[]
  invalid: ParsedRow<T>[]
}

/* ─── Parse a CSV/JSON file into typed rows + validation errors ──── */
export function parseImportFile<T>(text: string, schema: EntitySchema<T>, format: 'csv' | 'json'): ImportResult<T> {
  let rawRows: Record<string, string>[] = []

  if (format === 'json') {
    try {
      const arr = JSON.parse(text)
      if (Array.isArray(arr)) {
        rawRows = arr.map(o => {
          const obj: Record<string, string> = {}
          Object.entries(o ?? {}).forEach(([k, v]) => { obj[k] = v == null ? '' : String(v) })
          return obj
        })
      }
    } catch {
      return { rows: [], valid: [], invalid: [] }
    }
  } else {
    const matrix = parseCSV(text)
    if (matrix.length < 2) return { rows: [], valid: [], invalid: [] }
    const headers = matrix[0].map(h => h.trim())
    rawRows = matrix.slice(1).map(cells => {
      const obj: Record<string, string> = {}
      headers.forEach((h, idx) => { obj[h] = cells[idx] ?? '' })
      return obj
    })
  }

  /* Build a header lookup that matches against label, key OR any alias.
     All comparisons are case-insensitive and trim whitespace. */
  const byHeader = new Map<string, FieldDef>()
  const norm = (s: string) => s.toLowerCase().trim()
  schema.fields.forEach(f => {
    byHeader.set(norm(f.label), f)
    byHeader.set(norm(f.key),   f)
    if (f.aliases) f.aliases.forEach(a => byHeader.set(norm(a), f))
  })

  const rows: ParsedRow<T>[] = rawRows.map((raw, i) => {
    let data: Record<string, any> = {}
    const errors: string[] = []

    Object.entries(raw).forEach(([col, val]) => {
      const field = byHeader.get(norm(col))
      if (!field) return
      const parsed = parseValue(val, field)
      if (field.enum && parsed != null && parsed !== '' && !field.enum.includes(String(parsed))) {
        errors.push(`${field.label}: valeur "${parsed}" hors liste`)
      }
      data[field.key] = parsed
    })

    /* Optional schema-level transform : let the schema merge raw extra
       columns into composite fields (e.g. notes JSON envelope). */
    if (schema.postParse) data = schema.postParse(data, raw)

    schema.fields.forEach(f => {
      if (f.required) {
        const v = data[f.key]
        if (v == null || v === '') errors.push(`${f.label} requis`)
      }
    })

    return { index: i + 2, data: data as Partial<T>, errors }
  })

  return {
    rows,
    valid:   rows.filter(r => r.errors.length === 0),
    invalid: rows.filter(r => r.errors.length > 0),
  }
}

/* ─── Build CSV template (headers only, with example row) ────────── */
export function buildTemplate<T>(schema: EntitySchema<T>): string {
  const headers = schema.fields.map(f => csvEscape(f.label)).join(',')
  const example = schema.fields.map(f => {
    if (f.enum && f.enum.length > 0) return csvEscape(f.enum[0])
    switch (f.kind) {
      case 'number':  return '0'
      case 'date':    return new Date().toISOString().slice(0, 10)
      case 'boolean': return 'oui'
      default:        return f.required ? `Exemple ${f.label}` : ''
    }
  }).join(',')
  return [headers, example].join('\n')
}
