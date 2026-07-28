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

export type DevisTemplateKind = 'default' | 'simple' | 'offer' | 'executive' | 'proposal'

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
  /* Champs spécifiques au modèle « Executive » (optionnels). */
  objet?:           string   // texte « OBJET DU DEVIS »
  offreTitle?:      string   // sous-titre de la section « OFFRE — … »
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
  swift:     'CIHMMAMC',
}

/* ─── Montant en toutes lettres (français) ─────────────────────
   Ex. amountToWordsFr(14000) → "quatorze mille dirhams".
   Utilisé par le modèle Executive pour la ligne « Arrêté le présent
   devis à la somme de … ». */
const _UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
]
const _TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre-vingt', '']

function _under100(n: number): string {
  if (n < 20) return _UNITS[n]
  const t = Math.floor(n / 10)
  const u = n % 10
  if (t === 7) return u === 1 ? 'soixante et onze' : 'soixante' + (u === 0 ? '-dix' : '-' + _UNITS[10 + u])
  if (t === 9) return 'quatre-vingt-' + _UNITS[10 + u]
  if (t === 8) return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + _UNITS[u]
  const base = _TENS[t]
  if (u === 0) return base
  if (u === 1) return base + ' et un'
  return base + '-' + _UNITS[u]
}

function _under1000(n: number): string {
  if (n < 100) return _under100(n)
  const c = Math.floor(n / 100)
  const r = n % 100
  if (r === 0) return c === 1 ? 'cent' : _UNITS[c] + ' cents'
  const cent = c === 1 ? 'cent' : _UNITS[c] + ' cent'
  return cent + ' ' + _under100(r)
}

function _toWords(n: number): string {
  n = Math.floor(n)
  if (n === 0) return 'zéro'
  const parts: string[] = []
  const millions  = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest      = n % 1000
  if (millions > 0)  parts.push(millions === 1 ? 'un million' : _under1000(millions) + ' millions')
  if (thousands > 0) parts.push(thousands === 1 ? 'mille' : _under1000(thousands) + ' mille')
  if (rest > 0)      parts.push(_under1000(rest))
  return parts.join(' ')
}

const _CURRENCY_WORD: Record<Currency, [string, string]> = {
  MAD: ['dirham', 'dirhams'],
  EUR: ['euro', 'euros'],
  USD: ['dollar', 'dollars'],
  GBP: ['livre', 'livres'],
}

/** Montant en toutes lettres avec devise. Ex. « quatorze mille dirhams ». */
export function amountToWordsFr(n: number, currency: Currency = 'MAD'): string {
  const [sing, plur] = _CURRENCY_WORD[currency]
  const int   = Math.floor(Math.abs(n))
  const cents = Math.round((Math.abs(n) - int) * 100)
  let s = _toWords(int) + ' ' + (int === 1 ? sing : plur)
  if (cents > 0) s += ' et ' + _toWords(cents) + (cents === 1 ? ' centime' : ' centimes')
  return s
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
            style={{ fontSize: sz, color: '#0f172a', fontWeight: 500, lineHeight: 1.5 }}
            className="[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_strong]:text-[#0a1a3c]"
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
              <li key={j} style={{ fontSize: sz, color: '#0f172a', fontWeight: 500, lineHeight: 1.5 }}>{item}</li>
            ))}
          </ul>
        )
        return null
      })}
    </div>
  )
}
