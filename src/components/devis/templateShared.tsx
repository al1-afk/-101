/**
 * Helpers partagés entre les 4 templates de devis (default, simple, offer, executive).
 * Types, parseur des notes JSON, formatteurs monnaie/date, constantes société.
 */
import { sanitizeRichHtml } from '@/lib/safeHtml'

export type Currency  = 'MAD' | 'EUR' | 'USD' | 'GBP'
export type BlockType = 'title' | 'paragraph' | 'list'

export interface DescriptionBlock { id?: string; type: BlockType; content: string }

export interface Prestation {
  titre: string
  description: DescriptionBlock[]
  quantite: number
  prix_unitaire: number
  showQuantite?: boolean
  showPrixUnit?: boolean
}

export type DevisTemplateKind = 'default' | 'simple' | 'offer' | 'executive'

export interface DevisNotesEnvelope {
  prestations: Prestation[]
  conditions:  string[]
  bankInfo:    { banque: string; iban: string; swift: string }
  signature?:  string | null
  isInternational?: boolean
  currency?:        Currency
  bilingual?:       boolean
  template?:        DevisTemplateKind
  clientIce?:       string
}

export function parseDevisEnvelope(notes: string | null): DevisNotesEnvelope {
  const def: DevisNotesEnvelope = {
    prestations: [], conditions: [], bankInfo: { banque: '', iban: '', swift: '' },
  }
  if (!notes) return def
  try {
    const d = JSON.parse(notes) as DevisNotesEnvelope
    if (d.conditions && d.bankInfo) return d
    throw new Error()
  } catch {
    return def
  }
}

const CURRENCY_SUFFIX: Record<Currency, string> = { MAD: 'MAD', EUR: '€', USD: '$', GBP: '£' }

export function fmtMoney(n: number, currency: Currency = 'MAD') {
  const locale = currency === 'MAD' ? 'fr-MA' : 'fr-FR'
  const s = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  const suf = CURRENCY_SUFFIX[currency]
  return currency === 'MAD' || currency === 'EUR' ? `${s} ${suf}` : `${suf}${s}`
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export const CO = {
  name:      'NEXT GITAL',
  sub:       'Agence Web & Solutions Digitales',
  legalName: 'NEXT GITAL SARL',
  addr:      'Rue Mohamed V, Imm. Kissi 4eme etage Bureau N°7, Oujda',
  tel:       '212 6 20 00 20 66',
  email:     'info@nextgital.com',
  web:       'www.nextgital.com',
  rc:        '42415',
  if_:       '60270023',
  patente:   '10301120',
  ice:       '003453451000013',
  banque:    'CIH Bank',
  rib:       '230 570 6435881221008400 29',
  swift:     'CIH',
}

/** Rendu des blocs de description (title / paragraph / list). Compact = variante inline. */
export function DescBlocks({ blocks, compact = false }: { blocks: DescriptionBlock[]; compact?: boolean }) {
  if (!blocks?.length) return null
  const sz = compact ? '9.5px' : '10px'
  return (
    <div className="mt-1">
      {blocks.map((b, i) => {
        if (b.type === 'paragraph') return (
          <div
            key={i}
            style={{ fontSize: sz, color: '#333', lineHeight: 1.45 }}
            className="[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(b.content) }}
          />
        )
        const text = stripHtml(b.content)
        if (b.type === 'title') return (
          <p key={i} style={{ fontSize: sz, color: '#0a1a3c', lineHeight: 1.3 }} className="font-semibold">{text}</p>
        )
        if (b.type === 'list') return (
          <ul key={i}>
            {text.split('\n').filter(Boolean).map((item, j) => (
              <li key={j} style={{ fontSize: sz, color: '#333', lineHeight: 1.45 }}>{item}</li>
            ))}
          </ul>
        )
        return null
      })}
    </div>
  )
}
