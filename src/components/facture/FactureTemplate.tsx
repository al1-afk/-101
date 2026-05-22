/**
 * FactureTemplate — A4 HTML template that mirrors the PDF layout exactly.
 * Twin of DevisTemplate, adapted for factures (FACTURE label + date_echeance).
 */
import { forwardRef } from 'react'
import type { Facture } from '@/hooks/useFactures'
import type { Client }  from '@/hooks/useClients'

/* ─── Types ──────────────────────────────────────────────────── */
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

function fmt(n: number) {
  return new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' MAD'
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
  sub:     'Agence Digitale & Web Solutions',
  addr1:   'Rue Mohamed V, Hôtel Aswan, Immeuble Kissi, 4ème Étage, Bureau N°7',
  addr2:   'Oujda, Maroc',
  tel:     '+212 620002066',
  fax:     '0536683707',
  email:   'info@gestiq.com',
  web:     'www.gestiq.com',
  rc:      '42415',
  if_:     '60270023',
  patente: '10301120',
  ice:     '003453451000013',
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
            dangerouslySetInnerHTML={{ __html: b.content }}
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
    const { prestations, conditions, bankInfo, signature } = parsed

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
          padding: '14mm',
          boxSizing: 'border-box',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
        {/* ══ HEADER (repeated on every printed page) ═══════════ */}
        <div data-print-header="true">
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-3">
              <img
                src="/logo-gestiq.png"
                alt="NEXT GITAL"
                className="w-16 h-16 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <div>
                <p className="text-[22px] font-extrabold text-[#0a1a3c] leading-tight tracking-tight">{CO.name}</p>
                <p className="text-[11px] text-[#64748b] mt-0.5">{CO.sub}</p>
              </div>
            </div>

            <div className="text-right text-[10px] text-[#64748b] space-y-0.5 leading-relaxed">
              <p>RC: {CO.rc}  ·  IF: {CO.if_}  ·  Patente: {CO.patente}</p>
              <p>ICE: {CO.ice}</p>
              <p>Tél: {CO.tel}  ·  Fax: {CO.fax}</p>
              <p>{CO.email}  ·  {CO.web}</p>
            </div>
          </div>

          <div className="h-[2px] bg-[#1e64c4] rounded-full mb-5" />
        </div>

        {/* ══ TITLE BADGE + REF ═══════════════════════════════ */}
        <div className="flex items-start justify-between mb-5">
          <div
            className="px-8 py-2 rounded-lg text-white font-extrabold text-[18px] tracking-wider"
            style={{ backgroundColor: '#1e64c4' }}
          >
            FACTURE
          </div>

          <div className="text-right text-[11px] space-y-1">
            {[
              { label: 'Réf :',      val: f.numero },
              { label: 'Date :',     val: fmtDate(f.date_emission) },
              { label: 'Échéance :', val: f.date_echeance ? fmtDate(f.date_echeance) : dueDate(f.date_emission) },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-end gap-4">
                <span className="text-[#64748b]">{row.label}</span>
                <span className="font-bold text-[#0a1a3c] w-32 text-right">{row.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══ ÉMETTEUR / CLIENT ═══════════════════════════════ */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="border border-[#e2e8f0] rounded-lg p-3 bg-[#f8fafc]">
            <p className="text-[9px] font-bold text-[#1e64c4] uppercase tracking-widest mb-2">Émetteur</p>
            <p className="text-[13px] font-bold text-[#0a1a3c] mb-1">{CO.name}</p>
            <div className="text-[10px] text-[#374151] space-y-0.5">
              <p>{CO.addr1}</p>
              <p>{CO.addr2}</p>
              <p>Tél: {CO.tel}</p>
              <p>{CO.email}</p>
            </div>
          </div>

          <div className="border border-[#e2e8f0] rounded-lg p-3 bg-[#f8fafc]">
            <p className="text-[9px] font-bold text-[#1e64c4] uppercase tracking-widest mb-2">Client</p>
            <p className="text-[13px] font-bold text-[#0a1a3c] mb-1">
              {client?.entreprise ?? f.client_nom ?? '—'}
            </p>
            <div className="text-[10px] text-[#374151] space-y-0.5">
              {f.client_nom && client?.entreprise && <p>{f.client_nom}</p>}
              {client?.email     && <p>{client.email}</p>}
              {client?.telephone && <p>{client.telephone}</p>}
              {(client?.adresse || client?.ville) && (
                <p>{[client.adresse, client.ville, client.pays].filter(Boolean).join(', ')}</p>
              )}
            </div>
          </div>
        </div>

        {/* ══ SERVICES TABLE ══════════════════════════════════ */}
        {(() => {
          const anyQty  = serviceRows.some(r => r.showQuantite ?? true)
          const anyPrix = serviceRows.some(r => r.showPrixUnit ?? true)
          const headers = [
            'Désignation',
            ...(anyQty  ? ['Qté']           : []),
            ...(anyPrix ? ['Prix unitaire'] : []),
            'Prix HT',
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
                          {showPrix ? fmt(row.prix_unitaire) : ''}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right text-[11px] font-bold text-[#0a1a3c] align-top border-b border-[#e2e8f0]">
                        {fmt(total)}
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
            <p className="text-[9px] font-bold text-[#64748b] uppercase tracking-widest mb-1">Signature &amp; Cachet</p>
            <div className="w-44 h-[88px] border border-[#e2e8f0] rounded-lg bg-white flex items-center justify-center overflow-hidden">
              {signature
                ? <img src={signature} alt="Signature" className="max-w-full max-h-full object-contain" />
                : null
              }
            </div>
          </div>

          <div className="w-64">
            <div className="flex justify-between items-center py-1.5 px-3 bg-[#f8fafc] border border-[#e2e8f0]">
              <span className="text-[10px] text-[#64748b]">Sous-total HT</span>
              <span className="text-[11px] font-bold text-[#0a1a3c]">{fmt(f.montant_ht)}</span>
            </div>
            {hasTVA && (
              <div className="flex justify-between items-center py-1.5 px-3 bg-[#f8fafc] border border-t-0 border-[#e2e8f0]">
                <span className="text-[10px] text-[#64748b]">TVA ({f.tva}%)</span>
                <span className="text-[11px] font-bold text-[#0a1a3c]">{fmt(tvaMontant)}</span>
              </div>
            )}
            <div
              className="flex justify-between items-center py-2.5 px-3 mt-1 rounded-sm"
              style={{ backgroundColor: '#1a3460' }}
            >
              <span className="text-[12px] font-extrabold text-white tracking-wide">TOTAL TTC</span>
              <span className="text-[13px] font-extrabold text-white">{fmt(f.montant_ttc)}</span>
            </div>

            {/* Montant payé / Reste — only if there's been a payment */}
            {f.montant_paye > 0 && (
              <>
                <div className="flex justify-between items-center py-1.5 px-3 mt-1 bg-[#f0fdf4] border border-[#bbf7d0]">
                  <span className="text-[10px] text-[#16803d]">Montant payé</span>
                  <span className="text-[11px] font-bold text-[#16803d]">{fmt(f.montant_paye)}</span>
                </div>
                {f.montant_ttc - f.montant_paye > 0 && (
                  <div className="flex justify-between items-center py-1.5 px-3 bg-[#fef2f2] border border-t-0 border-[#fecaca]">
                    <span className="text-[10px] text-[#b91c1c]">Reste à payer</span>
                    <span className="text-[11px] font-bold text-[#b91c1c]">{fmt(f.montant_ttc - f.montant_paye)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══ CONDITIONS + BANK ═══════════════════════════════ */}
        <div className="h-px bg-[#e2e8f0] mb-4" />
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

        {/* ══ FOOTER ══════════════════════════════════════════ */}
        <div data-footer="true" className="border-t border-[#e2e8f0] pt-3 mt-6">
          <p className="text-center text-[9px] text-[#94a3b8] mb-1">Page 1/1</p>
          <p className="text-center text-[9px] text-[#94a3b8] leading-relaxed">
            {CO.name}  ·  {CO.addr1}, {CO.addr2}  ·  Tél: {CO.tel}  ·  Fax: {CO.fax}  ·  {CO.email}  ·  {CO.web}
          </p>
        </div>
      </div>
    )
  }
)

FactureTemplate.displayName = 'FactureTemplate'
export default FactureTemplate
