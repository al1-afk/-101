/**
 * FactureTemplateSimple — variante épurée (style « Nextgital simple »).
 * Header sobre : "NEXT GITAL" à gauche, "Facture N° · Date" à droite.
 * Tableau à bordures fines, totaux compacts, signature à gauche, pied
 * d'entreprise en bas de page.
 */
import { forwardRef } from 'react'
import type { Facture } from '@/hooks/useFactures'
import type { Client }  from '@/hooks/useClients'
import { sanitizeRichHtml } from '@/lib/safeHtml'

type Currency  = 'MAD' | 'EUR' | 'USD' | 'GBP'
type BlockType = 'title' | 'paragraph' | 'list'
interface DescriptionBlock { id?: string; type: BlockType; content: string }
interface Prestation {
  titre: string
  description: DescriptionBlock[]
  quantite: number
  prix_unitaire: number
  showQuantite?: boolean
  showPrixUnit?: boolean
}
interface FactureNotesData {
  prestations: Prestation[]
  conditions:  string[]
  bankInfo:    { banque: string; iban: string; swift: string }
  signature?:  string | null
  isInternational?: boolean
  currency?:        Currency
  bilingual?:       boolean
  template?:        'default' | 'simple'
  clientIce?:       string          // ICE du client (affiché dans le template Simple)
}

function parseNotes(notes: string | null): FactureNotesData {
  const def: FactureNotesData = { prestations: [], conditions: [], bankInfo: { banque: '', iban: '', swift: '' } }
  if (!notes) return def
  try {
    const d = JSON.parse(notes) as FactureNotesData
    if (d.conditions && d.bankInfo) return d
    throw new Error()
  } catch {
    return def
  }
}

const CURRENCY_SUFFIX: Record<Currency, string> = { MAD: 'MAD', EUR: '€', USD: '$', GBP: '£' }

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function fmt(n: number, currency: Currency = 'MAD') {
  const locale = currency === 'MAD' ? 'fr-MA' : 'fr-FR'
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  const suffix = CURRENCY_SUFFIX[currency]
  return currency === 'MAD' || currency === 'EUR' ? `${formatted} ${suffix}` : `${suffix}${formatted}`
}
function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const CO = {
  name:    'NEXT GITAL',
  sub:     'Agence Web & Solutions Digitales',
  legalName: 'NEXT GITAL SARL',
  addr:    'Rue Mohamed V, Imm. Kissi 4eme etage Bureau N°7, Oujda',
  tel:     '212 6 20 00 20 66',
  email:   'info@nextgital.com',
  web:     'www.nextgital.com',
  rc:      '42415',
  if_:     '60270023',
  patente: '10301120',
  ice:     '003453451000013',
  banque:  'CIH Bank',
  rib:     '230 570 6435881221008400 29',
  swift:   'CIH',
}

/** Rendu compact multi-lignes d'un bloc description dans la cellule Désignation. */
function DescBlocks({ blocks }: { blocks: DescriptionBlock[] }) {
  if (!blocks.length) return null
  return (
    <div className="mt-1 space-y-0">
      {blocks.map((b, i) => {
        if (b.type === 'paragraph') return (
          <div
            key={i}
            className="text-[9.5px] text-[#333] leading-snug [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(b.content) }}
          />
        )
        const text = stripHtml(b.content)
        if (b.type === 'title') return (
          <p key={i} className="text-[9.5px] font-semibold text-[#0a1a3c] leading-snug">{text}</p>
        )
        if (b.type === 'list') return (
          <ul key={i} className="space-y-0">
            {text.split('\n').filter(Boolean).map((item, j) => (
              <li key={j} className="text-[9.5px] text-[#333] leading-snug">{item}</li>
            ))}
          </ul>
        )
        return null
      })}
    </div>
  )
}

interface FactureTemplateSimpleProps {
  facture: Facture
  client?: Client
}

const FactureTemplateSimple = forwardRef<HTMLDivElement, FactureTemplateSimpleProps>(
  ({ facture: f, client }, ref) => {
    const parsed = parseNotes(f.notes)
    const { prestations, signature } = parsed
    const clientIce = parsed.clientIce?.trim() || ''
    const currency  = (parsed.currency ?? 'MAD') as Currency
    const hasTVA   = f.tva > 0
    const tvaMont  = f.montant_ttc - f.montant_ht

    const rows: Prestation[] = prestations.length > 0 ? prestations : [{
      titre: 'Prestations digitales',
      description: [],
      quantite: 1,
      prix_unitaire: f.montant_ht,
    }]

    return (
      <div
        ref={ref}
        className="bg-white text-[#0a1a3c] font-sans"
        style={{
          width: '210mm',
          minHeight: '297mm',
          boxSizing: 'border-box',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          padding: '18mm 16mm',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-10">
          <div className="flex items-center gap-3">
            <img
              src="/logo-nextgital.png"
              alt={CO.name}
              className="h-[64px] w-auto object-contain"
              crossOrigin="anonymous"
            />
            <p className="text-[10.5px] text-[#0a1a3c] underline">{CO.sub}</p>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-extrabold text-[#0a1a3c] leading-none">
              Facture N° <span>{f.numero}</span>
            </p>
            <p className="text-[10px] text-[#333] mt-1">Date : {fmtDate(f.date_emission)}</p>
          </div>
        </div>

        {/* ── Client ─────────────────────────────────────────── */}
        <div className="mb-4">
          <p className="text-[10px] text-[#333]">À l'attention de :</p>
          <p className="text-[12px] font-extrabold text-[#0a1a3c] underline mt-0.5">
            {client?.entreprise ?? f.client_nom ?? '—'}
          </p>
          {clientIce && (
            <p className="text-[10px] font-bold text-[#0a1a3c]">ICE : {clientIce}</p>
          )}
        </div>

        {/* ── Services table ─────────────────────────────────── */}
        <table
          className="w-full text-[10px] mb-5"
          style={{
            borderCollapse: 'collapse',
            border: '1px solid #333',
          }}
        >
          <colgroup>
            <col style={{ width: '60%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              {['Désignation', 'Qté', 'PU', 'Total'].map((h, i) => (
                <th
                  key={h}
                  className="font-bold text-[10.5px] text-[#0a1a3c]"
                  style={{
                    border: '1px solid #333',
                    padding: '5px 8px',
                    textAlign: i === 0 ? 'left' : 'right',
                    background: '#ffffff',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const showQty  = r.showQuantite ?? true
              const showPrix = r.showPrixUnit ?? true
              const total    = showQty ? r.quantite * r.prix_unitaire : r.prix_unitaire
              return (
                <tr key={i}>
                  <td
                    style={{
                      border: '1px solid #333',
                      padding: '6px 8px',
                      verticalAlign: 'top',
                    }}
                  >
                    <p className="text-[10.5px] text-[#0a1a3c]">{r.titre}</p>
                    <DescBlocks blocks={r.description} />
                  </td>
                  <td
                    style={{
                      border: '1px solid #333',
                      padding: '6px 8px',
                      textAlign: 'right',
                      verticalAlign: 'top',
                    }}
                  >
                    {showQty ? r.quantite : ''}
                  </td>
                  <td
                    style={{
                      border: '1px solid #333',
                      padding: '6px 8px',
                      textAlign: 'right',
                      verticalAlign: 'top',
                    }}
                  >
                    {showPrix
                      ? new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.prix_unitaire)
                      : ''}
                  </td>
                  <td
                    style={{
                      border: '1px solid #333',
                      padding: '6px 8px',
                      textAlign: 'right',
                      verticalAlign: 'top',
                    }}
                  >
                    {new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── Totals ─────────────────────────────────────────── */}
        <div className="flex justify-end mb-6">
          <table className="text-[10.5px]" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td className="text-right text-[#333] pr-4 py-1">Montant total HT :</td>
                <td
                  style={{
                    border: '1px solid #333',
                    padding: '3px 10px',
                    textAlign: 'right',
                    minWidth: '38mm',
                  }}
                >
                  {fmt(f.montant_ht, currency)}
                </td>
              </tr>
              {hasTVA && (
                <tr>
                  <td className="text-right text-[#333] pr-4 py-1">TVA ({f.tva}%):</td>
                  <td
                    style={{
                      border: '1px solid #333',
                      padding: '3px 10px',
                      textAlign: 'right',
                    }}
                  >
                    {fmt(tvaMont, currency)}
                  </td>
                </tr>
              )}
              <tr>
                <td className="text-right font-bold text-[#0a1a3c] pr-4 py-1">Montant total TTC :</td>
                <td
                  style={{
                    border: '1px solid #333',
                    padding: '4px 10px',
                    textAlign: 'right',
                    fontWeight: 'bold',
                    background: '#e7edf7',
                  }}
                >
                  {fmt(f.montant_ttc, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Signature ──────────────────────────────────────── */}
        <div className="mb-6">
          <p className="text-[10px] font-bold text-[#0a1a3c] mb-1">Signature :</p>
          <div className="w-[60mm] h-[28mm] flex items-start">
            {signature
              ? <img src={signature} alt="Signature" className="max-w-full max-h-full object-contain" />
              : null}
          </div>
        </div>

        {/* Spacer to push footer down */}
        <div className="flex-1" />

        {/* ── Footer ─────────────────────────────────────────── */}
        <div
          style={{
            borderTop: '1px solid #cbd5e1',
            paddingTop: '4mm',
          }}
        >
          <div className="flex items-start justify-between text-[8.5px] text-[#333] leading-relaxed">
            <div className="max-w-[130mm]">
              <p>
                <span className="font-bold text-[#0a1a3c]">{CO.legalName}</span>, {CO.addr}
              </p>
              <p>
                <span className="font-bold text-[#0a1a3c]">RC :</span> {CO.rc} &nbsp;·&nbsp;
                <span className="font-bold text-[#0a1a3c]">Patente N°</span> {CO.patente} &nbsp;·&nbsp;
                <span className="font-bold text-[#0a1a3c]">IF N°</span> {CO.if_} &nbsp;
                <span className="font-bold text-[#0a1a3c]">ICE :</span> {CO.ice}
              </p>
              <p>
                <span className="font-bold text-[#0a1a3c]">Banque</span> {CO.banque} &nbsp;
                <span className="font-bold text-[#0a1a3c]">RIB</span> {CO.rib} &nbsp;&nbsp;
                <span className="font-bold text-[#0a1a3c]">SWIFT</span> {CO.swift}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-[#1e64c4]">{CO.tel}</p>
              <p className="text-[9px] text-[#333]">{CO.email}</p>
              <p className="text-[9px] font-bold text-[#1e64c4]">{CO.web}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }
)

FactureTemplateSimple.displayName = 'FactureTemplateSimple'
export default FactureTemplateSimple
