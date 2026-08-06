/**
 * DevisTemplateOffer — Proposition sans tableau.
 * Chaque prestation est présentée comme un bloc narratif : titre en évidence,
 * description libre, prix aligné à droite avec un liseré. Idéal pour un devis
 * "offre commerciale" où l'on veut mettre en avant la valeur plutôt que la ligne
 * comptable.
 */
import { forwardRef } from 'react'
import type { Devis }  from '@/hooks/useDevis'
import type { Client } from '@/hooks/useClients'
import {
  parseDevisEnvelope, fmtMoney, fmtDate, DescBlocks, CO,
  type Currency, type Prestation,
} from './templateShared'

interface Props { devis: Devis; client?: Client }

const DevisTemplateOffer = forwardRef<HTMLDivElement, Props>(({ devis: d, client }, ref) => {
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
      <div className="flex items-start justify-between mb-8">
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
          <p className="text-[10px] uppercase tracking-widest text-[#64748b]">Proposition commerciale</p>
          <p className="text-[18px] font-extrabold text-[#0a1a3c] leading-none mt-1">{d.numero}</p>
          <p className="text-[10px] text-[#333] mt-1">Émission : {fmtDate(d.date_emission)}</p>
          {d.date_expiration && (
            <p className="text-[10px] text-[#333]">Validité : {fmtDate(d.date_expiration)}</p>
          )}
        </div>
      </div>

      {/* Client */}
      <div className="mb-6 rounded-lg" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 14px' }}>
        <p className="text-[10px] text-[#64748b] font-semibold uppercase tracking-wider mb-0.5">Préparée pour</p>
        <p className="text-[13px] font-extrabold text-[#0a1a3c]">{client?.entreprise ?? d.client_nom ?? '—'}</p>
        <div className="text-[10px] text-[#333] leading-snug">
          {client?.email     && <span>{client.email}</span>}
          {client?.email && client?.telephone && <span> · </span>}
          {client?.telephone && <span>{client.telephone}</span>}
          {clientIce && <p className="mt-0.5"><span className="font-bold text-[#0a1a3c]">ICE :</span> {clientIce}</p>}
        </div>
      </div>

      {/* Intro */}
      <p className="text-[10.5px] font-medium text-[#0f172a] leading-relaxed mb-5">
        Bonjour,<br />
        Suite à nos échanges, veuillez trouver ci-dessous notre proposition détaillée. Nous restons
        à votre disposition pour tout ajustement.
      </p>

      {/* Prestations en blocs narratifs — pas de prix par ligne, seul le total apparaît en bas */}
      <div className="space-y-4 mb-6">
        {rows.map((r, i) => (
          <div
            key={i}
            style={{ borderLeft: '3px solid #1e64c4', padding: '2px 0 4px 14px' }}
          >
            <p className="text-[12px] font-bold text-[#0a1a3c]">
              <span className="text-[#1e64c4] mr-1">{String(i + 1).padStart(2, '0')}.</span>
              {r.titre}
            </p>
            <DescBlocks blocks={r.description} />
          </div>
        ))}
      </div>

      {/* Totals compacts */}
      <div className="flex justify-end mb-6">
        <div style={{ minWidth: '68mm' }}>
          {hasTVA && (
            <>
              <div className="flex justify-between py-1.5 border-b border-[#e2e8f0]">
                <span className="text-[10.5px] text-[#64748b]">Sous-total HT</span>
                <span className="text-[10.5px] font-bold text-[#0a1a3c]">{fmtMoney(d.montant_ht, currency)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#e2e8f0]">
                <span className="text-[10.5px] text-[#64748b]">TVA {d.tva}%</span>
                <span className="text-[10.5px] font-bold text-[#0a1a3c]">{fmtMoney(tvaMont, currency)}</span>
              </div>
            </>
          )}
          <div
            className="flex justify-between items-center mt-1.5 px-3 py-2.5 rounded"
            style={{ background: '#0a1a3c' }}
          >
            <span className="text-[12px] font-extrabold text-white tracking-wide">{hasTVA ? 'TOTAL TTC' : 'TOTAL HT'}</span>
            <span className="text-[14px] font-extrabold text-white">{fmtMoney(hasTVA ? d.montant_ttc : d.montant_ht, currency)}</span>
          </div>
        </div>
      </div>

      {/* Conditions */}
      {parsed.conditions.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] font-bold text-[#0a1a3c] uppercase tracking-widest mb-2">Conditions</p>
          <ul className="space-y-1">
            {parsed.conditions.slice(0, 6).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[10px] font-medium text-[#0f172a]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1e64c4] flex-shrink-0 mt-[4px]" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Signature */}
      <div className="mb-6">
        <p className="text-[10px] font-bold text-[#0a1a3c] mb-1">Bon pour accord — Signature :</p>
        <div className="w-[60mm] h-[28mm] border border-dashed border-[#cbd5e1] rounded flex items-center justify-center">
          {signature
            ? <img src={signature} alt="Signature" className="max-w-full max-h-full object-contain" />
            : <span className="text-[9px] text-[#94a3b8]">Signature du client</span>}
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
              <span className="font-bold text-[#0a1a3c]">ICE :</span> {CO.ice} &nbsp;·&nbsp;
              <span className="font-bold text-[#0a1a3c]">IF :</span> {CO.if_}
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

DevisTemplateOffer.displayName = 'DevisTemplateOffer'
export default DevisTemplateOffer
