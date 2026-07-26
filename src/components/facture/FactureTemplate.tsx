/**
 * FactureTemplate — A4 HTML template that mirrors the PDF layout exactly.
 * Twin of DevisTemplate, adapted for factures (FACTURE label + date_echeance).
 * Supports an `isInternational` mode (foreign clients) with EUR/USD/GBP,
 * no Moroccan legal fields, IBAN/SWIFT highlight, optional FR/EN bilingual.
 */
import { forwardRef } from 'react'
import type { Facture } from '@/hooks/useFactures'
import type { Client }  from '@/hooks/useClients'
import FactureTemplateSimple from './FactureTemplateSimple'
import { sanitizeRichHtml } from '@/lib/safeHtml'

/* ─── Types ──────────────────────────────────────────────────── */
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
  clientIce?:       string
}

/* ─── Helpers ────────────────────────────────────────────────── */
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

/* fr/en label helper — returns "FR / EN" when bilingual, else just FR */
function L(fr: string, en: string, bilingual: boolean) {
  return bilingual ? `${fr} / ${en}` : fr
}

const CURRENCY_SUFFIX: Record<Currency, string> = {
  MAD: 'MAD', EUR: '€', USD: '$', GBP: '£',
}

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
function dueDate(s: string, days = 30) {
  const dt = new Date(s); dt.setDate(dt.getDate() + days)
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* ─── Company constants ──────────────────────────────────────── */
const CO = {
  name:    'NEXT GITAL',
  sub:     'Agence Web & Solutions Digitales',
  addr1:   'Rue Mohamed V, Imm. Kissi',
  addr2:   '4ème étage, Bureau N°7, Oujda',
  tel:     '+212 620 002 066',
  fax:     '0536 683 707',
  email:   'info@nextgital.com',
  web:     'www.nextgital.com',
  rc:      '42415',
  if_:     '60270023',
  patente: '10301120',
  ice:     '003453451000013',
  banque:  'CIH Bank',
  rib:     '230 570 6435881221008400 29',
  swift:   'CIHMMAMC',
}

const DEFAULT_CONDITIONS = [
  '50% à la signature du devis',
  '50% à la livraison du projet',
  'Délai de livraison : 15 à 21 jours ouvrables',
  'Acompte non remboursable après démarrage',
]

/* ─── Sub-components ─────────────────────────────────────────── */
function BlockContent({ blocks }: { blocks: DescriptionBlock[] }) {
  if (!blocks.length) return null
  return (
    <div className="mt-1 space-y-0.5">
      {blocks.map((b, i) => {
        if (b.type === 'paragraph') return (
          <div
            key={i}
            className="text-[10px] text-[#374151] leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_strong]:font-semibold [&_strong]:text-[#0a1a3c] [&_em]:italic [&_u]:underline [&_s]:line-through"
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(b.content) }}
          />
        )
        const text = stripHtml(b.content)
        if (b.type === 'title') return (
          <p key={i} className="text-[10px] font-semibold text-[#0a1a3c] leading-snug">{text}</p>
        )
        if (b.type === 'list') return (
          <ul key={i} className="space-y-0.5">
            {text.split('\n').filter(Boolean).map((item, j) => (
              <li key={j} className="flex items-start gap-1.5 text-[10px] text-[#374151]">
                <span className="w-1 h-1 rounded-full bg-[#374151] flex-shrink-0 mt-[4px]" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        )
        return null
      })}
    </div>
  )
}

/* ─── MAIN TEMPLATE ──────────────────────────────────────────── */
interface FactureTemplateProps {
  facture: Facture
  client?: Client
}

const FactureTemplate = forwardRef<HTMLDivElement, FactureTemplateProps>(
  ({ facture: f, client }, ref) => {
    const parsed = parseNotes(f.notes)
    /* Dispatch : template Simple (Nextgital épuré) si l'utilisateur l'a choisi. */
    if (parsed.template === 'simple') {
      return <FactureTemplateSimple ref={ref} facture={f} client={client} />
    }
    const { prestations, conditions, bankInfo, signature } = parsed
    const intl      = !!parsed.isInternational
    const currency  = (parsed.currency ?? 'MAD') as Currency
    const bilingual = !!parsed.bilingual

    const hasTVA      = f.tva > 0
    const tvaMontant  = f.montant_ttc - f.montant_ht
    const allConditions = conditions.length > 0 ? conditions : DEFAULT_CONDITIONS
    const hasBankInfo = !!(bankInfo.banque || bankInfo.iban)

    const serviceRows: Prestation[] = prestations.length > 0 ? prestations : [{
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
          boxSizing: 'border-box',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
      <table
        data-print-table="true"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
        }}
      >
        <thead data-print-header="true">
          <tr><td style={{ padding: '14mm 14mm 0 14mm', verticalAlign: 'top' }}>
            <div className="flex items-center justify-between mb-3">
              {/* FACTURE / INVOICE badge — left */}
              <div
                className="px-7 py-2 rounded-lg text-white font-extrabold text-[16px] tracking-wider"
                style={{ backgroundColor: '#1e64c4' }}
              >
                {intl ? (bilingual ? 'FACTURE / INVOICE' : 'INVOICE') : 'FACTURE'}
              </div>

              {/* Logo — center */}
              <div className="flex flex-col items-center">
                <img
                  src="/logo-nextgital.png"
                  alt="NEXT GITAL"
                  className="h-16 object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>

              {/* Company info — right (no Moroccan legal IDs for intl) */}
              <div className="text-right text-[9px] text-[#64748b] space-y-0.5 leading-relaxed">
                {!intl && <p>RC: {CO.rc}  ·  IF: {CO.if_}  ·  Patente: {CO.patente}</p>}
                {!intl && <p>ICE: {CO.ice}</p>}
                <p>{intl ? `${L('Tél', 'Tel', bilingual)}: ${CO.tel}` : `Tél: ${CO.tel}  ·  Fax: ${CO.fax}`}</p>
                <p>{CO.email}  ·  {CO.web}</p>
              </div>
            </div>

            <div className="h-px bg-[#cbd5e1] mb-4" />
          </td></tr>
        </thead>

        <tbody>
          <tr><td style={{ padding: '0 14mm', verticalAlign: 'top' }}>

        {/* ══ CLIENT + REF/DATE/ECHEANCE (compact) ═══════════════ */}
        <div className="grid grid-cols-2 gap-6 mb-3">
          <div>
            <p className="text-[9px] font-semibold text-[#64748b] uppercase tracking-wider mb-0.5">
              {L('Client', 'Bill to', bilingual)}
            </p>
            <p className="text-[12px] font-extrabold text-[#0a1a3c] leading-snug">
              {client?.entreprise ?? f.client_nom ?? '—'}
            </p>
            <div className="text-[10px] text-[#374151] leading-snug">
              {f.client_nom && client?.entreprise && <p>{f.client_nom}</p>}
              {client?.email     && <p>{client.email}</p>}
              {client?.telephone && <p>{client.telephone}</p>}
              {(client?.adresse || client?.ville) && (
                <p>{[client.adresse, client.ville, client.pays].filter(Boolean).join(', ')}</p>
              )}
            </div>
          </div>

          <div className="text-right text-[10px] space-y-0.5 self-start">
            {[
              { label: `${L('Réf', 'Ref', bilingual)} :`,        val: f.numero },
              { label: `${L('Date', 'Date', bilingual)} :`,      val: fmtDate(f.date_emission) },
              { label: `${L('Échéance', 'Due date', bilingual)} :`, val: f.date_echeance ? fmtDate(f.date_echeance) : dueDate(f.date_emission) },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-end gap-3">
                <span className="text-[#64748b]">{row.label}</span>
                <span className="font-bold text-[#0a1a3c] w-28 text-right">{row.val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-[#e2e8f0] mb-3" />

        {/* ══ SERVICES TABLE ══════════════════════════════════ */}
        {(() => {
          const anyQty  = serviceRows.some(r => r.showQuantite ?? true)
          const anyPrix = serviceRows.some(r => r.showPrixUnit ?? true)
          const headers = [
            L('Désignation', 'Description', bilingual),
            ...(anyQty  ? [L('Qté', 'Qty', bilingual)]                : []),
            ...(anyPrix ? [L('Prix unitaire', 'Unit price', bilingual)] : []),
            L('Prix HT', 'Amount', bilingual),
          ]
          return (
            <table className="w-full border-collapse mb-4" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: anyQty && anyPrix ? '50%' : anyQty || anyPrix ? '56%' : '72%' }} />
                {anyQty  && <col style={{ width: '10%' }} />}
                {anyPrix && <col style={{ width: '22%' }} />}
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: '#1a3460' }}>
                  {headers.map((h, i) => (
                    <th
                      key={h}
                      className="text-white text-[10px] font-bold py-2 px-3"
                      style={{ textAlign: i === 0 ? 'left' : 'right' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serviceRows.map((row, i) => {
                  const showQty  = row.showQuantite ?? true
                  const showPrix = row.showPrixUnit ?? true
                  const total    = showQty ? row.quantite * row.prix_unitaire : row.prix_unitaire
                  return (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fcfdff' : '#ffffff' }}>
                      <td className="px-3 py-2 align-top border-b border-[#e2e8f0]">
                        <p className="text-[11px] font-bold text-[#0a1a3c]">{row.titre}</p>
                        <BlockContent blocks={row.description} />
                      </td>
                      {anyQty && (
                        <td className="px-3 py-2 text-right text-[11px] text-[#374151] align-top border-b border-[#e2e8f0]">
                          {showQty ? row.quantite : ''}
                        </td>
                      )}
                      {anyPrix && (
                        <td className="px-3 py-2 text-right text-[11px] text-[#374151] align-top border-b border-[#e2e8f0]">
                          {showPrix ? fmt(row.prix_unitaire, currency) : ''}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right text-[11px] font-bold text-[#0a1a3c] align-top border-b border-[#e2e8f0]">
                        {fmt(total, currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })()}

        {/* ══ TOTALS + SIGNATURE ═══════════════════════════════ */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <p className="text-[9px] font-bold text-[#64748b] uppercase tracking-widest mb-1">
              {L('Signature & Cachet', 'Signature & Stamp', bilingual)}
            </p>
            <div className="w-44 h-[88px] border border-[#e2e8f0] rounded-lg bg-white flex items-center justify-center overflow-hidden">
              {signature
                ? <img src={signature} alt="Signature" className="max-w-full max-h-full object-contain" />
                : null
              }
            </div>
          </div>

          <div className="w-64">
            <div className="flex justify-between items-center py-1.5 px-3 bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="text-[10px] text-[#64748b]">{L('Sous-total HT', 'Subtotal', bilingual)}</span>
              <span className="text-[11px] font-bold text-[#0a1a3c]">{fmt(f.montant_ht, currency)}</span>
            </div>
            {hasTVA && (
              <div className="flex justify-between items-center py-1.5 px-3 bg-[#f8fafc] border border-t-0 border-[#e2e8f0]">
                <span className="text-[10px] text-[#64748b]">{intl ? `VAT (${f.tva}%)` : `TVA (${f.tva}%)`}</span>
                <span className="text-[11px] font-bold text-[#0a1a3c]">{fmt(tvaMontant, currency)}</span>
              </div>
            )}
            <div
              className="flex justify-between items-center py-2.5 px-3 mt-1 rounded-sm"
              style={{ backgroundColor: '#1a3460' }}
            >
              <span className="text-[12px] font-extrabold text-white tracking-wide">
                {intl ? (bilingual ? 'TOTAL' : 'TOTAL') : 'TOTAL TTC'}
              </span>
              <span className="text-[13px] font-extrabold text-white">{fmt(f.montant_ttc, currency)}</span>
            </div>

            {/* Montant payé / Reste — only if there's been a payment */}
            {f.montant_paye > 0 && (
              <>
                <div className="flex justify-between items-center py-1.5 px-3 mt-1 bg-[#f0fdf4] border border-[#bbf7d0]">
                  <span className="text-[10px] text-[#16803d]">{L('Montant payé', 'Amount paid', bilingual)}</span>
                  <span className="text-[11px] font-bold text-[#16803d]">{fmt(f.montant_paye, currency)}</span>
                </div>
                {f.montant_ttc - f.montant_paye > 0 && (
                  <div className="flex justify-between items-center py-1.5 px-3 bg-[#fef2f2] border border-t-0 border-[#fecaca]">
                    <span className="text-[10px] text-[#b91c1c]">{L('Reste à payer', 'Balance due', bilingual)}</span>
                    <span className="text-[11px] font-bold text-[#b91c1c]">{fmt(f.montant_ttc - f.montant_paye, currency)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══ CONDITIONS + BANK ═══════════════════════════════ */}
        <div className="h-px bg-[#e2e8f0] mb-4" />
        {intl ? (
          /* International: highlighted IBAN/SWIFT card + payment terms */
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="col-span-3 rounded-lg border-2 border-[#1e64c4] bg-[#eff6ff] p-3">
              <p className="text-[10px] font-bold text-[#1e64c4] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                ⇄ {L('Virement international', 'International wire transfer', bilingual)}
              </p>
              {hasBankInfo ? (
                <div className="space-y-1.5">
                  {[
                    { label: L('Bénéficiaire', 'Beneficiary', bilingual), val: CO.name },
                    { label: L('Banque', 'Bank', bilingual),              val: bankInfo.banque || CO.banque },
                    { label: 'IBAN',                                       val: bankInfo.iban || CO.rib, mono: true },
                    { label: 'SWIFT / BIC',                                val: bankInfo.swift || CO.swift, mono: true },
                  ].filter(r => r.val).map(r => (
                    <div key={r.label} className="flex gap-2 text-[10px]">
                      <span className="text-[#64748b] flex-shrink-0 w-24">{r.label} :</span>
                      <span className={`font-semibold text-[#0a1a3c] ${r.mono ? 'font-mono tracking-wide' : ''}`}>{r.val}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-[#64748b]">—</p>
              )}
            </div>
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-[#0a1a3c] uppercase tracking-wider mb-2">
                {L('Conditions', 'Terms', bilingual)}
              </p>
              <ul className="space-y-1">
                {allConditions.slice(0, 6).map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-[#374151]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1e64c4] flex-shrink-0 mt-[3px]" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-[10px] font-bold text-[#0a1a3c] uppercase tracking-wider mb-2">
                Coordonnées Bancaires
              </p>
              {hasBankInfo ? (
                <div className="space-y-1.5">
                  {[
                    { label: 'Banque :',    val: bankInfo.banque },
                    { label: 'IBAN :',      val: bankInfo.iban   },
                    { label: 'SWIFT/BIC :', val: bankInfo.swift  },
                  ].filter(r => r.val).map(r => (
                    <div key={r.label} className="flex gap-2 text-[10px]">
                      <span className="text-[#64748b] flex-shrink-0 w-20">{r.label}</span>
                      <span className="font-semibold text-[#0a1a3c]">{r.val}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-[#64748b]">—</p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-bold text-[#0a1a3c] uppercase tracking-wider mb-2">
                Conditions Générales
              </p>
              <ul className="space-y-1">
                {allConditions.slice(0, 6).map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-[#374151]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1e64c4] flex-shrink-0 mt-[3px]" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

          </td></tr>
        </tbody>

        {/* ══ FOOTER (repeated on every printed page via <tfoot>) ═ */}
        <tfoot data-footer="true">
          <tr><td style={{ padding: '0 14mm 10mm 14mm', verticalAlign: 'top' }}>
            <div className="border-t border-[#cbd5e1] pt-2 mt-4">
              <div className="flex items-start justify-between text-[9px] text-[#475569] leading-relaxed">
                <p>
                  <span className="font-bold text-[#0a1a3c]">{CO.name}</span>, {CO.addr1} {CO.addr2}
                </p>
                <p className="text-right">
                  <span className="font-semibold text-[#0a1a3c]">{CO.tel}</span><br />
                  {CO.email}<br />
                  {CO.web}
                </p>
              </div>
              {intl ? (
                <p className="text-[8.5px] text-[#64748b] mt-1.5 leading-relaxed">
                  <span className="font-semibold">Bank:</span> {CO.banque} &nbsp;·&nbsp;
                  <span className="font-semibold">IBAN:</span> {CO.rib} &nbsp;·&nbsp;
                  <span className="font-semibold">SWIFT:</span> {CO.swift}
                </p>
              ) : (
                <p className="text-[8.5px] text-[#64748b] mt-1.5 leading-relaxed">
                  <span className="font-semibold">RC:</span> {CO.rc} &nbsp;·&nbsp;
                  <span className="font-semibold">Patente N°</span> {CO.patente} &nbsp;·&nbsp;
                  <span className="font-semibold">IF N°</span> {CO.if_} &nbsp;·&nbsp;
                  <span className="font-semibold">ICE:</span> {CO.ice} &nbsp;·&nbsp;
                  <span className="font-semibold">Banque</span> {CO.banque} &nbsp;·&nbsp;
                  <span className="font-semibold">RIB</span> {CO.rib} &nbsp;·&nbsp;
                  <span className="font-semibold">SWIFT</span> {CO.swift}
                </p>
              )}
            </div>
          </td></tr>
        </tfoot>
      </table>
      </div>
    )
  }
)

FactureTemplate.displayName = 'FactureTemplate'
export default FactureTemplate
