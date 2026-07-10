/**
 * DevisTemplateSimple — variante épurée (style "Nextgital simple") du devis.
 * Header : "NEXT GITAL" à gauche, "Devis N° · Date · Validité" à droite.
 * Tableau à bordures fines, totaux compacts alignés à droite, signature à gauche,
 * pied d'entreprise en bas.
 */
import { forwardRef } from 'react'
import type { Devis }  from '@/hooks/useDevis'
import type { Client } from '@/hooks/useClients'
import {
  parseDevisEnvelope, fmtMoney, fmtDate, DescBlocks, CO,
  type Currency, type Prestation,
} from './templateShared'

interface Props { devis: Devis; client?: Client }

const DevisTemplateSimple = forwardRef<HTMLDivElement, Props>(({ devis: d, client }, ref) => {
  const parsed    = parseDevisEnvelope(d.notes)
  const clientIce = parsed.clientIce?.trim() || ''
  const currency  = (parsed.currency ?? 'MAD') as Currency
  const signature = parsed.signature
  const hasTVA    = d.tva > 0
  const tvaMont   = d.montant_ttc - d.montant_ht

  const rows: Prestation[] = parsed.prestations.length > 0 ? parsed.prestations : [{
    titre: 'Prestations digitales',
    description: [],
    quantite: 1,
    prix_unitaire: d.montant_ht,
  }]

  return (
    <div
      ref={ref}
      className="bg-white text-[#0a1a3c] font-sans"
      style={{
        width: '210mm', minHeight: '297mm', boxSizing: 'border-box',
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        padding: '18mm 16mm', display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
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
            Devis N° <span>{d.numero}</span>
          </p>
          <p className="text-[10px] text-[#333] mt-1">Date : {fmtDate(d.date_emission)}</p>
          {d.date_expiration && (
            <p className="text-[10px] text-[#333]">Validité : {fmtDate(d.date_expiration)}</p>
          )}
        </div>
      </div>

      {/* Client */}
      <div className="mb-4">
        <p className="text-[10px] text-[#333]">À l'attention de :</p>
        <p className="text-[12px] font-extrabold text-[#0a1a3c] underline mt-0.5">
          {client?.entreprise ?? d.client_nom ?? '—'}
        </p>
        {clientIce && (
          <p className="text-[10px] font-bold text-[#0a1a3c]">ICE : {clientIce}</p>
        )}
      </div>

      {/* Services table */}
      <table
        className="w-full text-[10px] mb-5"
        style={{ borderCollapse: 'collapse', border: '1px solid #333' }}
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
                  border: '1px solid #333', padding: '5px 8px',
                  textAlign: i === 0 ? 'left' : 'right', background: '#ffffff',
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
                <td style={{ border: '1px solid #333', padding: '6px 8px', verticalAlign: 'top' }}>
                  <p className="text-[10.5px] text-[#0a1a3c]">{r.titre}</p>
                  <DescBlocks blocks={r.description} />
                </td>
                <td style={{ border: '1px solid #333', padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                  {showQty ? r.quantite : ''}
                </td>
                <td style={{ border: '1px solid #333', padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                  {showPrix
                    ? new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.prix_unitaire)
                    : ''}
                </td>
                <td style={{ border: '1px solid #333', padding: '6px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                  {new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-6">
        <table className="text-[10.5px]" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td className="text-right text-[#333] pr-4 py-1">Montant total HT :</td>
              <td style={{ border: '1px solid #333', padding: '3px 10px', textAlign: 'right', minWidth: '38mm' }}>
                {fmtMoney(d.montant_ht, currency)}
              </td>
            </tr>
            {hasTVA && (
              <tr>
                <td className="text-right text-[#333] pr-4 py-1">TVA ({d.tva}%):</td>
                <td style={{ border: '1px solid #333', padding: '3px 10px', textAlign: 'right' }}>
                  {fmtMoney(tvaMont, currency)}
                </td>
              </tr>
            )}
            <tr>
              <td className="text-right font-bold text-[#0a1a3c] pr-4 py-1">Montant total TTC :</td>
              <td style={{ border: '1px solid #333', padding: '4px 10px', textAlign: 'right', fontWeight: 'bold', background: '#e7edf7' }}>
                {fmtMoney(d.montant_ttc, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signature */}
      <div className="mb-6">
        <p className="text-[10px] font-bold text-[#0a1a3c] mb-1">Signature :</p>
        <div className="w-[60mm] h-[28mm] flex items-start">
          {signature
            ? <img src={signature} alt="Signature" className="max-w-full max-h-full object-contain" />
            : null}
        </div>
      </div>

      <div className="flex-1" />

      {/* Footer */}
      <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '4mm' }}>
        <div className="flex items-start justify-between text-[8.5px] text-[#333] leading-relaxed">
          <div className="max-w-[130mm]">
            <p><span className="font-bold text-[#0a1a3c]">{CO.legalName}</span>, {CO.addr}</p>
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
})

DevisTemplateSimple.displayName = 'DevisTemplateSimple'
export default DevisTemplateSimple
