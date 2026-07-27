/**
 * DevisTemplateProposal — « Descriptif + Détail financier ».
 * En haut : un préambule / descriptif de l'offre (champ `objet` + description
 * narrative de chaque prestation avec puces). En bas : un tableau de prix épuré
 * « Détail financier » (Désignation | Montant HT) puis les totaux. Le tout à
 * l'identité NEXT GITAL (en-tête logo + pied de page légal).
 */
import { forwardRef } from 'react'
import type { Devis }  from '@/hooks/useDevis'
import type { Client } from '@/hooks/useClients'
import { sanitizeRichHtml } from '@/lib/safeHtml'
import {
  parseDevisEnvelope, fmtMoney, fmtDate, DescBlocks, CO,
  type Currency, type Prestation,
} from './templateShared'

interface Props { devis: Devis; client?: Client }

const NAVY = '#0a1a3c'
const BLUE = '#1e64c4'

const DevisTemplateProposal = forwardRef<HTMLDivElement, Props>(({ devis: d, client }, ref) => {
  const parsed    = parseDevisEnvelope(d.notes)
  const clientIce = parsed.clientIce?.trim() || ''
  const currency  = (parsed.currency ?? 'MAD') as Currency
  const signature = parsed.signature
  const hasTVA    = d.tva > 0
  const tvaMont   = d.montant_ttc - d.montant_ht
  const objet     = parsed.objet?.trim()
  const offreTitle = parsed.offreTitle?.trim()

  const rows: Prestation[] = parsed.prestations.length > 0 ? parsed.prestations : [{
    titre: 'Prestations digitales',
    description: [],
    quantite: 1,
    prix_unitaire: d.montant_ht,
  }]

  const lineTotal = (r: Prestation) => ((r.showQuantite ?? true) ? r.quantite * r.prix_unitaire : r.prix_unitaire)
  const hasNarrative = rows.some(r => r.description && r.description.length > 0)

  return (
    <div
      ref={ref}
      className="bg-white font-sans"
      style={{
        width: '210mm', minHeight: '297mm', boxSizing: 'border-box',
        color: NAVY,
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        padding: '16mm 16mm', display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ══ EN-TÊTE ══ */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo-nextgital.png"
            alt={CO.name}
            className="h-[60px] w-auto object-contain"
            crossOrigin="anonymous"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <p className="text-[10.5px] italic" style={{ color: '#475569' }}>{CO.sub}</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-extrabold leading-none" style={{ color: NAVY }}>DEVIS</p>
          <p className="text-[11px] font-semibold mt-1.5" style={{ color: NAVY }}>N° {d.numero}</p>
          <p className="text-[10px]" style={{ color: '#64748b' }}>Date : {fmtDate(d.date_emission)}</p>
          {d.date_expiration && (
            <p className="text-[10px]" style={{ color: '#64748b' }}>Valable jusqu'au {fmtDate(d.date_expiration)}</p>
          )}
        </div>
      </div>

      {/* Client */}
      <div className="mb-5 rounded-lg" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 14px' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>À l'attention de</p>
        <p className="text-[13px] font-extrabold" style={{ color: NAVY }}>{client?.entreprise ?? d.client_nom ?? '—'}</p>
        <div className="text-[10px]" style={{ color: '#334155' }}>
          {client?.email && <span>{client.email}</span>}
          {client?.email && client?.telephone && <span> · </span>}
          {client?.telephone && <span>{client.telephone}</span>}
          {clientIce && <p className="mt-0.5"><span className="font-bold" style={{ color: NAVY }}>ICE :</span> {clientIce}</p>}
        </div>
      </div>

      <div style={{ height: 2, background: BLUE, borderRadius: 2, marginBottom: '6mm' }} />

      {/* ══ PRÉAMBULE / DESCRIPTIF ══ */}
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: NAVY }}>
        {offreTitle || 'Présentation de l’offre'}
      </p>
      <div
        className="mb-6 text-[10.5px] leading-relaxed [&_strong]:font-bold [&_strong]:text-[#0a1a3c] [&_ul]:list-disc [&_ul]:pl-4"
        style={{ color: '#334155' }}
      >
        {objet
          ? <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(objet.replace(/\n/g, '<br/>')) }} />
          : <p>Veuillez trouver ci-dessous notre proposition détaillée ainsi que le détail financier correspondant. Nous restons à votre disposition pour tout ajustement.</p>}
      </div>

      {/* ══ SECTIONS DESCRIPTIVES (narratif par prestation) ══ */}
      {hasNarrative && (
        <div className="space-y-4 mb-7">
          {rows.map((r, i) => (
            r.description && r.description.length > 0 ? (
              <div key={i} style={{ borderLeft: `3px solid ${BLUE}`, padding: '2px 0 4px 14px' }}>
                <p className="text-[12px] font-bold" style={{ color: NAVY }}>
                  <span style={{ color: BLUE }} className="mr-1">{String(i + 1).padStart(2, '0')}.</span>
                  {r.titre}
                </p>
                <DescBlocks blocks={r.description} />
              </div>
            ) : null
          ))}
        </div>
      )}

      {/* ══ DÉTAIL FINANCIER (tableau prix) ══ */}
      <p className="text-[13px] font-bold mb-2" style={{ color: NAVY }}>Détail financier</p>
      <table className="w-full mb-4" style={{ borderCollapse: 'collapse', breakInside: 'avoid' }}>
        <thead>
          <tr>
            <th className="text-left text-[10px] font-bold uppercase tracking-wide"
                style={{ color: '#64748b', padding: '6px 4px', borderBottom: `1.5px solid ${NAVY}` }}>Désignation</th>
            <th className="text-right text-[10px] font-bold uppercase tracking-wide"
                style={{ color: '#64748b', padding: '6px 4px', borderBottom: `1.5px solid ${NAVY}`, whiteSpace: 'nowrap' }}>Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ breakInside: 'avoid' }}>
              <td className="text-[11px]" style={{ color: NAVY, padding: '9px 4px', borderBottom: '1px solid #e2e8f0' }}>
                {r.titre}
                {(r.showQuantite ?? true) && r.quantite > 1 && (
                  <span className="text-[9px] ml-1.5" style={{ color: '#94a3b8' }}>
                    ({r.quantite} × {new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.prix_unitaire)})
                  </span>
                )}
              </td>
              <td className="text-[11px] font-semibold text-right" style={{ color: NAVY, padding: '9px 4px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                {fmtMoney(lineTotal(r), currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totaux */}
      <div className="flex justify-end mb-7" style={{ breakInside: 'avoid' }}>
        <div style={{ minWidth: '72mm' }}>
          <div className="flex justify-between py-1.5" style={{ borderBottom: '1px solid #e2e8f0' }}>
            <span className="text-[10.5px]" style={{ color: '#64748b' }}>Sous-total HT</span>
            <span className="text-[10.5px] font-bold" style={{ color: NAVY }}>{fmtMoney(d.montant_ht, currency)}</span>
          </div>
          {hasTVA && (
            <div className="flex justify-between py-1.5" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <span className="text-[10.5px]" style={{ color: '#64748b' }}>TVA {d.tva} %</span>
              <span className="text-[10.5px] font-bold" style={{ color: NAVY }}>{fmtMoney(tvaMont, currency)}</span>
            </div>
          )}
          <div className="flex justify-between items-center mt-1.5 px-3 py-2.5 rounded" style={{ background: NAVY }}>
            <span className="text-[12px] font-extrabold text-white tracking-wide">TOTAL TTC</span>
            <span className="text-[14px] font-extrabold text-white">{fmtMoney(d.montant_ttc, currency)}</span>
          </div>
        </div>
      </div>

      {/* Conditions */}
      {parsed.conditions.length > 0 && (
        <div className="mb-6" style={{ breakInside: 'avoid' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: NAVY }}>Conditions</p>
          <ul className="space-y-1">
            {parsed.conditions.slice(0, 6).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[10px]" style={{ color: '#334155' }}>
                <span className="flex-shrink-0" style={{ width: 5, height: 5, borderRadius: 9, background: BLUE, marginTop: 4 }} />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Signature */}
      <div className="mb-6" style={{ breakInside: 'avoid' }}>
        <p className="text-[10px] font-bold mb-1" style={{ color: NAVY }}>Bon pour accord — Signature :</p>
        <div className="flex items-center justify-center overflow-hidden"
          style={{ width: '60mm', height: '26mm', border: '1px dashed #cbd5e1', borderRadius: 4 }}>
          {signature
            ? <img src={signature} alt="Signature" className="max-w-full max-h-full object-contain" />
            : <span className="text-[9px]" style={{ color: '#94a3b8' }}>Cachet et signature du client</span>}
        </div>
      </div>

      <div className="flex-1" />

      {/* ══ PIED DE PAGE LÉGAL ══ */}
      <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '3mm' }}>
        <p className="text-[8px] leading-relaxed" style={{ color: '#64748b' }}>
          <span className="font-bold" style={{ color: NAVY }}>{CO.legalName}</span> — {CO.addr} &nbsp;·&nbsp;
          <span className="font-semibold">RC</span> {CO.rc} &nbsp;·&nbsp;
          <span className="font-semibold">Patente N°</span> {CO.patente} &nbsp;·&nbsp;
          <span className="font-semibold">IF N°</span> {CO.if_} &nbsp;·&nbsp;
          <span className="font-semibold">ICE</span> {CO.ice}
        </p>
        <p className="text-[8px] leading-relaxed" style={{ color: '#64748b' }}>
          <span className="font-semibold">Banque</span> {CO.banque} &nbsp;·&nbsp;
          <span className="font-semibold">RIB</span> {CO.rib} &nbsp;·&nbsp;
          <span className="font-semibold">SWIFT</span> {CO.swift} &nbsp;·&nbsp;
          <span className="font-semibold" style={{ color: BLUE }}>{CO.tel}</span> &nbsp;·&nbsp;
          {CO.email} &nbsp;·&nbsp;
          <span className="font-semibold" style={{ color: BLUE }}>{CO.web}</span>
        </p>
      </div>
    </div>
  )
})

DevisTemplateProposal.displayName = 'DevisTemplateProposal'
export default DevisTemplateProposal
